import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  FollowUpTaskStatus,
  LauraMessageKind,
  LauraProposalStatus,
  Prisma,
  VisitStatus,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { LauraContextResolverService } from "./laura-context-resolver.service";
import { LauraLlmService } from "./laura-llm.service";
import { LauraPersistenceService } from "./laura-persistence.service";
import { ConfirmProposalDto } from "./dto/confirm-proposal.dto";
import { CreateMessageDto } from "./dto/create-message.dto";
import { QuerySessionDto } from "./dto/query-session.dto";
import { LauraSessionService } from "./laura-session.service";
import {
  LauraAgendaPayload,
  LauraAssistantResponse,
  LauraClarificationOption,
  LauraProposalConfirmationResponse,
  LauraProposalPayload,
  LauraStoredProposalPayload,
  LauraSessionResponse,
} from "./laura.types";

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class LauraService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lauraSessionService: LauraSessionService,
    private readonly lauraContextResolverService: LauraContextResolverService,
    private readonly lauraLlmService: LauraLlmService,
    private readonly lauraPersistenceService: LauraPersistenceService,
  ) {}

  async handleMessage(
    user: AuthUser,
    dto: CreateMessageDto,
  ): Promise<LauraAssistantResponse> {
    return this.prisma.$transaction(async (tx) => {
      const session = await this.lauraSessionService.ensureSession(user.id, dto, tx);
      const pendingClarification = await this.lauraSessionService.getLatestPendingClarification(session.id, tx);
      const recentMessages = await this.lauraSessionService.getRecentMessages(session.id, 6, tx);

      const userMessage = await this.lauraSessionService.appendUserMessage(
        session.id,
        LauraMessageKind.report,
        dto.content,
        undefined,
        tx,
      );

      const clarificationResolution = await this.resolveClarificationReply(dto.content, pendingClarification);
      const customerResolution = clarificationResolution
        ?? await this.lauraContextResolverService.resolveCustomerFromText(dto.content, tx);

      if (pendingClarification && !clarificationResolution && customerResolution.status === "unresolved") {
        return this.createClarificationResponse(
          session.id,
          pendingClarification.payload?.sourceMessage?.content ?? dto.content,
          pendingClarification.payload?.clarification?.options ?? [],
          "Necesito que elijas una de las opciones para continuar.",
          tx,
        );
      }

      if (customerResolution.status === "ambiguous") {
        return this.createClarificationResponse(
          session.id,
          pendingClarification?.payload?.sourceMessage?.content ?? dto.content,
          customerResolution.options.map((option) => ({
            id: option.customerId,
            label: option.label,
          })),
          `Encontré varios clientes que coinciden con ${customerResolution.query || "cliente"}. ¿Cuál es?`,
          tx,
        );
      }

      const selectedCustomer = customerResolution.status === "resolved"
        ? {
          id: customerResolution.customerId,
          label: customerResolution.label,
        }
        : await this.resolveSessionContextCustomer(session.contextType, session.contextEntityId, tx);

      const proposalSourceContent = clarificationResolution?.sourceContent
        ?? this.resolveProposalSourceContent(dto.content, pendingClarification, selectedCustomer?.id);

      const extraction = await this.lauraLlmService.extract({
        message: proposalSourceContent,
        recentMessages: recentMessages.map((message) => message.content),
        contextSummary: selectedCustomer?.label,
      });

      if (extraction.intent === "agenda_query") {
        const agenda = await this.buildAgendaPayload(user.id, tx);
        const response: LauraAssistantResponse = {
          mode: "agenda",
          sessionId: session.id,
          message: agenda.items.length > 0
            ? "Estas son tus prioridades comerciales actuales."
            : "No encontré pendientes activos en tu agenda.",
          agenda,
        };

        await this.lauraSessionService.appendAssistantMessage(
          session.id,
          LauraMessageKind.agenda_query,
          response.message,
          toJsonValue({
            agenda: response.agenda,
          }),
          tx,
        );

        return response;
      }

      const proposalPayload = this.buildProposalPayload(
        proposalSourceContent,
        extraction,
        selectedCustomer,
        session.contextType === "opportunity" ? session.contextEntityId ?? undefined : undefined,
      );
      const storedProposalPayload = this.buildStoredProposalPayload(
        proposalPayload,
        selectedCustomer,
        session.contextType === "opportunity" ? session.contextEntityId ?? undefined : undefined,
      );

      const proposal = await tx.lauraProposal.create({
        data: {
          sessionId: session.id,
          messageId: userMessage.id,
          status: LauraProposalStatus.draft,
          payload: toJsonValue(storedProposalPayload),
        },
      });

      const response: LauraAssistantResponse = {
        mode: "proposal",
        sessionId: session.id,
        message: "Preparé una propuesta inicial para que la revises antes de guardarla.",
        proposalId: proposal.id,
        proposal: proposalPayload,
      };

      await this.lauraSessionService.appendAssistantMessage(
        session.id,
        LauraMessageKind.proposal,
        response.message,
        toJsonValue({
          proposalId: proposal.id,
          proposal: proposalPayload,
        }),
        tx,
      );

      return response;
    });
  }

  async confirmProposal(
    user: AuthUser,
    proposalId: string,
    dto: ConfirmProposalDto,
  ): Promise<LauraProposalConfirmationResponse> {
    return this.prisma.$transaction(async (tx) => {
      const proposal = await tx.lauraProposal.findUnique({
        where: { id: proposalId },
      });

      if (!proposal) {
        throw new NotFoundException("Laura proposal not found");
      }

      await this.assertSessionOwner(user.id, proposal.sessionId, tx);
      const storedProposal = proposal.payload as unknown as LauraStoredProposalPayload;
      const confirmedProposal = this.reconcileConfirmedProposal(
        storedProposal,
        dto.proposal,
      );

      const updatedCount = await tx.lauraProposal.updateMany({
        where: {
          id: proposalId,
          status: LauraProposalStatus.draft,
        },
        data: {
          status: LauraProposalStatus.confirmed,
          payload: toJsonValue(confirmedProposal),
        },
      });

      if (updatedCount.count !== 1) {
        throw new ConflictException("Laura proposal has already been finalized");
      }

      const persistence = await this.lauraPersistenceService.persistApprovedBlocks(
        user,
        storedProposal,
        {
          proposal: confirmedProposal,
        },
        tx,
      );

      return {
        proposalId,
        status: "confirmed",
        proposal: confirmedProposal,
        saved: persistence.saved,
        discarded: persistence.discarded,
        createdIds: persistence.createdIds,
      };
    });
  }

  async getSession(
    user: AuthUser,
    sessionId: string,
    query: QuerySessionDto,
  ): Promise<LauraSessionResponse> {
    const session = await this.prisma.lauraSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException("Laura session not found");
    }

    if (session.ownerUserId !== user.id) {
      throw new ForbiddenException("Laura session does not belong to the current user");
    }

    const includeMessages = query.includeMessages ?? true;
    const includeProposals = query.includeProposals ?? true;

    return {
      id: session.id,
      ownerUserId: session.ownerUserId,
      contextType: session.contextType,
      contextEntityId: session.contextEntityId,
      messages: includeMessages
        ? await this.prisma.lauraMessage.findMany({
          where: { sessionId },
          orderBy: { createdAt: "asc" },
        })
        : [],
      proposals: includeProposals
        ? await this.prisma.lauraProposal.findMany({
          where: { sessionId },
          orderBy: { createdAt: "asc" },
        })
        : [],
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private buildProposalPayload(
    content: string,
    extraction: Awaited<ReturnType<LauraLlmService["extract"]>>,
    selectedCustomer?: LauraClarificationOption | null,
    opportunityId?: string,
  ): LauraProposalPayload {
    const canPersist = Boolean(selectedCustomer?.id);

    return {
      blocks: {
        interaction: {
          enabled: canPersist,
          summary: extraction.interactionSummary ?? content.trim(),
          rawMessage: content.trim(),
        },
        opportunity: {
          enabled: canPersist,
          opportunityId,
          createNew: !opportunityId && Boolean(selectedCustomer?.id),
          title: extraction.suggestedOpportunityTitle,
          stage: extraction.suggestedOpportunityStage,
        },
        followUp: {
          enabled: canPersist,
          opportunityId,
          title: extraction.suggestedNextStep ?? "Dar seguimiento comercial",
          dueAt: extraction.suggestedFollowUpDate ?? "2026-05-01T15:00:00.000Z",
          type: extraction.taskType ?? "llamada",
        },
        task: {
          enabled: canPersist,
          title: extraction.suggestedTaskTitle ?? "Registrar seguimiento comercial",
          dueAt: extraction.suggestedFollowUpDate,
          notes: extraction.contactName,
        },
        signals: {
          enabled: canPersist,
          objections: extraction.signals?.objections ?? [],
          risk: extraction.signals?.risk,
          buyingIntent: extraction.signals?.buyingIntent,
        },
      },
    };
  }

  private buildStoredProposalPayload(
    proposal: LauraProposalPayload,
    selectedCustomer?: LauraClarificationOption | null,
    opportunityId?: string,
  ): LauraStoredProposalPayload {
    return {
      ...proposal,
      blocks: {
        ...proposal.blocks,
        opportunity: proposal.blocks.opportunity,
        followUp: proposal.blocks.followUp,
      },
      internal: {
        customerId: selectedCustomer?.id,
        customerLabel: selectedCustomer?.label,
        opportunityId,
      },
    };
  }

  private reconcileConfirmedProposal(
    storedProposal: LauraStoredProposalPayload,
    confirmedProposal: LauraProposalPayload,
  ): LauraProposalPayload {
    const storedBlocks = storedProposal.blocks;
    const confirmedBlocks = confirmedProposal.blocks;

    this.assertImmutableTarget(
      storedBlocks.opportunity?.opportunityId,
      confirmedBlocks.opportunity?.opportunityId,
    );
    this.assertImmutableTarget(
      storedBlocks.opportunity?.createNew,
      confirmedBlocks.opportunity?.createNew,
    );
    this.assertImmutableTarget(
      storedBlocks.opportunity?.stage,
      confirmedBlocks.opportunity?.stage,
    );
    this.assertImmutableTarget(
      storedBlocks.followUp?.opportunityId,
      confirmedBlocks.followUp?.opportunityId,
    );

    return {
      blocks: {
        interaction: confirmedBlocks.interaction,
        opportunity: confirmedBlocks.opportunity
          ? {
            ...confirmedBlocks.opportunity,
            opportunityId: storedBlocks.opportunity?.opportunityId,
            createNew: storedBlocks.opportunity?.createNew,
            stage: storedBlocks.opportunity?.stage,
          }
          : confirmedBlocks.opportunity,
        followUp: confirmedBlocks.followUp
          ? {
            ...confirmedBlocks.followUp,
            opportunityId: storedBlocks.followUp?.opportunityId,
          }
          : confirmedBlocks.followUp,
        task: confirmedBlocks.task,
        signals: confirmedBlocks.signals,
      },
    };
  }

  private assertImmutableTarget<T>(stored: T, confirmed: T) {
    if (stored !== confirmed) {
      throw new BadRequestException("Laura confirmation contains invalid target changes");
    }
  }

  private async createClarificationResponse(
    sessionId: string,
    sourceContent: string,
    options: LauraClarificationOption[],
    message: string,
    tx: Prisma.TransactionClient,
  ): Promise<LauraAssistantResponse> {
    const response: LauraAssistantResponse = {
      mode: "clarification",
      sessionId,
      message,
      clarification: {
        type: "customer",
        options,
      },
    };

    await this.lauraSessionService.appendAssistantMessage(
      sessionId,
      LauraMessageKind.clarification,
      response.message,
      toJsonValue({
        pending: true,
        clarification: response.clarification,
        sourceMessage: {
          kind: LauraMessageKind.report,
          content: sourceContent,
        },
      }),
      tx,
    );

    return response;
  }

  private async buildAgendaPayload(
    userId: string,
    tx: Prisma.TransactionClient,
  ): Promise<LauraAgendaPayload> {
    const [tasks, visits] = await Promise.all([
      tx.followUpTask.findMany({
        where: {
          assignedToUserId: userId,
          status: FollowUpTaskStatus.pendiente,
        },
      }),
      tx.visit.findMany({
        where: {
          assignedToUserId: userId,
          status: VisitStatus.programada,
        },
      }),
    ]);

    const items = [
      ...tasks.map((task) => ({
        id: task.id,
        type: "follow_up_task" as const,
        label: task.title,
        scheduledAt: task.dueAt,
        priorityGroup: 0,
      })),
      ...visits.map((visit) => ({
        id: visit.id,
        type: "visit" as const,
        label: visit.summary?.trim() || visit.nextStep?.trim() || "Visita programada",
        scheduledAt: visit.scheduledAt,
        priorityGroup: 1,
      })),
    ]
      .sort((left, right) => {
        const byDate = left.scheduledAt.getTime() - right.scheduledAt.getTime();
        if (byDate !== 0) {
          return byDate;
        }

        return left.priorityGroup - right.priorityGroup;
      })
      .map(({ id, type, label }) => ({
        id,
        type,
        label,
      }));

    return { items };
  }

  private async resolveClarificationReply(
    content: string,
    pendingClarification: Awaited<ReturnType<LauraSessionService["getLatestPendingClarification"]>>,
  ) {
    const options = pendingClarification?.payload?.clarification?.options;

    if (!options?.length) {
      return null;
    }

    const selectedOption = this.pickClarificationOption(content, options);

    if (!selectedOption) {
      return null;
    }

    const sourceContent = this.mergeClarificationSourceContent(
      pendingClarification?.payload?.sourceMessage?.content ?? content,
      content,
      selectedOption,
    );

    return {
      status: "resolved" as const,
      customerId: selectedOption.id,
      confidence: "high" as const,
      label: selectedOption.label,
      sourceContent,
    };
  }

  private pickClarificationOption(content: string, options: LauraClarificationOption[]) {
    const normalized = this.lauraContextResolverService.normalizeText(content);

    const indexedOption = [
      { patterns: ["el primero", "la primera", "primero", "primera"], index: 0 },
      { patterns: ["el segundo", "la segunda", "segundo", "segunda"], index: 1 },
      { patterns: ["el tercero", "la tercera", "tercero", "tercera"], index: 2 },
    ].find(({ patterns }) => patterns.some((pattern) => normalized.includes(pattern)))
      ?? this.pickNumericClarificationOption(normalized);

    if (indexedOption && options[indexedOption.index]) {
      return options[indexedOption.index];
    }

    return options.find((option) =>
      normalized.includes(this.lauraContextResolverService.normalizeText(option.label)),
    );
  }

  private mergeClarificationSourceContent(
    originalContent: string,
    followUpContent: string,
    selectedOption: LauraClarificationOption,
  ) {
    const followUpDetail = this.extractClarificationFollowUpDetail(followUpContent, selectedOption);

    if (!followUpDetail) {
      return originalContent;
    }

    return `${originalContent.trim()} ${followUpDetail}`.trim();
  }

  private extractClarificationFollowUpDetail(
    followUpContent: string,
    selectedOption: LauraClarificationOption,
  ) {
    const normalizedOptionLabel = this.lauraContextResolverService.normalizeText(selectedOption.label);
    const optionLabelWords = normalizedOptionLabel.split(" ").filter(Boolean);
    const selectionOnlyPhrases = new Set([
      "si",
      "sí",
      "ok",
      "dale",
      "correcto",
      "confirmo",
      "opcion",
      "opción",
      "numero",
      "número",
      ...optionLabelWords,
    ]);

    const cleaned = followUpContent
      .replace(new RegExp(selectedOption.label, "ig"), " ")
      .replace(/\b(el|la)?\s*(primero|primera|segundo|segunda|tercero|tercera)\b/gi, " ")
      .replace(/\b(opcion|opción|numero|número)\s*[1-3]\b/gi, " ")
      .replace(/\b[1-3]\b/g, " ")
      .replace(/[,:;.-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleaned) {
      return "";
    }

    const meaningfulTokens = cleaned.split(" ").filter((token) => {
      const normalizedToken = this.lauraContextResolverService.normalizeText(token);
      return normalizedToken.length > 0 && !selectionOnlyPhrases.has(normalizedToken);
    });

    return meaningfulTokens.length > 0 ? cleaned : "";
  }

  private resolveProposalSourceContent(
    content: string,
    pendingClarification: Awaited<ReturnType<LauraSessionService["getLatestPendingClarification"]>>,
    resolvedCustomerId?: string,
  ) {
    const originalContent = pendingClarification?.payload?.sourceMessage?.content;

    if (!originalContent) {
      return content;
    }

    const priorOptionIds = new Set(
      pendingClarification?.payload?.clarification?.options?.map((option) => option.id) ?? [],
    );

    if (!resolvedCustomerId || !priorOptionIds.has(resolvedCustomerId)) {
      return content;
    }

    return `${originalContent.trim()} ${content.trim()}`.trim();
  }

  private pickNumericClarificationOption(normalized: string) {
    const exactDigitMatch = normalized.match(/^(?:opcion|opcion numero|numero)?\s*(1|2|3)$/);

    if (!exactDigitMatch) {
      return null;
    }

    return { index: Number(exactDigitMatch[1]) - 1 };
  }

  private async resolveSessionContextCustomer(
    contextType?: string | null,
    contextEntityId?: string | null,
    tx?: Prisma.TransactionClient,
  ) {
    if (!contextEntityId) {
      return null;
    }

    if (contextType === "customer") {
      return this.lauraContextResolverService.getCustomerOptionById(contextEntityId, tx);
    }

    if (contextType === "opportunity") {
      return this.lauraContextResolverService.getCustomerOptionFromOpportunity(contextEntityId, tx);
    }

    return null;
  }

  private async assertSessionOwner(userId: string, sessionId: string, client?: Prisma.TransactionClient) {
    const db = client ?? this.prisma;
    const session = await db.lauraSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException("Laura session not found");
    }

    if (session.ownerUserId !== userId) {
      throw new ForbiddenException("Laura session does not belong to the current user");
    }
  }
}

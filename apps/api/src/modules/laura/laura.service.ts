import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Observable } from "rxjs";
import {
  FollowUpTaskStatus,
  LauraMessageKind,
  LauraProposalStatus,
  Prisma,
  VisitStatus,
} from "@prisma/client";
import { ConfigService } from "@nestjs/config";
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
    private readonly configService: ConfigService,
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

      const seemsLikeAgendaQuery = this.looksLikeAgendaQuery(dto.content);
      const seemsLikeGreeting = this.looksLikeGreeting(dto.content);

      let customerResolution: Awaited<ReturnType<typeof this.lauraContextResolverService.resolveCustomerFromText>> | null = null;

      if (!seemsLikeAgendaQuery && !seemsLikeGreeting && !clarificationResolution) {
        customerResolution = await this.lauraContextResolverService.resolveCustomerFromText(dto.content, tx);
      }

      if (pendingClarification && !clarificationResolution && (!customerResolution || customerResolution.status === "unresolved")) {
        return this.createClarificationResponse(
          session.id,
          pendingClarification.payload?.sourceMessage?.content ?? dto.content,
          pendingClarification.payload?.clarification?.options ?? [],
          "Necesito que elijas una de las opciones para continuar.",
          tx,
          pendingClarification.payload?.clarification?.type ?? "customer",
        );
      }

      if (customerResolution?.status === "ambiguous") {
        return this.createClarificationResponse(
          session.id,
          pendingClarification?.payload?.sourceMessage?.content ?? dto.content,
          customerResolution.options.map((option) => ({
            id: option.customerId,
            label: option.label,
          })),
          `Encontré varios clientes que coinciden con ${customerResolution.query || "cliente"}. ¿Cuál es?`,
          tx,
          "customer",
        );
      }

      if (seemsLikeGreeting && !pendingClarification) {
        const greetingResponse: LauraAssistantResponse = {
          mode: "greeting",
          sessionId: session.id,
          message: "¡Hola! 👋 Soy Laura, tu asistente comercial. Contame qué pasó en tu visita, qué pendientes tenés o si querés ver tu agenda.",
        };

        await this.lauraSessionService.appendAssistantMessage(
          session.id,
          LauraMessageKind.report,
          greetingResponse.message,
          undefined,
          tx,
        );

        return greetingResponse;
      }

      const selectedCustomer = customerResolution?.status === "resolved"
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

  private get agentBaseUrl(): string {
    return this.configService.get<string>("LAURA_AGENT_BASE_URL") ?? "http://localhost:3100";
  }

  get useAgent(): boolean {
    return this.configService.get<string>("LAURA_USE_AGENT") === "true";
  }

  async handleMessageViaAgent(
    user: AuthUser,
    dto: CreateMessageDto,
  ): Promise<LauraAssistantResponse> {
    const url = `${this.agentBaseUrl}/invoke`;
    const serviceToken = this.configService.get<string>("LAURA_AGENT_SERVICE_TOKEN") ?? "";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}),
      },
      body: JSON.stringify({
        userId: user.id,
        sessionId: dto.sessionId ?? "",
        content: dto.content,
        contextType: dto.contextType,
        contextEntityId: dto.contextEntityId,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new BadRequestException(
        `Laura Agent Service error (${response.status}): ${errorBody}`,
      );
    }

    const agentResponse = await response.json() as LauraAssistantResponse;

    const persistedSessionId = await this.persistAgentResponse(user.id, dto, agentResponse);

    if (persistedSessionId) {
      agentResponse.sessionId = persistedSessionId;
    }

    return agentResponse;
  }

  private async persistAgentResponse(
    userId: string,
    dto: CreateMessageDto,
    agentResponse: LauraAssistantResponse,
  ): Promise<string | null> {
    try {
      const sessionId = dto.sessionId || agentResponse.sessionId;

      const session = sessionId
        ? await this.lauraSessionService.findOrCreateSession(
            userId,
            sessionId,
            dto.contextType,
            dto.contextEntityId,
          )
        : await this.lauraSessionService.ensureSession(userId, {
            contextType: dto.contextType,
            contextEntityId: dto.contextEntityId,
          });

      await this.lauraSessionService.appendUserMessage(
        session.id,
        LauraMessageKind.report,
        dto.content,
      );

      const kind = this.mapModeToKind(agentResponse.mode);

      const assistantMessage = await this.lauraSessionService.appendAssistantMessage(
        session.id,
        kind,
        agentResponse.message,
        this.buildPayloadForMode(agentResponse),
      );

      if (agentResponse.mode === "proposal" && "proposalId" in agentResponse && agentResponse.proposalId) {
        await this.prisma.lauraProposal.create({
          data: {
            sessionId: session.id,
            messageId: assistantMessage.id,
            status: LauraProposalStatus.draft,
            payload: toJsonValue(agentResponse.proposal),
          },
        });
      }

      return session.id;
    } catch (error) {
      console.error("Failed to persist agent response:", error);
      return null;
    }
  }

  private mapModeToKind(mode: string): LauraMessageKind {
    switch (mode) {
      case "agenda":
        return LauraMessageKind.agenda_query;
      case "greeting":
        return LauraMessageKind.report;
      case "clarification":
        return LauraMessageKind.report;
      case "proposal":
        return LauraMessageKind.proposal;
      case "qa":
        return LauraMessageKind.report;
      default:
        return LauraMessageKind.report;
    }
  }

  private buildPayloadForMode(agentResponse: LauraAssistantResponse): Prisma.InputJsonValue | undefined {
    if (agentResponse.mode === "agenda" && "agenda" in agentResponse) {
      return toJsonValue({ agenda: agentResponse.agenda });
    }
    if (agentResponse.mode === "clarification" && "clarification" in agentResponse) {
      return toJsonValue({ clarification: agentResponse.clarification });
    }
    return undefined;
  }

  streamMessageViaAgent(
    user: AuthUser,
    dto: CreateMessageDto,
  ): Observable<MessageEvent> {
    const url = `${this.agentBaseUrl}/stream`;
    const serviceToken = this.configService.get<string>("LAURA_AGENT_SERVICE_TOKEN") ?? "";

    return new Observable((subscriber) => {
      const controller = new AbortController();

      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}),
        },
        body: JSON.stringify({
          userId: user.id,
          sessionId: dto.sessionId ?? "",
          content: dto.content,
          contextType: dto.contextType,
          contextEntityId: dto.contextEntityId,
        }),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            const errorBody = await response.text().catch(() => "");
            subscriber.next({ data: JSON.stringify({ event: "error", message: `Agent error (${response.status}): ${errorBody}` }) } as MessageEvent);
            subscriber.complete();
            return;
          }

          const body = response.body;
          if (!body) {
            subscriber.next({ data: JSON.stringify({ event: "error", message: "No response body" }) } as MessageEvent);
            subscriber.complete();
            return;
          }

          const reader = body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                subscriber.next({ data: line.slice(6) } as MessageEvent);
              }
            }
          }

          if (buffer.startsWith("data: ")) {
            subscriber.next({ data: buffer.slice(6) } as MessageEvent);
          }

          subscriber.complete();
        })
        .catch((error) => {
          subscriber.next({ data: JSON.stringify({ event: "error", message: error.message }) } as MessageEvent);
          subscriber.complete();
        });

      return () => controller.abort();
    });
  }

  async confirmProposalViaAgent(
    proposal: LauraProposalPayload,
    customerId?: string,
    opportunityId?: string,
  ): Promise<LauraProposalConfirmationResponse> {
    const url = `${this.agentBaseUrl}/confirm`;
    const serviceToken = this.configService.get<string>("LAURA_AGENT_SERVICE_TOKEN") ?? "";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}),
      },
      body: JSON.stringify({
        proposal,
        customerId: customerId ?? "",
        opportunityId: opportunityId ?? "",
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new BadRequestException(
        `Laura Agent confirm error (${response.status}): ${errorBody}`,
      );
    }

    const result = await response.json() as {
      confirmation: {
        saved: string[];
        discarded: string[];
        createdIds: Record<string, string>;
      };
      proposal: LauraProposalPayload;
    };

    return {
      proposalId: "",
      status: "confirmed",
      proposal,
      saved: result.confirmation.saved,
      discarded: result.confirmation.discarded,
      createdIds: result.confirmation.createdIds,
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
    clarificationType: "customer" | "opportunity" | "date" | "action" = "customer",
  ): Promise<LauraAssistantResponse> {
    const response: LauraAssistantResponse = {
      mode: "clarification",
      sessionId,
      message,
      clarification: {
        type: clarificationType,
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
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const weekEnd = new Date(todayStart);
    weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));

    const [tasks, visits] = await Promise.all([
      tx.followUpTask.findMany({
        where: {
          status: FollowUpTaskStatus.pendiente,
          OR: [
            { assignedToUserId: userId },
            { assignedToUserId: null },
          ],
        },
      }),
      tx.visit.findMany({
        where: {
          status: VisitStatus.programada,
          OR: [
            { assignedToUserId: userId },
            { assignedToUserId: null },
          ],
        },
      }),
    ]);

    const items = [
      ...tasks.map((task) => {
        const dueAt = task.dueAt;
        let priorityGroup: number;
        if (dueAt < todayStart) priorityGroup = 0;
        else if (dueAt >= todayStart && dueAt <= todayEnd) priorityGroup = 1;
        else if (dueAt > todayEnd && dueAt <= weekEnd) priorityGroup = 2;
        else priorityGroup = 3;

        return {
          id: task.id,
          type: "follow_up_task" as const,
          label: task.title,
          scheduledAt: dueAt.toISOString(),
          priorityGroup,
        };
      }),
      ...visits.map((visit) => {
        const scheduledAt = visit.scheduledAt;
        let priorityGroup: number;
        if (scheduledAt < todayStart) priorityGroup = 0;
        else if (scheduledAt >= todayStart && scheduledAt <= todayEnd) priorityGroup = 2;
        else if (scheduledAt > todayEnd && scheduledAt <= weekEnd) priorityGroup = 2;
        else priorityGroup = 3;

        return {
          id: visit.id,
          type: "visit" as const,
          label: visit.summary?.trim() || visit.nextStep?.trim() || "Visita programada",
          scheduledAt: scheduledAt.toISOString(),
          priorityGroup,
        };
      }),
    ]
      .sort((left, right) => {
        const byPriority = left.priorityGroup - right.priorityGroup;
        if (byPriority !== 0) {
          return byPriority;
        }

        return left.scheduledAt.localeCompare(right.scheduledAt);
      });

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

  private looksLikeAgendaQuery(text: string): boolean {
    const normalized = text
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .trim();

    const agendaKeywords = ["agenda", "pendientes", "pendiente", "tareas", "visitas", "semana", "hoy", "que tengo", "qué tengo", "programado"];
    return agendaKeywords.some((keyword) => normalized.includes(keyword));
  }

  private looksLikeGreeting(text: string): boolean {
    const normalized = text
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .trim();

    if (normalized.split(/\s+/).length > 6) return false;

    const greetings = ["hola", "buenos dias", "buenas tardes", "buenas noches", "hey", "hi", "que tal", "qué tal"];
    return greetings.some((greeting) => normalized === greeting || normalized.startsWith(`${greeting} `));
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

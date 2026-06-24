import { Injectable, Logger } from "@nestjs/common";
import {
  NoraActionStatus,
  NoraConversationCase,
  NoraConversationCaseStatus,
  NoraConversationCaseType,
  Prisma,
  WhatsAppConversation,
  WhatsAppMessage,
  WhatsAppSenderType,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { NoraCaseAttachment } from "./dto/nora-case.dto";
import { NoraCaseService } from "./nora-case.service";
import { NoraExpenseExtractionService } from "./nora-expense-extraction.service";
import { ProcessOrderAutomationDto } from "./dto/process-order-automation.dto";
import { ResolvedWhatsAppSender, WhatsAppService } from "./whatsapp.service";
import { WhatsAppOrderAutomationService } from "./whatsapp-order-automation.service";

type RouteInboundMessageInput = {
  conversation: WhatsAppConversation;
  message: WhatsAppMessage;
};

type AutomationRoutingResult = {
  decision: "created" | "needs_clarification" | "human_review";
  reply?: unknown;
  question?: unknown;
  [key: string]: unknown;
};

@Injectable()
export class NoraRoutingService {
  private readonly logger = new Logger(NoraRoutingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsAppService: WhatsAppService,
    private readonly orderAutomation: WhatsAppOrderAutomationService,
    private readonly noraCaseService: NoraCaseService,
    private readonly expenseExtraction: NoraExpenseExtractionService,
    private readonly authService: AuthService,
  ) {}

  async routeInboundMessage({ conversation, message }: RouteInboundMessageInput) {
    const sender = await this.whatsAppService.resolveSenderByPhone(conversation.phone);

    await this.updateConversationIdentity(conversation.id, sender);

    if (sender.senderType === WhatsAppSenderType.desconocido && conversation.status === "nuevo") {
      await this.prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: { status: "pendiente" },
      });
    }

    const input = {
      body: message.body,
      conversationId: conversation.id,
      senderType: sender.senderType,
      customerId: "customerId" in sender ? sender.customerId : null,
      contactId: "contactId" in sender ? sender.contactId : null,
      userId: "userId" in sender ? sender.userId : null,
      userRole: "userRole" in sender ? sender.userRole : null,
    } satisfies Prisma.InputJsonObject;

    const actionLog = await this.prisma.noraActionLog.create({
      data: {
        conversationId: conversation.id,
        ...("userId" in sender && { actorUserId: sender.userId }),
        mode: this.modeFor(sender.senderType),
        action: "classify_inbound_message",
        status: NoraActionStatus.proposed,
        input,
      },
    });

    try {
      const context = await this.whatsAppService.getNoraConversationContext(conversation.id);
      const openCase = await this.noraCaseService.findOpenCase(conversation.id);
      const mediaPayload = this.mediaPayloadFromMessage(message);

      if (
        "userId" in sender &&
        sender.userId &&
        this.isExpenseFlowTurn(openCase?.type)
      ) {
        try {
          const scopedToken = await this.authService.mintScopedToken(sender.userId);
          const agentResponse = await this.requestNoraAgent({
            current_message: message.body,
            history: context.recent_messages,
            open_case: openCase
              ? {
                  id: openCase.id,
                  type: openCase.type,
                  status: openCase.status,
                  extractedData: openCase.extractedData,
                  missingFields: Array.isArray(openCase.missingFields)
                    ? openCase.missingFields
                    : [],
                  lastQuestion: openCase.lastQuestion,
                  attachments: openCase.attachments,
                }
              : null,
            conversation_id: conversation.id,
            auth: `Bearer ${scopedToken}`,
          });

          if (agentResponse.case_update && openCase) {
            await this.noraCaseService.updateCase(openCase.id, agentResponse.case_update);
          }

          await this.prisma.noraActionLog.update({
            where: { id: actionLog.id },
            data: {
              status: agentResponse.executed_entity
                ? NoraActionStatus.executed
                : NoraActionStatus.proposed,
              output: agentResponse as unknown as Prisma.InputJsonObject,
            },
          });

          if (agentResponse.reply_text) {
            await this.whatsAppService.sendAgentReply(conversation.id, agentResponse.reply_text);
          }
          return;
        } catch (error) {
          this.logger.error(
            `Nora agent expense flow failed, falling back to planner: ${String(error)}`,
          );
          // fall through to the planner path below
        }
      }

      if (
        process.env.NORA_WHATSAPP_GENERAL_AGENT === "true" &&
        "userId" in sender &&
        sender.userId &&
        !openCase &&
        !mediaPayload
      ) {
        try {
          const scopedToken = await this.authService.mintScopedToken(sender.userId);
          const agentResponse = await this.requestNoraGeneralAgent({
            current_message: message.body,
            history: context.recent_messages,
            conversation_id: conversation.id,
            auth: `Bearer ${scopedToken}`,
          });

          await this.prisma.noraActionLog.update({
            where: { id: actionLog.id },
            data: {
              status: agentResponse.executed_entity
                ? NoraActionStatus.executed
                : NoraActionStatus.proposed,
              output: agentResponse as unknown as Prisma.InputJsonObject,
            },
          });

          if (agentResponse.reply_text) {
            await this.whatsAppService.sendAgentReply(conversation.id, agentResponse.reply_text);
          }
          return;
        } catch (error) {
          this.logger.error(
            `Nora general agent failed, falling back to planner: ${String(error)}`,
          );
          // fall through to the planner path below
        }
      }

      const noraResponse = await this.requestNoraRoute({
        sender_type: sender.senderType,
        message: message.body,
        conversation_id: conversation.id,
        customer:
          context.customer ??
          ("customerId" in sender
            ? {
                id: sender.customerId,
              }
            : undefined),
        contact: context.contact ?? undefined,
        companies: context.companies,
        customer_zones: context.customer_zones,
        recent_messages: context.recent_messages,
        ...(openCase && { open_case: this.openCasePayload(openCase) }),
        ...(mediaPayload && { media: mediaPayload }),
        ...("userId" in sender
          ? {
              user: {
                id: sender.userId,
                role: sender.userRole,
                name: sender.userName,
                email: sender.userEmail,
              },
            }
          : {}),
      });

      const automationResult = await this.processOrderCandidate(
        noraResponse,
        conversation.id,
        sender,
      );

      if (automationResult?.decision === "created") {
        const orderCase = await this.noraCaseService.findOpenCase(conversation.id);
        if (orderCase && orderCase.type === NoraConversationCaseType.order) {
          await this.noraCaseService.updateCase(orderCase.id, {
            status: NoraConversationCaseStatus.executed,
          });
        }
      }

      const caseResult = await this.processCaseTransition(
        noraResponse,
        conversation.id,
        message,
        sender,
      );
      const output = {
        ...noraResponse,
        ...(automationResult && { order_automation: this.toJsonSafeValue(automationResult) }),
        ...(caseResult && { case_transition_result: this.toJsonSafeValue(caseResult) }),
      };

      const updatedLog = await this.prisma.noraActionLog.update({
        where: { id: actionLog.id },
        data: {
          status:
            automationResult?.decision === "created"
              ? NoraActionStatus.executed
              : NoraActionStatus.proposed,
          output: output as Prisma.InputJsonValue,
        },
      });

      const suggestedReply = this.extractSuggestedReply(noraResponse, automationResult);
      if (suggestedReply && this.shouldAutoReply(noraResponse, automationResult)) {
        try {
          await this.whatsAppService.sendAgentReply(conversation.id, suggestedReply);
          this.logger.log(`Nora auto-replied to conversation ${conversation.id}: "${suggestedReply.substring(0, 60)}..."`);
        } catch (sendError) {
          this.logger.error(`Failed to send Nora reply to conversation ${conversation.id}: ${this.safeErrorMessage(sendError)}`);
          await this.prisma.noraActionLog.update({
            where: { id: actionLog.id },
            data: {
              error: this.safeErrorMessage(sendError),
            },
          });
        }
      }

      // Once the case exists and the immediate reply is out, run OCR on the
      // attached support in the background so we never block the webhook.
      if (caseResult && mediaPayload && this.isStartExpenseTransition(noraResponse)) {
        this.expenseExtraction.extractForCaseInBackground({
          caseId: caseResult.id,
          conversationId: conversation.id,
          message,
        });
      }

      return updatedLog;
    } catch (error) {
      return this.prisma.noraActionLog.update({
        where: { id: actionLog.id },
        data: {
          status: NoraActionStatus.failed,
          error: this.safeErrorMessage(error),
        },
      });
    }
  }

  private modeFor(senderType: WhatsAppSenderType) {
    if (
      senderType === WhatsAppSenderType.cliente ||
      senderType === WhatsAppSenderType.desconocido
    ) {
      return "cliente";
    }

    if (senderType === WhatsAppSenderType.admin) {
      return "admin";
    }

    return "comercial";
  }

  private updateConversationIdentity(conversationId: string, sender: ResolvedWhatsAppSender) {
    if (sender.senderType === WhatsAppSenderType.cliente) {
      return this.prisma.whatsAppConversation.update({
        where: { id: conversationId },
        data: {
          senderType: sender.senderType,
          customerId: sender.customerId,
          contactId: sender.contactId,
        },
      });
    }

    if (
      sender.senderType === WhatsAppSenderType.admin ||
      sender.senderType === WhatsAppSenderType.comercial
    ) {
      return this.prisma.whatsAppConversation.update({
        where: { id: conversationId },
        data: {
          senderType: sender.senderType,
          customerId: null,
          contactId: null,
        },
      });
    }

    return Promise.resolve(null);
  }

  private isExpenseFlowTurn(openCaseType?: string): boolean {
    if (process.env.NORA_WHATSAPP_AGENT_EXPENSES !== "true") {
      return false;
    }
    // Only an EXISTING expense case routes to the agent. The first media turn
    // must go through the planner, which creates the case + queues OCR; the
    // agent has no data to register until that has happened.
    return openCaseType === "expense";
  }

  private async requestNoraAgent(payload: Record<string, unknown>) {
    const noraApiUrl = process.env.NORA_API_URL ?? "http://localhost:8000";
    const response = await fetch(`${noraApiUrl}/whatsapp/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Nora agent request failed with status ${response.status}`);
    }
    return response.json() as Promise<{
      reply_text: string;
      case_update: Record<string, unknown> | null;
      executed_entity: Record<string, unknown> | null;
    }>;
  }

  private async requestNoraGeneralAgent(payload: Record<string, unknown>) {
    const noraApiUrl = process.env.NORA_API_URL ?? "http://localhost:8000";
    const response = await fetch(`${noraApiUrl}/whatsapp/agent/general`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Nora general agent request failed with status ${response.status}`);
    }
    return response.json() as Promise<{
      reply_text: string;
      case_update: Record<string, unknown> | null;
      executed_entity: Record<string, unknown> | null;
    }>;
  }

  private async requestNoraRoute(payload: Prisma.InputJsonObject) {
    const noraApiUrl = process.env.NORA_API_URL ?? "http://localhost:8000";
    const response = await fetch(`${noraApiUrl}/whatsapp/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Nora route request failed with status ${response.status}`);
    }

    return response.json() as Promise<Record<string, unknown>>;
  }

  private async processCaseTransition(
    noraResponse: Record<string, unknown>,
    conversationId: string,
    message: WhatsAppMessage,
    sender: ResolvedWhatsAppSender,
  ) {
    const transition = noraResponse.case_transition;
    if (!transition || typeof transition !== "object" || Array.isArray(transition)) {
      return undefined;
    }

    const source = transition as Record<string, unknown>;
    const action = this.stringValue(source.action);
    const actorUserId = "userId" in sender ? sender.userId : null;

    if (action === "create_new_customer_subcase") {
      const caseId = this.stringValue(source.caseId);
      if (!caseId) {
        return undefined;
      }
      const orderCase = await this.prisma.noraConversationCase.findFirst({
        where: { id: caseId, conversationId },
      });
      if (!orderCase) {
        return undefined;
      }
      return this.noraCaseService.createNewCustomerSubcase(orderCase, actorUserId);
    }

    if (action === "start_case") {
      const type = this.stringValue(source.type);
      if (type === NoraConversationCaseType.expense) {
        const attachment = this.caseAttachmentFromMessage(message);
        return this.noraCaseService.createCase({
          conversationId,
          type: NoraConversationCaseType.expense,
          extractedData: this.objectValue(source.extractedData) ?? {},
          missingFields: this.stringArrayValue(source.missingFields),
          attachments: attachment ? [attachment] : [],
          lastQuestion: this.stringValue(source.lastQuestion) ?? null,
          riskLevel: "medium",
          createdByUserId: actorUserId,
        });
      }
      if (type === NoraConversationCaseType.order) {
        const missingFields = this.stringArrayValue(source.missingFields);
        return this.noraCaseService.createCase({
          conversationId,
          type: NoraConversationCaseType.order,
          status:
            missingFields.length === 0
              ? NoraConversationCaseStatus.ready_for_review
              : NoraConversationCaseStatus.collecting_info,
          extractedData: this.objectValue(source.extractedData) ?? {},
          missingFields,
          lastQuestion: this.stringValue(source.lastQuestion) ?? null,
          riskLevel: "high",
          createdByUserId: actorUserId,
        });
      }
      return undefined;
    }

    if (action === "update_case") {
      const caseId = this.stringValue(source.caseId);
      if (!caseId) {
        return undefined;
      }
      const existingCase = await this.prisma.noraConversationCase.findFirst({
        where: { id: caseId, conversationId },
      });
      if (!existingCase) {
        return undefined;
      }
      const nextMissing = this.stringArrayValue(source.missingFields);
      return this.noraCaseService.updateCase(caseId, {
        extractedData: this.objectValue(source.extractedData) ?? {},
        missingFields: nextMissing,
        lastQuestion: this.stringValue(source.lastQuestion) ?? null,
        ...(existingCase.type === NoraConversationCaseType.order &&
          nextMissing.length === 0 && {
            status: NoraConversationCaseStatus.ready_for_review,
          }),
      });
    }

    return undefined;
  }

  private async processOrderCandidate(
    noraResponse: Record<string, unknown>,
    conversationId: string,
    sender: ResolvedWhatsAppSender,
  ): Promise<AutomationRoutingResult | undefined> {
    if (sender.senderType === WhatsAppSenderType.desconocido) {
      return undefined;
    }

    if (noraResponse.intent !== "pedido") {
      return undefined;
    }

    const candidate = this.extractOrderCandidate(noraResponse.order_candidate);
    if (!candidate) {
      return undefined;
    }

    if (candidate.items.length === 0) {
      return {
        decision: "needs_clarification",
        missingField: "items",
        question: "Para preparar el pedido, enviame producto y cantidad mayor a cero.",
      };
    }

    const existingAutomatedOrder = await this.findExistingAutomatedOrder(conversationId);
    if (existingAutomatedOrder) {
      return {
        decision: "human_review",
        reason: "La conversacion ya tiene un pedido creado por automatizacion de Nora.",
        existingOrder: existingAutomatedOrder,
      };
    }

    const actor = await this.automationActorFor(sender);
    if (!actor) {
      return {
        decision: "human_review",
        reason: "NORA_AUTOMATION_USER_ID no esta configurado o no corresponde a un usuario activo.",
        proposal: candidate,
      };
    }

    return this.orderAutomation.process(
      actor,
      conversationId,
      candidate,
    ) as Promise<AutomationRoutingResult>;
  }

  private extractOrderCandidate(candidate: unknown): ProcessOrderAutomationDto | undefined {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return undefined;
    }

    const source = candidate as Record<string, unknown>;
    const items = Array.isArray(source.items)
      ? source.items
          .map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              return null;
            }

            const itemSource = item as Record<string, unknown>;
            const productRef = this.stringValue(itemSource.productRef);
            const quantity = Number(itemSource.quantity);

            if (!productRef || !Number.isFinite(quantity) || quantity <= 0) {
              return null;
            }

            return {
              productRef,
              quantity,
              ...(this.stringValue(itemSource.presentation) && {
                presentation: this.stringValue(itemSource.presentation),
              }),
              ...(this.stringValue(itemSource.notes) && {
                notes: this.stringValue(itemSource.notes),
              }),
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null)
      : [];

    return {
      ...(this.stringValue(source.companyRef) && {
        companyRef: this.stringValue(source.companyRef),
      }),
      ...(this.stringValue(source.customerRef) && {
        customerRef: this.stringValue(source.customerRef),
      }),
      ...(this.stringValue(source.customerZoneId) && {
        customerZoneId: this.stringValue(source.customerZoneId),
      }),
      ...(this.stringValue(source.zoneRef) && {
        zoneRef: this.stringValue(source.zoneRef),
      }),
      items,
      ...(this.stringValue(source.deliveryInstructions) && {
        deliveryInstructions: this.stringValue(source.deliveryInstructions),
      }),
      ...(this.stringValue(source.notes) && {
        notes: this.stringValue(source.notes),
      }),
    };
  }

  private async automationActorFor(sender: ResolvedWhatsAppSender): Promise<AuthUser | null> {
    if ("userId" in sender) {
      return {
        id: sender.userId,
        email: sender.userEmail,
        role: sender.userRole,
      };
    }

    const automationUserId = process.env.NORA_AUTOMATION_USER_ID?.trim();
    if (!automationUserId) {
      return null;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: automationUserId },
    });

    if (!user?.active) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }

  private async findExistingAutomatedOrder(conversationId: string) {
    const existingOrder = await this.prisma.order.findFirst({
      where: { sourceConversationId: conversationId },
      orderBy: { createdAt: "desc" },
      include: { items: true, customer: true },
    });

    if (!existingOrder) {
      return null;
    }

    const actionLogs = await this.prisma.noraActionLog.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const hasAutomationCreatedOrder = actionLogs.some((actionLog) => {
      if (!actionLog.output || typeof actionLog.output !== "object" || Array.isArray(actionLog.output)) {
        return false;
      }

      const output = actionLog.output as Record<string, unknown>;
      const automation = output.order_automation;
      return (
        automation !== null &&
        typeof automation === "object" &&
        !Array.isArray(automation) &&
        (automation as Record<string, unknown>).decision === "created"
      );
    });

    return hasAutomationCreatedOrder ? existingOrder : null;
  }

  private extractSuggestedReply(
    noraResponse: Record<string, unknown>,
    automationResult?: { reply?: unknown; question?: unknown },
  ): string | undefined {
    const automationReply =
      this.stringValue(automationResult?.reply) ?? this.stringValue(automationResult?.question);
    if (automationReply) {
      return automationReply;
    }

    const caseTransition =
      noraResponse.case_transition &&
      typeof noraResponse.case_transition === "object" &&
      !Array.isArray(noraResponse.case_transition)
        ? (noraResponse.case_transition as Record<string, unknown>)
        : null;
    const caseQuestion = this.stringValue(caseTransition?.lastQuestion);
    if (caseQuestion) {
      return caseQuestion;
    }

    const reply = noraResponse.suggested_reply;
    return this.stringValue(reply);
  }

  private shouldAutoReply(
    noraResponse: Record<string, unknown>,
    automationResult?: { decision?: unknown },
  ): boolean {
    if (
      automationResult?.decision === "created" ||
      automationResult?.decision === "needs_clarification"
    ) {
      return true;
    }

    return noraResponse.requires_human_review !== true;
  }

  private stringValue(value: unknown) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
  }

  private stringArrayValue(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  }

  private objectValue(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private isStartExpenseTransition(noraResponse: Record<string, unknown>): boolean {
    const transition = noraResponse.case_transition;
    if (!transition || typeof transition !== "object" || Array.isArray(transition)) {
      return false;
    }
    const source = transition as Record<string, unknown>;
    return source.action === "start_case" && source.type === NoraConversationCaseType.expense;
  }

  private openCasePayload(openCase: NoraConversationCase) {
    return {
      id: openCase.id,
      type: openCase.type,
      status: openCase.status,
      extractedData: openCase.extractedData,
      missingFields: Array.isArray(openCase.missingFields) ? openCase.missingFields : [],
      lastQuestion: openCase.lastQuestion,
    };
  }

  private mediaPayloadFromMessage(message: WhatsAppMessage):
    | {
        kind: "image" | "document";
        providerMediaId?: string;
        fileName?: string;
        contentType?: string;
        caption?: string;
      }
    | undefined {
    const payload =
      message.payload && typeof message.payload === "object" && !Array.isArray(message.payload)
        ? (message.payload as Record<string, unknown>)
        : {};
    const mediaKind = this.stringValue(payload.mediaKind);
    const kind =
      mediaKind === "image" || message.body === "[Imagen]"
        ? "image"
        : mediaKind === "document" || message.body === "[Documento]"
          ? "document"
          : null;

    if (!kind) {
      return undefined;
    }

    return {
      kind,
      providerMediaId: this.stringValue(payload.mediaId) ?? this.stringValue(payload.id),
      fileName: this.stringValue(payload.fileName),
      contentType: this.stringValue(payload.contentType),
      caption: this.stringValue(payload.caption),
    };
  }

  private caseAttachmentFromMessage(message: WhatsAppMessage): NoraCaseAttachment | undefined {
    const mediaPayload = this.mediaPayloadFromMessage(message);
    if (!mediaPayload) {
      return undefined;
    }
    const payload =
      message.payload && typeof message.payload === "object" && !Array.isArray(message.payload)
        ? (message.payload as Record<string, unknown>)
        : {};

    return {
      messageId: message.id,
      kind: mediaPayload.kind,
      provider: "kapso",
      ...(mediaPayload.providerMediaId && { providerMediaId: mediaPayload.providerMediaId }),
      ...(mediaPayload.fileName && { fileName: mediaPayload.fileName }),
      ...(mediaPayload.contentType && { contentType: mediaPayload.contentType }),
      ...(mediaPayload.caption && { caption: mediaPayload.caption }),
      payload,
    };
  }

  private toJsonSafeValue(value: unknown) {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private safeErrorMessage(error: unknown) {
    return error instanceof Error && error.message
      ? error.message
      : "Nora route request failed";
  }
}

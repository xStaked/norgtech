import { Injectable, Logger } from "@nestjs/common";
import {
  NoraActionStatus,
  Prisma,
  UserRole,
  WhatsAppConversation,
  WhatsAppMessage,
  WhatsAppSenderType,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { ProcessOrderAutomationDto } from "./dto/process-order-automation.dto";
import { ResolvedWhatsAppSender, WhatsAppService } from "./whatsapp.service";
import { WhatsAppOrderAutomationService } from "./whatsapp-order-automation.service";

type RouteInboundMessageInput = {
  conversation: WhatsAppConversation;
  message: WhatsAppMessage;
};

@Injectable()
export class NoraRoutingService {
  private readonly logger = new Logger(NoraRoutingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsAppService: WhatsAppService,
    private readonly orderAutomation: WhatsAppOrderAutomationService,
  ) {}

  async routeInboundMessage({ conversation, message }: RouteInboundMessageInput) {
    const sender = await this.whatsAppService.resolveSenderByPhone(conversation.phone);

    await this.updateConversationIdentity(conversation.id, sender);

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
      const output = {
        ...noraResponse,
        ...(automationResult && { order_automation: this.toJsonSafeValue(automationResult) }),
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

  private async processOrderCandidate(
    noraResponse: Record<string, unknown>,
    conversationId: string,
    sender: ResolvedWhatsAppSender,
  ) {
    if (noraResponse.intent !== "pedido") {
      return undefined;
    }

    const candidate = this.extractOrderCandidate(noraResponse.order_candidate);
    if (!candidate) {
      return undefined;
    }

    return this.orderAutomation.process(
      this.automationActorFor(sender),
      conversationId,
      candidate,
    );
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

            if (!productRef || !Number.isFinite(quantity)) {
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

  private automationActorFor(sender: ResolvedWhatsAppSender): AuthUser {
    if ("userId" in sender) {
      return {
        id: sender.userId,
        email: sender.userEmail,
        role: sender.userRole,
      };
    }

    return {
      id: process.env.NORA_AUTOMATION_USER_ID ?? "admin-user-id",
      email: "nora@norgtech.local",
      role: UserRole.administrador,
    };
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

  private toJsonSafeValue(value: unknown) {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private safeErrorMessage(error: unknown) {
    return error instanceof Error && error.message
      ? error.message
      : "Nora route request failed";
  }
}

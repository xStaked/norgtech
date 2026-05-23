import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma, WhatsAppMessageDirection, WhatsAppMessageRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { KapsoWebhookDto } from "./dto/kapso-webhook.dto";
import { NoraRoutingService } from "./nora-routing.service";

const MESSAGE_RECEIVED_EVENT = "whatsapp.message.received";

type NormalizedKapsoMessage = {
  phoneNumberId: string;
  waId: string;
  messageId: string;
  senderName?: string;
  body: string;
  payload: Record<string, unknown>;
};

@Injectable()
export class KapsoWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly noraRoutingService: NoraRoutingService,
  ) {}

  async handle(dto: KapsoWebhookDto) {
    if (dto.type !== MESSAGE_RECEIVED_EVENT) {
      return { ignored: true };
    }

    const normalized = this.normalizeMessage(dto);

    const result = await this.prisma.$transaction(async (tx) => {
      const account = await tx.whatsAppAccount.upsert({
        where: { phoneNumberId: normalized.phoneNumberId },
        update: {},
        create: {
          phoneNumberId: normalized.phoneNumberId,
          phoneNumber: normalized.phoneNumberId,
          displayName: "WhatsApp",
        },
      });

      const lastMessageAt = new Date();
      const conversation = await tx.whatsAppConversation.upsert({
        where: {
          accountId_waId: {
            accountId: account.id,
            waId: normalized.waId,
          },
        },
        update: {
          lastMessageText: normalized.body,
          lastMessageAt,
          ...(normalized.senderName !== undefined && { senderName: normalized.senderName }),
        },
        create: {
          accountId: account.id,
          waId: normalized.waId,
          phone: normalized.waId,
          ...(normalized.senderName !== undefined && { senderName: normalized.senderName }),
          lastMessageText: normalized.body,
          lastMessageAt,
        },
      });

      const message = await tx.whatsAppMessage.create({
        data: {
          conversationId: conversation.id,
          kapsoMessageId: normalized.messageId,
          metaMessageId: normalized.messageId,
          direction: WhatsAppMessageDirection.inbound,
          role: WhatsAppMessageRole.user,
          body: normalized.body,
          payload: normalized.payload as Prisma.InputJsonValue,
        },
      });

      return {
        ignored: false,
        conversation,
        message,
        conversationId: conversation.id,
        messageId: message.id,
      };
    });

    await this.noraRoutingService.routeInboundMessage({
      conversation: result.conversation,
      message: result.message,
    });

    return {
      ignored: result.ignored,
      conversationId: result.conversationId,
      messageId: result.messageId,
    };
  }

  private normalizeMessage(dto: KapsoWebhookDto): NormalizedKapsoMessage {
    const data = dto.data;
    const message = this.asRecord(data.message);
    const phoneNumberId = this.asString(data.phone_number_id) ?? this.asString(data.phoneNumberId);
    const messageId = this.asString(message?.id);
    const waId = this.asString(message?.from);

    if (!phoneNumberId || !messageId || !waId) {
      throw new BadRequestException("Kapso message webhook is missing required fields");
    }

    const text = this.asRecord(message?.text);
    const body = this.asString(text?.body);

    if (!body) {
      throw new BadRequestException("Kapso message webhook is missing required fields");
    }

    const profile = this.asRecord(message?.profile);
    const senderName = this.asString(profile?.name);

    return { phoneNumberId, waId, messageId, senderName, body, payload: data };
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private asString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim().length > 0 ? value : undefined;
  }
}

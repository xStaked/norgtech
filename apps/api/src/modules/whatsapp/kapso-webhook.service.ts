import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma, WhatsAppMessageDirection, WhatsAppMessageRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { KapsoWebhookDto } from "./dto/kapso-webhook.dto";

const MESSAGE_RECEIVED_EVENT = "whatsapp.message.received";
const UNSUPPORTED_MESSAGE_BODY = "[mensaje no soportado]";

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
  constructor(private readonly prisma: PrismaService) {}

  async handle(dto: KapsoWebhookDto) {
    if (dto.type !== MESSAGE_RECEIVED_EVENT) {
      return { ignored: true };
    }

    const normalized = this.normalizeMessage(dto);

    return this.prisma.$transaction(async (tx) => {
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
        conversationId: conversation.id,
        messageId: message.id,
      };
    });
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
    const profile = this.asRecord(message?.profile);
    const body = this.asString(text?.body) ?? UNSUPPORTED_MESSAGE_BODY;
    const senderName = this.asString(profile?.name);

    return {
      phoneNumberId,
      waId,
      messageId,
      senderName,
      body,
      payload: data,
    };
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

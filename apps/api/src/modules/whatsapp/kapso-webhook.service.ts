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
    if (!this.isInboundMessageEvent(dto)) {
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
    const data = this.getPayloadData(dto);
    const message = this.asRecord(data.message);
    const conversation = this.asRecord(data.conversation);
    const conversationKapso = this.asRecord(conversation?.kapso);
    const messageKapso = this.asRecord(message?.kapso);
    const phoneNumberId =
      this.asString(data.phone_number_id) ??
      this.asString(data.phoneNumberId) ??
      this.asString(conversation?.phone_number_id) ??
      this.asString(conversation?.phoneNumberId);
    const messageId = this.asString(message?.id);
    const waId =
      this.asString(message?.from) ??
      this.asString(conversation?.phone_number) ??
      this.asString(conversation?.phoneNumber);

    if (!phoneNumberId || !messageId || !waId) {
      throw new BadRequestException("Kapso message webhook is missing required fields");
    }

    const text = this.asRecord(message?.text);
    const image = this.asRecord(message?.image);
    const document = this.asRecord(message?.document);
    const profile = this.asRecord(message?.profile);
    const senderName =
      this.asString(profile?.name) ??
      this.asString(conversationKapso?.contact_name) ??
      this.asString(conversationKapso?.contactName);
    const body =
      this.asString(text?.body) ??
      this.asString(image?.caption) ??
      this.asString(document?.caption) ??
      this.asString(messageKapso?.content) ??
      this.asString(conversationKapso?.last_message_text);

    if (!body) {
      if (image?.id) {
        return {
          phoneNumberId,
          waId,
          messageId,
          senderName,
          body: "[Imagen]",
          payload: {
            ...data,
            mediaKind: "image",
            mediaId: this.asString(image.id),
            contentType: this.asString(image.mime_type),
            caption: this.asString(image.caption),
          },
        };
      }
      if (document?.id) {
        return {
          phoneNumberId,
          waId,
          messageId,
          senderName,
          body: "[Documento]",
          payload: {
            ...data,
            mediaKind: "document",
            mediaId: this.asString(document.id),
            contentType: this.asString(document.mime_type),
            fileName: this.asString(document.filename),
            caption: this.asString(document.caption),
          },
        };
      }
      throw new BadRequestException("Kapso message webhook is missing required fields");
    }

    return {
      phoneNumberId,
      waId,
      messageId,
      senderName,
      body,
      payload: {
        ...data,
        ...(image?.id
          ? {
              mediaKind: "image",
              mediaId: this.asString(image.id),
              contentType: this.asString(image.mime_type),
              caption: this.asString(image.caption),
            }
          : {}),
        ...(document?.id
          ? {
              mediaKind: "document",
              mediaId: this.asString(document.id),
              contentType: this.asString(document.mime_type),
              fileName: this.asString(document.filename),
              caption: this.asString(document.caption),
            }
          : {}),
      },
    };
  }

  private isInboundMessageEvent(dto: KapsoWebhookDto) {
    if (dto.type !== undefined) {
      return dto.type === MESSAGE_RECEIVED_EVENT;
    }

    const data = this.getPayloadData(dto);
    const message = this.asRecord(data.message);
    const messageKapso = this.asRecord(message?.kapso);
    const direction = this.asString(messageKapso?.direction);

    return Boolean(
      data.phone_number_id &&
        message?.id &&
        (direction === undefined || direction === "inbound"),
    );
  }

  private getPayloadData(dto: KapsoWebhookDto) {
    if (Array.isArray(dto.data) && dto.data.length > 0) {
      return dto.data[0] as Record<string, unknown>;
    }
    return (dto.data as Record<string, unknown> | undefined) ?? (dto as unknown as Record<string, unknown>);
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

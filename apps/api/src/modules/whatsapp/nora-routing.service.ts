import { Injectable } from "@nestjs/common";
import {
  NoraActionStatus,
  Prisma,
  WhatsAppConversation,
  WhatsAppMessage,
  WhatsAppSenderType,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ResolvedWhatsAppSender, WhatsAppService } from "./whatsapp.service";

type RouteInboundMessageInput = {
  conversation: WhatsAppConversation;
  message: WhatsAppMessage;
};

@Injectable()
export class NoraRoutingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  async routeInboundMessage({ conversation, message }: RouteInboundMessageInput) {
    const sender = await this.whatsAppService.resolveSenderByPhone(conversation.phone);

    await this.updateConversationIdentity(conversation.id, sender);

    return this.prisma.noraActionLog.create({
      data: {
        conversationId: conversation.id,
        mode: this.modeFor(sender.senderType),
        action: "classify_inbound_message",
        status: NoraActionStatus.proposed,
        input: {
          body: message.body,
          conversationId: conversation.id,
          senderType: sender.senderType,
          customerId: "customerId" in sender ? sender.customerId : null,
          contactId: "contactId" in sender ? sender.contactId : null,
        } satisfies Prisma.InputJsonObject,
      },
    });
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
        },
      });
    }

    return Promise.resolve(null);
  }
}

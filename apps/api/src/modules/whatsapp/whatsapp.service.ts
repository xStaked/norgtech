import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { SendMessageResponse, WhatsAppClient } from "@kapso/whatsapp-cloud-api";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { SendWhatsAppMessageDto } from "./dto/send-whatsapp-message.dto";
import { UpdateConversationDto } from "./dto/update-conversation.dto";

const conversationSummaryInclude = {
  customer: true,
  contact: true,
  assignedToUser: true,
  tags: true,
} satisfies Prisma.WhatsAppConversationInclude;

const conversationDetailInclude = {
  ...conversationSummaryInclude,
  notes: {
    orderBy: { createdAt: "asc" },
  },
  messages: {
    orderBy: { createdAt: "asc" },
  },
  orders: {
    include: {
      items: true,
      customer: true,
    },
  },
  noraActions: {
    orderBy: { createdAt: "desc" },
  },
} satisfies Prisma.WhatsAppConversationInclude;

const sendMessageConversationInclude = {
  account: true,
} satisfies Prisma.WhatsAppConversationInclude;

@Injectable()
export class WhatsAppService {
  constructor(private readonly prisma: PrismaService) {}

  listConversations() {
    return this.prisma.whatsAppConversation.findMany({
      include: conversationSummaryInclude,
      orderBy: { updatedAt: "desc" },
    });
  }

  async getConversation(id: string) {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id },
      include: conversationDetailInclude,
    });

    if (!conversation) {
      throw new NotFoundException("WhatsApp conversation not found");
    }

    return conversation;
  }

  async updateConversation(id: string, dto: UpdateConversationDto) {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id },
    });

    if (!conversation) {
      throw new NotFoundException("WhatsApp conversation not found");
    }

    await this.assertReferencesExist(conversation, dto);

    const shouldClearContact = dto.customerId === null && dto.contactId === undefined;

    return this.prisma.whatsAppConversation.update({
      where: { id },
      data: {
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.assignedToUserId !== undefined && {
          assignedToUserId: dto.assignedToUserId,
        }),
        ...(dto.customerId !== undefined && { customerId: dto.customerId }),
        ...((dto.contactId !== undefined || shouldClearContact) && {
          contactId: dto.contactId ?? null,
        }),
      },
      include: conversationDetailInclude,
    });
  }

  async createNote(user: AuthUser, conversationId: string, body: string) {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException("WhatsApp conversation not found");
    }

    return this.prisma.whatsAppInternalNote.create({
      data: {
        conversationId,
        authorUserId: user.id,
        body,
      },
    });
  }

  async sendMessage(user: AuthUser, conversationId: string, dto: SendWhatsAppMessageDto) {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
      include: sendMessageConversationInclude,
    });

    if (!conversation) {
      throw new NotFoundException("WhatsApp conversation not found");
    }

    const providerResult = await this.sendViaKapso(
      conversation.account.phoneNumberId,
      conversation.waId,
      dto.body,
    );

    return this.prisma.whatsAppMessage.create({
      data: {
        conversationId,
        direction: "outbound",
        role: "assistant",
        authorUserId: user.id,
        body: dto.body,
        payload: {
          provider: "kapso",
          providerResult: providerResult as Prisma.InputJsonValue,
        },
        deliveryStatus: "queued",
      },
    });
  }

  private async sendViaKapso(
    phoneNumberId: string,
    to: string,
    body: string,
  ): Promise<SendMessageResponse | Record<string, unknown>> {
    const kapsoApiKey = process.env.KAPSO_API_KEY;

    if (!kapsoApiKey || process.env.NODE_ENV === "test") {
      return {
        id: "kapso-test-message",
        status: "queued",
        phoneNumberId,
        to,
        body,
      };
    }

    const client = new WhatsAppClient({
      baseUrl: process.env.KAPSO_BASE_URL ?? "https://api.kapso.ai/meta/whatsapp",
      kapsoApiKey,
    });

    return client.messages.sendText({
      phoneNumberId,
      to,
      body,
    });
  }

  private async assertReferencesExist(
    conversation: { customerId: string | null; contactId: string | null },
    dto: UpdateConversationDto,
  ) {
    if (dto.assignedToUserId !== undefined && dto.assignedToUserId !== null) {
      const assignedUser = await this.prisma.user.findUnique({
        where: { id: dto.assignedToUserId },
      });

      if (!assignedUser) {
        throw new NotFoundException("Assigned user not found");
      }
    }

    if (dto.customerId !== undefined && dto.customerId !== null) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: dto.customerId },
      });

      if (!customer) {
        throw new NotFoundException("Customer not found");
      }
    }

    const effectiveCustomerId =
      dto.customerId !== undefined ? dto.customerId : conversation.customerId;
    const effectiveContactId =
      dto.customerId === null && dto.contactId === undefined
        ? null
        : dto.contactId !== undefined
          ? dto.contactId
          : conversation.contactId;

    if (effectiveContactId !== null && effectiveCustomerId === null) {
      throw new BadRequestException("Contact requires customer");
    }

    if (effectiveContactId !== null) {
      const contact = await this.prisma.contact.findUnique({
        where: { id: effectiveContactId },
      });

      if (!contact) {
        throw new NotFoundException("Contact not found");
      }

      if (contact.customerId !== effectiveCustomerId) {
        throw new BadRequestException("Contact does not belong to customer");
      }
    }
  }
}

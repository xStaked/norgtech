import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { SendMessageResponse, WhatsAppClient } from "@kapso/whatsapp-cloud-api";
import { Prisma, UserRole, WhatsAppSenderType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateOrderDto } from "../orders/dto/create-order.dto";
import { OrdersService } from "../orders/orders.service";
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

export type ResolvedWhatsAppSender =
  | {
      senderType: typeof WhatsAppSenderType.cliente;
      contactId: string;
      customerId: string;
    }
  | {
      senderType: typeof WhatsAppSenderType.admin;
      userId: string;
    }
  | {
      senderType: typeof WhatsAppSenderType.comercial;
      userId: string;
    }
  | {
      senderType: typeof WhatsAppSenderType.desconocido;
    };

@Injectable()
export class WhatsAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
  ) {}

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
    return this.createAndSendOutboundMessage(conversationId, dto.body, user.id);
  }

  async sendAgentReply(conversationId: string, body: string) {
    return this.createAndSendOutboundMessage(conversationId, body, null);
  }

  private async createAndSendOutboundMessage(
    conversationId: string,
    body: string,
    authorUserId: string | null,
  ) {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
      include: sendMessageConversationInclude,
    });

    if (!conversation) {
      throw new NotFoundException("WhatsApp conversation not found");
    }

    const attemptedAt = new Date();
    const message = await this.prisma.whatsAppMessage.create({
      data: {
        conversationId,
        direction: "outbound",
        role: "assistant",
        ...(authorUserId && { authorUserId }),
        body,
        payload: { provider: "kapso" },
        deliveryStatus: "queued",
      },
    });

    await this.prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: {
        lastMessageText: body,
        lastMessageAt: attemptedAt,
      },
    });

    try {
      const providerResult = await this.sendViaKapso(
        conversation.account.phoneNumberId,
        conversation.waId,
        body,
      );

      return this.prisma.whatsAppMessage.update({
        where: { id: message.id },
        data: {
          deliveryStatus: "sent",
          payload: {
            provider: "kapso",
            providerResult: providerResult as Prisma.InputJsonValue,
          },
        },
      });
    } catch (error) {
      await this.prisma.whatsAppMessage.update({
        where: { id: message.id },
        data: {
          deliveryStatus: "failed",
          payload: {
            provider: "kapso",
            error: this.getSafeErrorMessage(error),
          },
        },
      });

      throw new BadGatewayException("Could not send WhatsApp message");
    }
  }

  async createOrderDraft(user: AuthUser, conversationId: string, dto: CreateOrderDto) {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException("WhatsApp conversation not found");
    }

    return this.ordersService.create(user, {
      ...dto,
      sourceConversationId: conversationId,
      approvalStatus: dto.approvalStatus ?? "en_revision",
    });
  }

  async getNoraConversationContext(conversationId: string) {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        customer: {
          select: {
            id: true,
            displayName: true,
            legalName: true,
            customerZones: {
              where: { isActive: true },
              select: {
                id: true,
                zone: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        contact: {
          select: {
            id: true,
            fullName: true,
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 8,
          select: {
            role: true,
            body: true,
            createdAt: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException("WhatsApp conversation not found");
    }

    const companies = await this.prisma.company.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, prefix: true },
    });

    return {
      customer: conversation.customer
        ? {
            id: conversation.customer.id,
            displayName: conversation.customer.displayName,
            legalName: conversation.customer.legalName,
          }
        : null,
      contact: conversation.contact
        ? {
            id: conversation.contact.id,
            fullName: conversation.contact.fullName,
          }
        : null,
      companies,
      customer_zones:
        conversation.customer?.customerZones.map((customerZone) => ({
          id: customerZone.id,
          name: customerZone.zone.name,
        })) ?? [],
      recent_messages: conversation.messages
        .slice()
        .reverse()
        .map((message) => ({
          role: message.role,
          body: message.body,
        })),
    };
  }

  async resolveSenderByPhone(phone: string): Promise<ResolvedWhatsAppSender> {
    const normalizedPhone = this.normalizePhone(phone);

    const exactContact = await this.prisma.contact.findFirst({
      where: { phone },
      include: { customer: true },
    });
    const contact = exactContact ?? (await this.findContactByNormalizedPhone(normalizedPhone));

    if (contact) {
      return {
        senderType: WhatsAppSenderType.cliente,
        contactId: contact.id,
        customerId: contact.customerId,
      };
    }

    const mappedUser = await this.resolveUserByPhoneInNonProduction(normalizedPhone);

    if (mappedUser) {
      return {
        senderType: this.senderTypeForUserRole(mappedUser.role),
        userId: mappedUser.id,
      };
    }

    return { senderType: WhatsAppSenderType.desconocido };
  }

  private async sendViaKapso(
    phoneNumberId: string,
    to: string,
    body: string,
  ): Promise<SendMessageResponse | Record<string, unknown>> {
    const kapsoApiKey = process.env.KAPSO_API_KEY;

    if (process.env.NODE_ENV === "test" && process.env.KAPSO_TEST_SEND_FAILURE === "1") {
      throw new Error("Forced Kapso send failure");
    }

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
      baseUrl: process.env.KAPSO_API_BASE_URL ?? "https://api.kapso.ai/meta/whatsapp",
      kapsoApiKey,
    });

    return client.messages.sendText({
      phoneNumberId,
      to,
      body,
    });
  }

  private getSafeErrorMessage(error: unknown) {
    return error instanceof Error && error.message
      ? error.message
      : "WhatsApp provider send failed";
  }

  private normalizePhone(phone: string) {
    return phone.replace(/\D/g, "");
  }

  private async findContactByNormalizedPhone(normalizedPhone: string) {
    const contacts = await this.prisma.contact.findMany({
      where: { phone: { not: null } },
      include: { customer: true },
    });

    return (
      contacts.find((contact) => this.normalizePhone(contact.phone ?? "") === normalizedPhone) ??
      null
    );
  }

  private async resolveUserByPhoneInNonProduction(normalizedPhone: string) {
    if (process.env.NODE_ENV === "production") {
      return null;
    }

    // Production user-phone mapping must be added before commercial WhatsApp rollout.
    // Until then, avoid overloading email as a silent production identity source.
    const mappings = (process.env.WHATSAPP_TEST_USER_PHONE_MAP ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const match = mappings
      .map((item) => {
        const [phone, userId] = item.split(":").map((part) => part.trim());
        return { phone: this.normalizePhone(phone ?? ""), userId };
      })
      .find((item) => item.phone === normalizedPhone && item.userId);

    if (!match) {
      return null;
    }

    return this.prisma.user.findUnique({
      where: { id: match.userId },
    });
  }

  private senderTypeForUserRole(role: UserRole) {
    return role === UserRole.comercial || role === UserRole.director_comercial
      ? WhatsAppSenderType.comercial
      : WhatsAppSenderType.admin;
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

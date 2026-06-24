import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { SendMessageResponse, WhatsAppClient } from "@kapso/whatsapp-cloud-api";
import {
  NoraCaseRiskLevel,
  NoraConversationCaseStatus,
  NoraConversationCaseType,
  Prisma,
  UserRole,
  WhatsAppSenderType,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateOrderDto } from "../orders/dto/create-order.dto";
import { OrdersService } from "../orders/orders.service";
import { ProcessOrderAutomationDto } from "./dto/process-order-automation.dto";
import { SendWhatsAppMessageDto } from "./dto/send-whatsapp-message.dto";
import { UpdateConversationDto } from "./dto/update-conversation.dto";
import { NoraCaseService } from "./nora-case.service";
import { WhatsAppOrderAutomationService } from "./whatsapp-order-automation.service";

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
  noraCases: {
    orderBy: { updatedAt: "desc" },
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
      userRole: UserRole;
      userName: string;
      userEmail: string;
    }
  | {
      senderType: typeof WhatsAppSenderType.comercial;
      userId: string;
      userRole: UserRole;
      userName: string;
      userEmail: string;
    }
  | {
      senderType: typeof WhatsAppSenderType.desconocido;
    };

export type ExpenseCorrectionInput = {
  id: string;
  amount: Prisma.Decimal | number;
  category: string;
  expenseDate: Date;
  description: string;
  supplierName: string | null;
  supplierNit: string | null;
  invoiceNumber: string | null;
  paymentMethod: string | null;
  reviewNote: string | null;
  submittedByUserId: string;
  submittedBy: { name: string; phone: string | null } | null;
};

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly orderAutomation: WhatsAppOrderAutomationService,
    private readonly noraCaseService: NoraCaseService,
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
    return this.persistAndDispatch(conversationId, body, authorUserId, (phoneNumberId, waId) =>
      this.sendViaKapso(phoneNumberId, waId, body),
    );
  }

  async sendTemplateMessage(
    conversationId: string,
    templateName: string,
    languageCode: string,
    params: Array<{ name: string; text: string }>,
    previewBody: string,
  ) {
    return this.persistAndDispatch(conversationId, previewBody, null, (phoneNumberId, waId) =>
      this.sendViaKapsoTemplate(phoneNumberId, waId, templateName, languageCode, params),
    );
  }

  async notifyExpenseCorrection(expense: ExpenseCorrectionInput): Promise<void> {
    const phone = expense.submittedBy?.phone?.trim();
    if (!phone) {
      this.logger.warn(`Expense ${expense.id} correction: submitter has no phone, skipping WhatsApp`);
      return;
    }

    const account = await this.prisma.whatsAppAccount.findFirst();
    if (!account) {
      this.logger.warn(`Expense ${expense.id} correction: no WhatsAppAccount configured, skipping`);
      return;
    }

    const waId = this.normalizePhone(phone);
    const conversation = await this.prisma.whatsAppConversation.upsert({
      where: { accountId_waId: { accountId: account.id, waId } },
      update: {},
      create: {
        accountId: account.id,
        waId,
        phone,
        status: "pendiente",
        senderType: WhatsAppSenderType.comercial,
      },
      include: { account: true },
    });

    await this.noraCaseService.createCase({
      conversationId: conversation.id,
      type: NoraConversationCaseType.expense,
      status: NoraConversationCaseStatus.collecting_info,
      extractedData: {
        mode: "correction",
        expenseId: expense.id,
        reviewNote: expense.reviewNote ?? "",
        amount: Number(expense.amount),
        category: expense.category,
        expenseDate: expense.expenseDate.toISOString().slice(0, 10),
        description: expense.description,
        supplierName: expense.supplierName,
        supplierNit: expense.supplierNit,
        invoiceNumber: expense.invoiceNumber,
        paymentMethod: expense.paymentMethod,
      },
      missingFields: [],
      riskLevel: NoraCaseRiskLevel.medium,
      createdByUserId: expense.submittedByUserId,
    });

    const valor = new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(Number(expense.amount));

    await this.sendTemplateMessage(
      conversation.id,
      "correccion_gasto",
      "es",
      [
        { name: "nombre", text: expense.submittedBy?.name ?? "comercial" },
        { name: "valor", text: valor },
        { name: "motivo", text: expense.reviewNote ?? "" },
      ],
      `Hola ${expense.submittedBy?.name ?? ""}, tu gasto por ${valor} requiere corrección. Motivo: ${expense.reviewNote ?? ""}. Respóndeme aquí y te ayudo a corregirlo.`,
    );
  }

  private async persistAndDispatch(
    conversationId: string,
    body: string,
    authorUserId: string | null,
    dispatch: (
      phoneNumberId: string,
      waId: string,
    ) => Promise<SendMessageResponse | Record<string, unknown>>,
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
      data: { lastMessageText: body, lastMessageAt: attemptedAt },
    });

    try {
      const providerResult = await dispatch(conversation.account.phoneNumberId, conversation.waId);
      return this.prisma.whatsAppMessage.update({
        where: { id: message.id },
        data: {
          deliveryStatus: "sent",
          payload: { provider: "kapso", providerResult: providerResult as Prisma.InputJsonValue },
        },
      });
    } catch (error) {
      const safeError = this.getSafeErrorMessage(error);
      this.logger.error(
        `Kapso send failed for conversation ${conversation.id} (to: ${conversation.waId}): ${safeError}`,
      );
      await this.prisma.whatsAppMessage.update({
        where: { id: message.id },
        data: { deliveryStatus: "failed", payload: { provider: "kapso", error: safeError } },
      });
      throw new BadGatewayException("Could not send WhatsApp message");
    }
  }

  private async sendViaKapsoTemplate(
    phoneNumberId: string,
    to: string,
    templateName: string,
    languageCode: string,
    params: Array<{ name: string; text: string }>,
  ): Promise<SendMessageResponse | Record<string, unknown>> {
    const kapsoApiKey = process.env.KAPSO_API_KEY;

    if (!kapsoApiKey || process.env.NODE_ENV === "test") {
      return { id: "kapso-test-template", status: "queued", phoneNumberId, to, templateName };
    }

    const client = new WhatsAppClient({
      baseUrl: process.env.KAPSO_API_BASE_URL ?? "https://api.kapso.ai/meta/whatsapp",
      kapsoApiKey,
    });

    return client.messages.sendTemplate({
      phoneNumberId,
      to,
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [
          {
            type: "body",
            parameters: params.map((p) => ({ type: "text", parameter_name: p.name, text: p.text })),
          },
        ],
      },
    });
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

  async processOrderAutomation(
    user: AuthUser,
    conversationId: string,
    dto: ProcessOrderAutomationDto,
  ) {
    return this.orderAutomation.process(user, conversationId, dto);
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

    const mappedUser =
      (await this.findUserByNormalizedPhone(normalizedPhone)) ??
      (await this.resolveUserByPhoneInNonProduction(normalizedPhone));

    if (mappedUser) {
      return {
        senderType: this.senderTypeForUserRole(mappedUser.role),
        userId: mappedUser.id,
        userRole: mappedUser.role,
        userName: mappedUser.name,
        userEmail: mappedUser.email,
      };
    }

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

  async downloadMedia(phoneNumberId: string, mediaId: string): Promise<Buffer> {
    const kapsoApiKey = process.env.KAPSO_API_KEY;

    // Mirror sendViaKapso: avoid real network calls in tests / unconfigured envs.
    if (!kapsoApiKey || process.env.NODE_ENV === "test") {
      return Buffer.from(`kapso-test-media:${mediaId}`);
    }

    const client = new WhatsAppClient({
      baseUrl: process.env.KAPSO_API_BASE_URL ?? "https://api.kapso.ai/meta/whatsapp",
      kapsoApiKey,
    });

    const data = await client.media.download({
      mediaId,
      phoneNumberId,
      as: "arrayBuffer",
    });

    return Buffer.from(data as ArrayBuffer);
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

  private async findUserByNormalizedPhone(normalizedPhone: string) {
    const users = await this.prisma.user.findMany({
      where: { active: true, phone: { not: null } },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
      },
    });

    return (
      users.find((user) => this.normalizePhone(user.phone ?? "") === normalizedPhone) ??
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

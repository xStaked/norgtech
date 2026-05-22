import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthUser } from "../auth/types/authenticated-request";
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

    await this.assertReferencesExist(dto);

    return this.prisma.whatsAppConversation.update({
      where: { id },
      data: {
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.assignedToUserId !== undefined && {
          assignedToUserId: dto.assignedToUserId,
        }),
        ...(dto.customerId !== undefined && { customerId: dto.customerId }),
        ...(dto.contactId !== undefined && { contactId: dto.contactId }),
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

  private async assertReferencesExist(dto: UpdateConversationDto) {
    if (dto.assignedToUserId !== undefined) {
      const assignedUser = await this.prisma.user.findUnique({
        where: { id: dto.assignedToUserId },
      });

      if (!assignedUser) {
        throw new NotFoundException("Assigned user not found");
      }
    }

    if (dto.customerId !== undefined) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: dto.customerId },
      });

      if (!customer) {
        throw new NotFoundException("Customer not found");
      }
    }

    if (dto.contactId !== undefined) {
      const contact = await this.prisma.contact.findUnique({
        where: { id: dto.contactId },
      });

      if (!contact) {
        throw new NotFoundException("Contact not found");
      }
    }
  }
}

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { NoraConversationCaseStatus } from "@prisma/client";
import { AuthUser } from "../auth/types/authenticated-request";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateCommercialExpenseDto } from "../commercial-expenses/dto/create-commercial-expense.dto";
import { CommercialExpensesService } from "../commercial-expenses/commercial-expenses.service";
import { NoraCaseAttachment } from "./dto/nora-case.dto";
import { NoraCaseService } from "./nora-case.service";
import { WhatsAppService } from "./whatsapp.service";

export type ExecuteExpenseInput = {
  user: AuthUser;
  conversationId: string;
  dto: CreateCommercialExpenseDto;
};

export type ExecuteExpenseResult = {
  id: string;
  status: string;
  alreadyExisted: boolean;
};

@Injectable()
export class NoraExpenseExecutionService {
  constructor(
    public readonly noraCaseService: NoraCaseService,
    public readonly expensesService: CommercialExpensesService,
    public readonly whatsAppService: WhatsAppService,
    public readonly prisma: PrismaService,
  ) {}

  async executeFromWhatsApp(input: ExecuteExpenseInput): Promise<ExecuteExpenseResult> {
    const openCase = await this.noraCaseService.findOpenCase(input.conversationId);
    if (!openCase) {
      throw new NotFoundException("No open case for conversation");
    }

    if (openCase.executedEntityId) {
      return { id: openCase.executedEntityId, status: "pendiente", alreadyExisted: true };
    }

    const attachment = this.firstImageAttachment(openCase.attachments);
    if (!attachment?.providerMediaId) {
      throw new BadRequestException("Case has no support attachment to link");
    }

    const phoneNumberId = await this.resolvePhoneNumberId(input.conversationId);
    if (!phoneNumberId) {
      throw new BadRequestException("Conversation has no WhatsApp account");
    }

    const buffer = await this.whatsAppService.downloadMedia(phoneNumberId, attachment.providerMediaId);

    const expense = await this.expensesService.createFromBuffer(input.user, input.dto, {
      buffer,
      originalname: attachment.fileName ?? "soporte-whatsapp.jpg",
      mimetype: attachment.contentType ?? "image/jpeg",
      size: buffer.length,
    });

    await this.noraCaseService.updateCase(openCase.id, {
      status: NoraConversationCaseStatus.executed,
      executedEntityType: "CommercialExpense",
      executedEntityId: expense.id,
    });

    return { id: expense.id, status: expense.status, alreadyExisted: false };
  }

  private firstImageAttachment(value: unknown): NoraCaseAttachment | undefined {
    const list = Array.isArray(value) ? (value as NoraCaseAttachment[]) : [];
    return list.find((a) => a && a.provider === "kapso" && Boolean(a.providerMediaId));
  }

  private async resolvePhoneNumberId(conversationId: string): Promise<string | null> {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
      include: { account: true },
    });
    return conversation?.account?.phoneNumberId ?? null;
  }
}

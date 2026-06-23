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
  id: string | null;
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

    // Atomic CAS claim — first concurrent caller wins; others short-circuit here.
    // ponytail: ceiling — loser returns alreadyExisted:true with possibly-null id;
    // acceptable (no double-create). Per-case advisory lock if exact id on race needed.
    const claimed = await this.noraCaseService.claimForExecution(openCase.id, "CommercialExpense");
    if (!claimed) {
      const refreshed = await this.noraCaseService.findOpenCase(input.conversationId);
      return { id: refreshed?.executedEntityId ?? null, status: "pendiente", alreadyExisted: true };
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

    // FIX 4: backfill extraction provenance from OCR result when the DTO omits them.
    const dto = { ...input.dto };
    const extractedData = openCase.extractedData as Record<string, unknown> | null;
    if (dto.extractionConfidence == null && extractedData?.extractionConfidence != null) {
      (dto as Record<string, unknown>).extractionConfidence = extractedData.extractionConfidence;
    }
    if (dto.extractionModel == null && extractedData?.extractionModel != null) {
      (dto as Record<string, unknown>).extractionModel = extractedData.extractionModel;
    }

    const expense = await this.expensesService.createFromBuffer(input.user, dto as CreateCommercialExpenseDto, {
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

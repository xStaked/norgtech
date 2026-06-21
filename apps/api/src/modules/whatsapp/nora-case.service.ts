import { Injectable, NotFoundException } from "@nestjs/common";
import {
  NoraCaseRiskLevel,
  NoraConversationCase,
  NoraConversationCaseStatus,
  NoraConversationCaseType,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  NoraCaseAttachment,
  NoraCaseJsonObject,
  NoraCaseTransitionInput,
  openNoraCaseStatuses,
} from "./dto/nora-case.dto";

type NoraCasePrismaClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class NoraCaseService {
  constructor(private readonly prisma: PrismaService) {}

  findOpenCase(conversationId: string) {
    return this.prisma.noraConversationCase.findFirst({
      where: {
        conversationId,
        status: { in: openNoraCaseStatuses },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  async createCase(input: NoraCaseTransitionInput) {
    return this.createCaseWithClient(this.prisma, input);
  }

  async updateCase(caseId: string, input: Partial<NoraCaseTransitionInput>) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockCaseForUpdate(tx, caseId);
      const existing = await tx.noraConversationCase.findFirst({
        where: { id: caseId },
      });
      if (!existing) {
        throw new NotFoundException("Nora case not found");
      }

      return tx.noraConversationCase.update({
        where: { id: caseId },
        data: {
          ...(input.status && { status: input.status }),
          ...(input.extractedData && {
            extractedData: this.jsonObject({
              ...(existing.extractedData as NoraCaseJsonObject),
              ...input.extractedData,
            }),
          }),
          ...(input.missingFields && {
            missingFields: this.jsonArray(input.missingFields),
          }),
          ...(input.attachments && {
            attachments: this.jsonArray([
              ...this.arrayValue<NoraCaseAttachment>(existing.attachments),
              ...input.attachments,
            ]),
          }),
          ...(input.proposal !== undefined && {
            proposal: this.jsonNullable(input.proposal ?? null),
          }),
          ...(input.lastQuestion !== undefined && {
            lastQuestion: input.lastQuestion,
          }),
          ...(input.riskLevel && { riskLevel: input.riskLevel }),
        },
      });
    });
  }

  async createNewCustomerSubcase(
    orderCase: NoraConversationCase,
    createdByUserId: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockCaseForUpdate(tx, orderCase.id);
      const existing = await tx.noraConversationCase.findFirst({
        where: {
          conversationId: orderCase.conversationId,
          parentCaseId: orderCase.id,
          type: NoraConversationCaseType.new_customer,
          status: { in: openNoraCaseStatuses },
        },
        orderBy: { updatedAt: "desc" },
      });

      if (existing) {
        return existing;
      }

      return this.createCaseWithClient(tx, {
        conversationId: orderCase.conversationId,
        parentCaseId: orderCase.id,
        type: NoraConversationCaseType.new_customer,
        status: NoraConversationCaseStatus.collecting_info,
        extractedData: {},
        missingFields: ["displayName", "contactName"],
        proposal: {
          type: "new_customer",
          title: "Cliente nuevo para revision",
          payload: {},
        },
        lastQuestion:
          "Listo. Para dejar la propuesta de cliente nuevo, dime la razon social o nombre comercial.",
        riskLevel: NoraCaseRiskLevel.high,
        createdByUserId,
      });
    });
  }

  async appendAttachmentFromMessage(
    caseId: string,
    attachment: NoraCaseAttachment,
  ) {
    return this.updateCase(caseId, {
      attachments: [attachment],
    });
  }

  private async createCaseWithClient(
    prisma: NoraCasePrismaClient,
    input: NoraCaseTransitionInput,
  ) {
    await this.assertConversation(prisma, input.conversationId);
    return prisma.noraConversationCase.create({
      data: {
        conversationId: input.conversationId,
        parentCaseId: input.parentCaseId ?? null,
        type: input.type,
        status: input.status ?? NoraConversationCaseStatus.collecting_info,
        extractedData: this.jsonObject(input.extractedData ?? {}),
        missingFields: this.jsonArray(input.missingFields ?? []),
        attachments: this.jsonArray(input.attachments ?? []),
        proposal:
          input.proposal === undefined
            ? undefined
            : this.jsonNullable(input.proposal),
        lastQuestion: input.lastQuestion ?? null,
        riskLevel: input.riskLevel ?? NoraCaseRiskLevel.medium,
        createdByUserId: input.createdByUserId ?? null,
      },
    });
  }

  private async assertConversation(
    prisma: NoraCasePrismaClient,
    conversationId: string,
  ) {
    const conversation = await prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
      select: { id: true },
    });
    if (!conversation) {
      throw new NotFoundException("WhatsApp conversation not found");
    }
  }

  private async lockCaseForUpdate(
    prisma: NoraCasePrismaClient,
    caseId: string,
  ) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "NoraConversationCase" WHERE id = ${caseId} FOR UPDATE
    `;
    if (rows.length === 0) {
      throw new NotFoundException("Nora case not found");
    }
  }

  private jsonObject(value: NoraCaseJsonObject): Prisma.InputJsonObject {
    return value as Prisma.InputJsonObject;
  }

  private jsonNullable(value: NoraCaseJsonObject | null) {
    return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonObject);
  }

  private jsonArray<T>(value: T[]): Prisma.InputJsonArray {
    return value as Prisma.InputJsonArray;
  }

  private arrayValue<T>(value: Prisma.JsonValue): T[] {
    return Array.isArray(value) ? (value as T[]) : [];
  }
}

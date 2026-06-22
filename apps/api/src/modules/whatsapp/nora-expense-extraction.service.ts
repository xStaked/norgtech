import { Injectable, Logger } from "@nestjs/common";
import { WhatsAppMessage } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  ExpenseExtractionProvider,
} from "../commercial-expenses/commercial-expense-extraction.provider";
import { ExtractCommercialExpenseSupportResult } from "../commercial-expenses/dto/extract-commercial-expense-support.dto";
import { NoraCaseService } from "./nora-case.service";
import { WhatsAppService } from "./whatsapp.service";

type ExtractForCaseInput = {
  caseId: string;
  conversationId: string;
  message: WhatsAppMessage;
};

type ExpenseMedia = {
  providerMediaId: string;
  contentType: string;
  fileName?: string;
};

// Fields the expense case tracks as required before it can be reviewed.
const REQUIRED_EXPENSE_FIELDS = [
  "amount",
  "expenseDate",
  "category",
  "description",
] as const;

const FALLBACK_REPLY =
  "No pude leer el soporte automaticamente. Para dejar el gasto listo, " +
  "escribeme el valor del gasto y el cliente o visita a asociar.";

@Injectable()
export class NoraExpenseExtractionService {
  private readonly logger = new Logger(NoraExpenseExtractionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly extractionProvider: ExpenseExtractionProvider,
    private readonly noraCaseService: NoraCaseService,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  // Fire-and-forget entry point: never throws, so it can be triggered from the
  // inbound webhook flow without blocking the immediate Nora reply.
  extractForCaseInBackground(input: ExtractForCaseInput): void {
    void this.extractForCase(input).catch((error) => {
      this.logger.error(
        `Nora expense extraction crashed for case ${input.caseId}: ${this.safeError(error)}`,
      );
    });
  }

  async extractForCase({ caseId, conversationId, message }: ExtractForCaseInput): Promise<void> {
    const media = this.expenseMediaFromMessage(message);
    if (!media) {
      return;
    }

    const phoneNumberId = await this.resolvePhoneNumberId(conversationId);
    if (!phoneNumberId) {
      this.logger.warn(
        `Skipping expense extraction for case ${caseId}: conversation ${conversationId} has no WhatsApp account`,
      );
      return;
    }

    let result: ExtractCommercialExpenseSupportResult;
    try {
      const buffer = await this.whatsAppService.downloadMedia(
        phoneNumberId,
        media.providerMediaId,
      );
      result = await this.extractionProvider.extract({
        fileName: media.fileName ?? "soporte-whatsapp",
        contentType: media.contentType,
        buffer,
      });
    } catch (error) {
      this.logger.error(
        `Failed to extract expense support for case ${caseId}: ${this.safeError(error)}`,
      );
      await this.safeReply(conversationId, FALLBACK_REPLY);
      return;
    }

    const extractedData = this.toExtractedData(result);
    const missingFields = this.missingFieldsFrom(extractedData);

    await this.noraCaseService.updateCase(caseId, {
      extractedData,
      missingFields,
    });

    await this.safeReply(conversationId, this.summaryReply(extractedData, missingFields));
  }

  private expenseMediaFromMessage(message: WhatsAppMessage): ExpenseMedia | undefined {
    const payload =
      message.payload && typeof message.payload === "object" && !Array.isArray(message.payload)
        ? (message.payload as Record<string, unknown>)
        : {};

    const providerMediaId = this.stringValue(payload.mediaId) ?? this.stringValue(payload.id);
    const contentType = this.stringValue(payload.contentType);
    if (!providerMediaId || !contentType) {
      return undefined;
    }

    return {
      providerMediaId,
      contentType,
      fileName: this.stringValue(payload.fileName),
    };
  }

  private async resolvePhoneNumberId(conversationId: string): Promise<string | null> {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
      include: { account: true },
    });
    return conversation?.account?.phoneNumberId ?? null;
  }

  private toExtractedData(
    result: ExtractCommercialExpenseSupportResult,
  ): Record<string, unknown> {
    const fields = result.fields ?? {};
    const extractedData: Record<string, unknown> = {
      extractionStatus: result.status,
      extractionConfidence: result.confidence,
      extractionModel: result.model,
    };

    for (const [key, field] of Object.entries(fields)) {
      if (field && field.value !== null && field.value !== undefined) {
        extractedData[key] = field.value;
      }
    }

    return extractedData;
  }

  private missingFieldsFrom(extractedData: Record<string, unknown>): string[] {
    return REQUIRED_EXPENSE_FIELDS.filter(
      (key) => extractedData[key] === undefined || extractedData[key] === null,
    );
  }

  private summaryReply(
    extractedData: Record<string, unknown>,
    missingFields: string[],
  ): string {
    const parts: string[] = [];
    const amount = extractedData.amount;
    if (typeof amount === "number") {
      parts.push(`valor ${this.formatCurrency(amount)}`);
    }
    if (typeof extractedData.expenseDate === "string") {
      parts.push(`fecha ${extractedData.expenseDate}`);
    }
    if (typeof extractedData.category === "string") {
      parts.push(`categoria ${extractedData.category}`);
    }
    if (typeof extractedData.supplierName === "string") {
      parts.push(`proveedor ${extractedData.supplierName}`);
    }

    const intro = parts.length
      ? `Lei el soporte: ${parts.join(", ")}.`
      : "Recibi el soporte pero no pude leer los datos con claridad.";

    if (missingFields.length === 0) {
      return `${intro} Dejo el gasto listo para revision.`;
    }

    return `${intro} Me falta ${this.missingFieldsToText(missingFields)} para dejar el gasto listo.`;
  }

  private missingFieldsToText(missingFields: string[]): string {
    const labels: Record<string, string> = {
      amount: "el valor del gasto",
      expenseDate: "la fecha",
      category: "la categoria",
      description: "la descripcion",
    };
    const readable = missingFields.map((field) => labels[field] ?? field);
    if (readable.length === 1) {
      return readable[0];
    }
    return `${readable.slice(0, -1).join(", ")} y ${readable[readable.length - 1]}`;
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(amount);
  }

  private async safeReply(conversationId: string, body: string): Promise<void> {
    try {
      await this.whatsAppService.sendAgentReply(conversationId, body);
    } catch (error) {
      this.logger.error(
        `Failed to send expense extraction reply to ${conversationId}: ${this.safeError(error)}`,
      );
    }
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
  }

  private safeError(error: unknown): string {
    return error instanceof Error && error.message ? error.message : "unknown error";
  }
}

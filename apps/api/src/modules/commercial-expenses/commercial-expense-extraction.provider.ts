import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CommercialExpenseCategory } from "@prisma/client";
import OpenAI from "openai";
import {
  ExtractCommercialExpenseSupportResult,
  ExtractedExpenseField,
} from "./dto/extract-commercial-expense-support.dto";

export interface ExpenseExtractionInput {
  fileName: string;
  contentType: string;
  buffer: Buffer;
}

export abstract class ExpenseExtractionProvider {
  abstract extract(
    input: ExpenseExtractionInput,
  ): Promise<ExtractCommercialExpenseSupportResult>;
}

interface ModelField<T> {
  value?: T | null;
  confidence?: number | null;
}

interface ModelExtractionResponse {
  confidence?: number | null;
  fields?: {
    expenseDate?: ModelField<string> | null;
    amount?: ModelField<number> | null;
    currency?: ModelField<string> | null;
    category?: ModelField<CommercialExpenseCategory> | null;
    description?: ModelField<string> | null;
    supplierName?: ModelField<string> | null;
    supplierNit?: ModelField<string> | null;
    invoiceNumber?: ModelField<string> | null;
    paymentMethod?: ModelField<string> | null;
  } | null;
  warnings?: string[] | null;
}

const DEFAULT_MODEL = "gpt-4.1-mini";
const LOW_CONFIDENCE_WARNING =
  "No se pudo leer la factura con suficiente confianza.";

const expenseCategories = Object.values(CommercialExpenseCategory);

@Injectable()
export class OpenAIExpenseExtractionProvider
  implements ExpenseExtractionProvider
{
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>("OPENAI_API_KEY");
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
    this.model =
      this.configService.get<string>("EXPENSE_EXTRACTION_MODEL") ??
      DEFAULT_MODEL;
  }

  async extract(
    input: ExpenseExtractionInput,
  ): Promise<ExtractCommercialExpenseSupportResult> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        "Expense extraction is not configured",
      );
    }

    const response = await this.client.responses.create({
      model: this.model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Extrae datos de esta factura colombiana para un gasto comercial. " +
                "Devuelve solo JSON valido con confidence, fields y warnings. " +
                `Usa categoria solo entre: ${expenseCategories.join(", ")}. ` +
                "No inventes datos. Si no puedes leer un campo, devuelve null para ese campo.",
            },
            {
              ...(this.isImageMimeType(input.contentType)
                ? {
                    type: "input_image",
                    image_url: `data:${input.contentType};base64,${input.buffer.toString(
                      "base64",
                    )}`,
                    detail: "high",
                  }
                : {
                    type: "input_file",
                    filename: input.fileName,
                    file_data: `data:${input.contentType};base64,${input.buffer.toString(
                      "base64",
                    )}`,
                  }),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "expense_invoice_extraction",
          strict: true,
          schema: this.responseSchema(),
        },
      },
    });

    const parsed = JSON.parse(response.output_text) as ModelExtractionResponse;
    const confidence = this.clampConfidence(parsed.confidence);
    const status = confidence >= 0.5 ? "completed" : "low_confidence";
    const warnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];

    return {
      status,
      model: this.model,
      confidence,
      fields: this.normalizeFields(parsed.fields ?? {}),
      warnings:
        status === "completed"
          ? warnings
          : [...warnings, LOW_CONFIDENCE_WARNING],
    };
  }

  private normalizeFields(
    fields: NonNullable<ModelExtractionResponse["fields"]>,
  ): ExtractCommercialExpenseSupportResult["fields"] {
    return {
      ...this.stringField("expenseDate", fields.expenseDate),
      ...this.numberField("amount", fields.amount),
      ...this.stringField("currency", fields.currency),
      ...this.categoryField(fields.category),
      ...this.stringField("description", fields.description),
      ...this.stringField("supplierName", fields.supplierName),
      ...this.stringField("supplierNit", fields.supplierNit),
      ...this.stringField("invoiceNumber", fields.invoiceNumber),
      ...this.stringField("paymentMethod", fields.paymentMethod),
    };
  }

  private stringField<K extends StringFieldKey>(
    key: K,
    field?: ModelField<string> | null,
  ): Pick<ExtractCommercialExpenseSupportResult["fields"], K> | {} {
    const normalized = this.normalizeField(field, "string");
    return normalized ? { [key]: normalized } : {};
  }

  private numberField(
    key: "amount",
    field?: ModelField<number> | null,
  ): Pick<ExtractCommercialExpenseSupportResult["fields"], "amount"> | {} {
    const normalized = this.normalizeField(field, "number");
    return normalized ? { [key]: normalized } : {};
  }

  private categoryField(
    field?: ModelField<CommercialExpenseCategory> | null,
  ): Pick<ExtractCommercialExpenseSupportResult["fields"], "category"> | {} {
    const normalized = this.normalizeField(field, "string");
    if (!normalized) return {};
    if (!expenseCategories.includes(normalized.value as CommercialExpenseCategory)) {
      return {};
    }
    return {
      category: {
        value: normalized.value as CommercialExpenseCategory,
        confidence: normalized.confidence,
      },
    };
  }

  private normalizeField<T extends string | number>(
    field: ModelField<T> | null | undefined,
    valueType: "string" | "number",
  ): ExtractedExpenseField<T> | null {
    const value = field?.value;
    if (typeof value !== valueType) return null;
    const confidence = this.clampConfidence(field?.confidence);
    return {
      value: value as T,
      confidence,
    };
  }

  private clampConfidence(value: number | null | undefined): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(0, value));
  }

  private isImageMimeType(mimeType: string): boolean {
    return (
      mimeType === "image/jpeg" ||
      mimeType === "image/png" ||
      mimeType === "image/webp"
    );
  }

  private responseSchema(): Record<string, unknown> {
    return {
      type: "object",
      additionalProperties: false,
      required: ["confidence", "fields", "warnings"],
      properties: {
        confidence: { type: "number", minimum: 0, maximum: 1 },
        fields: {
          type: "object",
          additionalProperties: false,
          required: [
            "expenseDate",
            "amount",
            "currency",
            "category",
            "description",
            "supplierName",
            "supplierNit",
            "invoiceNumber",
            "paymentMethod",
          ],
          properties: {
            expenseDate: this.nullableRef("#/$defs/stringField"),
            amount: this.nullableRef("#/$defs/numberField"),
            currency: this.nullableRef("#/$defs/stringField"),
            category: this.nullableRef("#/$defs/categoryField"),
            description: this.nullableRef("#/$defs/stringField"),
            supplierName: this.nullableRef("#/$defs/stringField"),
            supplierNit: this.nullableRef("#/$defs/stringField"),
            invoiceNumber: this.nullableRef("#/$defs/stringField"),
            paymentMethod: this.nullableRef("#/$defs/stringField"),
          },
        },
        warnings: { type: "array", items: { type: "string" } },
      },
      $defs: {
        stringField: this.fieldSchema({ type: "string" }),
        numberField: this.fieldSchema({ type: "number" }),
        categoryField: this.fieldSchema({
          type: "string",
          enum: expenseCategories,
        }),
      },
    };
  }

  private nullableRef(ref: string): Record<string, unknown> {
    return { anyOf: [{ $ref: ref }, { type: "null" }] };
  }

  private fieldSchema(value: Record<string, unknown>): Record<string, unknown> {
    return {
      type: "object",
      additionalProperties: false,
      required: ["value", "confidence"],
      properties: {
        value,
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
    };
  }
}

type StringFieldKey = Exclude<
  keyof ExtractCommercialExpenseSupportResult["fields"],
  "amount" | "category"
>;

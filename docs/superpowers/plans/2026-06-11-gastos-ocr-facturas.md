# Gastos OCR Facturas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI-assisted invoice reading to the commercial expenses module so a salesperson can upload a factura, review prefilled fields, and confirm the final expense manually.

**Architecture:** Keep extraction separate from expense creation. Add a focused extraction service/provider behind `CommercialExpensesModule`, expose a multipart `POST /commercial-expenses/extract-support` endpoint, persist only user-confirmed structured fields on `CommercialExpense`, and keep support storage in the existing R2 flow during final save.

**Tech Stack:** NestJS 11, Prisma 6, PostgreSQL, OpenAI Node SDK, Multer memory uploads, Next.js 16, React 19, Jest/Supertest, Playwright.

---

## File Structure

Backend files:

- `apps/api/prisma/schema.prisma`: add optional OCR-confirmed invoice fields to `CommercialExpense`.
- `apps/api/prisma/migrations/20260611120000_commercial_expense_invoice_ocr/migration.sql`: database migration for new fields.
- `apps/api/src/modules/commercial-expenses/commercial-expense-constants.ts`: reuse support validation and add extraction model/timeout defaults if needed.
- `apps/api/src/modules/commercial-expenses/dto/create-commercial-expense.dto.ts`: accept confirmed supplier/NIT/invoice/payment/extraction metadata.
- `apps/api/src/modules/commercial-expenses/dto/extract-commercial-expense-support.dto.ts`: define extraction response types for controller/service tests.
- `apps/api/src/modules/commercial-expenses/commercial-expense-extraction.provider.ts`: OpenAI-backed provider plus provider interface.
- `apps/api/src/modules/commercial-expenses/commercial-expense-extraction.service.ts`: file validation, provider call, normalization, and low-confidence handling.
- `apps/api/src/modules/commercial-expenses/commercial-expenses.module.ts`: register extraction service/provider.
- `apps/api/src/modules/commercial-expenses/commercial-expenses.controller.ts`: add `POST /commercial-expenses/extract-support`.
- `apps/api/src/modules/commercial-expenses/commercial-expenses.service.ts`: persist confirmed new fields on create/update and include them in returned/exported rows.
- `apps/api/src/modules/commercial-expenses/commercial-expenses-export.service.ts`: include new structured invoice fields in CSV/XLSX export.
- `apps/api/test/commercial-expenses.e2e-spec.ts`: add extraction and persistence coverage with mocked provider.

Frontend files:

- `apps/web/src/components/expenses/expense-form.tsx`: add invoice extraction UI, prefill logic, editable new fields, and metadata hidden inputs.
- `apps/web/src/app/(app)/expenses/[id]/page.tsx`: show supplier, NIT, invoice number, payment method, and extraction metadata.
- `apps/web/src/app/(app)/expenses/page.tsx`: no new columns for MVP unless table width allows; keep list focused.
- `apps/web/tests/e2e/expenses.spec.ts`: add smoke coverage for extraction fallback/pre-fill where practical.

Reference docs:

- `docs/superpowers/specs/2026-06-11-gastos-ocr-facturas-design.md`: canonical product/design spec.

---

### Task 1: Persist Confirmed Invoice Fields

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260611120000_commercial_expense_invoice_ocr/migration.sql`
- Modify: `apps/api/src/modules/commercial-expenses/dto/create-commercial-expense.dto.ts`
- Modify: `apps/api/src/modules/commercial-expenses/commercial-expenses.service.ts`
- Modify: `apps/api/test/commercial-expenses.e2e-spec.ts`

- [ ] **Step 1: Add failing e2e assertion for persisted invoice fields**

In `apps/api/test/commercial-expenses.e2e-spec.ts`, update the existing `createExpense` helper to send OCR-confirmed fields:

```ts
  const createExpense = () =>
    request(globalThis.__APP__)
      .post("/commercial-expenses")
      .set("Authorization", `Bearer ${comercialToken}`)
      .field("expenseDate", "2026-05-01")
      .field("category", CommercialExpenseCategory.alimentacion)
      .field("amount", "25000")
      .field("description", "Almuerzo con cliente")
      .field("supplierName", "Restaurante La 80")
      .field("supplierNit", "900123456-7")
      .field("invoiceNumber", "FE-1001")
      .field("paymentMethod", "tarjeta")
      .field("extractionConfidence", "0.91")
      .field("extractionModel", "gpt-4.1-mini")
      .attach("support", Buffer.from("image"), {
        filename: "support.png",
        contentType: "image/png",
      });
```

Then extend the assertion in `POST /commercial-expenses allows comercial to create with image support`:

```ts
    expect(response.body).toMatchObject({
      status: CommercialExpenseStatus.pendiente,
      submittedByUserId: "comercial-user-id",
      category: CommercialExpenseCategory.alimentacion,
      description: "Almuerzo con cliente",
      supplierName: "Restaurante La 80",
      supplierNit: "900123456-7",
      invoiceNumber: "FE-1001",
      paymentMethod: "tarjeta",
      extractionModel: "gpt-4.1-mini",
    });
    expect(Number(response.body.extractionConfidence)).toBeCloseTo(0.91);
    expect(response.body.extractionReviewedAt).toBeTruthy();
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/api && pnpm test -- commercial-expenses.e2e-spec.ts --runInBand
```

Expected: FAIL because the DTO rejects the new fields or the response does not include them.

- [ ] **Step 3: Add Prisma fields and migration**

In `apps/api/prisma/schema.prisma`, add these fields inside `model CommercialExpense` after `description`:

```prisma
  supplierName          String?
  supplierNit           String?
  invoiceNumber         String?
  paymentMethod         String?
  extractionConfidence  Decimal?                  @db.Decimal(5, 4)
  extractionModel       String?
  extractionReviewedAt  DateTime?
```

Create `apps/api/prisma/migrations/20260611120000_commercial_expense_invoice_ocr/migration.sql`:

```sql
ALTER TABLE "CommercialExpense"
ADD COLUMN "supplierName" TEXT,
ADD COLUMN "supplierNit" TEXT,
ADD COLUMN "invoiceNumber" TEXT,
ADD COLUMN "paymentMethod" TEXT,
ADD COLUMN "extractionConfidence" DECIMAL(5, 4),
ADD COLUMN "extractionModel" TEXT,
ADD COLUMN "extractionReviewedAt" TIMESTAMP(3);
```

- [ ] **Step 4: Accept new fields in create DTO**

In `apps/api/src/modules/commercial-expenses/dto/create-commercial-expense.dto.ts`, add imports:

```ts
import { Max, MaxLength } from "class-validator";
```

Keep existing imports deduplicated, then add fields to `CreateCommercialExpenseDto`:

```ts
  @IsOptional()
  @IsString()
  @MaxLength(160)
  supplierName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  supplierNit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  paymentMethod?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === "" ? undefined : Number(value),
  )
  @IsNumber()
  @Min(0)
  @Max(1)
  extractionConfidence?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  extractionModel?: string;
```

- [ ] **Step 5: Persist confirmed fields on create/update**

In `apps/api/src/modules/commercial-expenses/commercial-expenses.service.ts`, add the fields to `tx.commercialExpense.create({ data: ... })`:

```ts
            supplierName: dto.supplierName?.trim() || null,
            supplierNit: dto.supplierNit?.trim() || null,
            invoiceNumber: dto.invoiceNumber?.trim() || null,
            paymentMethod: dto.paymentMethod?.trim() || null,
            extractionConfidence:
              dto.extractionConfidence === undefined
                ? null
                : new Prisma.Decimal(dto.extractionConfidence).toDecimalPlaces(4),
            extractionModel: dto.extractionModel?.trim() || null,
            extractionReviewedAt:
              dto.extractionConfidence === undefined && !dto.extractionModel
                ? null
                : new Date(),
```

In the `update()` method, after the `description` block, add:

```ts
      if (dto.supplierName !== undefined) {
        data.supplierName = dto.supplierName?.trim() || null;
      }
      if (dto.supplierNit !== undefined) {
        data.supplierNit = dto.supplierNit?.trim() || null;
      }
      if (dto.invoiceNumber !== undefined) {
        data.invoiceNumber = dto.invoiceNumber?.trim() || null;
      }
      if (dto.paymentMethod !== undefined) {
        data.paymentMethod = dto.paymentMethod?.trim() || null;
      }
      if (dto.extractionConfidence !== undefined) {
        data.extractionConfidence = new Prisma.Decimal(
          dto.extractionConfidence,
        ).toDecimalPlaces(4);
        data.extractionReviewedAt = new Date();
      }
      if (dto.extractionModel !== undefined) {
        data.extractionModel = dto.extractionModel?.trim() || null;
      }
```

- [ ] **Step 6: Update test stub hydration**

In `apps/api/test/commercial-expenses.e2e-spec.ts`, add the new properties to the fake created expense in the `commercialExpense.create` stub:

```ts
        supplierName: data.supplierName ?? null,
        supplierNit: data.supplierNit ?? null,
        invoiceNumber: data.invoiceNumber ?? null,
        paymentMethod: data.paymentMethod ?? null,
        extractionConfidence: data.extractionConfidence ?? null,
        extractionModel: data.extractionModel ?? null,
        extractionReviewedAt: data.extractionReviewedAt ?? null,
```

In `hydrateExpense`, add:

```ts
    extractionConfidence: expense.extractionConfidence
      ? new Prisma.Decimal(expense.extractionConfidence)
      : null,
    extractionReviewedAt: expense.extractionReviewedAt
      ? new Date(expense.extractionReviewedAt)
      : null,
```

- [ ] **Step 7: Run backend test**

Run:

```bash
cd apps/api && pnpm test -- commercial-expenses.e2e-spec.ts --runInBand
```

Expected: PASS for existing commercial expense tests.

- [ ] **Step 8: Validate Prisma schema**

Run:

```bash
cd apps/api && pnpm exec prisma validate --schema prisma/schema.prisma
```

Expected: `The schema at prisma/schema.prisma is valid`.

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260611120000_commercial_expense_invoice_ocr/migration.sql apps/api/src/modules/commercial-expenses/dto/create-commercial-expense.dto.ts apps/api/src/modules/commercial-expenses/commercial-expenses.service.ts apps/api/test/commercial-expenses.e2e-spec.ts
git commit -m "feat(api): persist expense invoice fields"
```

---

### Task 2: Add Backend Extraction Service And Endpoint

**Files:**
- Create: `apps/api/src/modules/commercial-expenses/dto/extract-commercial-expense-support.dto.ts`
- Create: `apps/api/src/modules/commercial-expenses/commercial-expense-extraction.provider.ts`
- Create: `apps/api/src/modules/commercial-expenses/commercial-expense-extraction.service.ts`
- Modify: `apps/api/src/modules/commercial-expenses/commercial-expenses.module.ts`
- Modify: `apps/api/src/modules/commercial-expenses/commercial-expenses.controller.ts`
- Modify: `apps/api/test/commercial-expenses.e2e-spec.ts`

- [ ] **Step 1: Write failing e2e tests for extraction endpoint**

In `apps/api/test/commercial-expenses.e2e-spec.ts`, import the service token:

```ts
import { CommercialExpenseExtractionService } from "../src/modules/commercial-expenses/commercial-expense-extraction.service";
```

In the testing module setup, add:

```ts
      .overrideProvider(CommercialExpenseExtractionService)
      .useValue({
        extract: async () => ({
          status: "completed",
          model: "gpt-4.1-mini",
          confidence: 0.91,
          fields: {
            expenseDate: { value: "2026-05-01", confidence: 0.93 },
            amount: { value: 25000, confidence: 0.94 },
            currency: { value: "COP", confidence: 0.98 },
            category: {
              value: CommercialExpenseCategory.alimentacion,
              confidence: 0.87,
            },
            description: {
              value: "Almuerzo proveedor Restaurante La 80",
              confidence: 0.76,
            },
            supplierName: { value: "Restaurante La 80", confidence: 0.9 },
            supplierNit: { value: "900123456-7", confidence: 0.82 },
            invoiceNumber: { value: "FE-1001", confidence: 0.8 },
            paymentMethod: { value: "tarjeta", confidence: 0.64 },
          },
          warnings: [],
        }),
      })
```

Add tests:

```ts
  it("POST /commercial-expenses/extract-support returns extracted invoice fields", async () => {
    const response = await request(globalThis.__APP__)
      .post("/commercial-expenses/extract-support")
      .set("Authorization", `Bearer ${comercialToken}`)
      .attach("support", Buffer.from("image"), {
        filename: "factura.png",
        contentType: "image/png",
      })
      .expect(201);

    expect(response.body).toMatchObject({
      status: "completed",
      model: "gpt-4.1-mini",
      confidence: 0.91,
      fields: {
        amount: { value: 25000, confidence: 0.94 },
        supplierName: { value: "Restaurante La 80", confidence: 0.9 },
      },
      warnings: [],
    });
  });

  it("POST /commercial-expenses/extract-support rejects missing support", async () => {
    await request(globalThis.__APP__)
      .post("/commercial-expenses/extract-support")
      .set("Authorization", `Bearer ${comercialToken}`)
      .expect(400);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/api && pnpm test -- commercial-expenses.e2e-spec.ts --runInBand
```

Expected: FAIL because `CommercialExpenseExtractionService` and the endpoint do not exist.

- [ ] **Step 3: Create extraction DTO/types**

Create `apps/api/src/modules/commercial-expenses/dto/extract-commercial-expense-support.dto.ts`:

```ts
import { CommercialExpenseCategory } from "@prisma/client";

export type ExpenseExtractionStatus = "completed" | "low_confidence";

export interface ExtractedExpenseField<T> {
  value: T;
  confidence: number;
}

export interface ExtractCommercialExpenseSupportResult {
  status: ExpenseExtractionStatus;
  model: string;
  confidence: number;
  fields: {
    expenseDate?: ExtractedExpenseField<string>;
    amount?: ExtractedExpenseField<number>;
    currency?: ExtractedExpenseField<string>;
    category?: ExtractedExpenseField<CommercialExpenseCategory>;
    description?: ExtractedExpenseField<string>;
    supplierName?: ExtractedExpenseField<string>;
    supplierNit?: ExtractedExpenseField<string>;
    invoiceNumber?: ExtractedExpenseField<string>;
    paymentMethod?: ExtractedExpenseField<string>;
  };
  warnings: string[];
}
```

- [ ] **Step 4: Create provider interface and OpenAI implementation**

Create `apps/api/src/modules/commercial-expenses/commercial-expense-extraction.provider.ts`:

```ts
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CommercialExpenseCategory } from "@prisma/client";
import OpenAI from "openai";
import { ExtractCommercialExpenseSupportResult } from "./dto/extract-commercial-expense-support.dto";

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
    expenseDate?: ModelField<string>;
    amount?: ModelField<number>;
    currency?: ModelField<string>;
    category?: ModelField<CommercialExpenseCategory>;
    description?: ModelField<string>;
    supplierName?: ModelField<string>;
    supplierNit?: ModelField<string>;
    invoiceNumber?: ModelField<string>;
    paymentMethod?: ModelField<string>;
  };
  warnings?: string[];
}

const DEFAULT_MODEL = "gpt-4.1-mini";

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
      throw new ServiceUnavailableException("Expense extraction is not configured");
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
                "Usa categoria solo entre: alimentacion, transporte, hospedaje, combustible, peajes, parqueadero, atencion_comercial, otros. " +
                "No inventes datos. Si no puedes leer un campo, omite el campo.",
            },
            {
              type: "input_file",
              filename: input.fileName,
              file_data: `data:${input.contentType};base64,${input.buffer.toString("base64")}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "expense_invoice_extraction",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["confidence", "fields", "warnings"],
            properties: {
              confidence: { type: "number", minimum: 0, maximum: 1 },
              fields: {
                type: "object",
                additionalProperties: false,
                properties: {
                  expenseDate: { $ref: "#/$defs/stringField" },
                  amount: { $ref: "#/$defs/numberField" },
                  currency: { $ref: "#/$defs/stringField" },
                  category: { $ref: "#/$defs/categoryField" },
                  description: { $ref: "#/$defs/stringField" },
                  supplierName: { $ref: "#/$defs/stringField" },
                  supplierNit: { $ref: "#/$defs/stringField" },
                  invoiceNumber: { $ref: "#/$defs/stringField" },
                  paymentMethod: { $ref: "#/$defs/stringField" },
                },
              },
              warnings: { type: "array", items: { type: "string" } },
            },
            $defs: {
              stringField: {
                type: "object",
                additionalProperties: false,
                required: ["value", "confidence"],
                properties: {
                  value: { type: "string" },
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                },
              },
              numberField: {
                type: "object",
                additionalProperties: false,
                required: ["value", "confidence"],
                properties: {
                  value: { type: "number" },
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                },
              },
              categoryField: {
                type: "object",
                additionalProperties: false,
                required: ["value", "confidence"],
                properties: {
                  value: {
                    type: "string",
                    enum: [
                      "alimentacion",
                      "transporte",
                      "hospedaje",
                      "combustible",
                      "peajes",
                      "parqueadero",
                      "atencion_comercial",
                      "otros",
                    ],
                  },
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                },
              },
            },
          },
        },
      },
    });

    const parsed = JSON.parse(response.output_text) as ModelExtractionResponse;
    return {
      status: (parsed.confidence ?? 0) >= 0.5 ? "completed" : "low_confidence",
      model: this.model,
      confidence: parsed.confidence ?? 0,
      fields: parsed.fields ?? {},
      warnings:
        (parsed.confidence ?? 0) >= 0.5
          ? (parsed.warnings ?? [])
          : [
              ...(parsed.warnings ?? []),
              "No se pudo leer la factura con suficiente confianza.",
            ],
    };
  }
}
```

- [ ] **Step 5: Create extraction service**

Create `apps/api/src/modules/commercial-expenses/commercial-expense-extraction.service.ts`:

```ts
import { BadRequestException, Injectable } from "@nestjs/common";
import {
  EXPENSE_SUPPORT_ALLOWED_MIME_TYPES,
  EXPENSE_SUPPORT_MAX_BYTES,
} from "./commercial-expense-constants";
import {
  ExpenseExtractionProvider,
  ExpenseExtractionInput,
} from "./commercial-expense-extraction.provider";
import { ExtractCommercialExpenseSupportResult } from "./dto/extract-commercial-expense-support.dto";

type ExpenseSupportFile = Express.Multer.File;

@Injectable()
export class CommercialExpenseExtractionService {
  constructor(
    private readonly extractionProvider: ExpenseExtractionProvider,
  ) {}

  async extract(
    file?: ExpenseSupportFile,
  ): Promise<ExtractCommercialExpenseSupportResult> {
    const supportFile = this.assertSupportFile(file);
    const input: ExpenseExtractionInput = {
      fileName: supportFile.originalname,
      contentType: supportFile.mimetype,
      buffer: supportFile.buffer,
    };

    return this.extractionProvider.extract(input);
  }

  private assertSupportFile(file?: ExpenseSupportFile): ExpenseSupportFile {
    if (!file) {
      throw new BadRequestException("Expense support file is required");
    }

    if (
      !EXPENSE_SUPPORT_ALLOWED_MIME_TYPES.includes(
        file.mimetype as (typeof EXPENSE_SUPPORT_ALLOWED_MIME_TYPES)[number],
      )
    ) {
      throw new BadRequestException("Unsupported expense support content type");
    }

    if (file.size > EXPENSE_SUPPORT_MAX_BYTES) {
      throw new BadRequestException("Expense support exceeds maximum size");
    }

    return file;
  }
}
```

- [ ] **Step 6: Register provider/service in module**

Modify `apps/api/src/modules/commercial-expenses/commercial-expenses.module.ts`:

```ts
import {
  ExpenseExtractionProvider,
  OpenAIExpenseExtractionProvider,
} from "./commercial-expense-extraction.provider";
import { CommercialExpenseExtractionService } from "./commercial-expense-extraction.service";
```

Add to providers:

```ts
    CommercialExpenseExtractionService,
    {
      provide: ExpenseExtractionProvider,
      useClass: OpenAIExpenseExtractionProvider,
    },
```

- [ ] **Step 7: Add controller endpoint**

Modify `apps/api/src/modules/commercial-expenses/commercial-expenses.controller.ts`.

Add constructor dependency:

```ts
    private readonly expenseExtractionService: CommercialExpenseExtractionService,
```

Add import:

```ts
import { CommercialExpenseExtractionService } from "./commercial-expense-extraction.service";
```

Add endpoint before `@Get(":id")`:

```ts
  @Roles(...expenseRoles)
  @Post("extract-support")
  @UseInterceptors(
    FileInterceptor("support", {
      storage: memoryStorage(),
      limits: { fileSize: EXPENSE_SUPPORT_MAX_BYTES },
    }),
  )
  extractSupport(@UploadedFile() file?: Express.Multer.File) {
    return this.expenseExtractionService.extract(file);
  }
```

- [ ] **Step 8: Run backend test**

Run:

```bash
cd apps/api && pnpm test -- commercial-expenses.e2e-spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/commercial-expenses apps/api/test/commercial-expenses.e2e-spec.ts
git commit -m "feat(api): extract expense fields from invoice supports"
```

---

### Task 3: Include Invoice Fields In Exports And Detail Payloads

**Files:**
- Modify: `apps/api/src/modules/commercial-expenses/commercial-expenses.service.ts`
- Modify: `apps/api/src/modules/commercial-expenses/commercial-expenses-export.service.ts`
- Modify: `apps/api/test/commercial-expenses.e2e-spec.ts`

- [ ] **Step 1: Add failing export assertions**

In `apps/api/test/commercial-expenses.e2e-spec.ts`, update the CSV export test:

```ts
    expect(csv.text).toContain("proveedor,nit,numero_factura,medio_pago");
    expect(csv.text).toContain("Restaurante La 80");
    expect(csv.text).toContain("FE-1001");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/api && pnpm test -- commercial-expenses.e2e-spec.ts --runInBand
```

Expected: FAIL because export columns do not include invoice fields.

- [ ] **Step 3: Add fields to export rows**

In `apps/api/src/modules/commercial-expenses/commercial-expenses.service.ts`, update `exportRows()` mapping:

```ts
      supplierName: expense.supplierName,
      supplierNit: expense.supplierNit,
      invoiceNumber: expense.invoiceNumber,
      paymentMethod: expense.paymentMethod,
      extractionConfidence: expense.extractionConfidence?.toString() ?? null,
      extractionModel: expense.extractionModel,
```

- [ ] **Step 4: Update export service interface and columns**

In `apps/api/src/modules/commercial-expenses/commercial-expenses-export.service.ts`, add to `ExpenseExportRow`:

```ts
  supplierName: string | null;
  supplierNit: string | null;
  invoiceNumber: string | null;
  paymentMethod: string | null;
  extractionConfidence: string | null;
  extractionModel: string | null;
```

Update `EXPORT_COLUMNS` to:

```ts
const EXPORT_COLUMNS = [
  "fecha",
  "comercial",
  "categoria",
  "monto",
  "moneda",
  "proveedor",
  "nit",
  "numero_factura",
  "medio_pago",
  "cliente",
  "visita",
  "estado",
  "descripcion",
  "nota_revision",
  "fecha_revision",
  "revisor",
  "confianza_extraccion",
  "modelo_extraccion",
  "fecha_creacion",
] as const;
```

Update `toValues()` in the same order:

```ts
      row.supplierName ?? "",
      row.supplierNit ?? "",
      row.invoiceNumber ?? "",
      row.paymentMethod ?? "",
```

and before `createdAt`:

```ts
      row.extractionConfidence ?? "",
      row.extractionModel ?? "",
```

- [ ] **Step 5: Run backend test**

Run:

```bash
cd apps/api && pnpm test -- commercial-expenses.e2e-spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/commercial-expenses/commercial-expenses.service.ts apps/api/src/modules/commercial-expenses/commercial-expenses-export.service.ts apps/api/test/commercial-expenses.e2e-spec.ts
git commit -m "feat(api): export expense invoice fields"
```

---

### Task 4: Add Frontend OCR Prefill UI

**Files:**
- Modify: `apps/web/src/components/expenses/expense-form.tsx`
- Modify: `apps/web/src/app/(app)/expenses/[id]/page.tsx`

- [ ] **Step 1: Add form state and extraction helper types**

In `apps/web/src/components/expenses/expense-form.tsx`, add these types near the existing interfaces:

```ts
interface ExtractedField<T> {
  value: T;
  confidence: number;
}

interface ExpenseExtractionResult {
  status: "completed" | "low_confidence";
  model: string;
  confidence: number;
  fields: {
    expenseDate?: ExtractedField<string>;
    amount?: ExtractedField<number>;
    currency?: ExtractedField<string>;
    category?: ExtractedField<string>;
    description?: ExtractedField<string>;
    supplierName?: ExtractedField<string>;
    supplierNit?: ExtractedField<string>;
    invoiceNumber?: ExtractedField<string>;
    paymentMethod?: ExtractedField<string>;
  };
  warnings: string[];
}
```

Extend `ExpenseFormInitialValues`:

```ts
  supplierName?: string | null;
  supplierNit?: string | null;
  invoiceNumber?: string | null;
  paymentMethod?: string | null;
  extractionConfidence?: string | number | null;
  extractionModel?: string | null;
```

- [ ] **Step 2: Add controlled values for prefillable fields**

Inside `ExpenseForm`, add state:

```ts
  const [expenseDate, setExpenseDate] = useState(dateInputValue(initialValues?.expenseDate));
  const [category, setCategory] = useState(initialValues?.category ?? "");
  const [amountValue, setAmountValue] = useState(
    initialValues?.amount ? String(initialValues.amount) : "",
  );
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [supplierName, setSupplierName] = useState(initialValues?.supplierName ?? "");
  const [supplierNit, setSupplierNit] = useState(initialValues?.supplierNit ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(initialValues?.invoiceNumber ?? "");
  const [paymentMethod, setPaymentMethod] = useState(initialValues?.paymentMethod ?? "");
  const [extractionConfidence, setExtractionConfidence] = useState<string>(
    initialValues?.extractionConfidence ? String(initialValues.extractionConfidence) : "",
  );
  const [extractionModel, setExtractionModel] = useState(initialValues?.extractionModel ?? "");
  const [extracting, setExtracting] = useState(false);
  const [extractionMessage, setExtractionMessage] = useState<string | null>(null);
```

Update existing inputs to use `value` and `onChange` for these states.

- [ ] **Step 3: Add extraction submit handler**

Inside `ExpenseForm`, add:

```ts
  async function handleExtractSupport() {
    const fileInput = document.querySelector<HTMLInputElement>('input[name="support"]');
    const file = fileInput?.files?.[0];

    if (!file) {
      setExtractionMessage("Selecciona una factura para leerla con IA.");
      return;
    }

    setExtracting(true);
    setExtractionMessage(null);

    const formData = new FormData();
    formData.set("support", file);

    try {
      const response = await apiFetchClient("/commercial-expenses/extract-support", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        setExtractionMessage("No se pudo leer la factura. Puedes llenar el gasto manualmente.");
        return;
      }

      const result = (await response.json()) as ExpenseExtractionResult;
      const fields = result.fields;

      if (fields.expenseDate?.value) setExpenseDate(fields.expenseDate.value.slice(0, 10));
      if (fields.category?.value) setCategory(fields.category.value);
      if (fields.amount?.value) setAmountValue(String(Math.round(Number(fields.amount.value))));
      if (fields.description?.value) setDescription(fields.description.value);
      if (fields.supplierName?.value) setSupplierName(fields.supplierName.value);
      if (fields.supplierNit?.value) setSupplierNit(fields.supplierNit.value);
      if (fields.invoiceNumber?.value) setInvoiceNumber(fields.invoiceNumber.value);
      if (fields.paymentMethod?.value) setPaymentMethod(fields.paymentMethod.value);

      setExtractionConfidence(String(result.confidence));
      setExtractionModel(result.model);
      setExtractionMessage(
        result.status === "completed"
          ? "Factura leida. Revisa los campos antes de guardar."
          : "La factura se leyo con baja confianza. Completa o corrige los campos.",
      );
    } catch {
      setExtractionMessage("No se pudo leer la factura. Puedes llenar el gasto manualmente.");
    } finally {
      setExtracting(false);
    }
  }
```

- [ ] **Step 4: Send confirmed fields on save**

In the edit JSON body, add:

```ts
              supplierName: optionalStringOrNull(formData.get("supplierName")),
              supplierNit: optionalStringOrNull(formData.get("supplierNit")),
              invoiceNumber: optionalStringOrNull(formData.get("invoiceNumber")),
              paymentMethod: optionalStringOrNull(formData.get("paymentMethod")),
              extractionConfidence: optionalString(formData.get("extractionConfidence"))
                ? Number(formData.get("extractionConfidence"))
                : undefined,
              extractionModel: optionalStringOrNull(formData.get("extractionModel")),
```

For create, these named fields are already included in `formData`; ensure hidden inputs exist:

```tsx
      <input type="hidden" name="extractionConfidence" value={extractionConfidence} />
      <input type="hidden" name="extractionModel" value={extractionModel} />
```

- [ ] **Step 5: Render extraction UI and new fields**

Above the date field, render:

```tsx
      {!isEditing ? (
        <div className="grid gap-2 rounded-lg border border-border p-3">
          <div className="text-sm font-semibold text-foreground">Leer factura con IA</div>
          <p className="text-xs text-muted-foreground">
            Sube una factura para prellenar el gasto. Revisa los datos antes de guardar.
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleExtractSupport()}
            disabled={extracting}
          >
            {extracting ? "Leyendo..." : "Leer factura"}
          </Button>
          {extractionMessage ? (
            <p className="text-sm text-muted-foreground">{extractionMessage}</p>
          ) : null}
        </div>
      ) : null}
```

Below amount, render:

```tsx
      <div className="grid gap-1">
        <Label>Proveedor</Label>
        <Input
          name="supplierName"
          value={supplierName}
          onChange={(event) => setSupplierName(event.target.value)}
        />
      </div>

      <div className="grid gap-1">
        <Label>NIT</Label>
        <Input
          name="supplierNit"
          value={supplierNit}
          onChange={(event) => setSupplierNit(event.target.value)}
        />
      </div>

      <div className="grid gap-1">
        <Label>Numero de factura</Label>
        <Input
          name="invoiceNumber"
          value={invoiceNumber}
          onChange={(event) => setInvoiceNumber(event.target.value)}
        />
      </div>

      <div className="grid gap-1">
        <Label>Medio de pago</Label>
        <Input
          name="paymentMethod"
          value={paymentMethod}
          onChange={(event) => setPaymentMethod(event.target.value)}
        />
      </div>
```

- [ ] **Step 6: Show invoice fields on detail**

In `apps/web/src/app/(app)/expenses/[id]/page.tsx`, extend `CommercialExpense`:

```ts
  supplierName: string | null;
  supplierNit: string | null;
  invoiceNumber: string | null;
  paymentMethod: string | null;
  extractionConfidence: string | null;
  extractionModel: string | null;
  extractionReviewedAt: string | null;
```

Add fields to the "Informacion del gasto" `DetailSection`:

```tsx
          { label: "Proveedor", value: expense.supplierName ?? "Sin proveedor" },
          { label: "NIT", value: expense.supplierNit ?? "Sin NIT" },
          { label: "Numero factura", value: expense.invoiceNumber ?? "Sin numero" },
          { label: "Medio de pago", value: expense.paymentMethod ?? "Sin medio de pago" },
          {
            label: "IA",
            value: expense.extractionConfidence
              ? `${Math.round(Number(expense.extractionConfidence) * 100)}% (${expense.extractionModel ?? "modelo no registrado"})`
              : "Sin lectura IA",
          },
```

When passing `initialValues` to `ExpenseForm`, include the new fields.

- [ ] **Step 7: Run frontend lint/build check**

Run:

```bash
cd apps/web && pnpm build
```

Expected: build completes without TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/expenses/expense-form.tsx 'apps/web/src/app/(app)/expenses/[id]/page.tsx'
git commit -m "feat(web): prefill expense form from invoice OCR"
```

---

### Task 5: Add Browser-Level Coverage And Final Verification

**Files:**
- Modify: `apps/web/tests/e2e/expenses.spec.ts`
- Verify: backend and frontend builds/tests

- [ ] **Step 1: Add Playwright smoke test for manual fallback**

In `apps/web/tests/e2e/expenses.spec.ts`, add:

```ts
test("new expense form exposes invoice OCR controls and manual fields", async ({ page, request }) => {
  await waitForBackend(request);
  await login(page, "comercial@norgtech.com", "Comercial123!");

  await page.goto("/expenses/new");

  await expect(page.getByText("Leer factura con IA")).toBeVisible();
  await expect(page.getByRole("button", { name: "Leer factura" })).toBeVisible();
  await expect(page.getByLabel("Proveedor")).toBeVisible();
  await expect(page.getByLabel("NIT")).toBeVisible();
  await expect(page.getByLabel("Numero de factura")).toBeVisible();
  await expect(page.getByLabel("Medio de pago")).toBeVisible();
});
```

- [ ] **Step 2: Run Playwright expense spec**

Run:

```bash
cd apps/web && pnpm exec playwright test tests/e2e/expenses.spec.ts
```

Expected: PASS. If the local backend/frontend are not running, start the normal dev stack first and rerun.

- [ ] **Step 3: Run backend commercial expense tests**

Run:

```bash
cd apps/api && pnpm test -- commercial-expenses.e2e-spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 4: Run API build**

Run:

```bash
cd apps/api && pnpm build
```

Expected: build completes without TypeScript errors.

- [ ] **Step 5: Run web build**

Run:

```bash
cd apps/web && pnpm build
```

Expected: build completes without TypeScript errors.

- [ ] **Step 6: Manual UAT**

Run the app locally and verify:

1. Login as `comercial@norgtech.com`.
2. Open `/expenses/new`.
3. Select a factura image/PDF.
4. Click "Leer factura".
5. Confirm fields prefill or low-confidence fallback appears.
6. Correct one field manually.
7. Save the expense.
8. Open the detail page and confirm supplier/NIT/invoice/payment fields appear.
9. Login as `facturacion@norgtech.com`.
10. Open the same expense, open the support, and approve/reject as normal.
11. Export CSV/XLSX and confirm new columns are present.

- [ ] **Step 7: Commit verification test**

```bash
git add apps/web/tests/e2e/expenses.spec.ts
git commit -m "test(web): cover expense invoice OCR form"
```

---

## Self-Review

Spec coverage:

- AI prefill before creation: Task 2 endpoint and Task 4 frontend flow.
- Human confirmation required: Task 4 keeps save as the only creation action.
- New structured fields: Task 1 persistence, Task 4 UI, Task 3 export.
- Manual fallback: Task 4 error/low-confidence behavior and Task 5 UAT.
- No temporary R2 storage during extraction: Task 2 endpoint analyzes upload only; Task 4 sends file again on final save.
- Export includes new fields: Task 3.
- Permissions and validation: Task 2 uses existing roles and support file validation.

Placeholder scan:

- No TBD/TODO placeholders are left in the implementation steps.
- Every code-changing task has concrete paths, snippets, commands, and expected outcomes.

Type consistency:

- Persisted fields use `supplierName`, `supplierNit`, `invoiceNumber`, `paymentMethod`, `extractionConfidence`, `extractionModel`, and `extractionReviewedAt` consistently across Prisma, DTOs, service, API response use, frontend, and export.

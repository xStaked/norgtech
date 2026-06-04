# Gastos Comerciales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the commercial expenses module with required private Cloudflare R2 supports, review workflow, summaries, and CSV/XLSX exports.

**Architecture:** Add a focused NestJS `CommercialExpensesModule` backed by Prisma models for expenses and support metadata. File storage is isolated behind an `R2StorageService`, so tests can mock storage and storage provider changes do not affect controllers or business logic. The Next.js app exposes `/expenses` as the user-facing route, reusing existing CRM table, filter, stat, form, and detail patterns.

**Tech Stack:** NestJS 11, Prisma 6, PostgreSQL, Cloudflare R2 via AWS S3 SDK, Next.js 16, React 19, Playwright, Jest/Supertest.

---

## File Structure

Backend files:

- `apps/api/prisma/schema.prisma`: add `CommercialExpenseStatus`, `CommercialExpenseCategory`, `CommercialExpense`, and `CommercialExpenseSupport`.
- `apps/api/prisma/migrations/20260604160000_commercial_expenses/migration.sql`: migration for expense tables and enums. If Prisma generates a different timestamp during execution, keep the generated timestamp and verify the migration name ends in `_commercial_expenses`.
- `apps/api/src/app.module.ts`: import `CommercialExpensesModule`.
- `apps/api/src/modules/commercial-expenses/commercial-expenses.module.ts`: Nest module wiring controller, service, storage, and export service.
- `apps/api/src/modules/commercial-expenses/commercial-expenses.controller.ts`: authenticated HTTP endpoints, role guards, multipart upload handling, support download.
- `apps/api/src/modules/commercial-expenses/commercial-expenses.service.ts`: business rules, permission filtering, state transitions, audit logging, R2 coordination.
- `apps/api/src/modules/commercial-expenses/commercial-expenses-export.service.ts`: CSV and XLSX generation for filtered rows.
- `apps/api/src/modules/commercial-expenses/r2-storage.service.ts`: Cloudflare R2 upload/delete/read/presign interface.
- `apps/api/src/modules/commercial-expenses/commercial-expense-constants.ts`: allowed transitions, MIME types, max file size, labels.
- `apps/api/src/modules/commercial-expenses/dto/create-commercial-expense.dto.ts`: create DTO.
- `apps/api/src/modules/commercial-expenses/dto/update-commercial-expense.dto.ts`: edit DTO for editable states.
- `apps/api/src/modules/commercial-expenses/dto/update-commercial-expense-status.dto.ts`: status DTO with review note rules.
- `apps/api/src/modules/commercial-expenses/dto/list-commercial-expenses.dto.ts`: typed filters.
- `apps/api/test/commercial-expenses.e2e-spec.ts`: backend e2e tests with mocked Prisma and mocked storage.

Frontend files:

- `apps/web/src/lib/auth.ts`: allow `/expenses`, add `expense` to create permissions.
- `apps/web/src/lib/theme.ts`: add `Gastos` nav item and breadcrumb label.
- `apps/web/src/app/(app)/expenses/page.tsx`: list, filters, stats, export actions.
- `apps/web/src/app/(app)/expenses/new/page.tsx`: create page.
- `apps/web/src/app/(app)/expenses/[id]/page.tsx`: detail/review page.
- `apps/web/src/lib/api.client.ts`: preserve browser-managed multipart headers for `FormData`.
- `apps/web/src/components/expenses/expense-form.tsx`: multipart create/edit form.
- `apps/web/src/components/expenses/expense-status-action.tsx`: review status actions and note input.
- `apps/web/src/components/expenses/expense-export-buttons.tsx`: CSV/XLSX download links preserving current filters.
- `apps/web/src/components/expenses/expense-support-link.tsx`: authenticated support opener for private API files.
- `apps/web/tests/e2e/expenses.spec.ts`: Playwright coverage for create/list/review/export visibility.

Shared or docs:

- `package.json` / `pnpm-lock.yaml`: dependency updates after adding API packages.
- Final implementation notes: document required R2 variables because this repo does not currently have an `.env.example` convention.

---

### Task 1: Add Dependencies And Prisma Schema

**Files:**
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260604160000_commercial_expenses/migration.sql` or the same migration name with Prisma's generated timestamp.

- [ ] **Step 1: Add API dependencies**

Run:

```bash
pnpm --filter @norgtech/api add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner exceljs
```

Expected: `apps/api/package.json` gains the three dependencies and `pnpm-lock.yaml` updates.

- [ ] **Step 2: Add Prisma enums and relations**

In `apps/api/prisma/schema.prisma`, add enums near the existing CRM enums:

```prisma
enum CommercialExpenseStatus {
  pendiente
  requiere_correccion
  aprobado
  rechazado
  contabilizado
}

enum CommercialExpenseCategory {
  alimentacion
  transporte
  hospedaje
  combustible
  peajes
  parqueadero
  atencion_comercial
  otros
}
```

Add relations to existing models:

```prisma
model User {
  // existing fields...
  submittedCommercialExpenses CommercialExpense[]        @relation("CommercialExpenseSubmitter")
  reviewedCommercialExpenses  CommercialExpense[]        @relation("CommercialExpenseReviewer")
  uploadedExpenseSupports     CommercialExpenseSupport[] @relation("CommercialExpenseSupportUploader")
}

model Customer {
  // existing fields...
  commercialExpenses CommercialExpense[]
}

model Visit {
  // existing fields...
  commercialExpenses CommercialExpense[]
}
```

Add new models after `BillingRequest`:

```prisma
model CommercialExpense {
  id                String                    @id @default(cuid())
  expenseDate       DateTime
  category          CommercialExpenseCategory
  amount            Decimal                   @db.Decimal(14, 2)
  currency          String                    @default("COP")
  description       String
  status            CommercialExpenseStatus   @default(pendiente)
  reviewNote        String?
  reviewedAt        DateTime?
  reviewedByUserId  String?
  submittedByUserId String
  customerId        String?
  visitId           String?
  createdBy         String
  updatedBy         String
  createdAt         DateTime                  @default(now())
  updatedAt         DateTime                  @updatedAt
  submittedBy       User                      @relation("CommercialExpenseSubmitter", fields: [submittedByUserId], references: [id], onDelete: Restrict)
  reviewedBy        User?                     @relation("CommercialExpenseReviewer", fields: [reviewedByUserId], references: [id], onDelete: Restrict)
  customer          Customer?                 @relation(fields: [customerId], references: [id])
  visit             Visit?                    @relation(fields: [visitId], references: [id])
  supports          CommercialExpenseSupport[]

  @@index([submittedByUserId, expenseDate])
  @@index([status, expenseDate])
  @@index([category, expenseDate])
  @@index([customerId])
  @@index([visitId])
}

model CommercialExpenseSupport {
  id               String            @id @default(cuid())
  expenseId        String
  bucket           String
  objectKey        String            @unique
  fileName         String
  contentType      String
  sizeBytes        Int
  checksum         String?
  uploadedByUserId String
  createdAt        DateTime          @default(now())
  expense          CommercialExpense @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  uploadedBy       User              @relation("CommercialExpenseSupportUploader", fields: [uploadedByUserId], references: [id], onDelete: Restrict)

  @@index([expenseId])
  @@index([uploadedByUserId])
}
```

- [ ] **Step 3: Generate migration**

Run:

```bash
pnpm --filter @norgtech/api prisma migrate dev --name commercial_expenses
```

Expected: Prisma creates a migration under `apps/api/prisma/migrations/` and regenerates the client.

- [ ] **Step 4: Validate schema**

Run:

```bash
pnpm --filter @norgtech/api prisma validate
```

Expected: `The schema at prisma/schema.prisma is valid`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): add commercial expense schema"
```

---

### Task 2: Backend Constants, DTOs, And Storage Boundary

**Files:**
- Create: `apps/api/src/modules/commercial-expenses/commercial-expense-constants.ts`
- Create: `apps/api/src/modules/commercial-expenses/dto/create-commercial-expense.dto.ts`
- Create: `apps/api/src/modules/commercial-expenses/dto/update-commercial-expense.dto.ts`
- Create: `apps/api/src/modules/commercial-expenses/dto/update-commercial-expense-status.dto.ts`
- Create: `apps/api/src/modules/commercial-expenses/dto/list-commercial-expenses.dto.ts`
- Create: `apps/api/src/modules/commercial-expenses/r2-storage.service.ts`

- [ ] **Step 1: Create constants**

Create `apps/api/src/modules/commercial-expenses/commercial-expense-constants.ts`:

```ts
import {
  CommercialExpenseCategory,
  CommercialExpenseStatus,
} from "@prisma/client";

export const EXPENSE_SUPPORT_MAX_BYTES = 10 * 1024 * 1024;

export const EXPENSE_SUPPORT_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const expenseStatusTransitions: Record<
  CommercialExpenseStatus,
  CommercialExpenseStatus[]
> = {
  pendiente: ["aprobado", "requiere_correccion", "rechazado"],
  requiere_correccion: ["pendiente"],
  aprobado: ["contabilizado"],
  rechazado: [],
  contabilizado: [],
};

export const expenseCategoryLabels: Record<CommercialExpenseCategory, string> = {
  alimentacion: "Alimentacion",
  transporte: "Transporte",
  hospedaje: "Hospedaje",
  combustible: "Combustible",
  peajes: "Peajes",
  parqueadero: "Parqueadero",
  atencion_comercial: "Cliente / atencion comercial",
  otros: "Otros",
};
```

- [ ] **Step 2: Create create DTO**

Create `apps/api/src/modules/commercial-expenses/dto/create-commercial-expense.dto.ts`:

```ts
import { CommercialExpenseCategory } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateCommercialExpenseDto {
  @IsDateString()
  expenseDate!: string;

  @IsEnum(CommercialExpenseCategory)
  category!: CommercialExpenseCategory;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  visitId?: string;
}
```

- [ ] **Step 3: Create update DTO**

Create `apps/api/src/modules/commercial-expenses/dto/update-commercial-expense.dto.ts`:

```ts
import { PartialType } from "@nestjs/mapped-types";
import { CreateCommercialExpenseDto } from "./create-commercial-expense.dto";

export class UpdateCommercialExpenseDto extends PartialType(
  CreateCommercialExpenseDto,
) {}
```

- [ ] **Step 4: Create status DTO**

Create `apps/api/src/modules/commercial-expenses/dto/update-commercial-expense-status.dto.ts`:

```ts
import { CommercialExpenseStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateCommercialExpenseStatusDto {
  @IsEnum(CommercialExpenseStatus)
  status!: CommercialExpenseStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}
```

- [ ] **Step 5: Create list DTO**

Create `apps/api/src/modules/commercial-expenses/dto/list-commercial-expenses.dto.ts`:

```ts
import {
  CommercialExpenseCategory,
  CommercialExpenseStatus,
} from "@prisma/client";
import { IsDateString, IsEnum, IsOptional, IsString } from "class-validator";

export class ListCommercialExpensesDto {
  @IsOptional()
  @IsEnum(CommercialExpenseStatus)
  status?: CommercialExpenseStatus;

  @IsOptional()
  @IsEnum(CommercialExpenseCategory)
  category?: CommercialExpenseCategory;

  @IsOptional()
  @IsString()
  submittedByUserId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  visitId?: string;

  @IsOptional()
  @IsString()
  format?: "csv" | "xlsx";
}
```

- [ ] **Step 6: Create R2 storage service**

Create `apps/api/src/modules/commercial-expenses/r2-storage.service.ts`:

```ts
import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

export interface StoredExpenseSupport {
  bucket: string;
  objectKey: string;
}

@Injectable()
export class R2StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    const accountId = this.requireEnv("R2_ACCOUNT_ID");
    const accessKeyId = this.requireEnv("R2_ACCESS_KEY_ID");
    const secretAccessKey = this.requireEnv("R2_SECRET_ACCESS_KEY");
    this.bucket = this.requireEnv("R2_BUCKET");
    const endpoint =
      this.configService.get<string>("R2_ENDPOINT") ??
      `https://${accountId}.r2.cloudflarestorage.com`;

    this.client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async uploadExpenseSupport(input: {
    fileName: string;
    contentType: string;
    body: Buffer;
  }): Promise<StoredExpenseSupport> {
    const objectKey = `commercial-expenses/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${this.safeFileName(input.fileName)}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );

    return { bucket: this.bucket, objectKey };
  }

  async deleteObject(objectKey: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
  }

  async getObjectStream(objectKey: string) {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    return result.Body as Readable;
  }

  async createSignedReadUrl(objectKey: string) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      { expiresIn: 60 },
    );
  }

  private requireEnv(name: string) {
    const value = this.configService.get<string>(name);
    if (!value) {
      throw new InternalServerErrorException(`${name} is required`);
    }
    return value;
  }

  private safeFileName(fileName: string) {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  }
}
```

- [ ] **Step 7: Run TypeScript compile**

Run:

```bash
pnpm --filter @norgtech/api build
```

Expected: build succeeds after Prisma client has the new enums.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/commercial-expenses apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): add expense dto and r2 storage boundary"
```

---

### Task 3: Backend Service, Controller, Module, And Exports

**Files:**
- Create: `apps/api/src/modules/commercial-expenses/commercial-expenses.service.ts`
- Create: `apps/api/src/modules/commercial-expenses/commercial-expenses.controller.ts`
- Create: `apps/api/src/modules/commercial-expenses/commercial-expenses-export.service.ts`
- Create: `apps/api/src/modules/commercial-expenses/commercial-expenses.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create export service**

Create `apps/api/src/modules/commercial-expenses/commercial-expenses-export.service.ts`:

```ts
import { Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";

export interface ExpenseExportRow {
  expenseDate: Date | string;
  submittedByName: string;
  category: string;
  amount: unknown;
  currency: string;
  customerName: string;
  visitId: string;
  status: string;
  description: string;
  reviewNote: string;
  reviewedAt: Date | string | null;
  reviewedByName: string;
  createdAt: Date | string;
}

@Injectable()
export class CommercialExpensesExportService {
  readonly csvContentType = "text/csv; charset=utf-8";
  readonly xlsxContentType =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  generateCsv(rows: ExpenseExportRow[]) {
    const header = [
      "fecha",
      "comercial",
      "categoria",
      "monto",
      "moneda",
      "cliente",
      "visita",
      "estado",
      "descripcion",
      "nota_revision",
      "fecha_revision",
      "revisor",
      "fecha_creacion",
    ];
    const lines = rows.map((row) =>
      [
        this.formatDate(row.expenseDate),
        row.submittedByName,
        row.category,
        String(row.amount),
        row.currency,
        row.customerName,
        row.visitId,
        row.status,
        row.description,
        row.reviewNote,
        this.formatDate(row.reviewedAt),
        row.reviewedByName,
        this.formatDate(row.createdAt),
      ]
        .map((value) => this.csvEscape(value))
        .join(","),
    );
    return Buffer.from([header.join(","), ...lines].join("\n"), "utf8");
  }

  async generateXlsx(rows: ExpenseExportRow[]) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Gastos");
    sheet.columns = [
      { header: "Fecha", key: "expenseDate", width: 14 },
      { header: "Comercial", key: "submittedByName", width: 24 },
      { header: "Categoria", key: "category", width: 22 },
      { header: "Monto", key: "amount", width: 14 },
      { header: "Moneda", key: "currency", width: 10 },
      { header: "Cliente", key: "customerName", width: 24 },
      { header: "Visita", key: "visitId", width: 18 },
      { header: "Estado", key: "status", width: 18 },
      { header: "Descripcion", key: "description", width: 36 },
      { header: "Nota revision", key: "reviewNote", width: 36 },
      { header: "Fecha revision", key: "reviewedAt", width: 18 },
      { header: "Revisor", key: "reviewedByName", width: 24 },
      { header: "Fecha creacion", key: "createdAt", width: 18 },
    ];
    rows.forEach((row) => {
      sheet.addRow({
        ...row,
        expenseDate: this.formatDate(row.expenseDate),
        reviewedAt: this.formatDate(row.reviewedAt),
        createdAt: this.formatDate(row.createdAt),
      });
    });
    sheet.getRow(1).font = { bold: true };
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private csvEscape(value: string) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  private formatDate(value: Date | string | null) {
    if (!value) return "";
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return value.slice(0, 10);
  }
}
```

- [ ] **Step 2: Create service**

Create `apps/api/src/modules/commercial-expenses/commercial-expenses.service.ts` with these methods and logic:

```ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CommercialExpenseStatus,
  Prisma,
  UserRole,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../auth/types/authenticated-request";
import {
  EXPENSE_SUPPORT_ALLOWED_MIME_TYPES,
  EXPENSE_SUPPORT_MAX_BYTES,
  expenseStatusTransitions,
} from "./commercial-expense-constants";
import { CreateCommercialExpenseDto } from "./dto/create-commercial-expense.dto";
import { ListCommercialExpensesDto } from "./dto/list-commercial-expenses.dto";
import { UpdateCommercialExpenseDto } from "./dto/update-commercial-expense.dto";
import { UpdateCommercialExpenseStatusDto } from "./dto/update-commercial-expense-status.dto";
import { R2StorageService } from "./r2-storage.service";

const includeExpenseRelations = {
  submittedBy: { select: { id: true, name: true, email: true, role: true } },
  reviewedBy: { select: { id: true, name: true, email: true, role: true } },
  customer: { select: { id: true, displayName: true } },
  visit: { select: { id: true, scheduledAt: true, summary: true } },
  supports: true,
} satisfies Prisma.CommercialExpenseInclude;

@Injectable()
export class CommercialExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly storage: R2StorageService,
  ) {}

  async create(
    user: AuthUser,
    dto: CreateCommercialExpenseDto,
    file?: Express.Multer.File,
  ) {
    this.assertSupportFile(file);
    const uploaded = await this.storage.uploadExpenseSupport({
      fileName: file.originalname,
      contentType: file.mimetype,
      body: file.buffer,
    });

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.validateOptionalRelations(dto, tx);
        const expense = await tx.commercialExpense.create({
          data: {
            expenseDate: new Date(dto.expenseDate),
            category: dto.category,
            amount: dto.amount,
            description: dto.description.trim(),
            customerId: dto.customerId || null,
            visitId: dto.visitId || null,
            submittedByUserId: user.id,
            createdBy: user.id,
            updatedBy: user.id,
            supports: {
              create: {
                bucket: uploaded.bucket,
                objectKey: uploaded.objectKey,
                fileName: file.originalname,
                contentType: file.mimetype,
                sizeBytes: file.size,
                uploadedByUserId: user.id,
              },
            },
          },
          include: includeExpenseRelations,
        });
        await this.auditService.record(
          {
            entityType: "CommercialExpense",
            entityId: expense.id,
            action: "commercial_expense.created",
            actorUserId: user.id,
            previousState: null,
            nextState: JSON.parse(JSON.stringify(expense)),
          },
          tx,
        );
        return expense;
      });
    } catch (error) {
      await this.storage.deleteObject(uploaded.objectKey).catch(() => undefined);
      throw error;
    }
  }

  findAll(user: AuthUser, filters: ListCommercialExpensesDto) {
    return this.prisma.commercialExpense.findMany({
      where: this.buildWhere(user, filters),
      orderBy: { expenseDate: "desc" },
      include: includeExpenseRelations,
    });
  }

  async findOne(user: AuthUser, id: string) {
    const expense = await this.prisma.commercialExpense.findUnique({
      where: { id },
      include: includeExpenseRelations,
    });
    if (!expense) throw new NotFoundException("Commercial expense not found");
    this.assertCanRead(user, expense.submittedByUserId);
    return expense;
  }

  async update(user: AuthUser, id: string, dto: UpdateCommercialExpenseDto) {
    const expense = await this.findOne(user, id);
    if (!["pendiente", "requiere_correccion"].includes(expense.status)) {
      throw new BadRequestException("Only pending expenses can be edited");
    }
    if (expense.submittedByUserId !== user.id && !this.isControlRole(user.role)) {
      throw new ForbiddenException("Cannot edit another user's expense");
    }
    return this.prisma.$transaction(async (tx) => {
      await this.validateOptionalRelations(dto, tx);
      const updated = await tx.commercialExpense.update({
        where: { id },
        data: {
          expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : undefined,
          category: dto.category,
          amount: dto.amount,
          description: dto.description?.trim(),
          customerId: dto.customerId === undefined ? undefined : dto.customerId || null,
          visitId: dto.visitId === undefined ? undefined : dto.visitId || null,
          status: expense.status === "requiere_correccion" ? "pendiente" : undefined,
          reviewNote: expense.status === "requiere_correccion" ? null : undefined,
          updatedBy: user.id,
        },
        include: includeExpenseRelations,
      });
      await this.auditService.record(
        {
          entityType: "CommercialExpense",
          entityId: id,
          action: "commercial_expense.updated",
          actorUserId: user.id,
          previousState: JSON.parse(JSON.stringify(expense)),
          nextState: JSON.parse(JSON.stringify(updated)),
        },
        tx,
      );
      return updated;
    });
  }

  async updateStatus(
    user: AuthUser,
    id: string,
    dto: UpdateCommercialExpenseStatusDto,
  ) {
    if (!this.isControlRole(user.role)) {
      throw new ForbiddenException("Only control roles can review expenses");
    }
    const expense = await this.findOne(user, id);
    if (!expenseStatusTransitions[expense.status].includes(dto.status)) {
      throw new BadRequestException("Invalid commercial expense status transition");
    }
    if (
      (dto.status === "requiere_correccion" || dto.status === "rechazado") &&
      !dto.reviewNote?.trim()
    ) {
      throw new BadRequestException("Review note is required for this status");
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.commercialExpense.update({
        where: { id },
        data: {
          status: dto.status,
          reviewNote: dto.reviewNote?.trim() || null,
          reviewedAt: new Date(),
          reviewedByUserId: user.id,
          updatedBy: user.id,
        },
        include: includeExpenseRelations,
      });
      await this.auditService.record(
        {
          entityType: "CommercialExpense",
          entityId: id,
          action: "commercial_expense.status_changed",
          actorUserId: user.id,
          previousState: JSON.parse(JSON.stringify(expense)),
          nextState: JSON.parse(JSON.stringify(updated)),
        },
        tx,
      );
      return updated;
    });
  }

  async getSupport(user: AuthUser, expenseId: string, supportId: string) {
    const expense = await this.findOne(user, expenseId);
    const support = expense.supports.find((item) => item.id === supportId);
    if (!support) throw new NotFoundException("Commercial expense support not found");
    return {
      support,
      stream: await this.storage.getObjectStream(support.objectKey),
    };
  }

  async summary(user: AuthUser, filters: ListCommercialExpensesDto) {
    const expenses = await this.findAll(user, filters);
    const totals = {
      totalAmount: 0,
      byStatus: {} as Record<string, number>,
      byCategory: {} as Record<string, number>,
      byUser: {} as Record<string, number>,
    };
    for (const expense of expenses) {
      const amount = Number(expense.amount);
      totals.totalAmount += amount;
      totals.byStatus[expense.status] = (totals.byStatus[expense.status] ?? 0) + amount;
      totals.byCategory[expense.category] = (totals.byCategory[expense.category] ?? 0) + amount;
      totals.byUser[expense.submittedBy.name] = (totals.byUser[expense.submittedBy.name] ?? 0) + amount;
    }
    return totals;
  }

  private buildWhere(user: AuthUser, filters: ListCommercialExpensesDto) {
    const where: Prisma.CommercialExpenseWhereInput = {};
    if (!this.isControlRole(user.role)) where.submittedByUserId = user.id;
    if (filters.status) where.status = filters.status;
    if (filters.category) where.category = filters.category;
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.visitId) where.visitId = filters.visitId;
    if (filters.submittedByUserId && this.isControlRole(user.role)) {
      where.submittedByUserId = filters.submittedByUserId;
    }
    if (filters.from || filters.to) {
      where.expenseDate = {
        gte: filters.from ? new Date(filters.from) : undefined,
        lte: filters.to ? new Date(filters.to) : undefined,
      };
    }
    return where;
  }

  private assertSupportFile(file?: Express.Multer.File): asserts file is Express.Multer.File {
    if (!file) throw new BadRequestException("Expense support is required");
    if (!EXPENSE_SUPPORT_ALLOWED_MIME_TYPES.includes(file.mimetype as any)) {
      throw new BadRequestException("Unsupported expense support file type");
    }
    if (file.size > EXPENSE_SUPPORT_MAX_BYTES) {
      throw new BadRequestException("Expense support file is too large");
    }
  }

  private assertCanRead(user: AuthUser, submittedByUserId: string) {
    if (this.isControlRole(user.role) || user.id === submittedByUserId) return;
    throw new ForbiddenException("Cannot access another user's expense");
  }

  private isControlRole(role: UserRole | string) {
    return ["administrador", "director_comercial", "facturacion"].includes(role);
  }

  private async validateOptionalRelations(
    dto: Partial<CreateCommercialExpenseDto>,
    tx: Prisma.TransactionClient,
  ) {
    if (dto.customerId) {
      const customer = await tx.customer.findUnique({ where: { id: dto.customerId } });
      if (!customer) throw new NotFoundException("Customer not found");
    }
    if (dto.visitId) {
      const visit = await tx.visit.findUnique({ where: { id: dto.visitId } });
      if (!visit) throw new NotFoundException("Visit not found");
    }
  }
}
```

- [ ] **Step 3: Create controller**

Create `apps/api/src/modules/commercial-expenses/commercial-expenses.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { EXPENSE_SUPPORT_MAX_BYTES } from "./commercial-expense-constants";
import { CommercialExpensesExportService } from "./commercial-expenses-export.service";
import { CommercialExpensesService } from "./commercial-expenses.service";
import { CreateCommercialExpenseDto } from "./dto/create-commercial-expense.dto";
import { ListCommercialExpensesDto } from "./dto/list-commercial-expenses.dto";
import { UpdateCommercialExpenseDto } from "./dto/update-commercial-expense.dto";
import { UpdateCommercialExpenseStatusDto } from "./dto/update-commercial-expense-status.dto";

@Controller("commercial-expenses")
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommercialExpensesController {
  constructor(
    private readonly service: CommercialExpensesService,
    private readonly exportService: CommercialExpensesExportService,
  ) {}

  @Roles("administrador", "director_comercial", "comercial", "facturacion")
  @Post()
  @UseInterceptors(
    FileInterceptor("support", {
      storage: memoryStorage(),
      limits: { fileSize: EXPENSE_SUPPORT_MAX_BYTES },
    }),
  )
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    dto: CreateCommercialExpenseDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.create(user, dto, file);
  }

  @Roles("administrador", "director_comercial", "comercial", "facturacion")
  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query(new ValidationPipe({ whitelist: true, transform: true }))
    filters: ListCommercialExpensesDto,
  ) {
    return this.service.findAll(user, filters);
  }

  @Roles("administrador", "director_comercial", "comercial", "facturacion")
  @Get("summary")
  summary(
    @CurrentUser() user: AuthUser,
    @Query(new ValidationPipe({ whitelist: true, transform: true }))
    filters: ListCommercialExpensesDto,
  ) {
    return this.service.summary(user, filters);
  }

  @Roles("administrador", "director_comercial", "comercial", "facturacion")
  @Get("export")
  async export(
    @CurrentUser() user: AuthUser,
    @Query(new ValidationPipe({ whitelist: true, transform: true }))
    filters: ListCommercialExpensesDto,
    @Res() res: Response,
  ) {
    const expenses = await this.service.findAll(user, filters);
    const rows = expenses.map((expense) => ({
      expenseDate: expense.expenseDate,
      submittedByName: expense.submittedBy.name,
      category: expense.category,
      amount: expense.amount,
      currency: expense.currency,
      customerName: expense.customer?.displayName ?? "",
      visitId: expense.visit?.id ?? "",
      status: expense.status,
      description: expense.description,
      reviewNote: expense.reviewNote ?? "",
      reviewedAt: expense.reviewedAt,
      reviewedByName: expense.reviewedBy?.name ?? "",
      createdAt: expense.createdAt,
    }));
    const format = filters.format === "xlsx" ? "xlsx" : "csv";
    const buffer =
      format === "xlsx"
        ? await this.exportService.generateXlsx(rows)
        : this.exportService.generateCsv(rows);
    res.setHeader(
      "Content-Type",
      format === "xlsx"
        ? this.exportService.xlsxContentType
        : this.exportService.csvContentType,
    );
    res.setHeader("Content-Disposition", `attachment; filename="gastos.${format}"`);
    res.send(buffer);
  }

  @Roles("administrador", "director_comercial", "comercial", "facturacion")
  @Get(":id")
  findOne(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.findOne(user, id);
  }

  @Roles("administrador", "director_comercial", "comercial", "facturacion")
  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    dto: UpdateCommercialExpenseDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Roles("administrador", "director_comercial", "facturacion")
  @Patch(":id/status")
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: UpdateCommercialExpenseStatusDto,
  ) {
    return this.service.updateStatus(user, id, dto);
  }

  @Roles("administrador", "director_comercial", "comercial", "facturacion")
  @Get(":id/supports/:supportId")
  async support(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("supportId") supportId: string,
    @Res() res: Response,
  ) {
    const { support, stream } = await this.service.getSupport(user, id, supportId);
    res.setHeader("Content-Type", support.contentType);
    res.setHeader("Content-Disposition", `inline; filename="${support.fileName}"`);
    stream.pipe(res);
  }
}
```

- [ ] **Step 4: Create module**

Create `apps/api/src/modules/commercial-expenses/commercial-expenses.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { CommercialExpensesController } from "./commercial-expenses.controller";
import { CommercialExpensesExportService } from "./commercial-expenses-export.service";
import { CommercialExpensesService } from "./commercial-expenses.service";
import { R2StorageService } from "./r2-storage.service";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [CommercialExpensesController],
  providers: [
    CommercialExpensesService,
    CommercialExpensesExportService,
    R2StorageService,
  ],
})
export class CommercialExpensesModule {}
```

- [ ] **Step 5: Register module**

In `apps/api/src/app.module.ts`, add:

```ts
import { CommercialExpensesModule } from "./modules/commercial-expenses/commercial-expenses.module";
```

Then add `CommercialExpensesModule` to the imports array near other operational modules.

- [ ] **Step 6: Run API build**

Run:

```bash
pnpm --filter @norgtech/api build
```

Expected: TypeScript build passes.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app.module.ts apps/api/src/modules/commercial-expenses
git commit -m "feat(api): add commercial expense endpoints"
```

---

### Task 4: Backend E2E Tests

**Files:**
- Create: `apps/api/test/commercial-expenses.e2e-spec.ts`

- [ ] **Step 1: Write e2e test fixture**

Create `apps/api/test/commercial-expenses.e2e-spec.ts`. Start with this fixture:

```ts
import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import {
  CommercialExpenseCategory,
  CommercialExpenseStatus,
  UserRole,
} from "@prisma/client";
import request from "supertest";
import { Readable } from "node:stream";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { R2StorageService } from "../src/modules/commercial-expenses/r2-storage.service";

describe("CommercialExpenses", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  const passwordHash = "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";
  const expenses: Array<Record<string, any>> = [];
  const supports: Array<Record<string, any>> = [];
  const auditLogs: Array<Record<string, any>> = [];

  const users = {
    "admin@norgtech.local": {
      id: "admin-user-id",
      name: "Admin",
      email: "admin@norgtech.local",
      passwordHash,
      role: UserRole.administrador,
      active: true,
    },
    "comercial@norgtech.local": {
      id: "comercial-user-id",
      name: "Comercial",
      email: "comercial@norgtech.local",
      passwordHash,
      role: UserRole.comercial,
      active: true,
    },
    "otro@norgtech.local": {
      id: "otro-user-id",
      name: "Otro Comercial",
      email: "otro@norgtech.local",
      passwordHash,
      role: UserRole.comercial,
      active: true,
    },
    "facturacion@norgtech.local": {
      id: "facturacion-user-id",
      name: "Facturacion",
      email: "facturacion@norgtech.local",
      passwordHash,
      role: UserRole.facturacion,
      active: true,
    },
  };

  beforeAll(async () => {
    const prismaStub = buildPrismaStub(users, expenses, supports, auditLogs);
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .overrideProvider(R2StorageService)
      .useValue({
        uploadExpenseSupport: async () => ({
          bucket: "test-bucket",
          objectKey: `commercial-expenses/test-${supports.length + 1}.png`,
        }),
        deleteObject: async () => undefined,
        getObjectStream: async () => Readable.from(Buffer.from("support")),
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await moduleRef.close();
  });

  async function login(email: keyof typeof users) {
    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password: "Admin123*" })
      .expect(200);
    return response.body.accessToken as string;
  }

  it("requires a support file when creating an expense", async () => {
    const token = await login("comercial@norgtech.local");
    await request(app.getHttpServer())
      .post("/commercial-expenses")
      .set("Authorization", `Bearer ${token}`)
      .field("expenseDate", "2026-06-04")
      .field("category", CommercialExpenseCategory.alimentacion)
      .field("amount", "38000")
      .field("description", "Almuerzo con cliente")
      .expect(400);
  });

  it("allows a commercial user to create an expense with support", async () => {
    const token = await login("comercial@norgtech.local");
    const response = await request(app.getHttpServer())
      .post("/commercial-expenses")
      .set("Authorization", `Bearer ${token}`)
      .field("expenseDate", "2026-06-04")
      .field("category", CommercialExpenseCategory.alimentacion)
      .field("amount", "38000")
      .field("description", "Almuerzo con cliente")
      .attach("support", Buffer.from("fake-image"), {
        filename: "factura.png",
        contentType: "image/png",
      })
      .expect(201);

    expect(response.body.status).toBe(CommercialExpenseStatus.pendiente);
    expect(response.body.supports).toHaveLength(1);
    expect(response.body.submittedByUserId).toBe("comercial-user-id");
  });

  it("prevents one commercial from seeing another commercial expense", async () => {
    const token = await login("otro@norgtech.local");
    const expenseId = expenses[0].id;
    await request(app.getHttpServer())
      .get(`/commercial-expenses/${expenseId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
  });

  it("allows facturacion to request correction with a note", async () => {
    const token = await login("facturacion@norgtech.local");
    const expenseId = expenses[0].id;
    const response = await request(app.getHttpServer())
      .patch(`/commercial-expenses/${expenseId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "requiere_correccion", reviewNote: "Soporte borroso" })
      .expect(200);

    expect(response.body.status).toBe("requiere_correccion");
    expect(response.body.reviewNote).toBe("Soporte borroso");
  });

  it("returns summary totals for control roles", async () => {
    const token = await login("facturacion@norgtech.local");
    const response = await request(app.getHttpServer())
      .get("/commercial-expenses/summary")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.totalAmount).toBeGreaterThan(0);
    expect(response.body.byCategory.alimentacion).toBeGreaterThan(0);
  });

  it("exports csv and xlsx", async () => {
    const token = await login("facturacion@norgtech.local");
    await request(app.getHttpServer())
      .get("/commercial-expenses/export?format=csv")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect("Content-Type", /text\/csv/);

    await request(app.getHttpServer())
      .get("/commercial-expenses/export?format=xlsx")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect("Content-Type", /spreadsheetml/);
  });
});
```

- [ ] **Step 2: Add Prisma stub helper**

In the same file below the test suite, add a helper with concrete mocked methods:

```ts
function buildPrismaStub(
  users: Record<string, any>,
  expenses: Array<Record<string, any>>,
  supports: Array<Record<string, any>>,
  auditLogs: Array<Record<string, any>>,
) {
  const userById = Object.values(users).reduce<Record<string, any>>((acc, user) => {
    acc[user.id] = user;
    return acc;
  }, {});

  function hydrate(expense: Record<string, any>) {
    const expenseSupports = supports.filter((support) => support.expenseId === expense.id);
    return JSON.parse(
      JSON.stringify({
        ...expense,
        submittedBy: userById[expense.submittedByUserId],
        reviewedBy: expense.reviewedByUserId ? userById[expense.reviewedByUserId] : null,
        customer: null,
        visit: null,
        supports: expenseSupports,
      }),
    );
  }

  const tx = {
    customer: { findUnique: async () => null },
    visit: { findUnique: async () => null },
    commercialExpense: {
      create: async ({ data, include }: any) => {
        const expense = {
          id: `expense-${expenses.length + 1}`,
          ...data,
          amount: Number(data.amount),
          status: "pendiente",
          createdAt: new Date("2026-06-04T00:00:00.000Z"),
          updatedAt: new Date("2026-06-04T00:00:00.000Z"),
        };
        expenses.push(expense);
        const supportData = data.supports.create;
        supports.push({
          id: `support-${supports.length + 1}`,
          expenseId: expense.id,
          ...supportData,
          createdAt: new Date("2026-06-04T00:00:00.000Z"),
        });
        return include ? hydrate(expense) : expense;
      },
      update: async ({ where, data, include }: any) => {
        const index = expenses.findIndex((expense) => expense.id === where.id);
        if (index === -1) return null;
        expenses[index] = {
          ...expenses[index],
          ...data,
          updatedAt: new Date("2026-06-04T00:00:00.000Z"),
        };
        return include ? hydrate(expenses[index]) : expenses[index];
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        const audit = { id: `audit-${auditLogs.length + 1}`, ...data };
        auditLogs.push(audit);
        return audit;
      },
    },
  };

  return {
    user: {
      findUnique: async ({ where }: any) => {
        if (where.email) return users[where.email] ?? null;
        if (where.id) return userById[where.id] ?? null;
        return null;
      },
    },
    customer: tx.customer,
    visit: tx.visit,
    commercialExpense: {
      findUnique: async ({ where }: any) => {
        const expense = expenses.find((item) => item.id === where.id);
        return expense ? hydrate(expense) : null;
      },
      findMany: async ({ where }: any = {}) =>
        expenses
          .filter((expense) => {
            if (where?.submittedByUserId && expense.submittedByUserId !== where.submittedByUserId) return false;
            if (where?.status && expense.status !== where.status) return false;
            if (where?.category && expense.category !== where.category) return false;
            return true;
          })
          .map(hydrate),
    },
    auditLog: tx.auditLog,
    $transaction: async (callback: any) => callback(tx),
  };
}
```

- [ ] **Step 3: Run targeted API test**

Run:

```bash
pnpm --filter @norgtech/api test commercial-expenses.e2e-spec.ts --runInBand
```

Expected: all `CommercialExpenses` tests pass.

- [ ] **Step 4: Run auth regression and add route coverage**

In `apps/api/test/auth.e2e-spec.ts`, add these assertions before running the test:

```ts
it("GET /commercial-expenses returns 200 for comercial", async () => {
  const login = await request(globalThis.__APP__)
    .post("/auth/login")
    .send({ email: "comercial@norgtech.com", password: "Admin123*" })
    .expect(200);

  await request(globalThis.__APP__)
    .get("/commercial-expenses")
    .set("Authorization", `Bearer ${login.body.accessToken}`)
    .expect(200);
});

it("GET /commercial-expenses is forbidden for logistica", async () => {
  const login = await request(globalThis.__APP__)
    .post("/auth/login")
    .send({ email: "logistica@norgtech.com", password: "Admin123*" })
    .expect(200);

  await request(globalThis.__APP__)
    .get("/commercial-expenses")
    .set("Authorization", `Bearer ${login.body.accessToken}`)
    .expect(403);
});
```

Run:

```bash
pnpm --filter @norgtech/api test auth.e2e-spec.ts --runInBand
```

Expected: auth role access tests pass, including the new commercial expense route coverage.

- [ ] **Step 5: Commit**

```bash
git add apps/api/test/commercial-expenses.e2e-spec.ts apps/api/test/auth.e2e-spec.ts
git commit -m "test(api): cover commercial expense workflow"
```

---

### Task 5: Frontend Navigation, Types, List, And Export

**Files:**
- Modify: `apps/web/src/lib/auth.ts`
- Modify: `apps/web/src/lib/theme.ts`
- Create: `apps/web/src/components/expenses/expense-export-buttons.tsx`
- Create: `apps/web/src/app/(app)/expenses/page.tsx`

- [ ] **Step 1: Update auth access**

In `apps/web/src/lib/auth.ts`, add `/expenses`:

```ts
"/expenses": ["administrador", "director_comercial", "comercial", "facturacion"],
```

Extend `canCreate` entity union to include `"expense"` and add:

```ts
expense: ["administrador", "director_comercial", "comercial"],
```

- [ ] **Step 2: Update theme navigation**

In `apps/web/src/lib/theme.ts`, add this item after `Visitas`:

```ts
{
  href: "/expenses",
  label: "Gastos",
  shortLabel: "GS",
  description: "Gastos de campo y soportes",
  group: "Operacion",
  requiredRoles: ["administrador", "director_comercial", "comercial", "facturacion"] as const,
},
```

Add singular label:

```ts
Gastos: "Gasto",
```

- [ ] **Step 3: Create export buttons**

Create `apps/web/src/components/expenses/expense-export-buttons.tsx`:

```tsx
"use client";

import { Download } from "lucide-react";
import { getSessionTokenClient } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function ExpenseExportButtons({ query }: { query: string }) {
  async function download(format: "csv" | "xlsx") {
    const token = getSessionTokenClient();
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/commercial-expenses/export?${query}&format=${format}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
    );
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gastos.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="secondary" onClick={() => download("csv")}>
        <Download className="h-4 w-4" /> CSV
      </Button>
      <Button type="button" variant="secondary" onClick={() => download("xlsx")}>
        <Download className="h-4 w-4" /> XLSX
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Create expenses list page**

Create `apps/web/src/app/(app)/expenses/page.tsx`:

```tsx
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CrmStatusTone } from "@/components/ui/theme";
import { apiFetch } from "@/lib/api.server";
import { getCurrentUser } from "@/lib/auth.server";
import { canCreate } from "@/lib/auth";
import { ExpenseExportButtons } from "@/components/expenses/expense-export-buttons";

interface Expense {
  id: string;
  expenseDate: string;
  category: string;
  amount: string | number;
  currency: string;
  description: string;
  status: string;
  submittedBy: { id: string; name: string } | null;
  customer: { id: string; displayName: string } | null;
  visit: { id: string; summary: string | null } | null;
  supports: Array<{ id: string; fileName: string }>;
}

const statusLabels: Record<string, string> = {
  pendiente: "Pendiente",
  requiere_correccion: "Correccion",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  contabilizado: "Contabilizado",
};

const statusTones: Record<string, CrmStatusTone> = {
  pendiente: "warning",
  requiere_correccion: "info",
  aprobado: "success",
  rechazado: "danger",
  contabilizado: "neutral",
};

const categoryLabels: Record<string, string> = {
  alimentacion: "Alimentacion",
  transporte: "Transporte",
  hospedaje: "Hospedaje",
  combustible: "Combustible",
  peajes: "Peajes",
  parqueadero: "Parqueadero",
  atencion_comercial: "Cliente / atencion comercial",
  otros: "Otros",
};

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" });

function totalByStatus(rows: Expense[], status: string) {
  return currencyFormatter.format(
    rows
      .filter((row) => row.status === status)
      .reduce((sum, row) => sum + Number(row.amount), 0),
  );
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value) query.set(key, value);
  }
  const [expensesResponse, summaryResponse, user] = await Promise.all([
    apiFetch(`/commercial-expenses${query.toString() ? `?${query}` : ""}`),
    apiFetch(`/commercial-expenses/summary${query.toString() ? `?${query}` : ""}`),
    getCurrentUser(),
  ]);
  const expenses: Expense[] = expensesResponse.ok ? await expensesResponse.json() : [];
  const summary = summaryResponse.ok ? await summaryResponse.json() : null;
  const role = user?.role ?? null;
  const canExport = role === "administrador" || role === "director_comercial" || role === "facturacion";

  const columns: readonly DataTableColumn<Expense>[] = [
    {
      key: "date",
      header: "Fecha",
      render: (row) => dateFormatter.format(new Date(row.expenseDate)),
    },
    {
      key: "submittedBy",
      header: "Comercial",
      render: (row) => row.submittedBy?.name ?? "Sin comercial",
    },
    {
      key: "category",
      header: "Categoria",
      render: (row) => categoryLabels[row.category] ?? row.category,
    },
    {
      key: "amount",
      header: "Monto",
      render: (row) => currencyFormatter.format(Number(row.amount)),
    },
    {
      key: "context",
      header: "Contexto",
      render: (row) =>
        row.customer ? (
          <Link href={`/customers/${row.customer.id}`} style={{ color: "#2d6cdf", fontWeight: 700, textDecoration: "none" }}>
            {row.customer.displayName}
          </Link>
        ) : row.visit ? (
          <Link href={`/visits/${row.visit.id}`} style={{ color: "#2d6cdf", fontWeight: 700, textDecoration: "none" }}>
            Visita #{row.visit.id.slice(-6)}
          </Link>
        ) : (
          <span style={{ color: "#64748b" }}>General</span>
        ),
    },
    {
      key: "status",
      header: "Estado",
      render: (row) => <StatusBadge tone={statusTones[row.status] ?? "neutral"}>{statusLabels[row.status] ?? row.status}</StatusBadge>,
    },
    {
      key: "detail",
      header: "Detalle",
      align: "right",
      render: (row) => (
        <Link href={`/expenses/${row.id}`} style={{ color: "#2d6cdf", fontWeight: 700, textDecoration: "none" }}>
          Abrir
        </Link>
      ),
    },
  ];

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Control en campo"
        title="Gastos comerciales"
        description="Registro, revision contable y resumen mensual por vendedor."
        actions={
          <>
            {canCreate(role, "expense") && <ButtonLink href="/expenses/new">Nuevo gasto</ButtonLink>}
            {canExport && <ExpenseExportButtons query={query.toString()} />}
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <StatCard label="Pendientes" value={totalByStatus(expenses, "pendiente")} tone="warning" />
        <StatCard label="En correccion" value={totalByStatus(expenses, "requiere_correccion")} tone="info" />
        <StatCard label="Aprobados" value={totalByStatus(expenses, "aprobado")} tone="success" />
        <StatCard label="Contabilizados" value={totalByStatus(expenses, "contabilizado")} tone="neutral" />
      </div>

      <FilterBar summary={`${expenses.length.toLocaleString("es-CO")} gastos registrados`} />

      <SectionCard title="Cola de gastos" description="Controla soporte, categoria, comercial y estado de revision.">
        <DataTable
          columns={columns}
          rows={expenses}
          getRowKey={(row) => row.id}
          emptyState={<EmptyState title="No hay gastos registrados" description="Los gastos apareceran aqui cuando el equipo comercial cargue sus soportes." />}
        />
      </SectionCard>
    </div>
  );
}
```

- [ ] **Step 5: Run web build**

Run:

```bash
pnpm --filter @norgtech/web build
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/auth.ts apps/web/src/lib/theme.ts apps/web/src/components/expenses apps/web/src/app/'(app)'/expenses
git commit -m "feat(web): add expenses list and exports"
```

---

### Task 6: Frontend Create Form And Detail Review

**Files:**
- Create: `apps/web/src/components/expenses/expense-form.tsx`
- Create: `apps/web/src/components/expenses/expense-status-action.tsx`
- Create: `apps/web/src/components/expenses/expense-support-link.tsx`
- Create: `apps/web/src/app/(app)/expenses/new/page.tsx`
- Create: `apps/web/src/app/(app)/expenses/[id]/page.tsx`
- Modify: `apps/web/src/lib/api.client.ts`

- [ ] **Step 1: Allow FormData in client fetch helper**

Modify `apps/web/src/lib/api.client.ts` so it does not force JSON for multipart form submissions:

```ts
import { getSessionTokenClient } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function apiFetchClient(path: string, init?: RequestInit) {
  const token = getSessionTokenClient();
  const headers = new Headers(init?.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (!headers.has("Content-Type") && init?.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(new URL(path, API_URL).toString(), {
    ...init,
    headers,
  });
}
```

- [ ] **Step 2: Create expense form**

Create `apps/web/src/components/expenses/expense-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Customer {
  id: string;
  displayName: string;
}

interface Visit {
  id: string;
  summary: string | null;
}

const categories = [
  ["alimentacion", "Alimentacion"],
  ["transporte", "Transporte"],
  ["hospedaje", "Hospedaje"],
  ["combustible", "Combustible"],
  ["peajes", "Peajes"],
  ["parqueadero", "Parqueadero"],
  ["atencion_comercial", "Cliente / atencion comercial"],
  ["otros", "Otros"],
] as const;

const selectClasses =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function ExpenseForm({
  customers,
  visits,
}: {
  customers: Customer[];
  visits: Visit[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const formData = new FormData(event.currentTarget);
    const support = formData.get("support");
    if (!(support instanceof File) || support.size === 0) {
      setError("El soporte es obligatorio.");
      setLoading(false);
      return;
    }

    try {
      const response = await apiFetchClient("/commercial-expenses", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al crear el gasto");
        setLoading(false);
        return;
      }
      const created = await response.json();
      router.push(`/expenses/${created.id}`);
    } catch {
      setError("Error de conexion");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid max-w-2xl gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid gap-1">
        <Label>Fecha *</Label>
        <Input name="expenseDate" type="date" required />
      </div>
      <div className="grid gap-1">
        <Label>Categoria *</Label>
        <select name="category" required className={selectClasses}>
          <option value="">Seleccionar categoria</option>
          {categories.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1">
        <Label>Monto *</Label>
        <Input name="amount" type="number" min="1" step="1" required />
      </div>
      <div className="grid gap-1">
        <Label>Cliente</Label>
        <select name="customerId" className={selectClasses}>
          <option value="">Gasto general</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.displayName}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1">
        <Label>Visita</Label>
        <select name="visitId" className={selectClasses}>
          <option value="">Sin visita asociada</option>
          {visits.map((visit) => (
            <option key={visit.id} value={visit.id}>
              {visit.summary || `Visita #${visit.id.slice(-6)}`}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1">
        <Label>Descripcion *</Label>
        <Textarea name="description" rows={3} required />
      </div>
      <div className="grid gap-1">
        <Label>Soporte *</Label>
        <Input name="support" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required />
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? "Guardando..." : "Guardar gasto"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Create new page**

Create `apps/web/src/app/(app)/expenses/new/page.tsx`:

```tsx
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { apiFetch } from "@/lib/api.server";
import { ExpenseForm } from "@/components/expenses/expense-form";

export default async function NewExpensePage() {
  const [customersResponse, visitsResponse] = await Promise.all([
    apiFetch("/customers"),
    apiFetch("/visits?assignedToMe=true"),
  ]);
  const customers = customersResponse.ok ? await customersResponse.json() : [];
  const visits = visitsResponse.ok ? await visitsResponse.json() : [];

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Control en campo"
        title="Nuevo gasto"
        description="Registra el gasto con su soporte obligatorio para revision administrativa."
      />
      <SectionCard title="Datos del gasto" description="El soporte debe ser imagen o PDF.">
        <ExpenseForm customers={customers} visits={visits} />
      </SectionCard>
    </div>
  );
}
```

- [ ] **Step 4: Create status action**

Create `apps/web/src/components/expenses/expense-status-action.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const actions = [
  ["aprobado", "Aprobar"],
  ["requiere_correccion", "Pedir correccion"],
  ["rechazado", "Rechazar"],
  ["contabilizado", "Marcar contabilizado"],
] as const;

export function ExpenseStatusAction({
  id,
  currentStatus,
  canReview,
}: {
  id: string;
  currentStatus: string;
  canReview: boolean;
}) {
  const router = useRouter();
  const [reviewNote, setReviewNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  if (!canReview) return null;

  async function updateStatus(status: string) {
    setLoading(status);
    setMessage(null);
    const response = await apiFetchClient(`/commercial-expenses/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, reviewNote }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setMessage(data.message || "Error al cambiar estado");
      setLoading(null);
      return;
    }
    router.refresh();
    setLoading(null);
  }

  const allowed = actions.filter(([status]) => {
    if (currentStatus === "pendiente") return ["aprobado", "requiere_correccion", "rechazado"].includes(status);
    if (currentStatus === "aprobado") return status === "contabilizado";
    return false;
  });

  if (allowed.length === 0) return null;

  return (
    <div className="grid gap-3">
      <Textarea
        value={reviewNote}
        onChange={(event) => setReviewNote(event.target.value)}
        placeholder="Nota de revision"
        rows={3}
      />
      {message && <p className="text-sm text-destructive">{message}</p>}
      <div className="flex flex-wrap gap-2">
        {allowed.map(([status, label]) => (
          <Button
            key={status}
            type="button"
            variant={status === "rechazado" ? "danger" : "secondary"}
            disabled={loading !== null}
            onClick={() => updateStatus(status)}
          >
            {loading === status ? "Procesando..." : label}
          </Button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create authenticated support link**

Create `apps/web/src/components/expenses/expense-support-link.tsx`:

```tsx
"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";

export function ExpenseSupportLink({
  expenseId,
  supportId,
  fileName,
}: {
  expenseId: string;
  supportId: string;
  fileName: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openSupport() {
    setLoading(true);
    setError(null);
    const response = await apiFetchClient(
      `/commercial-expenses/${expenseId}/supports/${supportId}`,
    );
    if (!response.ok) {
      setError("No se pudo abrir el soporte.");
      setLoading(false);
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    setLoading(false);
  }

  return (
    <div className="grid gap-2">
      <Button type="button" variant="secondary" onClick={openSupport} disabled={loading}>
        <FileText className="h-4 w-4" />
        {loading ? "Abriendo..." : `Abrir ${fileName}`}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 6: Create detail page**

Create `apps/web/src/app/(app)/expenses/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { DetailSection } from "@/components/ui/detail-section";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api.server";
import { getCurrentUser } from "@/lib/auth.server";
import { ExpenseStatusAction } from "@/components/expenses/expense-status-action";
import { ExpenseSupportLink } from "@/components/expenses/expense-support-link";

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const statusLabels: Record<string, string> = {
  pendiente: "Pendiente",
  requiere_correccion: "Correccion",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  contabilizado: "Contabilizado",
};

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [response, user] = await Promise.all([
    apiFetch(`/commercial-expenses/${id}`),
    getCurrentUser(),
  ]);
  if (!response.ok) notFound();
  const expense = await response.json();
  const role = user?.role ?? null;
  const canReview = role === "administrador" || role === "director_comercial" || role === "facturacion";
  const support = expense.supports?.[0];

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Gastos comerciales"
        title={`Gasto #${expense.id.slice(-6)}`}
        description={expense.description}
        actions={<Link href="/expenses" style={{ color: "#2d6cdf", fontWeight: 700, textDecoration: "none" }}>Volver</Link>}
      />
      <DetailSection title="Resumen">
        <Info label="Estado" value={<StatusBadge>{statusLabels[expense.status] ?? expense.status}</StatusBadge>} />
        <Info label="Monto" value={currencyFormatter.format(Number(expense.amount))} />
        <Info label="Comercial" value={expense.submittedBy?.name} />
        <Info label="Categoria" value={expense.category} />
        <Info label="Cliente" value={expense.customer?.displayName ?? "General"} />
        <Info label="Nota revision" value={expense.reviewNote ?? "Sin nota"} />
      </DetailSection>
      {support && (
        <SectionCard title="Soporte" description={support.fileName}>
          <ExpenseSupportLink
            expenseId={expense.id}
            supportId={support.id}
            fileName={support.fileName}
          />
        </SectionCard>
      )}
      <SectionCard title="Revision" description="Acciones disponibles para roles de control.">
        <ExpenseStatusAction id={expense.id} currentStatus={expense.status} canReview={canReview} />
      </SectionCard>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <span style={{ color: "#64748b", fontSize: 13 }}>{label}</span>
      <strong>{value || "Sin dato"}</strong>
    </div>
  );
}
```

- [ ] **Step 7: Run web build**

Run:

```bash
pnpm --filter @norgtech/web build
```

Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/api.client.ts apps/web/src/components/expenses apps/web/src/app/'(app)'/expenses
git commit -m "feat(web): add expense create and review views"
```

---

### Task 7: Seeds, Auth Coverage, And E2E UI Test

**Files:**
- Modify: `apps/api/prisma/seed.ts`
- Create: `apps/web/tests/e2e/expenses.spec.ts`

- [ ] **Step 1: Add seeded expenses**

In `apps/api/prisma/seed.ts`, after visits or billing requests are seeded, add two commercial expenses and supports using the existing seeded user/customer/visit IDs. Use deterministic `objectKey` values like `seed/commercial-expenses/factura-alimentacion.png`. Do not upload real files during seed.

Use this shape:

```ts
await prisma.commercialExpense.create({
  data: {
    expenseDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
    category: "alimentacion",
    amount: 38000,
    description: "Almuerzo con cliente en visita comercial",
    status: "pendiente",
    submittedByUserId: user_comercial,
    customerId: cust_1,
    createdBy: user_comercial,
    updatedBy: user_comercial,
    supports: {
      create: {
        bucket: "seed-r2-bucket",
        objectKey: "seed/commercial-expenses/factura-alimentacion.png",
        fileName: "factura-alimentacion.png",
        contentType: "image/png",
        sizeBytes: 120000,
        uploadedByUserId: user_comercial,
      },
    },
  },
});
```

- [ ] **Step 2: Add Playwright test**

Create `apps/web/tests/e2e/expenses.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("commercial expenses page is available and shows create action", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("comercial@norgtech.com");
  await page.getByLabel("Password").fill("Comercial123!");
  await page.getByRole("button", { name: /ingresar/i }).click();

  await page.goto("/expenses");
  await expect(page.getByRole("heading", { name: "Gastos comerciales" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Nuevo gasto" })).toBeVisible();
});

test("facturacion can see export actions", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("facturacion@norgtech.com");
  await page.getByLabel("Password").fill("Facturacion123!");
  await page.getByRole("button", { name: /ingresar/i }).click();

  await page.goto("/expenses");
  await expect(page.getByRole("button", { name: "CSV" })).toBeVisible();
  await expect(page.getByRole("button", { name: "XLSX" })).toBeVisible();
});
```

- [ ] **Step 3: Run tests**

Run:

```bash
pnpm --filter @norgtech/api test auth.e2e-spec.ts commercial-expenses.e2e-spec.ts --runInBand
pnpm --filter @norgtech/web test:e2e -- expenses.spec.ts
```

Expected: all targeted tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/seed.ts apps/web/tests/e2e/expenses.spec.ts
git commit -m "test: cover commercial expenses access"
```

---

### Task 8: Final Verification And Operational Notes

**Files:**
- Modify if needed: deployment notes or final response only.

- [ ] **Step 1: Run API test suite**

Run:

```bash
pnpm --filter @norgtech/api test --runInBand
```

Expected: all API tests pass.

- [ ] **Step 2: Run builds**

Run:

```bash
pnpm --filter @norgtech/api build
pnpm --filter @norgtech/web build
```

Expected: both builds pass.

- [ ] **Step 3: Run web e2e smoke**

Run:

```bash
pnpm --filter @norgtech/web test:e2e
```

Expected: Playwright suite passes or only known environment-specific failures are documented with exact error output.

- [ ] **Step 4: Document required production env vars**

In the final implementation notes, report these required env vars:

```text
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
R2_ENDPOINT optional if using default account endpoint
```

- [ ] **Step 5: Confirm clean tree**

Run:

```bash
git status --short
```

Expected: no uncommitted implementation files remain.

---

## Self-Review Checklist

- Spec coverage:
  - Required support upload is covered by Tasks 2, 3, 4, and 6.
  - R2 private storage is covered by Tasks 2 and 3.
  - Permission model is covered by Tasks 3, 4, 5, and 7.
  - Status workflow including correction is covered by Tasks 3, 4, and 6.
  - `/expenses` frontend route and `/commercial-expenses` API route are covered by Tasks 3, 5, and 6.
  - CSV/XLSX export is covered by Tasks 3, 5, and 7.
  - Audit logging is covered by Task 3 and tested through the mocked audit calls in Task 4.
- Placeholder scan:
  - This plan was scanned for unfinished markers, vague implementation instructions, and unnamed decisions.
- Type consistency:
  - Prisma enum names, DTO names, route paths, and status/category strings match the approved design spec.

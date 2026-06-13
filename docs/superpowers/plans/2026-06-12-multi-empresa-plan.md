# Multi-empresa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-company support so orders, billing requests, and invoices can be issued under Nortech or Nanonutricion with independent sequential numbering, while sharing all other catalog entities.

**Architecture:** New `Company` model with `prefix` for numbering. Only Order, BillingRequest, and Invoice carry a `companyId` foreign key. All other entities remain shared. Dashboard supports optional company filter with consolidation when omitted.

**Tech Stack:** NestJS + Prisma (PostgreSQL), Next.js 16 App Router, TypeScript, class-validator DTOs

---

## Task 1: Prisma Schema + Migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

### Step 1: Add Company model and companyId relations

Add the `Company` model after the enums (before the `User` model) and add `companyId` + relation to Order, BillingRequest, and Invoice.

```prisma
model Company {
  id         String   @id @default(cuid())
  name       String                       // "Norgtech"
  legalName  String                       // Razon social completa
  nit        String                       // NIT
  prefix     String   @unique             // "NT", "NN" para consecutivos
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  orders          Order[]
  billingRequests BillingRequest[]
  invoices        Invoice[]
}
```

In the `Order` model, add before `createdAt`:
```prisma
  companyId String
  company   Company @relation(fields: [companyId], references: [id])
```

In the `BillingRequest` model, add before `createdAt`:
```prisma
  companyId String
  company   Company @relation(fields: [companyId], references: [id])
```

In the `Invoice` model, add before `createdAt`:
```prisma
  companyId String
  company   Company @relation(fields: [companyId], references: [id])
```

### Step 2: Run Prisma migration

```bash
cd apps/api && npx prisma migrate dev --name add_company_model
```

Expected: migration created successfully with `Company` table, FK columns added to Order, BillingRequest, Invoice.

### Step 3: Generate Prisma client

```bash
cd apps/api && npx prisma generate
```

### Step 4: Commit

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat: add Company model with companyId on Order, BillingRequest, Invoice"
```

---

## Task 2: Companies NestJS Module (Backend)

**Files:**
- Create: `apps/api/src/modules/companies/companies.module.ts`
- Create: `apps/api/src/modules/companies/companies.controller.ts`
- Create: `apps/api/src/modules/companies/companies.service.ts`
- Create: `apps/api/src/modules/companies/dto/create-company.dto.ts`
- Create: `apps/api/src/modules/companies/dto/update-company.dto.ts`
- Modify: `apps/api/src/app.module.ts`

### Step 1: Create DTOs

Create `apps/api/src/modules/companies/dto/create-company.dto.ts`:

```typescript
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name!: string;

  @IsString()
  @IsNotEmpty()
  legalName!: string;

  @IsString()
  @IsNotEmpty()
  nit!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(4)
  @Matches(/^[A-Z]+$/, { message: "prefix must be uppercase letters only" })
  prefix!: string;
}
```

Create `apps/api/src/modules/companies/dto/update-company.dto.ts`:

```typescript
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  nit?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(4)
  @Matches(/^[A-Z]+$/, { message: "prefix must be uppercase letters only" })
  prefix?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

### Step 2: Create service

Create `apps/api/src/modules/companies/companies.service.ts`:

```typescript
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateCompanyDto) {
    return this.prisma.company.create({
      data: {
        name: dto.name,
        legalName: dto.legalName,
        nit: dto.nit,
        prefix: dto.prefix.toUpperCase(),
      },
    });
  }

  findAll() {
    return this.prisma.company.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
  }

  async findOne(id: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) {
      throw new NotFoundException("Company not found");
    }
    return company;
  }

  async update(id: string, dto: UpdateCompanyDto) {
    await this.findOne(id);

    if (dto.prefix) {
      const existing = await this.prisma.company.findUnique({
        where: { prefix: dto.prefix.toUpperCase() },
      });
      if (existing && existing.id !== id) {
        throw new BadRequestException("Prefix already in use");
      }
    }

    return this.prisma.company.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.prefix ? { prefix: dto.prefix.toUpperCase() } : {}),
      },
    });
  }
}
```

### Step 3: Create controller

Create `apps/api/src/modules/companies/companies.controller.ts`:

```typescript
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { CompaniesService } from "./companies.service";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";

@Controller("companies")
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador")
  @Post()
  create(
    @Body(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    )
    dto: CreateCompanyDto,
  ) {
    return this.companiesService.create(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll() {
    return this.companiesService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.companiesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador")
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    )
    dto: UpdateCompanyDto,
  ) {
    return this.companiesService.update(id, dto);
  }
}
```

### Step 4: Create module

Create `apps/api/src/modules/companies/companies.module.ts`:

```typescript
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";

@Module({
  imports: [AuthModule],
  controllers: [CompaniesController],
  providers: [CompaniesService],
})
export class CompaniesModule {}
```

### Step 5: Register in AppModule

In `apps/api/src/app.module.ts`, add the import:

```typescript
import { CompaniesModule } from "./modules/companies/companies.module";
```

And add to the `imports` array:

```typescript
CompaniesModule,
```

### Step 6: Commit

```bash
git add apps/api/src/modules/companies/ apps/api/src/app.module.ts
git commit -m "feat: add Companies CRUD module"
```

---

## Task 3: Seed Companies and Update Seed Data

**Files:**
- Modify: `apps/api/prisma/seed.ts`

### Step 1: Add company IDs and seed data

At the top of `apps/api/prisma/seed.ts`, add after existing UUID constants:

```typescript
const company_nortech = "c_nortech_nt";
const company_nanonutricion = "c_nanonutricion_nn";
```

After the users seed section and before the segments section, add:

```typescript
// -- Companies -------------------------------------------------
const companies = [
  { id: company_nortech, name: "Norgtech", legalName: "Tecnologia de Nutricion Organica S.A.S.", nit: "900.123.456-7", prefix: "NT" },
  { id: company_nanonutricion, name: "Nanonutricion", legalName: "Tecnologias en Nanonutricion Organica S.A.S.", nit: "901.987.654-3", prefix: "NN" },
];

for (const company of companies) {
  await prisma.company.upsert({
    where: { prefix: company.prefix },
    update: {},
    create: company,
  });
}
```

### Step 2: Add companyId to seed orders

In the orders seed section, add `companyId: company_nortech` to both orders:

```typescript
{ id: order_1, ..., companyId: company_nortech },
{ id: order_2, ..., companyId: company_nortech },
```

Also add `orderNumber` to seed orders to use the new format:

```typescript
{ id: order_1, ..., orderNumber: "NT-001", ... },
{ id: order_2, ..., orderNumber: "NT-002", ... },
```

### Step 3: Add companyId to seed billing requests

Add `companyId: company_nortech` to both billing request seed records.

### Step 4: Update seed log

Add to the seed completion log:

```typescript
console.log("   - 2 empresas");
```

### Step 5: Commit

```bash
git add apps/api/prisma/seed.ts
git commit -m "feat: seed companies and update seed data with companyId"
```

---

## Task 4: Update Order Numbering with Company Prefix

**Files:**
- Modify: `apps/api/src/modules/orders/dto/create-order.dto.ts`
- Modify: `apps/api/src/modules/orders/orders.controller.ts`
- Modify: `apps/api/src/modules/orders/orders.service.ts`

### Step 1: Add companyId to CreateOrderDto

In `apps/api/src/modules/orders/dto/create-order.dto.ts`, add after the `customerId` field:

```typescript
  @IsString()
  @IsNotEmpty()
  companyId!: string;
```

### Step 2: Update nextOrderNumber to use company prefix

In `apps/api/src/modules/orders/orders.service.ts`, replace the `nextOrderNumber` method:

```typescript
  private async nextOrderNumber(companyPrefix: string) {
    const last = await this.prisma.order.findFirst({
      where: { orderNumber: { startsWith: `${companyPrefix}-` } },
      orderBy: { orderNumber: "desc" },
      select: { orderNumber: true },
    });

    if (!last?.orderNumber) {
      return `${companyPrefix}-001`;
    }

    const parts = last.orderNumber.split("-");
    const seq = Number.parseInt(parts[parts.length - 1] ?? "0", 10) || 0;
    return `${companyPrefix}-${String(seq + 1).padStart(3, "0")}`;
  }
```

### Step 3: Add companyId validation to OrdersService.create()

At the top of the `create` method, after the imports, add company validation immediately after the Customer lookup:

```typescript
    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
    });
    if (!company || !company.isActive) {
      throw new NotFoundException("Company not found or inactive");
    }

    const orderNumber = dto.orderNumber?.trim() || await this.nextOrderNumber(company.prefix);
```

Then in the `tx.order.create()` call's `data`, add:

```typescript
          companyId: dto.companyId,
```

### Step 4: Update OrdersService.findAll() for companyId filter

Replace the `findAll` method signature to accept optional company filter:

```typescript
  findAll(status?: OrderStatus, companyId?: string) {
    const where: Prisma.OrderWhereInput = {};
    if (status) where.status = status;
    if (companyId) where.companyId = companyId;
    return this.prisma.order.findMany({
      where,
      include: { customer: true, opportunity: true, items: true, company: true },
      orderBy: { createdAt: "desc" },
    });
  }
```

Add `Prisma` import if not already present.

### Step 5: Update findOne to include company

In `findOne`, add `company: true` to the include:

```typescript
  findOne(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        opportunity: true,
        sourceQuote: true,
        sourceConversation: true,
        items: true,
        billingRequests: true,
        assignedLogisticsUser: true,
        company: true,
      },
    });
  }
```

### Step 6: Update OrdersController for companyId

In `apps/api/src/modules/orders/orders.controller.ts`, update the `findAll` method:

```typescript
  @Get()
  findAll(@Query("status") status?: OrderStatus, @Query("companyId") companyId?: string) {
    return this.ordersService.findAll(status, companyId);
  }
```

### Step 7: Update createBillingRequest to inherit companyId

In `OrdersService.createBillingRequest`, add `companyId: order.companyId` to the billing request creation data.

### Step 8: Commit

```bash
git add apps/api/src/modules/orders/
git commit -m "feat: add companyId to orders with prefix-based numbering"
```

---

## Task 5: Update BillingRequest with companyId

**Files:**
- Modify: `apps/api/src/modules/billing-requests/dto/create-billing-request.dto.ts`
- Modify: `apps/api/src/modules/billing-requests/billing-requests.controller.ts`
- Modify: `apps/api/src/modules/billing-requests/billing-requests.service.ts`

### Step 1: Add companyId to CreateBillingRequestDto

In `apps/api/src/modules/billing-requests/dto/create-billing-request.dto.ts`, add:

```typescript
  @IsString()
  @IsNotEmpty()
  companyId!: string;
```

### Step 2: Add company validation to BillingRequestsService.createDirect()

After the existing validations and before the transaction, add:

```typescript
    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
    });
    if (!company || !company.isActive) {
      throw new NotFoundException("Company not found or inactive");
    }
```

Then in `tx.billingRequest.create` data, add:

```typescript
          companyId: dto.companyId,
```

### Step 3: Update BillingRequestsService.findAll() for companyId filter

Replace the `findAll` method:

```typescript
  findAll(status?: BillingRequestStatus, companyId?: string) {
    const where: Prisma.BillingRequestWhereInput = {};
    if (status) where.status = status;
    if (companyId) where.companyId = companyId;
    return this.prisma.billingRequest.findMany({
      where,
      include: { customer: true, opportunity: true, sourceQuote: true, sourceOrder: true, company: true },
      orderBy: { createdAt: "desc" },
    });
  }
```

### Step 4: Update BillingRequestsService.findOne() include

Add `company: true` to the include in `findOne`.

### Step 5: Update BillingRequestsController for companyId

In `apps/api/src/modules/billing-requests/billing-requests.controller.ts`, update the `findAll` method:

```typescript
  @Get()
  findAll(@Query("status") status?: BillingRequestStatus, @Query("companyId") companyId?: string) {
    return this.billingRequestsService.findAll(status, companyId);
  }
```

### Step 6: Commit

```bash
git add apps/api/src/modules/billing-requests/
git commit -m "feat: add companyId to billing requests with filter support"
```

---

## Task 6: Update Invoice with companyId

**Files:**
- Modify: `apps/api/src/modules/invoices/dto/create-invoice.dto.ts`
- Modify: `apps/api/src/modules/invoices/dto/list-invoices.dto.ts`
- Modify: `apps/api/src/modules/invoices/invoices.controller.ts`
- Modify: `apps/api/src/modules/invoices/invoices.service.ts`

### Step 1: Add companyId to CreateInvoiceDto

In `apps/api/src/modules/invoices/dto/create-invoice.dto.ts`, add:

```typescript
  @IsString()
  @IsNotEmpty()
  companyId!: string;
```

### Step 2: Add companyId to ListInvoicesDto

In `apps/api/src/modules/invoices/dto/list-invoices.dto.ts`, add:

```typescript
  @IsOptional()
  @IsString()
  companyId?: string;
```

### Step 3: Add company validation to InvoicesService.create()

After the Customer lookup and before `this.prisma.$transaction`, add:

```typescript
    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
    });
    if (!company || !company.isActive) {
      throw new NotFoundException("Company not found or inactive");
    }
```

Update `nextInvoiceNumber` to accept a company prefix:

```typescript
  private async nextInvoiceNumber(companyPrefix: string): Promise<string> {
    const last = await this.prisma.invoice.findFirst({
      where: { invoiceNumber: { startsWith: `${companyPrefix}-` } },
      orderBy: { invoiceNumber: "desc" },
      select: { invoiceNumber: true },
    });

    if (!last?.invoiceNumber) {
      return `${companyPrefix}-001`;
    }

    const parts = last.invoiceNumber.split("-");
    const seq = Number.parseInt(parts[parts.length - 1] ?? "0", 10) || 0;
    return `${companyPrefix}-${String(seq + 1).padStart(3, "0")}`;
  }
```

Update the invoice creation call:

```typescript
    const invoiceNumber = dto.invoiceNumber?.trim()
      || (await this.nextInvoiceNumber(company.prefix));
```

And add `companyId: dto.companyId` to the `tx.invoice.create` data.

### Step 4: Update InvoicesService.findAll() and buildWhere()

In `buildWhere`, add `companyId` filter:

```typescript
    if (filters.companyId) {
      where.companyId = filters.companyId;
    }
```

In `findOne`, add `company: true` to the include.

### Step 5: Update InvoicesController

Update `findAll` to pass `companyId` from the DTO to the service (already handled by ListInvoicesDto change). No controller code change needed for `findAll` since it already passes `filters`.

Add `companyId` to `create`:

```typescript
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(validationPipe) dto: CreateInvoiceDto,
  ) {
    return this.invoicesService.create(user, dto);
  }
```

No change needed — the DTO already carries `companyId`.

### Step 6: Commit

```bash
git add apps/api/src/modules/invoices/
git commit -m "feat: add companyId to invoices with prefix-based numbering"
```

---

## Task 7: Update Dashboard with companyId Filter

**Files:**
- Modify: `apps/api/src/modules/dashboard/dashboard.controller.ts`
- Modify: `apps/api/src/modules/dashboard/dashboard.service.ts`

### Step 1: Add companyId query param to dashboard controller

In `apps/api/src/modules/dashboard/dashboard.controller.ts`, update both endpoints:

```typescript
  @Get("summary")
  getSummary(
    @CurrentUser() user: AuthUser,
    @Query("companyId") companyId?: string,
  ) {
    return this.dashboardService.getSummary(user, companyId);
  }

  @Get("commercial-advanced")
  getCommercialAdvanced(
    @CurrentUser() user: AuthUser,
    @Query("days") days?: string,
    @Query("companyId") companyId?: string,
  ) {
    return this.dashboardService.getCommercialAdvancedSummary(user, days, companyId);
  }
```

### Step 2: Update DashboardService.getSummary() for companyId

Change the signature to accept optional `companyId`:

```typescript
  async getSummary(user: AuthUser, companyId?: string) {
```

Add companyId filter to the order, quote, opportunity counts. The simplest approach: when `companyId` is provided, add `where: { companyId }` to the order count. For summary KPIs that should be filtered:

```typescript
    const activeOrders = companyId
      ? await this.prisma.order.count({ where: { status: { not: "entregado" }, companyId } })
      : await this.prisma.order.count({ where: { status: { not: "entregado" } } });
```

Apply the same pattern to `openQuotes` is NOT filtered (quotes don't have companyId). Only orders and anything derived from orders.

### Step 3: Update DashboardService.getCommercialAdvancedSummary() for companyId

Change the signature:

```typescript
  async getCommercialAdvancedSummary(user: AuthUser, daysQuery?: string, companyId?: string) {
```

Add companyId to the order query where clause:

```typescript
    const orderWhereExtra = companyId ? { companyId } : {};

    const [orders, orderItems, customers, activeProducts] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          orderDate: { gte: from, lte: to },
          ...orderCustomerScope,
          ...orderWhereExtra,
        },
        ...
      }),
      this.prisma.orderItem.findMany({
        where: {
          order: {
            orderDate: { lte: to },
            ...orderCustomerScope,
            ...orderWhereExtra,
          },
        },
        ...
      }),
```

### Step 4: Commit

```bash
git add apps/api/src/modules/dashboard/
git commit -m "feat: add optional companyId filter to dashboard endpoints"
```

---

## Task 8: Companies Frontend Pages

**Files:**
- Create: `apps/web/src/components/companies/company-select.tsx`
- Create: `apps/web/src/app/(app)/companies/page.tsx`
- Create: `apps/web/src/app/(app)/companies/new/page.tsx`
- Create: `apps/web/src/app/(app)/companies/[id]/page.tsx`
- Modify: `apps/web/src/lib/theme.ts`

### Step 1: Create CompanySelect component

Create `apps/web/src/components/companies/company-select.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { apiFetchClient } from "@/lib/api.client";

interface Company {
  id: string;
  name: string;
  prefix: string;
}

interface CompanySelectProps {
  value?: string;
  onChange?: (companyId: string) => void;
  name?: string;
  required?: boolean;
  includeAll?: boolean;
}

export function CompanySelect({
  value,
  onChange,
  name = "companyId",
  required = false,
  includeAll = false,
}: CompanySelectProps) {
  const [companies, setCompanies] = useState<Company[]>([]);

  useEffect(() => {
    apiFetchClient("/companies")
      .then((res) => res.json())
      .then(setCompanies)
      .catch(() => setCompanies([]));
  }, []);

  if (onChange) {
    return (
      <select
        name={name}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      >
        {includeAll && <option value="">Todas</option>}
        {!required && !includeAll && <option value="">Seleccionar empresa</option>}
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.prefix})
          </option>
        ))}
      </select>
    );
  }

  return (
    <select
      name={name}
      defaultValue={value ?? ""}
      required={required}
      className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
    >
      {includeAll && <option value="">Todas</option>}
      {!required && !includeAll && <option value="">Seleccionar empresa</option>}
      {companies.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name} ({c.prefix})
        </option>
      ))}
    </select>
  );
}
```

### Step 2: Create /companies page (list)

Create `apps/web/src/app/(app)/companies/page.tsx`:

```tsx
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api.server";

interface Company {
  id: string;
  name: string;
  legalName: string;
  nit: string;
  prefix: string;
  isActive: boolean;
}

interface CompanyRow {
  id: string;
  name: string;
  legalName: string;
  nit: string;
  prefix: string;
  isActive: boolean;
}

const columns: readonly DataTableColumn<CompanyRow>[] = [
  {
    key: "name",
    header: "Nombre",
    render: (row) => (
      <div style={{ display: "grid", gap: 4 }}>
        <Link href={`/companies/${row.id}`} style={{ fontWeight: 700, color: "#10233f", textDecoration: "none" }}>
          {row.name}
        </Link>
        <span style={{ fontSize: 13, color: "#52637a" }}>{row.legalName}</span>
      </div>
    ),
  },
  {
    key: "prefix",
    header: "Prefijo",
    render: (row) => (
      <code style={{ padding: "2px 6px", borderRadius: 4, backgroundColor: "#f0f4f8", fontSize: 13 }}>
        {row.prefix}
      </code>
    ),
  },
  {
    key: "nit",
    header: "NIT",
    render: (row) => row.nit,
  },
  {
    key: "status",
    header: "Estado",
    render: (row) => (
      <StatusBadge tone={row.isActive ? "success" : "neutral"}>
        {row.isActive ? "Activa" : "Inactiva"}
      </StatusBadge>
    ),
  },
] as const;

export default async function CompaniesPage() {
  const response = await apiFetch("/companies");
  const companies: Company[] = response.ok ? await response.json() : [];

  const rows: CompanyRow[] = companies;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Admin"
        title="Empresas"
        description="Empresas facturadoras activas en el sistema."
        actions={<ButtonLink href="/companies/new">Nueva empresa</ButtonLink>}
      />

      <FilterBar summary={`${rows.length.toLocaleString("es-CO")} empresas registradas`} />

      <SectionCard title="Catalogo de empresas" description="Gestiona las empresas facturadoras disponibles en pedidos y facturas.">
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          emptyState={
            <EmptyState
              title="No hay empresas registradas"
              description="Registra la primera empresa para habilitar pedidos y facturacion."
              action={<ButtonLink href="/companies/new">Crear empresa</ButtonLink>}
            />
          }
        />
      </SectionCard>
    </div>
  );
}
```

### Step 3: Create /companies/new page

Create `apps/web/src/app/(app)/companies/new/page.tsx`:

```tsx
import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { CompanyForm } from "./company-form";

export default function NewCompanyPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Empresas"
        title="Nueva empresa"
        actions={
          <ButtonLink href="/companies" variant="secondary">
            Volver a empresas
          </ButtonLink>
        }
      />
      <SectionCard>
        <CompanyForm />
      </SectionCard>
    </div>
  );
}
```

Create `apps/web/src/app/(app)/companies/new/company-form.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CompanyForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);

    const body = {
      name: String(formData.get("name") ?? "").trim(),
      legalName: String(formData.get("legalName") ?? "").trim(),
      nit: String(formData.get("nit") ?? "").trim(),
      prefix: String(formData.get("prefix") ?? "").trim().toUpperCase(),
    };

    if (!body.name || !body.legalName || !body.nit || !body.prefix) {
      setError("Todos los campos son obligatorios");
      setLoading(false);
      return;
    }

    try {
      const response = await apiFetchClient("/companies", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al crear la empresa");
        setLoading(false);
        return;
      }

      const created = await response.json();
      router.push(`/companies/${created.id}`);
    } catch {
      setError("Error de conexion");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 max-w-lg">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-1">
        <Label htmlFor="name">Nombre *</Label>
        <Input id="name" name="name" required placeholder="Norgtech" />
      </div>

      <div className="grid gap-1">
        <Label htmlFor="legalName">Razon social *</Label>
        <Input id="legalName" name="legalName" required placeholder="Tecnologia de Nutricion Organica S.A.S." />
      </div>

      <div className="grid gap-1">
        <Label htmlFor="nit">NIT *</Label>
        <Input id="nit" name="nit" required placeholder="900.123.456-7" />
      </div>

      <div className="grid gap-1">
        <Label htmlFor="prefix">Prefijo * (2-4 letras mayusculas)</Label>
        <Input
          id="prefix"
          name="prefix"
          required
          maxLength={4}
          minLength={2}
          placeholder="NT"
          style={{ textTransform: "uppercase" }}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Guardando..." : "Guardar empresa"}
        </Button>
      </div>
    </form>
  );
}
```

### Step 4: Create /companies/[id] page (edit)

Create `apps/web/src/app/(app)/companies/[id]/page.tsx`:

```tsx
import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { apiFetch } from "@/lib/api.server";
import { notFound } from "next/navigation";
import { CompanyEditForm } from "./company-edit-form";

interface Company {
  id: string;
  name: string;
  legalName: string;
  nit: string;
  prefix: string;
  isActive: boolean;
}

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const response = await apiFetch(`/companies/${id}`);
  if (!response.ok) notFound();

  const company: Company = await response.json();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Empresas"
        title={company.name}
        actions={
          <ButtonLink href="/companies" variant="secondary">
            Volver a empresas
          </ButtonLink>
        }
      />
      <SectionCard>
        <CompanyEditForm company={company} />
      </SectionCard>
    </div>
  );
}
```

Create `apps/web/src/app/(app)/companies/[id]/company-edit-form.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Company {
  id: string;
  name: string;
  legalName: string;
  nit: string;
  prefix: string;
  isActive: boolean;
}

export function CompanyEditForm({ company }: { company: Company }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);

    const body = {
      name: String(formData.get("name") ?? "").trim() || undefined,
      legalName: String(formData.get("legalName") ?? "").trim() || undefined,
      nit: String(formData.get("nit") ?? "").trim() || undefined,
      prefix: String(formData.get("prefix") ?? "").trim().toUpperCase() || undefined,
      isActive: formData.get("isActive") === "on",
    };

    try {
      const response = await apiFetchClient(`/companies/${company.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al actualizar la empresa");
        setLoading(false);
        return;
      }

      router.refresh();
      router.push("/companies");
    } catch {
      setError("Error de conexion");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 max-w-lg">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-1">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" defaultValue={company.name} />
      </div>

      <div className="grid gap-1">
        <Label htmlFor="legalName">Razon social</Label>
        <Input id="legalName" name="legalName" defaultValue={company.legalName} />
      </div>

      <div className="grid gap-1">
        <Label htmlFor="nit">NIT</Label>
        <Input id="nit" name="nit" defaultValue={company.nit} />
      </div>

      <div className="grid gap-1">
        <Label htmlFor="prefix">Prefijo (2-4 letras mayusculas)</Label>
        <Input id="prefix" name="prefix" defaultValue={company.prefix} maxLength={4} minLength={2} />
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" id="isActive" name="isActive" defaultChecked={company.isActive} className="h-4 w-4" />
        <Label htmlFor="isActive">Activa</Label>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Guardando..." : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
```

### Step 5: Add "Empresas" to navigation

In `apps/web/src/lib/theme.ts`, add to the `primaryNavItems` array after the `/users` item:

```typescript
  {
    href: "/companies",
    label: "Empresas",
    shortLabel: "EM",
    description: "Empresas facturadoras del sistema",
    group: "Admin",
    requiredRoles: ["administrador"] as const,
  },
```

### Step 6: Commit

```bash
git add apps/web/src/components/companies/ apps/web/src/app/\(app\)/companies/ apps/web/src/lib/theme.ts
git commit -m "feat: add Companies CRUD frontend pages and navigation"
```

---

## Task 9: Update Orders Frontend with Company Selector

**Files:**
- Modify: `apps/web/src/app/(app)/orders/page.tsx`
- Modify: `apps/web/src/app/(app)/orders/new/page.tsx`
- Modify: `apps/web/src/components/orders/order-form.tsx`

### Step 1: Add companyId to order-form.tsx

In `apps/web/src/components/orders/order-form.tsx`, add the import:

```tsx
import { CompanySelect } from "@/components/companies/company-select";
```

In the handleSubmit function's body object, add:

```typescript
      companyId: String(formData.get("companyId")),
```

Add validation before `customerId` check:

```typescript
    if (!body.companyId) {
      setError("Debe seleccionar una empresa facturadora");
      setLoading(false);
      return;
    }
```

In the "Encabezado del pedido" FormSection, add the `CompanySelect` component as the first field:

```tsx
          <Field label="Empresa facturadora *" htmlFor="companyId">
            <CompanySelect name="companyId" required />
          </Field>
```

### Step 2: Add company column and filter to orders page

In `apps/web/src/app/(app)/orders/page.tsx`, add the `company` property to the `Order` interface:

```typescript
interface Order {
  id: string;
  status: string;
  subtotal: string;
  total: string;
  committedDeliveryDate: string | null;
  customer: Customer | null;
  company: { id: string; name: string; prefix: string } | null;
  createdAt: string;
}
```

Add to `OrderRow`:

```typescript
  companyName: string | null;
  companyPrefix: string | null;
```

Map it in rows:

```typescript
    companyName: order.company?.name ?? null,
    companyPrefix: order.company?.prefix ?? null,
```

Add a "company" column to the columns array (before the "detail" column):

```typescript
  {
    key: "company",
    header: "Empresa",
    render: (row) =>
      row.companyPrefix ? (
        <span style={{ fontSize: 13, fontWeight: 600 }}>{row.companyPrefix}</span>
      ) : (
        <span style={{ fontSize: 13, color: "#6b7c93" }}>—</span>
      ),
  },
```

### Step 3: Add companyId query param to orders page for filtering

In the `OrdersPage` server component, accept `companyId` from search params:

```typescript
  const { status, companyId } = await searchParams;
```

Build API path with companyId:

```typescript
  const params = new URLSearchParams();
  if (status) params.set("status", status as string);
  if (companyId) params.set("companyId", companyId as string);
  const apiPath = params.toString() ? `/orders?${params.toString()}` : "/orders";
```

### Step 4: Pass companies to orders/new page

In `apps/web/src/app/(app)/orders/new/page.tsx`, add a fetch for companies:

```typescript
  const [customersRes, opportunitiesRes, productsRes, quotesRes, companiesRes] = await Promise.all([
    apiFetch("/customers"),
    apiFetch("/opportunities"),
    apiFetch("/products"),
    apiFetch("/quotes"),
    apiFetch("/companies"),
  ]);

  const companies: Array<{ id: string; name: string; prefix: string }> = companiesRes.ok
    ? await companiesRes.json()
    : [];
```

Pass `companies` to `OrderForm` (the OrderForm component doesn't need them as prop since CompanySelect fetches on mount — but for server-side rendering we can skip it; the CompanySelect component handles its own fetching).

Actually, since `CompanySelect` already fetches companies on mount, no change needed to `OrderForm` props. Just make sure the import is there.

### Step 5: Commit

```bash
git add apps/web/src/components/orders/ apps/web/src/app/\(app\)/orders/
git commit -m "feat: add company selector to order form and company column to orders list"
```

---

## Task 10: Update Invoices and Billing Requests Frontend

**Files:**
- Modify: `apps/web/src/app/(app)/invoices/page.tsx`
- Modify: `apps/web/src/app/(app)/billing-requests/page.tsx`

### Step 1: Add company to invoices page

In `apps/web/src/app/(app)/invoices/page.tsx`, add to the filter params:

```typescript
  const params = await searchParams;
  // companyId is already part of the query via buildQueryString
```

Since the invoices page already uses `ListInvoicesDto` on the backend which now accepts `companyId`, the query string just passes through. No frontend code change needed for the API call — just add the company column and filter.

Add to the `Invoice` interface:

```typescript
  company: { id: string; name: string; prefix: string } | null;
```

Add to `InvoiceRow`:

```typescript
  companyName: string | null;
  companyPrefix: string | null;
```

Map in rows:

```typescript
    companyName: invoice.company?.name ?? null,
    companyPrefix: invoice.company?.prefix ?? null,
```

Add "company" column after "invoiceNumber":

```typescript
  {
    key: "company",
    header: "Empresa",
    render: (row) =>
      row.companyPrefix ? (
        <span style={{ fontSize: 13, fontWeight: 600 }}>{row.companyPrefix}</span>
      ) : (
        <span style={{ fontSize: 13, color: "#6b7c93" }}>—</span>
      ),
  },
```

Add `companyId` to the filter options by adding a link filter. Add in the FilterBar section (between stat cards and section card) a set of company filter links similar to status filters.

Since this requires reading companies server-side, add a companies fetch:

```typescript
  const [response, user, companiesRes] = await Promise.all([
    apiFetch(listPath),
    getCurrentUser(),
    apiFetch("/companies"),
  ]);

  const companies: Array<{ id: string; name: string; prefix: string }> =
    companiesRes.ok ? await companiesRes.json() : [];
```

### Step 2: Add company to billing requests page

In `apps/web/src/app/(app)/billing-requests/page.tsx`, add to the `BillingRequest` interface:

```typescript
  company: { id: string; name: string; prefix: string } | null;
```

Add to `BillingRequestRow`:

```typescript
  companyName: string | null;
  companyPrefix: string | null;
```

Map in rows:

```typescript
    companyName: billingRequest.company?.name ?? null,
    companyPrefix: billingRequest.company?.prefix ?? null,
```

Add a "company" column after "customer":

```typescript
  {
    key: "company",
    header: "Empresa",
    render: (row) =>
      row.companyPrefix ? (
        <span style={{ fontSize: 13, fontWeight: 600 }}>{row.companyPrefix}</span>
      ) : (
        <span style={{ fontSize: 13, color: "#6b7c93" }}>—</span>
      ),
  },
```

### Step 3: Commit

```bash
git add apps/web/src/app/\(app\)/invoices/ apps/web/src/app/\(app\)/billing-requests/
git commit -m "feat: add company column to invoices and billing requests lists"
```

---

## Task 11: Update Dashboard Frontend with Company Filter

**Files:**
- Modify: `apps/web/src/app/(app)/dashboard/page.tsx`

### Step 1: Add CompanySelect to dashboard

Add import:

```tsx
import { CompanySelect } from "@/components/companies/company-select";
```

The dashboard is a server component, so `CompanySelect` client component can't directly control the URL query. Instead, wrap the company filter in a `Suspense` with a search params approach.

Alternative simpler approach: Since the dashboard already renders server-side, add a `companyId` search param and pass it to the API calls. Add filter links at the top between the ShiftKPICards and secondary KPIs.

In `DashboardPage`, extract `companyId` from search params:

```typescript
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const { companyId } = await searchParams;
```

Build API paths with optional companyId:

```typescript
  const summaryQuery = companyId ? `/dashboard/summary?companyId=${companyId}` : "/dashboard/summary";
  const commercialQuery = companyId
    ? `/dashboard/commercial-advanced?days=90&companyId=${companyId}`
    : "/dashboard/commercial-advanced?days=90";
```

Use these in the apiFetch calls.

Add a company filter section before the KPI cards. Since the dashboard is server-side, add Link-based filters:

```tsx
      {/* Company Filter */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link
          href="/dashboard"
          style={{
            padding: "6px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            textDecoration: "none",
            backgroundColor: !companyId ? "#10233f" : "#eef3f8",
            color: !companyId ? "#ffffff" : "#52637a",
            border: `1px solid ${!companyId ? "#10233f" : "#dbe4ef"}`,
          }}
        >
          Todas las empresas
        </Link>
        {companies.map((c) => (
          <Link
            key={c.id}
            href={`/dashboard?companyId=${c.id}`}
            style={{
              padding: "6px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              textDecoration: "none",
              backgroundColor: companyId === c.id ? "#10233f" : "#eef3f8",
              color: companyId === c.id ? "#ffffff" : "#52637a",
              border: `1px solid ${companyId === c.id ? "#10233f" : "#dbe4ef"}`,
            }}
          >
            {c.name} ({c.prefix})
          </Link>
        ))}
      </div>
```

Fetch companies at the top:

```typescript
  const [response, commercialAdvancedResponse, companiesRes] = await Promise.all([
    apiFetch(summaryQuery),
    canViewCommercialAdvanced
      ? apiFetch(commercialQuery)
      : Promise.resolve(null),
    apiFetch("/companies"),
  ]);

  const companies: Array<{ id: string; name: string; prefix: string }> =
    companiesRes.ok ? await companiesRes.json() : [];
```

### Step 2: Commit

```bash
git add apps/web/src/app/\(app\)/dashboard/page.tsx
git commit -m "feat: add company filter to dashboard"
```

---

## Task 12: Verify and Finalize

**Files:** None (verification only)

### Step 1: Run Prisma generate and build

```bash
cd apps/api && npx prisma generate && npm run build
```
Expected: Build succeeds with no TypeScript errors.

### Step 2: Reset database and seed

```bash
cd apps/api && npx prisma migrate reset --force
```
Expected: Seed runs successfully, companies created, orders/billing requests assigned to Nortech.

### Step 3: Start API and test endpoints

```bash
cd apps/api && npm run start:dev
```

Test with curl:

```bash
curl -s http://localhost:3001/companies | jq
```
Expected: Returns Nortech and Nanonutricion.

```bash
curl -s http://localhost:3001/orders | jq '.[0].company'
```
Expected: `{ "id": "c_nortech_nt", "name": "Norgtech", "prefix": "NT" }`

### Step 4: Commit final verification

```bash
git add -A
git commit -m "verify: multi-empresa implementation complete with verification"
```

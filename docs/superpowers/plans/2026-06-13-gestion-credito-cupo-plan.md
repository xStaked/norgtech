# Gestion de Credito/Cupo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar gestión de crédito/cupo: UI para editar creditLimit/purchaseBudget/paymentCondition/paymentDays, validación al crear pedido, crédito disponible en ficha/lista/dashboard, y alertas de clientes >80% de uso.

**Architecture:** Nuevo módulo `CreditModule` con endpoints dedicados. `CreditService` compartido extrae `assertCreditLimit` de `InvoicesService` para que `OrdersService` también lo use. Frontend: `CreditInfoCard` (server component), `CreditAlertsWidget` (client component), columna "Crédito" en lista, y crédito disponible en formulario de pedido.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Next.js 16 App Router, Tailwind, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-06-13-gestion-credito-cupo-design.md`

---

### Task 1: Add purchaseBudget to Prisma schema

**Files:**
- Modify: `apps/api/prisma/schema.prisma:454`
- Create: migration via `pnpm prisma migrate dev`

- [ ] **Step 1: Add purchaseBudget field**

In `apps/api/prisma/schema.prisma`, after line 454 (`paymentDays Int? @default(0)`), add:

```prisma
  purchaseBudget    Decimal?           @db.Decimal(14, 2)
```

- [ ] **Step 2: Run migration**

```bash
pnpm --filter api prisma migrate dev --name add_purchase_budget
```

- [ ] **Step 3: Verify migration**

```bash
pnpm --filter api prisma db pull --print | grep purchaseBudget
```

Expected: shows `purchaseBudget Decimal? @db.Decimal(14, 2)` in output.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat: add purchaseBudget to Customer model"
```

---

### Task 2: Add purchaseBudget to DTOs

**Files:**
- Modify: `apps/api/src/modules/customers/dto/create-customer.dto.ts`
- Modify: `apps/api/src/modules/customers/dto/update-customer.dto.ts`

- [ ] **Step 1: Add purchaseBudget to CreateCustomerDto**

In `apps/api/src/modules/customers/dto/create-customer.dto.ts`, after the `paymentDays` field (line 107), add:

```typescript
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  purchaseBudget?: number;
```

- [ ] **Step 2: Add purchaseBudget to UpdateCustomerDto**

In `apps/api/src/modules/customers/dto/update-customer.dto.ts`, after the `paymentDays` field (line 75), add:

```typescript
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  purchaseBudget?: number;
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/customers/dto/create-customer.dto.ts apps/api/src/modules/customers/dto/update-customer.dto.ts
git commit -m "feat: add purchaseBudget to customer DTOs"
```

---

### Task 3: Create Credit DTOs

**Files:**
- Create: `apps/api/src/modules/credit/dto/credit-summary.dto.ts`
- Create: `apps/api/src/modules/credit/dto/credit-alert.dto.ts`

- [ ] **Step 1: Create credit module directory**

```bash
mkdir -p apps/api/src/modules/credit/dto
```

- [ ] **Step 2: Write CreditSummaryDto**

Create `apps/api/src/modules/credit/dto/credit-summary.dto.ts`:

```typescript
export class PurchaseProgressDto {
  currentMonthSales!: number;
  budget!: number | null;
  percent!: number | null;
}

export class CreditSummaryDto {
  creditLimit!: number | null;
  purchaseBudget!: number | null;
  currentBalance!: number;
  availableCredit!: number | null;
  utilizationPercent!: number | null;
  isNearLimit!: boolean;
  purchaseProgress!: PurchaseProgressDto;
}
```

- [ ] **Step 3: Write CreditAlertDto**

Create `apps/api/src/modules/credit/dto/credit-alert.dto.ts`:

```typescript
export class CreditAlertDto {
  customerId!: string;
  displayName!: string;
  creditLimit!: number;
  currentBalance!: number;
  utilizationPercent!: number;
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/credit/
git commit -m "feat: add credit DTOs"
```

---

### Task 4: Create CreditService

**Files:**
- Create: `apps/api/src/modules/credit/credit.service.ts`

- [ ] **Step 1: Create CreditService**

Create `apps/api/src/modules/credit/credit.service.ts`:

```typescript
import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreditSummaryDto, PurchaseProgressDto } from "./dto/credit-summary.dto";
import { CreditAlertDto } from "./dto/credit-alert.dto";

@Injectable()
export class CreditService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCreditLimit(
    customerId: string,
    amount: Prisma.Decimal,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const customer = await client.customer.findUnique({
      where: { id: customerId },
      select: { creditLimit: true },
    });

    if (!customer?.creditLimit || customer.creditLimit.lte(0)) return;

    const agg = await client.invoice.aggregate({
      where: {
        customerId,
        status: { notIn: ["pagada", "anulada"] },
      },
      _sum: { totalAmount: true },
    });

    const currentTotal = new Prisma.Decimal(agg._sum.totalAmount ?? 0);
    if (currentTotal.plus(amount).gt(customer.creditLimit)) {
      const available = customer.creditLimit.minus(currentTotal);
      throw new BadRequestException(
        `Credito excedido. Disponible: $${available.toFixed(0)}, Pedido: $${amount.toFixed(0)}`,
      );
    }
  }

  async getCreditSummary(customerId: string): Promise<CreditSummaryDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { creditLimit: true, purchaseBudget: true },
    });

    if (!customer) throw new BadRequestException("Customer not found");

    const invoiceAgg = await this.prisma.invoice.aggregate({
      where: {
        customerId,
        status: { notIn: ["pagada", "anulada"] },
      },
      _sum: { totalAmount: true },
    });

    const currentBalance = new Prisma.Decimal(invoiceAgg._sum.totalAmount ?? 0).toNumber();
    const creditLimit = customer.creditLimit ? customer.creditLimit.toNumber() : null;

    const availableCredit = creditLimit != null && creditLimit > 0
      ? creditLimit - currentBalance
      : null;

    const utilizationPercent = creditLimit != null && creditLimit > 0
      ? (currentBalance / creditLimit) * 100
      : null;

    const isNearLimit = utilizationPercent != null && utilizationPercent >= 80;

    let purchaseProgress: PurchaseProgressDto = {
      currentMonthSales: 0,
      budget: customer.purchaseBudget ? customer.purchaseBudget.toNumber() : null,
      percent: null,
    };

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const orderAgg = await this.prisma.order.aggregate({
      where: {
        customerId,
        createdAt: { gte: startOfMonth },
      },
      _sum: { subtotal: true },
    });

    purchaseProgress.currentMonthSales = new Prisma.Decimal(orderAgg._sum.subtotal ?? 0).toNumber();

    if (purchaseProgress.budget != null && purchaseProgress.budget > 0) {
      purchaseProgress.percent = (purchaseProgress.currentMonthSales / purchaseProgress.budget) * 100;
    }

    return {
      creditLimit,
      purchaseBudget: customer.purchaseBudget ? customer.purchaseBudget.toNumber() : null,
      currentBalance,
      availableCredit,
      utilizationPercent,
      isNearLimit,
      purchaseProgress,
    };
  }

  async getCreditAlerts(companyId?: string): Promise<CreditAlertDto[]> {
    const customers = await this.prisma.customer.findMany({
      where: {
        creditLimit: { gt: 0 },
        ...(companyId
          ? { invoices: { some: { companyId } } }
          : {}),
      },
      select: {
        id: true,
        displayName: true,
        creditLimit: true,
      },
    });

    const alerts: CreditAlertDto[] = [];

    for (const customer of customers) {
      const agg = await this.prisma.invoice.aggregate({
        where: {
          customerId: customer.id,
          status: { notIn: ["pagada", "anulada"] },
        },
        _sum: { totalAmount: true },
      });

      const creditLimit = customer.creditLimit!.toNumber();
      const currentBalance = new Prisma.Decimal(agg._sum.totalAmount ?? 0).toNumber();
      const utilizationPercent = (currentBalance / creditLimit) * 100;

      if (utilizationPercent >= 80) {
        alerts.push({
          customerId: customer.id,
          displayName: customer.displayName,
          creditLimit,
          currentBalance,
          utilizationPercent,
        });
      }
    }

    return alerts.sort((a, b) => b.utilizationPercent - a.utilizationPercent);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/credit/credit.service.ts
git commit -m "feat: add CreditService with assertCreditLimit, getCreditSummary, getCreditAlerts"
```

---

### Task 5: Create CreditController and CreditModule

**Files:**
- Create: `apps/api/src/modules/credit/credit.controller.ts`
- Create: `apps/api/src/modules/credit/credit.module.ts`

- [ ] **Step 1: Write CreditController**

Create `apps/api/src/modules/credit/credit.controller.ts`:

```typescript
import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { CreditService } from "./credit.service";

@Controller("credit")
export class CreditController {
  constructor(private readonly creditService: CreditService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial", "facturacion")
  @Get("customers/:customerId/summary")
  getCustomerCreditSummary(@Param("customerId") customerId: string) {
    return this.creditService.getCreditSummary(customerId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial")
  @Get("dashboard/alerts")
  getDashboardAlerts(@Query("companyId") companyId?: string) {
    return this.creditService.getCreditAlerts(companyId);
  }
}
```

- [ ] **Step 2: Write CreditModule**

Create `apps/api/src/modules/credit/credit.module.ts`:

```typescript
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CreditController } from "./credit.controller";
import { CreditService } from "./credit.service";

@Module({
  imports: [AuthModule],
  controllers: [CreditController],
  providers: [CreditService],
  exports: [CreditService],
})
export class CreditModule {}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/credit/credit.controller.ts apps/api/src/modules/credit/credit.module.ts
git commit -m "feat: add CreditController and CreditModule"
```

---

### Task 6: Register CreditModule and wire dependencies

**Files:**
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/modules/orders/orders.module.ts`
- Modify: `apps/api/src/modules/invoices/invoices.module.ts`

- [ ] **Step 1: Register CreditModule in AppModule**

In `apps/api/src/app.module.ts`, add the import:
```typescript
import { CreditModule } from "./modules/credit/credit.module";
```

And add `CreditModule` to the `imports` array (alphabetically, after `CommercialExpensesModule`).

- [ ] **Step 2: Import CreditModule in OrdersModule**

In `apps/api/src/modules/orders/orders.module.ts`, add:
```typescript
import { CreditModule } from "../credit/credit.module";
```

And add `CreditModule` to the `imports` array.

- [ ] **Step 3: Import CreditModule in InvoicesModule**

In `apps/api/src/modules/invoices/invoices.module.ts`, add:
```typescript
import { CreditModule } from "../credit/credit.module";
```

And add `CreditModule` to the `imports` array.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/app.module.ts apps/api/src/modules/orders/orders.module.ts apps/api/src/modules/invoices/invoices.module.ts
git commit -m "feat: wire CreditModule into AppModule, OrdersModule, InvoicesModule"
```

---

### Task 7: Integrate CreditService into OrdersService

**Files:**
- Modify: `apps/api/src/modules/orders/orders.service.ts`

- [ ] **Step 1: Import and inject CreditService**

At the top of `apps/api/src/modules/orders/orders.service.ts`, add import:
```typescript
import { CreditService } from "../credit/credit.service";
```

In the constructor, after `orderXlsxExportService`, add:
```typescript
private readonly credit: CreditService,
```

- [ ] **Step 2: Add credit validation in create method**

In the `create` method, after line 56 (`if (dto.assignedLogisticsUserId) { await this.assertUserExists(dto.assignedLogisticsUserId); }`), add:

```typescript
    const subtotal = dto.items.reduce(
      (sum, item) =>
        sum.plus(
          new Prisma.Decimal(item.quantity).times(new Prisma.Decimal(item.unitPrice)),
        ),
      new Prisma.Decimal(0),
    );

    await this.credit.assertCreditLimit(dto.customerId, subtotal);
```

**Note:** The existing code computes `orderSubtotal` later in the method (around lines 120-130). Move the subtotal computation to before the credit validation so it's available. The existing code's `orderSubtotal` variable should be replaced with the one computed above.

- [ ] **Step 3: Read the full create method to identify exact placement**

Read lines 56-160 of `apps/api/src/modules/orders/orders.service.ts` to find where `orderSubtotal` is first computed and where the `tx.order.create` call is. The credit validation must go inside the transaction block (where `tx = await this.prisma.$transaction(...)` starts) or before it. Given that `assertCreditLimit` accepts an optional `tx` parameter, it should be called inside the transaction for consistency.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/orders/orders.service.ts
git commit -m "feat: add credit limit validation to order creation"
```

---

### Task 8: Refactor InvoicesService to use CreditService

**Files:**
- Modify: `apps/api/src/modules/invoices/invoices.service.ts`

- [ ] **Step 1: Import CreditService and inject it**

At the top of `apps/api/src/modules/invoices/invoices.service.ts`, add import:
```typescript
import { CreditService } from "../credit/credit.service";
```

In the constructor (line 37-39), after `private readonly storage: R2StorageService,`, add:
```typescript
private readonly credit: CreditService,
```

- [ ] **Step 2: Replace private assertCreditLimit calls**

Find where `this.assertCreditLimit(tx, customerId, dto.totalAmount, customer.creditLimit)` is called (around line 70 in the create method). Replace with:
```typescript
await this.credit.assertCreditLimit(customerId, new Prisma.Decimal(dto.totalAmount), tx);
```

- [ ] **Step 3: Remove the private assertCreditLimit method**

Delete lines 409-429 (the entire `private async assertCreditLimit` method).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/invoices/invoices.service.ts
git commit -m "refactor: use shared CreditService in InvoicesService"
```

---

### Task 9: Extend CustomersService.findAll to include creditLimit

**Files:**
- Modify: `apps/api/src/modules/customers/customers.service.ts`

- [ ] **Step 1: Include creditLimit in findAll select**

In `apps/api/src/modules/customers/customers.service.ts`, update the `findAll` method (lines 184-189):

Change:
```typescript
  findAll() {
    return this.prisma.customer.findMany({
      include: { contacts: true, segment: true },
      orderBy: { displayName: "asc" },
    });
  }
```

To:
```typescript
  findAll() {
    return this.prisma.customer.findMany({
      select: {
        id: true,
        legalName: true,
        displayName: true,
        taxId: true,
        phone: true,
        email: true,
        city: true,
        department: true,
        creditLimit: true,
        segment: { select: { id: true, name: true } },
        contacts: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            isPrimary: true,
          },
        },
      },
      orderBy: { displayName: "asc" },
    });
  }
```

**Note:** This changes from `include` to `select` to add `creditLimit` while keeping the same data shape. The `Customer` interface in the frontend's `page.tsx` already matches this shape.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/customers/customers.service.ts
git commit -m "feat: include creditLimit in customers findAll"
```

---

### Task 10: Create CreditInfoCard component

**Files:**
- Create: `apps/web/src/components/customers/credit-info-card.tsx`

- [ ] **Step 1: Write CreditInfoCard server component**

Create `apps/web/src/components/customers/credit-info-card.tsx`:

```tsx
import { SectionCard } from "@/components/ui/section-card";
import { crmTheme } from "@/components/ui/theme";
import { apiFetch } from "@/lib/api.server";

interface CreditSummary {
  creditLimit: number | null;
  purchaseBudget: number | null;
  currentBalance: number;
  availableCredit: number | null;
  utilizationPercent: number | null;
  isNearLimit: boolean;
  purchaseProgress: {
    currentMonthSales: number;
    budget: number | null;
    percent: number | null;
  };
}

function fmt(value: number): string {
  return `$${value.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
}

function utilizationColor(pct: number | null): string {
  if (pct == null) return "#6b7c93";
  if (pct >= 100) return "#d92d20";
  if (pct >= 80) return "#dc6803";
  return "#17b26a";
}

function BudgetProgressBar({ percent }: { percent: number | null }) {
  const pct = Math.min(percent ?? 0, 100);
  return (
    <div
      style={{
        height: 8,
        borderRadius: 4,
        background: "#eef3f8",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          borderRadius: 4,
          background: "#2d6cdf",
          transition: "width 0.3s ease",
        }}
      />
    </div>
  );
}

function CreditProgressBar({ percent, color }: { percent: number | null; color: string }) {
  const pct = Math.min(percent ?? 0, 100);
  return (
    <div
      style={{
        height: 8,
        borderRadius: 4,
        background: "#eef3f8",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          borderRadius: 4,
          background: color,
          transition: "width 0.3s ease",
        }}
      />
    </div>
  );
}

interface CreditInfoCardProps {
  customerId: string;
}

export async function CreditInfoCard({ customerId }: CreditInfoCardProps) {
  const res = await apiFetch(`/credit/customers/${customerId}/summary`);

  if (!res.ok) {
    return (
      <SectionCard title="Credito y cupo">
        <div style={{ fontSize: "0.9375rem", color: "#6b7c93" }}>
          Sin informacion de credito disponible
        </div>
      </SectionCard>
    );
  }

  const data: CreditSummary = await res.json();

  return (
    <SectionCard
      title="Credito y cupo"
      description={
        data.isNearLimit
          ? "Cliente cerca del limite de credito"
          : "Estado actual de credito y presupuesto"
      }
    >
      <div style={{ display: "grid", gap: 16 }}>
        {data.isNearLimit && (
          <div
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              background: "#fef3c7",
              color: "#92400e",
              fontSize: "0.875rem",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 18 }}>&#9888;</span>
            Cerca del limite de credito ({data.utilizationPercent?.toFixed(0)}% usado)
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <CreditKpi
            label="Limite de credito"
            value={data.creditLimit != null ? fmt(data.creditLimit) : "Sin limite"}
          />
          <CreditKpi
            label="Saldo pendiente"
            value={fmt(data.currentBalance)}
            color="#d92d20"
          />
          <CreditKpi
            label="Disponible"
            value={data.availableCredit != null ? fmt(data.availableCredit) : "Sin limite"}
            color="#17b26a"
          />
          <CreditKpi
            label="% utilizado"
            value={data.utilizationPercent != null ? `${data.utilizationPercent.toFixed(0)}%` : "—"}
            color={utilizationColor(data.utilizationPercent)}
          />
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: "0.8125rem", color: "#52637a" }}>Uso de credito</span>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: utilizationColor(data.utilizationPercent) }}>
              {data.utilizationPercent != null ? `${data.utilizationPercent.toFixed(0)}%` : "—"}
            </span>
          </div>
          <CreditProgressBar percent={data.utilizationPercent} color={utilizationColor(data.utilizationPercent)} />
        </div>

        {data.purchaseBudget != null && data.purchaseBudget > 0 && (
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: crmTheme.colors.text, marginBottom: 12 }}>
              Presupuesto mensual
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <CreditKpi label="Meta mensual" value={fmt(data.purchaseBudget)} />
              <CreditKpi label="Ventas del mes" value={fmt(data.purchaseProgress.currentMonthSales)} />
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: "0.8125rem", color: "#52637a" }}>Progreso</span>
                <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#2d6cdf" }}>
                  {data.purchaseProgress.percent != null ? `${data.purchaseProgress.percent.toFixed(0)}%` : "—"}
                </span>
              </div>
              <BudgetProgressBar percent={data.purchaseProgress.percent} />
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function CreditKpi({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 8,
        border: `1px solid ${crmTheme.colors.border}`,
        background: crmTheme.colors.surfaceMuted,
      }}
    >
      <div style={{ fontSize: "0.75rem", color: "#6b7c93", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: "1.25rem", fontWeight: 700, color: color ?? crmTheme.colors.text }}>
        {value}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/customers/credit-info-card.tsx
git commit -m "feat: add CreditInfoCard component"
```

---

### Task 11: Add CreditInfoCard to customer detail page

**Files:**
- Modify: `apps/web/src/app/(app)/customers/[id]/page.tsx`

- [ ] **Step 1: Import CreditInfoCard**

At the top of the file, add:
```typescript
import { CreditInfoCard } from "@/components/customers/credit-info-card";
```

- [ ] **Step 2: Render CreditInfoCard**

After the `CustomerGoalsSection` component (line `<CustomerGoalsSection customerId={customer.id} />`), add:

```tsx
      <CreditInfoCard customerId={customer.id} />
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(app\)/customers/\[id\]/page.tsx
git commit -m "feat: add CreditInfoCard to customer detail page"
```

---

### Task 12: Add "Credito" column to customer list

**Files:**
- Modify: `apps/web/src/app/(app)/customers/page.tsx`

- [ ] **Step 1: Add creditLimit to Customer interface**

Update the `Customer` interface to include `creditLimit`:
```typescript
interface Customer {
  id: string;
  legalName: string;
  displayName: string;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  department: string | null;
  creditLimit: string | number | null;
  segment: Segment | null;
  contacts: Contact[];
}
```

- [ ] **Step 2: Add creditLimit to CustomerRow interface**

```typescript
interface CustomerRow {
  id: string;
  displayName: string;
  legalName: string;
  segment: string | null;
  location: string;
  primaryContact: string | null;
  primaryContactMeta: string | null;
  creditLimit: string | null;
}
```

- [ ] **Step 3: Map creditLimit in the rows builder**

In the `rows` mapping (after `primaryContactMeta: primary.meta,`):
```typescript
      creditLimit: customer.creditLimit != null
        ? `$${Number(customer.creditLimit).toLocaleString("es-CO", { maximumFractionDigits: 0 })}`
        : null,
```

- [ ] **Step 4: Add "Credito" column to columns array**

After the "Ubicacion" column definition, add:

```typescript
  {
    key: "credit",
    header: "Credito",
    render: (row) =>
      row.creditLimit ? (
        <span style={{ fontWeight: 600 }}>{row.creditLimit}</span>
      ) : (
        <span style={{ color: "#6b7c93" }}>—</span>
      ),
  },
```

**Note:** Insert this column in an appropriate position. After "Ubicacion" (index ~3) and before "Contacto principal" is recommended. The `columns` variable is `readonly DataTableColumn<CustomerRow>[]` so directly modify the array.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(app\)/customers/page.tsx
git commit -m "feat: add Credito column to customer list"
```

---

### Task 13: Create CreditAlertsWidget component

**Files:**
- Create: `apps/web/src/components/dashboard/credit-alerts-widget.tsx`

- [ ] **Step 1: Write CreditAlertsWidget client component**

Create `apps/web/src/components/dashboard/credit-alerts-widget.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetchClient } from "@/lib/api.client";
import { AlertTriangle } from "lucide-react";

interface CreditAlert {
  customerId: string;
  displayName: string;
  creditLimit: number;
  currentBalance: number;
  utilizationPercent: number;
}

function fmt(value: number): string {
  return `$${value.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
}

function barColor(pct: number): string {
  if (pct >= 100) return "#d92d20";
  return "#dc6803";
}

interface CreditAlertsWidgetProps {
  companyId?: string;
}

export function CreditAlertsWidget({ companyId }: CreditAlertsWidgetProps) {
  const [alerts, setAlerts] = useState<CreditAlert[] | null>(null);

  useEffect(() => {
    const query = companyId
      ? `/credit/dashboard/alerts?companyId=${companyId}`
      : "/credit/dashboard/alerts";

    apiFetchClient(query)
      .then((r) => r.json())
      .then(setAlerts)
      .catch(() => setAlerts(null));
  }, [companyId]);

  if (alerts === null || alerts.length === 0) return null;

  const top5 = alerts.slice(0, 5);

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-bold">Alertas de credito</CardTitle>
          </div>
          <AlertTriangle className="h-5 w-5 text-amber-500" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {top5.map((alert) => (
            <Link
              key={alert.customerId}
              href={`/customers/${alert.customerId}`}
              className="block rounded-lg border border-border/50 p-3 transition-colors hover:bg-muted/50"
              style={{ textDecoration: "none" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontWeight: 600, fontSize: "0.875rem", color: "#10233f" }}>
                  {alert.displayName}
                </span>
                <span
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 700,
                    color: barColor(alert.utilizationPercent),
                  }}
                >
                  {alert.utilizationPercent.toFixed(0)}%
                </span>
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 3,
                  background: "#eef3f8",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(alert.utilizationPercent, 100)}%`,
                    borderRadius: 3,
                    background: barColor(alert.utilizationPercent),
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 6,
                  fontSize: "0.75rem",
                  color: "#6b7c93",
                }}
              >
                <span>Usado: {fmt(alert.currentBalance)}</span>
                <span>Limite: {fmt(alert.creditLimit)}</span>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/dashboard/credit-alerts-widget.tsx
git commit -m "feat: add CreditAlertsWidget component"
```

---

### Task 14: Add CreditAlertsWidget to dashboard

**Files:**
- Modify: `apps/web/src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Import CreditAlertsWidget**

At the top of the file, add:
```typescript
import { CreditAlertsWidget } from "@/components/dashboard/credit-alerts-widget";
```

- [ ] **Step 2: Render CreditAlertsWidget**

Add it after `<CommercialAdvancedDashboard summary={commercialAdvancedSummary} />` (before the "Main Content Grid" `<div>`):

```tsx
      <CreditAlertsWidget companyId={companyId} />
```

The `companyId` is already available from `searchParams` in the page component.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(app\)/dashboard/page.tsx
git commit -m "feat: add CreditAlertsWidget to dashboard"
```

---

### Task 15: Show available credit in order form

**Files:**
- Modify: `apps/web/src/components/orders/order-form.tsx`

- [ ] **Step 1: Add credit state and fetch on customer select**

Add state after `selectedCustomerId`:
```typescript
  const [creditSummary, setCreditSummary] = useState<{
    availableCredit: number | null;
    utilizationPercent: number | null;
  } | null>(null);
```

Update the `useEffect` that runs when `selectedCustomerId` changes (after the zones fetch):

```typescript
  useEffect(() => {
    if (!selectedCustomerId) {
      setCustomerZones([]);
      setCreditSummary(null);
      return;
    }
    apiFetchClient(`/customers/${selectedCustomerId}/zones`)
      .then(r => r.json())
      .then(setCustomerZones)
      .catch(() => setCustomerZones([]));

    apiFetchClient(`/credit/customers/${selectedCustomerId}/summary`)
      .then(r => r.json())
      .then(setCreditSummary)
      .catch(() => setCreditSummary(null));
  }, [selectedCustomerId]);
```

- [ ] **Step 2: Add credit info display after customer select**

After the `</select>` for the customer selector (line 269), add:

```tsx
            {creditSummary && creditSummary.availableCredit != null && (
              <div
                style={{
                  marginTop: 6,
                  padding: "6px 10px",
                  borderRadius: 6,
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  background: creditSummary.availableCredit <= 0 ? "#fef3c7" : "#ecfdf3",
                  color: creditSummary.availableCredit <= 0 ? "#92400e" : "#027a48",
                }}
              >
                Credito disponible: ${creditSummary.availableCredit.toLocaleString("es-CO", { maximumFractionDigits: 0 })}
                {creditSummary.availableCredit <= 0 && " — Sin credito disponible"}
              </div>
            )}
```

- [ ] **Step 3: Add client-side credit validation before submit**

In the `handleSubmit` function, after the items validation (line 217) and before the `try` block, add:

```typescript
    if (creditSummary?.availableCredit != null && subtotal > creditSummary.availableCredit) {
      setError(
        `Credito excedido. Disponible: $${creditSummary.availableCredit.toLocaleString("es-CO", { maximumFractionDigits: 0 })}, Pedido: $${subtotal.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`,
      );
      setLoading(false);
      return;
    }
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/orders/order-form.tsx
git commit -m "feat: show available credit and validate in order form"
```

---

### Task 16: Update CustomerForm to include purchaseBudget

**Files:**
- Modify: `apps/web/src/components/customers/customer-form.tsx`

- [ ] **Step 1: Add purchaseBudget input**

After the `paymentDays` input (around line 289), add a new `purchaseBudget` input. In the existing "grid grid-cols-1 sm:grid-cols-2" div that contains creditLimit and paymentDays, after the paymentDays div, add:

```tsx
        <div className="grid gap-1">
          <Label>Presupuesto de compra mensual ($)</Label>
          <Input
            name="purchaseBudget"
            type="number"
            min={0}
            step={1}
            defaultValue={customer?.purchaseBudget ?? ""}
          />
        </div>
```

**Note:** The `CustomerUpdateData` interface in CustomerForm needs `purchaseBudget` added. Find the interface definition (around line 22) and add:
```typescript
  purchaseBudget?: string | number | null;
```

- [ ] **Step 2: Verify form submission includes purchaseBudget**

Check that the form submission code (around lines 92-98) serializes the form and sends `purchaseBudget`. If it uses `Object.fromEntries(formData)` it will be included automatically as a number.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/customers/customer-form.tsx
git commit -m "feat: add purchaseBudget input to CustomerForm"
```

---

### Task 17: API E2E tests

**Files:**
- Create: `apps/api/test/credit.e2e-spec.ts` (or integration test file following existing test patterns)

- [ ] **Step 1: Check existing test infrastructure**

```bash
ls apps/api/test/
```

Check if there are existing e2e test files to follow as patterns (e.g., `jest-e2e.json`, existing `*.e2e-spec.ts` files).

- [ ] **Step 2: Write e2e tests**

Create test file following the existing test patterns. Tests to cover:

1. `GET /credit/customers/:id/summary` returns 200 with creditLimit, currentBalance, utilizationPercent
2. `GET /credit/customers/:id/summary` for customer without creditLimit returns null values
3. `GET /credit/customers/:id/summary` for customer without invoices returns currentBalance=0
4. `GET /credit/dashboard/alerts` returns only customers >=80% utilization
5. `GET /credit/dashboard/alerts?companyId=xxx` filters by company
6. `POST /orders` blocks (400) when subtotal exceeds available credit
7. `POST /orders` allows when within credit limit
8. `POST /orders` allows when customer has no creditLimit

- [ ] **Step 3: Run tests**

```bash
pnpm --filter api test:e2e -- credit
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/
git commit -m "test: add e2e tests for credit endpoints and validation"
```

---

### Task 18: Verify full build

**Files:**
- None (verification only)

- [ ] **Step 1: Build API**

```bash
pnpm --filter api build
```

Expected: builds successfully, no TypeScript errors.

- [ ] **Step 2: Build Web**

```bash
pnpm --filter web build
```

Expected: builds successfully, no TypeScript errors.

- [ ] **Step 3: Check for lint errors**

```bash
pnpm lint
```

Fix any issues.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore: fix build and lint issues"
```

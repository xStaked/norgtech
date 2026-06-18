# Pedido A Factura Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a controlled one-click flow to generate an invoice from an existing order without retyping customer, company, totals, or due date.

**Architecture:** Implement the conversion in `OrdersService` because the action starts from an order and must update order state atomically. Reuse `CreditService`, `AuditService`, Prisma transactions, existing invoice schema, and existing order detail UI actions. Keep the existing manual invoice flow unchanged.

**Tech Stack:** NestJS, Prisma, Jest/Supertest e2e tests, Next.js App Router, React client component, existing API fetch helpers.

---

## File Structure

- Modify: `apps/api/src/modules/orders/orders.service.ts`
  - Add `createInvoiceFromOrder(user, orderId)`.
  - Add private helpers for active invoice detection, invoice totals, due date, invoice number, and status comparison.
- Modify: `apps/api/src/modules/orders/orders.controller.ts`
  - Add `POST /orders/:id/invoice` guarded for `administrador`, `director_comercial`, `facturacion`.
- Modify: `apps/api/test/orders.e2e-spec.ts`
  - Extend the Prisma stub with companies, invoices, and credit aggregate support.
  - Add e2e coverage for conversion, duplicate blocking, cancelled invoice retry, due date, status behavior, and role denial.
- Modify: `apps/web/src/app/(app)/orders/[id]/page.tsx`
  - Add invoice relation typing and pass invoice state into `OrderActions`.
- Modify: `apps/web/src/components/orders/order-actions.tsx`
  - Add direct invoice action, duplicate guard, and redirect to `/invoices/:id`.
- Test: `apps/api/test/orders.e2e-spec.ts`
- Optional frontend test if local Playwright coverage is already stable: `apps/web/tests/e2e/orders.spec.ts`

---

### Task 1: Backend Test Harness For Order Invoices

**Files:**
- Modify: `apps/api/test/orders.e2e-spec.ts`

- [ ] **Step 1: Add test data arrays and users**

In `apps/api/test/orders.e2e-spec.ts`, extend imports:

```ts
import { InvoiceStatus, UserRole } from "@prisma/client";
```

Replace the current import if it only imports `UserRole`.

Add these arrays near the existing `auditLogs`, `orders`, and `products` arrays:

```ts
const invoices: Array<Record<string, any>> = [];
const companies = [
  {
    id: "company-1",
    name: "Nortech",
    legalName: "Tecnologia de Nutricion Organica SAS",
    nit: "900999888-1",
    prefix: "NOR",
    isActive: true,
  },
];
const users = [
  {
    id: "admin-user-id",
    name: "Admin",
    email: "admin@norgtech.local",
    passwordHash,
    role: UserRole.administrador,
    active: true,
  },
  {
    id: "facturacion-user-id",
    name: "Facturacion",
    email: "facturacion@norgtech.local",
    passwordHash,
    role: UserRole.facturacion,
    active: true,
  },
  {
    id: "comercial-user-id",
    name: "Comercial",
    email: "comercial@norgtech.local",
    passwordHash,
    role: UserRole.comercial,
    active: true,
  },
  {
    id: "logistics-user-id",
    name: "Logistics",
    email: "logistics@norgtech.local",
    passwordHash,
    role: UserRole.logistica,
    active: true,
  },
];
```

- [ ] **Step 2: Replace the user stub**

Replace the existing `const user = { findUnique: ... }` with:

```ts
const user = {
  findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
    if (where.email) {
      return users.find((u) => u.email === where.email) ?? null;
    }
    return users.find((u) => u.id === where.id) ?? null;
  },
};
```

- [ ] **Step 3: Expand customer fixtures with credit/payment fields**

In the existing `customer.findUnique`, include these fields in each returned customer:

```ts
creditLimit: 5000000,
paymentDays: 30,
assignedToUserId: "comercial-user-id",
```

For `customer-2`, use:

```ts
creditLimit: null,
paymentDays: null,
assignedToUserId: null,
```

- [ ] **Step 4: Add company and invoice stubs to top-level Prisma stub**

Inside `prismaStub`, add:

```ts
company: {
  findUnique: async ({ where }: { where: { id?: string; prefix?: string } }) => {
    if (where.id) return companies.find((c) => c.id === where.id) ?? null;
    if (where.prefix) return companies.find((c) => c.prefix === where.prefix) ?? null;
    return null;
  },
},
invoice: {
  findFirst: async ({ where }: { where: any }) => {
    const byOrder = invoices.filter((invoice) => invoice.orderId === where.orderId);
    const statusNot = where.status?.not;
    const startsWith = where.invoiceNumber?.startsWith;
    if (where.orderId) {
      return byOrder.find((invoice) => !statusNot || invoice.status !== statusNot) ?? null;
    }
    if (startsWith) {
      return [...invoices]
        .filter((invoice) => String(invoice.invoiceNumber).startsWith(startsWith))
        .sort((a, b) => String(b.invoiceNumber).localeCompare(String(a.invoiceNumber)))[0] ?? null;
    }
    return null;
  },
  aggregate: async ({ where }: { where: any }) => {
    const total = invoices
      .filter((invoice) => invoice.customerId === where.customerId)
      .filter((invoice) => !where.status?.notIn?.includes(invoice.status))
      .reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0);
    return { _sum: { totalAmount: total } };
  },
},
```

- [ ] **Step 5: Add invoice support inside transaction stub**

Inside the `$transaction` callback stub, add `pendingInvoices`:

```ts
const pendingInvoices: Array<Record<string, any>> = [];
```

Inside the transaction client object, add:

```ts
company: prismaStub.company,
invoice: {
  findFirst: prismaStub.invoice.findFirst,
  aggregate: prismaStub.invoice.aggregate,
  create: async ({ data, include }: { data: Record<string, any>; include?: Record<string, unknown> }) => {
    const invoice = {
      id: `invoice-${invoices.length + pendingInvoices.length + 1}`,
      ...data,
      createdAt: new Date("2026-04-29T00:00:00.000Z"),
      updatedAt: new Date("2026-04-29T00:00:00.000Z"),
      company: include?.company ? companies.find((c) => c.id === data.companyId) : undefined,
      customer: include?.customer ? { id: data.customerId, displayName: "Agro Norte" } : undefined,
      order: include?.order ? { id: data.orderId, orderNumber: "NOR-001", status: "facturado" } : undefined,
      payments: include?.payments ? [] : undefined,
    };
    pendingInvoices.push(invoice);
    return invoice;
  },
},
customer,
```

Before returning the transaction result, push invoices:

```ts
invoices.push(...pendingInvoices);
```

- [ ] **Step 6: Ensure created orders include `companyId` and invoice relations**

In the transaction `order.create` stub, add defaults:

```ts
companyId: data.companyId ?? "company-1",
company: include?.company ? companies[0] : undefined,
invoices: include?.invoices ? [] : undefined,
```

In the top-level `order.findUnique` and transaction `order.findUnique`, keep existing behavior but make sure saved orders can include:

```ts
companyId: "company-1",
items: [...],
invoices: [],
```

The service implementation in later tasks will request includes, so returning existing saved object fields is enough.

- [ ] **Step 7: Run current order tests to confirm harness still passes before adding failing tests**

Run:

```bash
pnpm --filter @norgtech/api test -- orders.e2e-spec.ts
```

Expected: existing tests either pass, or fail only because the later conversion endpoint is not yet added if a test was added early. At this step, do not add conversion tests yet.

---

### Task 2: Backend Failing Tests For Conversion

**Files:**
- Modify: `apps/api/test/orders.e2e-spec.ts`

- [ ] **Step 1: Add helper for role token**

Near the existing login setup, add:

```ts
async function getToken(email: string) {
  const response = await request(globalThis.__APP__)
    .post("/auth/login")
    .send({ email, password: "Admin123*" })
    .expect(200);
  return response.body.accessToken;
}
```

- [ ] **Step 2: Add failing test for creating invoice from order**

Append:

```ts
it("creates an invoice from an order and marks it facturado", async () => {
  const token = await getToken("facturacion@norgtech.local");
  const createResponse = await request(globalThis.__APP__)
    .post("/orders")
    .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
    .send({
      customerId: "customer-1",
      companyId: "company-1",
      items: [{ productId: "product-1", quantity: 2, unitPrice: 50000 }],
    })
    .expect(201);

  await request(globalThis.__APP__)
    .patch(`/orders/${createResponse.body.id}/status`)
    .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
    .send({ status: "orden_facturacion" })
    .expect(200);

  const response = await request(globalThis.__APP__)
    .post(`/orders/${createResponse.body.id}/invoice`)
    .set("Authorization", `Bearer ${token}`)
    .expect(201);

  expect(response.body.id).toMatch(/^invoice-/);
  expect(response.body.orderId).toBe(createResponse.body.id);
  expect(response.body.customerId).toBe("customer-1");
  expect(response.body.companyId).toBe("company-1");
  expect(response.body.invoiceNumber).toMatch(/^NOR-\d{3}$/);
  expect(Number(response.body.subtotal)).toBe(100000);
  expect(Number(response.body.taxAmount)).toBe(19000);
  expect(Number(response.body.totalAmount)).toBe(119000);
  expect(response.body.status).toBe("emitida");

  const updatedOrder = orders.find((order) => order.id === createResponse.body.id);
  expect(updatedOrder?.status).toBe("facturado");
});
```

- [ ] **Step 3: Add failing tests for duplicate and cancelled invoice behavior**

Append:

```ts
it("blocks a second active invoice for the same order", async () => {
  const token = await getToken("facturacion@norgtech.local");
  const createResponse = await request(globalThis.__APP__)
    .post("/orders")
    .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
    .send({
      customerId: "customer-1",
      companyId: "company-1",
      items: [{ productId: "product-1", quantity: 1, unitPrice: 50000 }],
    })
    .expect(201);

  await request(globalThis.__APP__)
    .patch(`/orders/${createResponse.body.id}/status`)
    .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
    .send({ status: "orden_facturacion" })
    .expect(200);

  await request(globalThis.__APP__)
    .post(`/orders/${createResponse.body.id}/invoice`)
    .set("Authorization", `Bearer ${token}`)
    .expect(201);

  const duplicate = await request(globalThis.__APP__)
    .post(`/orders/${createResponse.body.id}/invoice`)
    .set("Authorization", `Bearer ${token}`)
    .expect(400);

  expect(duplicate.body.message).toBe("Order already has an active invoice");
});

it("allows a new invoice when previous order invoice is anulada", async () => {
  const token = await getToken("facturacion@norgtech.local");
  const createResponse = await request(globalThis.__APP__)
    .post("/orders")
    .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
    .send({
      customerId: "customer-1",
      companyId: "company-1",
      items: [{ productId: "product-1", quantity: 1, unitPrice: 50000 }],
    })
    .expect(201);

  await request(globalThis.__APP__)
    .patch(`/orders/${createResponse.body.id}/status`)
    .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
    .send({ status: "orden_facturacion" })
    .expect(200);

  const first = await request(globalThis.__APP__)
    .post(`/orders/${createResponse.body.id}/invoice`)
    .set("Authorization", `Bearer ${token}`)
    .expect(201);
  const stored = invoices.find((invoice) => invoice.id === first.body.id);
  if (stored) stored.status = InvoiceStatus.anulada;

  const second = await request(globalThis.__APP__)
    .post(`/orders/${createResponse.body.id}/invoice`)
    .set("Authorization", `Bearer ${token}`)
    .expect(201);

  expect(second.body.id).not.toBe(first.body.id);
});
```

- [ ] **Step 4: Add failing tests for due date, later status, and role denial**

Append:

```ts
it("calculates invoice due date from customer payment days", async () => {
  const token = await getToken("facturacion@norgtech.local");
  const createResponse = await request(globalThis.__APP__)
    .post("/orders")
    .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
    .send({
      customerId: "customer-1",
      companyId: "company-1",
      items: [{ productId: "product-1", quantity: 1, unitPrice: 50000 }],
    })
    .expect(201);

  await request(globalThis.__APP__)
    .patch(`/orders/${createResponse.body.id}/status`)
    .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
    .send({ status: "orden_facturacion" })
    .expect(200);

  const response = await request(globalThis.__APP__)
    .post(`/orders/${createResponse.body.id}/invoice`)
    .set("Authorization", `Bearer ${token}`)
    .expect(201);

  const issue = new Date(response.body.issueDate);
  const due = new Date(response.body.dueDate);
  expect(Math.round((due.getTime() - issue.getTime()) / 86_400_000)).toBe(30);
});

it("does not move delivered orders backwards when invoicing", async () => {
  const token = await getToken("facturacion@norgtech.local");
  const createResponse = await request(globalThis.__APP__)
    .post("/orders")
    .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
    .send({
      customerId: "customer-1",
      companyId: "company-1",
      items: [{ productId: "product-1", quantity: 1, unitPrice: 50000 }],
    })
    .expect(201);

  const stored = orders.find((order) => order.id === createResponse.body.id);
  if (stored) stored.status = "entregado";

  await request(globalThis.__APP__)
    .post(`/orders/${createResponse.body.id}/invoice`)
    .set("Authorization", `Bearer ${token}`)
    .expect(201);

  expect(stored?.status).toBe("entregado");
});

it("rejects direct invoice creation from order for comercial role", async () => {
  const comercialToken = await getToken("comercial@norgtech.local");
  const createResponse = await request(globalThis.__APP__)
    .post("/orders")
    .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
    .send({
      customerId: "customer-1",
      companyId: "company-1",
      items: [{ productId: "product-1", quantity: 1, unitPrice: 50000 }],
    })
    .expect(201);

  await request(globalThis.__APP__)
    .post(`/orders/${createResponse.body.id}/invoice`)
    .set("Authorization", `Bearer ${comercialToken}`)
    .expect(403);
});
```

- [ ] **Step 5: Run tests and verify failure**

Run:

```bash
pnpm --filter @norgtech/api test -- orders.e2e-spec.ts
```

Expected: FAIL with `Cannot POST /orders/:id/invoice` or 404, proving the endpoint is not implemented yet.

---

### Task 3: Implement Backend Conversion

**Files:**
- Modify: `apps/api/src/modules/orders/orders.service.ts`
- Modify: `apps/api/src/modules/orders/orders.controller.ts`

- [ ] **Step 1: Add endpoint to controller**

In `apps/api/src/modules/orders/orders.controller.ts`, append before the closing brace:

```ts
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "facturacion")
  @Post(":id/invoice")
  createInvoiceFromOrder(
    @CurrentUser() user: AuthUser,
    @Param("id") orderId: string,
  ) {
    return this.ordersService.createInvoiceFromOrder(user, orderId);
  }
```

- [ ] **Step 2: Add imports in service**

In `apps/api/src/modules/orders/orders.service.ts`, keep existing imports and ensure:

```ts
import { InvoiceStatus, OrderStatus, Prisma } from "@prisma/client";
```

If `OrderStatus, Prisma` are already imported from `@prisma/client`, extend that import rather than adding a second one.

- [ ] **Step 3: Add service constants**

Near `allowedTransitions` import or before `@Injectable()`, add:

```ts
const INVOICE_ALLOWED_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.orden_facturacion,
  OrderStatus.facturado,
  OrderStatus.despachado,
  OrderStatus.entregado,
];

const ORDER_STATUS_RANK: Record<OrderStatus, number> = {
  recibido: 0,
  orden_facturacion: 1,
  facturado: 2,
  despachado: 3,
  en_transito: 4,
  entregado: 5,
};
```

- [ ] **Step 4: Add `createInvoiceFromOrder` method**

Add this public method inside `OrdersService` before `findAll`:

```ts
  async createInvoiceFromOrder(user: AuthUser, orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          customer: true,
          company: true,
          items: true,
          invoices: true,
        },
      });

      if (!order) {
        throw new NotFoundException("Order not found");
      }
      if (!INVOICE_ALLOWED_ORDER_STATUSES.includes(order.status)) {
        throw new BadRequestException("Order status is not invoiceable");
      }
      if (!order.company || !order.company.isActive) {
        throw new BadRequestException("Order billing company is missing or inactive");
      }
      if (!order.customer) {
        throw new BadRequestException("Order customer is missing");
      }
      if (!order.items.length) {
        throw new BadRequestException("Order has no items to invoice");
      }

      const activeInvoice = order.invoices.find((invoice) => invoice.status !== InvoiceStatus.anulada);
      if (activeInvoice) {
        throw new BadRequestException("Order already has an active invoice");
      }

      const totals = this.calculateInvoiceTotalsFromOrder(order);
      await this.credit.assertCreditLimit(order.customerId, totals.totalAmount, tx);

      const issueDate = new Date();
      const dueDate = this.calculateInvoiceDueDate(issueDate, order.customer.paymentDays);
      const invoiceNumber = await this.nextInvoiceNumber(order.company.prefix, tx);
      const previousOrderState = JSON.parse(JSON.stringify(order));

      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          companyId: order.companyId,
          customerId: order.customerId,
          orderId: order.id,
          issueDate,
          dueDate,
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
          totalPaid: 0,
          status: InvoiceStatus.emitida,
          notes: `Generada desde pedido ${order.orderNumber ?? order.id}`,
          createdBy: user.id,
          updatedBy: user.id,
        },
        include: {
          company: true,
          customer: { select: { id: true, displayName: true, taxId: true, creditLimit: true, paymentDays: true } },
          order: { select: { id: true, orderNumber: true, status: true } },
          payments: { include: { supports: true }, orderBy: { paymentDate: "desc" } },
        },
      });

      if (ORDER_STATUS_RANK[order.status] < ORDER_STATUS_RANK.facturado) {
        const updatedOrder = await tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.facturado,
            updatedBy: user.id,
          },
        });

        await this.auditService.record(
          {
            entityType: "Order",
            entityId: order.id,
            action: "order.status_changed",
            actorUserId: user.id,
            previousState: previousOrderState,
            nextState: JSON.parse(JSON.stringify(updatedOrder)),
          },
          tx,
        );
      }

      await this.auditService.record(
        {
          entityType: "Invoice",
          entityId: invoice.id,
          action: "invoice.created_from_order",
          actorUserId: user.id,
          nextState: JSON.parse(JSON.stringify({ invoice, orderTotal: order.total })),
        },
        tx,
      );

      return invoice;
    });
  }
```

- [ ] **Step 5: Add helper methods**

Add these private methods near existing private helpers:

```ts
  private calculateInvoiceTotalsFromOrder(order: {
    subtotal: Prisma.Decimal;
    total: Prisma.Decimal;
    items: Array<{
      quantity: Prisma.Decimal;
      subtotal: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      totalWithTax: Prisma.Decimal;
    }>;
  }) {
    const subtotal = order.items.reduce(
      (sum, item) => sum.plus(new Prisma.Decimal(item.subtotal)),
      new Prisma.Decimal(0),
    ).toDecimalPlaces(2);
    const taxAmount = order.items.reduce(
      (sum, item) => sum.plus(new Prisma.Decimal(item.taxAmount).times(item.quantity)),
      new Prisma.Decimal(0),
    ).toDecimalPlaces(2);
    const itemsTotal = order.items.reduce(
      (sum, item) => sum.plus(new Prisma.Decimal(item.totalWithTax)),
      new Prisma.Decimal(0),
    ).toDecimalPlaces(2);
    const orderTotal = new Prisma.Decimal(order.total).toDecimalPlaces(2);
    const totalAmount = orderTotal.minus(itemsTotal).abs().lte(1)
      ? orderTotal
      : itemsTotal;

    return { subtotal, taxAmount, totalAmount };
  }

  private calculateInvoiceDueDate(issueDate: Date, paymentDays: number | null) {
    const dueDate = new Date(issueDate);
    dueDate.setDate(dueDate.getDate() + (paymentDays ?? 0));
    return dueDate;
  }
```

- [ ] **Step 6: Change `nextInvoiceNumber` to accept transaction client**

Add this method to `OrdersService`:

```ts
  private async nextInvoiceNumber(companyPrefix: string, tx: Prisma.TransactionClient): Promise<string> {
    const last = await tx.invoice.findFirst({
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

Do not modify `InvoicesService.nextInvoiceNumber`; it is private and remains for manual invoices.

- [ ] **Step 7: Run backend tests**

Run:

```bash
pnpm --filter @norgtech/api test -- orders.e2e-spec.ts
```

Expected: PASS for the order suite.

- [ ] **Step 8: Commit backend conversion**

```bash
git add apps/api/src/modules/orders/orders.controller.ts apps/api/src/modules/orders/orders.service.ts apps/api/test/orders.e2e-spec.ts
git commit -m "feat(api): generate invoice from order"
```

---

### Task 4: Frontend Direct Invoice Action

**Files:**
- Modify: `apps/web/src/app/(app)/orders/[id]/page.tsx`
- Modify: `apps/web/src/components/orders/order-actions.tsx`

- [ ] **Step 1: Extend order page invoice types**

In `apps/web/src/app/(app)/orders/[id]/page.tsx`, add:

```ts
interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
}
```

Add to `interface Order`:

```ts
  invoices: Invoice[];
```

- [ ] **Step 2: Compute active invoice and pass it to actions**

Before `return`, add:

```ts
  const activeInvoice = order.invoices?.find((invoice) => invoice.status !== "anulada") ?? null;
```

Change:

```tsx
<OrderActions orderId={order.id} currentStatus={order.status} />
```

to:

```tsx
<OrderActions
  orderId={order.id}
  currentStatus={order.status}
  activeInvoiceId={activeInvoice?.id ?? null}
/>
```

- [ ] **Step 3: Extend `OrderActionsProps`**

In `apps/web/src/components/orders/order-actions.tsx`, change:

```ts
interface OrderActionsProps {
  orderId: string;
  currentStatus: string;
}
```

to:

```ts
interface OrderActionsProps {
  orderId: string;
  currentStatus: string;
  activeInvoiceId?: string | null;
}
```

Change the component signature:

```ts
export function OrderActions({ orderId, currentStatus, activeInvoiceId = null }: OrderActionsProps) {
```

- [ ] **Step 4: Add invoiceable status helper**

Add below `billRoles`:

```ts
const invoiceableStatuses = ["orden_facturacion", "facturado", "despachado", "entregado"];
```

- [ ] **Step 5: Add create invoice handler**

Inside `OrderActions`, after `createBillingRequest`, add:

```ts
  async function createInvoiceFromOrder() {
    setError(null);
    setLoading(true);
    try {
      const response = await apiFetchClient(`/orders/${orderId}/invoice`, {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.message || "Error al generar factura");
        setLoading(false);
        return;
      }
      router.push(`/invoices/${data.id}`);
      router.refresh();
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }
```

- [ ] **Step 6: Add permission booleans**

Replace the existing `canBill` with:

```ts
  const canBill =
    (currentStatus === "entregado" || currentStatus === "facturado") && role && billRoles.includes(role);
  const canCreateInvoice =
    invoiceableStatuses.includes(currentStatus) &&
    !activeInvoiceId &&
    role &&
    billRoles.includes(role);
```

- [ ] **Step 7: Render direct invoice button**

In the actions button group, after the billing request button, add:

```tsx
        {canCreateInvoice && (
          <Button
            onClick={createInvoiceFromOrder}
            disabled={loading}
            variant="secondary"
          >
            {loading ? "Procesando..." : "Generar factura"}
          </Button>
        )}
        {activeInvoiceId && role && billRoles.includes(role) && (
          <Button
            onClick={() => router.push(`/invoices/${activeInvoiceId}`)}
            variant="outline"
            type="button"
          >
            Ver factura
          </Button>
        )}
```

- [ ] **Step 8: Run frontend lint/build check**

Run:

```bash
pnpm --filter @norgtech/web lint
```

Expected: PASS. If this project does not define lint, run:

```bash
pnpm --filter @norgtech/web build
```

Expected: PASS.

- [ ] **Step 9: Commit frontend action**

```bash
git add 'apps/web/src/app/(app)/orders/[id]/page.tsx' apps/web/src/components/orders/order-actions.tsx
git commit -m "feat(web): add order invoice action"
```

---

### Task 5: Full Verification

**Files:**
- No source edits expected unless verification exposes a bug.

- [ ] **Step 1: Run backend order tests**

```bash
pnpm --filter @norgtech/api test -- orders.e2e-spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run backend invoice tests**

```bash
pnpm --filter @norgtech/api test -- invoices.e2e-spec.ts
```

Expected: PASS. This confirms manual invoice behavior still works.

- [ ] **Step 3: Run API build**

```bash
pnpm --filter @norgtech/api build
```

Expected: PASS.

- [ ] **Step 4: Run web build**

```bash
pnpm --filter @norgtech/web build
```

Expected: PASS.

- [ ] **Step 5: Inspect final git status**

```bash
git status --short
```

Expected: only the pre-existing untracked `GASTOS SEMANA 18-19 OTROS.xlsx` remains, unless intentionally staged/committed changes are pending.

---

## Self-Review

- Spec coverage: endpoint, permissions, duplicate guard, totals, due date, status transition, audit, UI action, and tests are covered.
- Scope check: importers, inventory, returns, remissions, and editable pre-invoice screen are excluded.
- Type consistency: plan uses existing Prisma enums `OrderStatus`, `InvoiceStatus`, existing `CreditService.assertCreditLimit`, existing `AuditService.record`, and existing `OrderActions` component.
- Placeholder scan: no unresolved markers are left.

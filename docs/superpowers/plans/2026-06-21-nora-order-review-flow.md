# Nora Order Review Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a WhatsApp confirmation gate + internal (facturación) review/approval to Nora's order flow, so pedidos are confirmed by the sender, created with unresolved items when products/customer can't be matched, and approved/rejected in the web with WhatsApp notifications.

**Architecture:** Introduce `order`-type `NoraConversationCase` records as the cross-turn holder of an in-progress order. Nora no longer auto-creates the order on first detection; it starts/advances an order case, asks for confirmation (and for the customer when a comercial omits it), and only emits the `order_candidate` when the sender confirms. On confirmation the existing `WhatsAppOrderAutomationService` creates the order in `approvalStatus="en_revision"`, now tolerating unresolved products (marked items) and resolving the customer by name for comerciales. A new orders review API (`facturacion`/`administrador`) lists the queue, resolves marked items, and approves/rejects, with approval advancing the order to `orden_facturacion` and notifying the sender over WhatsApp.

**Tech Stack:** NestJS 11 + Prisma (apps/api), Python 3 + Pydantic (agents/nora), Next.js App Router + React client components (apps/web). Backend tests are Jest e2e specs (`apps/api/test/*.e2e-spec.ts`, in-memory Prisma mocks). Nora tests are pytest (`agents/nora/tests/*.py`).

## Global Constraints

- Order states: `OrderStatus` enum = `recibido | orden_facturacion | facturado | despachado | en_transito | entregado`. Approval lives in `Order.approvalStatus` (free string) = `en_revision | aprobado | rechazado`.
- Review role gate: `facturacion` + `administrador` only (reuse existing roles; do NOT add a UserRole enum value).
- Nora case enums (existing): `NoraConversationCaseType = order | new_customer | expense`; `NoraConversationCaseStatus = collecting_info | ready_for_review | approved | executed | cancelled | blocked`. `openNoraCaseStatuses = [collecting_info, ready_for_review, blocked]`.
- An order cannot be approved while any `OrderItem.needsResolution = true` or the customer is unresolved.
- WhatsApp notifications are best-effort: wrap in try/catch, log on failure, never throw out of approve/reject.
- Backend e2e tests EXTEND the existing in-memory mock harness in the relevant `*.e2e-spec.ts` (same `PrismaService` override pattern). Do not introduce a real DB.
- Run backend tests from `apps/api` with `npm test`. Run Nora tests from `agents/nora` with `python -m pytest`.

---

### Task 1: Schema — `OrderItem.needsResolution`

**Files:**
- Modify: `apps/api/prisma/schema.prisma:719-739` (model `OrderItem`)
- Create (generated): `apps/api/prisma/migrations/<timestamp>_order_item_needs_resolution/migration.sql`

**Interfaces:**
- Produces: Prisma `OrderItem.needsResolution: boolean` (default `false`), available on `@prisma/client` types.

- [ ] **Step 1: Add the field to the model**

In `apps/api/prisma/schema.prisma`, inside `model OrderItem`, add after the `notes` line (`notes String?`):

```prisma
  needsResolution      Boolean  @default(false)
```

- [ ] **Step 2: Create the migration without applying to a remote DB**

Run (from `apps/api`):

```bash
npx prisma migrate dev --name order_item_needs_resolution --create-only
```

Expected: a new folder under `prisma/migrations/` containing `migration.sql` with `ALTER TABLE "OrderItem" ADD COLUMN "needsResolution" BOOLEAN NOT NULL DEFAULT false;`

- [ ] **Step 3: Regenerate the Prisma client**

Run (from `apps/api`):

```bash
npx prisma generate --schema prisma/schema.prisma
```

Expected: `Generated Prisma Client` success message. `OrderItem` now has `needsResolution`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(orders): add OrderItem.needsResolution column"
```

---

### Task 2: Persist `needsResolution` through order creation

**Files:**
- Modify: `apps/api/src/modules/orders/dto/create-order-item.dto.ts`
- Modify: `apps/api/src/modules/orders/orders.service.ts:154-179` (no-productId branch of `create`)
- Modify: `apps/api/src/modules/orders/orders.service.ts:136-152` (productId branch of `create`)
- Test: `apps/api/test/orders.e2e-spec.ts`

**Interfaces:**
- Consumes: `OrderItem.needsResolution` (Task 1).
- Produces: `CreateOrderItemDto.needsResolution?: boolean`. Orders created with an item that has no `productId` and `needsResolution: true` persist that flag; productId items persist `needsResolution: false`.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/test/orders.e2e-spec.ts` (inside the main `describe`, alongside the other order-creation tests). It posts an order with one resolved and one unresolved item and asserts the persisted flags. Reuse the existing admin token + mock `order.create` capture used by the other tests (the suite already pushes created orders into the `orders` array and the `prisma.order.create` mock returns the built record with `items`).

```ts
it("persists needsResolution for unresolved items", async () => {
  const response = await request(global.__APP__)
    .post("/orders")
    .set("Authorization", `Bearer ${global.__ADMIN_TOKEN__}`)
    .send({
      customerId: "customer-1",
      companyId: "company-1",
      items: [
        { productId: "product-1", quantity: 2, unitPrice: 50000 },
        { productName: "Algo que Nora no encontro", quantity: 5, unitPrice: 0, needsResolution: true },
      ],
    })
    .expect(201);

  const created = response.body.items as Array<{
    productId: string | null;
    needsResolution: boolean;
    customProductName: string | null;
  }>;
  const resolved = created.find((i) => i.productId === "product-1");
  const unresolved = created.find((i) => i.productId === null);
  expect(resolved?.needsResolution).toBe(false);
  expect(unresolved?.needsResolution).toBe(true);
  expect(unresolved?.customProductName).toBe("Algo que Nora no encontro");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run (from `apps/api`): `npm test -- orders.e2e-spec.ts`
Expected: FAIL — `needsResolution` is `undefined`/`false` on the unresolved item because the DTO drops it and the service never sets it.

- [ ] **Step 3: Add the DTO field**

In `apps/api/src/modules/orders/dto/create-order-item.dto.ts`, add (after `notes`):

```ts
  @IsOptional()
  @IsBoolean()
  needsResolution?: boolean;
```

And add `IsBoolean` to the imports on line 1:

```ts
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";
```

- [ ] **Step 4: Set the flag in the service**

In `apps/api/src/modules/orders/orders.service.ts`, in the **productId branch** return object (around line 136), add:

```ts
            needsResolution: false,
```

In the **no-productId branch** return object (around line 163), add:

```ts
          needsResolution: item.needsResolution ?? false,
```

- [ ] **Step 5: Run the test to verify it passes**

Run (from `apps/api`): `npm test -- orders.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/orders/dto/create-order-item.dto.ts apps/api/src/modules/orders/orders.service.ts apps/api/test/orders.e2e-spec.ts
git commit -m "feat(orders): persist needsResolution on order items"
```

---

### Task 3: Automation creates unresolved items + resolves customer by name

**Files:**
- Modify: `apps/api/src/modules/whatsapp/dto/process-order-automation.dto.ts` (add `customerRef`)
- Modify: `apps/api/src/modules/whatsapp/whatsapp-order-automation.service.ts`
- Test: `apps/api/test/whatsapp.e2e-spec.ts`

**Interfaces:**
- Consumes: `CreateOrderItemDto.needsResolution` (Task 2); `OrdersService.create`.
- Produces: `WhatsAppOrderAutomationService.process` now (a) accepts `customerRef` on the DTO and resolves the customer when `conversation.customer` is null, (b) never returns `needs_clarification`/`human_review` for unmatched products — it pushes an unresolved item instead and still returns `{ decision: "created", order, summary, reply }`. `summary.items` entries gain `needsResolution: boolean`.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/test/whatsapp.e2e-spec.ts` a unit-style test of the service. The suite already constructs the Nest app with mocked Prisma; if it does not already resolve `WhatsAppOrderAutomationService`, get it via `moduleRef.get(WhatsAppOrderAutomationService)`. The test drives a conversation with a known customer and an item whose `productRef` matches no product, asserting an order is still created with one unresolved item:

```ts
it("creates an order with an unresolved item when the product does not match", async () => {
  const automation = moduleRef.get(WhatsAppOrderAutomationService);
  const result = await automation.process(
    { id: "admin-user-id", email: "admin@norgtech.local", role: "administrador" },
    "conversation-customer-1",
    {
      companyRef: "Nortech",
      items: [{ productRef: "producto inexistente xyz", quantity: 3 }],
    },
  );

  expect(result.decision).toBe("created");
  expect(result.summary.items).toHaveLength(1);
  expect(result.summary.items[0].needsResolution).toBe(true);
});
```

Ensure the mocked `product.findMany` returns the existing seeded products (none matching `producto inexistente xyz`) and the mocked `whatsAppConversation.findUnique` for `conversation-customer-1` includes a `customer` with `id: "customer-1"`. Extend the existing mocks in the suite if needed (follow the pattern already used for conversations/customers).

- [ ] **Step 2: Run it and watch it fail**

Run (from `apps/api`): `npm test -- whatsapp.e2e-spec.ts`
Expected: FAIL — current code returns `{ decision: "needs_clarification", missingField: "items" }` for an unmatched product.

- [ ] **Step 3: Add `customerRef` to the DTO**

In `apps/api/src/modules/whatsapp/dto/process-order-automation.dto.ts`, add an optional string field `customerRef` (mirror the existing optional string fields with `@IsOptional() @IsString()`).

- [ ] **Step 4: Resolve the customer in `process`**

In `whatsapp-order-automation.service.ts`, replace the early customer guard (lines 61-66) with resolution that falls back to `customerRef`:

```ts
    const customer =
      conversation.customer ?? (await this.resolveCustomer(dto.customerRef));
    if (customer === undefined) {
      return {
        decision: "human_review" satisfies AutomationDecision,
        reason: `Cliente ambiguo: ${dto.customerRef}`,
        proposal: dto,
      };
    }
    if (!customer) {
      return this.needsClarification(
        "customerId",
        "Necesito identificar el cliente antes de preparar el pedido. Dime el nombre o NIT del cliente.",
      );
    }
```

Then replace every later use of `conversation.customer.id` (lines 124 and the `resolveCustomerZone(conversation.customer.id, ...)` call on line 78) with `customer.id`.

Add the helper (place near `resolveCompany`):

```ts
  private async resolveCustomer(customerRef?: string) {
    if (!customerRef?.trim()) {
      return null;
    }
    const customers = await this.prisma.customer.findMany({
      where: { active: true },
      select: { id: true, displayName: true, legalName: true, taxId: true },
    });
    const normalizedRef = this.normalize(customerRef);
    const matches = customers.filter((candidate) =>
      [candidate.displayName, candidate.legalName, candidate.taxId].some(
        (value) => value && this.normalize(value) === normalizedRef,
      ),
    );
    if (matches.length === 1) {
      return { id: matches[0].id };
    }
    if (matches.length > 1) {
      return undefined; // ambiguous
    }
    return null; // not found
  }
```

> Note: `customer.active` is the existing flag on the `Customer` model. If the field is named differently in the schema, drop the `where` filter rather than guessing.

- [ ] **Step 5: Build unresolved items instead of bailing**

Replace the product loop (lines 91-121) so unmatched/ambiguous products produce an unresolved item:

```ts
    const products = await this.prisma.product.findMany({
      where: { active: true },
    });
    const resolvedItems: Array<{
      candidate: OrderAutomationItemDto;
      product: ActiveProduct | null;
    }> = [];

    for (const item of dto.items) {
      const resolvedProduct = this.resolveProduct(products, item.productRef);
      if (resolvedProduct.decision === "created") {
        resolvedItems.push({ candidate: item, product: resolvedProduct.product });
      } else {
        resolvedItems.push({ candidate: item, product: null });
      }
    }
```

- [ ] **Step 6: Map resolved + unresolved items into the payload**

Replace the `items` mapping in the `payload` (lines 133-139) with:

```ts
      items: resolvedItems.map(({ candidate, product }) =>
        product
          ? {
              productId: product.id,
              quantity: candidate.quantity,
              unitPrice: this.decimalToNumber(product.basePrice),
              presentation: candidate.presentation,
              notes: candidate.notes,
            }
          : {
              productName: candidate.productRef,
              quantity: candidate.quantity,
              unitPrice: 0,
              presentation: candidate.presentation,
              notes: candidate.notes,
              needsResolution: true,
            },
      ),
```

And in the `summary.items` mapping (lines 156-161) include the flag and tolerate a null product:

```ts
        items: resolvedItems.map(({ candidate, product }) => ({
          name: product?.name ?? candidate.productRef,
          sku: product?.sku ?? "POR RESOLVER",
          quantity: candidate.quantity,
          unit: product?.unit ?? "und",
          needsResolution: !product,
        })),
```

- [ ] **Step 7: Run the test to verify it passes**

Run (from `apps/api`): `npm test -- whatsapp.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/whatsapp/dto/process-order-automation.dto.ts apps/api/src/modules/whatsapp/whatsapp-order-automation.service.ts apps/api/test/whatsapp.e2e-spec.ts
git commit -m "feat(whatsapp): order automation creates unresolved items and resolves customer by name"
```

---

### Task 4: `OrdersService.resolveOrderItem` (resolve a marked item + recompute totals)

**Files:**
- Create: `apps/api/src/modules/orders/dto/resolve-order-item.dto.ts`
- Modify: `apps/api/src/modules/orders/orders.service.ts`
- Test: `apps/api/test/orders.e2e-spec.ts`

**Interfaces:**
- Consumes: `OrderItem.needsResolution`.
- Produces: `OrdersService.resolveOrderItem(user: AuthUser, orderId: string, itemId: string, dto: ResolveOrderItemDto): Promise<Order>` where `ResolveOrderItemDto = { productId: string; unitPrice: number }`. Sets the item's product snapshot + price, `needsResolution=false`, recomputes the item's subtotal/tax/total and the order's subtotal/total.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/test/orders.e2e-spec.ts`. The suite mocks Prisma; extend the `orderItem` and `order` mocks so `orderItem.findUnique`/`update` and `order.update` operate on an in-memory record. Test body:

```ts
it("resolves an unresolved item and recomputes totals", async () => {
  // Arrange: an order with one unresolved item (productId null, unitPrice 0)
  // is seeded into the in-memory `orders`/`orderItems` mock arrays (see harness).
  const response = await request(global.__APP__)
    .patch(`/orders/order-unresolved/items/item-unresolved/resolve`)
    .set("Authorization", `Bearer ${global.__FACTURACION_TOKEN__}`)
    .send({ productId: "product-1", unitPrice: 50000 })
    .expect(200);

  const item = response.body.items.find((i: { id: string }) => i.id === "item-unresolved");
  expect(item.productId).toBe("product-1");
  expect(item.needsResolution).toBe(false);
  expect(Number(item.unitPrice)).toBe(50000);
});
```

Add a `facturacion` token global (`global.__FACTURACION_TOKEN__`) the same way the suite builds `__ADMIN_TOKEN__` (sign in as `facturacion@norgtech.local`, already present in `users`). Seed `order-unresolved` with `item-unresolved` (`productId: null`, `quantity: 2`, `needsResolution: true`, `unitPrice: 0`).

- [ ] **Step 2: Run it and watch it fail**

Run (from `apps/api`): `npm test -- orders.e2e-spec.ts`
Expected: FAIL — route 404 (endpoint not defined yet; controller comes in Task 6) OR method missing. (If the controller route does not exist, the test fails with 404 — that's the expected red.)

> Implementation note: implement the service method now; the route is wired in Task 6. To keep this task independently green, also add the controller route here is acceptable, but this plan wires all review endpoints together in Task 6. Run the service-level expectation by temporarily calling the service in the test if the route is not ready. Prefer to land Task 4 + Task 6 together if executing strictly red-green; the commit below is for the service method.

- [ ] **Step 3: Create the DTO**

`apps/api/src/modules/orders/dto/resolve-order-item.dto.ts`:

```ts
import { IsNotEmpty, IsNumber, IsString, Min } from "class-validator";

export class ResolveOrderItemDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;
}
```

- [ ] **Step 4: Implement `resolveOrderItem`**

Add to `OrdersService` (mirror the totals math already in `create`, lines 130-134 and 183-190):

```ts
  async resolveOrderItem(
    user: AuthUser,
    orderId: string,
    itemId: string,
    dto: ResolveOrderItemDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.orderItem.findUnique({ where: { id: itemId } });
      if (!item || item.orderId !== orderId) {
        throw new NotFoundException("Order item not found");
      }
      const product = await tx.product.findUnique({ where: { id: dto.productId } });
      if (!product) {
        throw new NotFoundException(`Product ${dto.productId} not found`);
      }

      const quantity = new Prisma.Decimal(item.quantity);
      const taxPercent = new Prisma.Decimal(item.taxPercent ?? 19).toDecimalPlaces(2);
      const unitPrice = new Prisma.Decimal(dto.unitPrice).toDecimalPlaces(2);
      const taxAmount = unitPrice.times(taxPercent).dividedBy(100).toDecimalPlaces(2);
      const subtotal = quantity.times(unitPrice).toDecimalPlaces(2);
      const totalWithTax = quantity.times(unitPrice.plus(taxAmount)).toDecimalPlaces(2);

      await tx.orderItem.update({
        where: { id: itemId },
        data: {
          productId: product.id,
          productSnapshotName: product.name,
          productSnapshotSku: product.sku,
          unit: product.unit,
          customProductName: null,
          originalUnitPrice: product.basePrice,
          unitPrice,
          taxAmount,
          subtotal,
          totalWithTax,
          needsResolution: false,
        },
      });

      const items = await tx.orderItem.findMany({ where: { orderId } });
      const orderSubtotal = items.reduce(
        (sum, current) => sum.plus(new Prisma.Decimal(current.subtotal)),
        new Prisma.Decimal(0),
      );
      const orderTotal = items.reduce(
        (sum, current) => sum.plus(new Prisma.Decimal(current.totalWithTax)),
        new Prisma.Decimal(0),
      );

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { subtotal: orderSubtotal, total: orderTotal, updatedBy: user.id },
        include: { items: true, customer: true },
      });

      await this.auditService.record(
        {
          entityType: "Order",
          entityId: orderId,
          action: "order.item_resolved",
          actorUserId: user.id,
          nextState: JSON.parse(JSON.stringify(updated)),
        },
        tx,
      );

      return updated;
    });
  }
```

Add the import at the top of the file: `import { ResolveOrderItemDto } from "./dto/resolve-order-item.dto";`

- [ ] **Step 5: Run the test (after Task 6 wires the route) to verify it passes**

Run (from `apps/api`): `npm test -- orders.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/orders/dto/resolve-order-item.dto.ts apps/api/src/modules/orders/orders.service.ts apps/api/test/orders.e2e-spec.ts
git commit -m "feat(orders): resolve unresolved order items and recompute totals"
```

---

### Task 5: `OrdersService` review queue + approve + reject

**Files:**
- Create: `apps/api/src/modules/orders/dto/reject-order.dto.ts`
- Modify: `apps/api/src/modules/orders/orders.service.ts`
- Test: `apps/api/test/orders.e2e-spec.ts`

**Interfaces:**
- Consumes: `OrderItem.needsResolution`, `Order.approvalStatus/approvalReason/approvalName/reviewDate`.
- Produces:
  - `OrdersService.findReviewQueue(): Promise<Order[]>` — orders with `approvalStatus = "en_revision"`, newest first, `include: { items: true, customer: true, company: true }`.
  - `OrdersService.approveOrder(user, orderId): Promise<Order>` — throws `BadRequestException` if any item `needsResolution` or `customerId` missing; sets `approvalStatus="aprobado"`, `reviewDate=now`, `approvalName=user name`; advances `status` to `orden_facturacion` only if currently `recibido`.
  - `OrdersService.rejectOrder(user, orderId, reason): Promise<Order>` — sets `approvalStatus="rechazado"`, `approvalReason=reason`, `reviewDate=now`, `approvalName=user name`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/test/orders.e2e-spec.ts`:

```ts
it("blocks approval while an item needs resolution", async () => {
  await request(global.__APP__)
    .patch(`/orders/order-unresolved/approve`)
    .set("Authorization", `Bearer ${global.__FACTURACION_TOKEN__}`)
    .expect(400);
});

it("approves a fully resolved order and advances it to orden_facturacion", async () => {
  // order-resolved: approvalStatus en_revision, status recibido, all items resolved
  const response = await request(global.__APP__)
    .patch(`/orders/order-resolved/approve`)
    .set("Authorization", `Bearer ${global.__FACTURACION_TOKEN__}`)
    .expect(200);
  expect(response.body.approvalStatus).toBe("aprobado");
  expect(response.body.status).toBe("orden_facturacion");
});

it("rejects an order with a reason", async () => {
  const response = await request(global.__APP__)
    .patch(`/orders/order-resolved-2/reject`)
    .set("Authorization", `Bearer ${global.__FACTURACION_TOKEN__}`)
    .send({ reason: "Cliente con cartera vencida" })
    .expect(200);
  expect(response.body.approvalStatus).toBe("rechazado");
  expect(response.body.approvalReason).toBe("Cliente con cartera vencida");
});
```

Seed `order-resolved` and `order-resolved-2` (`approvalStatus: "en_revision"`, `status: "recibido"`, items all `needsResolution: false`, `customerId: "customer-1"`) in the harness.

- [ ] **Step 2: Run them and watch them fail**

Run (from `apps/api`): `npm test -- orders.e2e-spec.ts`
Expected: FAIL — 404 (routes not wired until Task 6) / methods missing.

- [ ] **Step 3: Create the reject DTO**

`apps/api/src/modules/orders/dto/reject-order.dto.ts`:

```ts
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class RejectOrderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
```

- [ ] **Step 4: Implement the three methods**

Add to `OrdersService` (add `import { RejectOrderDto } from "./dto/reject-order.dto";` at top):

```ts
  findReviewQueue() {
    return this.prisma.order.findMany({
      where: { approvalStatus: "en_revision" },
      include: { items: true, customer: true, company: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async approveOrder(user: AuthUser, orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!order) {
        throw new NotFoundException("Order not found");
      }
      if (!order.customerId) {
        throw new BadRequestException("Order has no customer assigned");
      }
      if (order.items.some((item) => item.needsResolution)) {
        throw new BadRequestException("Order has unresolved items");
      }

      const previousState = JSON.parse(JSON.stringify(order));
      const reviewer =
        (await tx.user.findUnique({ where: { id: user.id } }))?.name ?? user.email;

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          approvalStatus: "aprobado",
          approvalName: reviewer,
          reviewDate: new Date(),
          updatedBy: user.id,
          ...(order.status === OrderStatus.recibido && {
            status: OrderStatus.orden_facturacion,
          }),
        },
        include: { items: true, customer: true, company: true, sourceConversation: true },
      });

      await this.auditService.record(
        {
          entityType: "Order",
          entityId: orderId,
          action: "order.approved",
          actorUserId: user.id,
          previousState,
          nextState: JSON.parse(JSON.stringify(updated)),
        },
        tx,
      );

      return updated;
    });
  }

  async rejectOrder(user: AuthUser, orderId: string, dto: RejectOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) {
        throw new NotFoundException("Order not found");
      }
      const previousState = JSON.parse(JSON.stringify(order));
      const reviewer =
        (await tx.user.findUnique({ where: { id: user.id } }))?.name ?? user.email;

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          approvalStatus: "rechazado",
          approvalReason: dto.reason,
          approvalName: reviewer,
          reviewDate: new Date(),
          updatedBy: user.id,
        },
        include: { items: true, customer: true, company: true, sourceConversation: true },
      });

      await this.auditService.record(
        {
          entityType: "Order",
          entityId: orderId,
          action: "order.rejected",
          actorUserId: user.id,
          previousState,
          nextState: JSON.parse(JSON.stringify(updated)),
        },
        tx,
      );

      return updated;
    });
  }
```

`OrderStatus` is already imported in this file (line 2).

- [ ] **Step 5: Run the tests (after Task 6) to verify they pass**

Run (from `apps/api`): `npm test -- orders.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/orders/dto/reject-order.dto.ts apps/api/src/modules/orders/orders.service.ts apps/api/test/orders.e2e-spec.ts
git commit -m "feat(orders): add review queue, approve and reject service methods"
```

---

### Task 6: Orders review endpoints (controller)

**Files:**
- Modify: `apps/api/src/modules/orders/orders.controller.ts`
- Test: `apps/api/test/orders.e2e-spec.ts` (the tests from Tasks 4 & 5 now go green)

**Interfaces:**
- Consumes: `OrdersService.findReviewQueue/resolveOrderItem/approveOrder/rejectOrder`.
- Produces HTTP routes (all `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles("administrador", "facturacion")`):
  - `GET /orders/review-queue`
  - `PATCH /orders/:id/items/:itemId/resolve` body `ResolveOrderItemDto`
  - `PATCH /orders/:id/approve`
  - `PATCH /orders/:id/reject` body `RejectOrderDto`

- [ ] **Step 1: Confirm the failing tests**

Run (from `apps/api`): `npm test -- orders.e2e-spec.ts`
Expected: Tasks 4 & 5 tests FAIL with 404 (routes missing).

- [ ] **Step 2: Add the routes**

In `orders.controller.ts`, add imports:

```ts
import { ResolveOrderItemDto } from "./dto/resolve-order-item.dto";
import { RejectOrderDto } from "./dto/reject-order.dto";
```

Add inside the class (place the `review-queue` GET before the `:id` GET so it is not captured by the param route):

```ts
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "facturacion")
  @Get("review-queue")
  findReviewQueue() {
    return this.ordersService.findReviewQueue();
  }
```

> The existing `@Get(":id")` is at line 54. Insert `review-queue` ABOVE it. NestJS matches in declaration order; a literal path declared first wins over `:id`.

Add (anywhere among the other `@Patch`/`@Post` handlers):

```ts
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "facturacion")
  @Patch(":id/items/:itemId/resolve")
  resolveItem(
    @CurrentUser() user: AuthUser,
    @Param("id") orderId: string,
    @Param("itemId") itemId: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: ResolveOrderItemDto,
  ) {
    return this.ordersService.resolveOrderItem(user, orderId, itemId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "facturacion")
  @Patch(":id/approve")
  approve(@CurrentUser() user: AuthUser, @Param("id") orderId: string) {
    return this.ordersService.approveOrder(user, orderId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "facturacion")
  @Patch(":id/reject")
  reject(
    @CurrentUser() user: AuthUser,
    @Param("id") orderId: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: RejectOrderDto,
  ) {
    return this.ordersService.rejectOrder(user, orderId, dto);
  }
```

- [ ] **Step 3: Run all orders tests to verify they pass**

Run (from `apps/api`): `npm test -- orders.e2e-spec.ts`
Expected: PASS (Tasks 4 & 5 tests now green).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/orders/orders.controller.ts apps/api/test/orders.e2e-spec.ts
git commit -m "feat(orders): expose review queue, resolve-item, approve and reject endpoints"
```

---

### Task 7: WhatsApp notification on approve/reject

**Files:**
- Modify: `apps/api/src/modules/orders/orders.module.ts` (forwardRef import of WhatsAppModule)
- Modify: `apps/api/src/modules/whatsapp/whatsapp.module.ts` (export WhatsAppService, forwardRef import of OrdersModule)
- Modify: `apps/api/src/modules/orders/orders.service.ts` (inject WhatsAppService, notify after approve/reject)
- Test: `apps/api/test/orders.e2e-spec.ts`

**Interfaces:**
- Consumes: `WhatsAppService.sendAgentReply(conversationId: string, body: string)` (exists, line 157).
- Produces: after `approveOrder`/`rejectOrder`, if the order has `sourceConversationId`, a best-effort outbound WhatsApp message is sent.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/test/orders.e2e-spec.ts`. The suite mocks Prisma; assert that approving an order with a `sourceConversationId` creates an outbound `whatsAppMessage`. Spy on the mock `whatsAppMessage.create` (the harness already has a `whatsAppMessage` mock for other suites; add one if missing) and assert it was called with `direction: "outbound"` after approval of an order whose `sourceConversationId` is set:

```ts
it("notifies the sender over WhatsApp when an order is approved", async () => {
  outboundMessages.length = 0; // array the whatsAppMessage.create mock pushes into
  await request(global.__APP__)
    .patch(`/orders/order-resolved-wa/approve`)
    .set("Authorization", `Bearer ${global.__FACTURACION_TOKEN__}`)
    .expect(200);
  expect(outboundMessages.some((m) => m.direction === "outbound")).toBe(true);
});
```

Seed `order-resolved-wa` like `order-resolved` but with `sourceConversationId: "conversation-customer-1"`. Add an `outboundMessages` array and a `whatsAppMessage.create` mock that pushes into it (follow the existing mock style).

- [ ] **Step 2: Run it and watch it fail**

Run (from `apps/api`): `npm test -- orders.e2e-spec.ts`
Expected: FAIL — no outbound message is produced (OrdersService cannot send WhatsApp yet).

- [ ] **Step 3: Wire the modules with forwardRef**

In `apps/api/src/modules/whatsapp/whatsapp.module.ts`: change the `OrdersModule` import to `forwardRef(() => OrdersModule)` and add `WhatsAppService` to `exports`. Import `forwardRef` from `@nestjs/common`.

```ts
import { forwardRef, Module } from "@nestjs/common";
// ...
  imports: [AuthModule, forwardRef(() => OrdersModule)],
// ...
  exports: [WhatsAppService],
```

In `apps/api/src/modules/orders/orders.module.ts`: add `forwardRef(() => WhatsAppModule)` to imports.

```ts
import { forwardRef, Module } from "@nestjs/common";
import { WhatsAppModule } from "../whatsapp/whatsapp.module";
// ...
  imports: [AuthModule, AuditModule, CreditModule, forwardRef(() => WhatsAppModule)],
```

- [ ] **Step 4: Inject WhatsAppService and send notifications**

In `orders.service.ts` constructor, inject with forwardRef:

```ts
import { BadRequestException, forwardRef, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
// ...
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly orderXlsxExportService: OrderXlsxExportService,
    private readonly credit: CreditService,
    @Inject(forwardRef(() => WhatsAppService))
    private readonly whatsApp: WhatsAppService,
  ) {}
```

Add a private helper:

```ts
  private async notifyReviewOutcome(
    order: { sourceConversationId: string | null; orderNumber: string | null },
    message: string,
  ) {
    if (!order.sourceConversationId) {
      return;
    }
    try {
      await this.whatsApp.sendAgentReply(order.sourceConversationId, message);
    } catch (error) {
      // best-effort: never block the review outcome on a delivery failure
      console.error("Failed to notify order review outcome over WhatsApp", error);
    }
  }
```

At the end of `approveOrder`, before `return updated;` (move the return so the notification runs after the transaction commits — call it on the returned `updated`):

```ts
    });
    await this.notifyReviewOutcome(
      result,
      `Tu pedido ${result.orderNumber ?? ""} fue aprobado y pasa a facturación. ¡Gracias!`,
    );
    return result;
```

Refactor `approveOrder`/`rejectOrder` to assign the `$transaction(...)` result to `const result` and notify after it resolves. For reject:

```ts
    await this.notifyReviewOutcome(
      result,
      `Tu pedido ${result.orderNumber ?? ""} fue rechazado. Motivo: ${dto.reason}`,
    );
    return result;
```

- [ ] **Step 5: Run the test to verify it passes**

Run (from `apps/api`): `npm test -- orders.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 6: Run the whole backend suite to catch DI/circular wiring regressions**

Run (from `apps/api`): `npm test`
Expected: all suites PASS (confirms the forwardRef wiring boots the app).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/orders/orders.module.ts apps/api/src/modules/whatsapp/whatsapp.module.ts apps/api/src/modules/orders/orders.service.ts apps/api/test/orders.e2e-spec.ts
git commit -m "feat(orders): notify sender over WhatsApp on order approval/rejection"
```

---

### Task 8: Nora — order confirmation gate (planner + router)

**Files:**
- Modify: `agents/nora/src/operation/planner.py`
- Modify: `agents/nora/src/whatsapp_router.py`
- Test: `agents/nora/tests/test_whatsapp_router.py`

**Interfaces:**
- Consumes: `WhatsAppRouteRequest.open_case` (with `type`, `status`, `extractedData`, `missingFields`), `NoraCaseTransition`.
- Produces:
  - When an order is first detected (intent `pedido`, customer present, items present) and there is NO open order case: the router returns `case_transition` with `action="start_case"`, `type="order"`, `extractedData` = the order candidate fields, `lastQuestion` = order summary + "¿confirmas el pedido?" — and DOES NOT emit `order_candidate`.
  - When `open_case.type == "order"` and `open_case.status == "ready_for_review"` and the message is a confirmation word: the router emits `order_candidate` (built from `open_case.extractedData`) so automation runs.

- [ ] **Step 1: Write the failing tests**

Add to `agents/nora/tests/test_whatsapp_router.py`:

```python
def test_first_order_message_starts_case_and_asks_confirmation():
    result = route_whatsapp_message(
        {
            "sender_type": "cliente",
            "message": "Necesito 10 bultos de FERT-001",
            "conversation_id": "conv-1",
            "customer": {"id": "customer-1", "displayName": "Agro Norte"},
            "companies": [{"id": "company-nt", "name": "Nortech", "prefix": "NT"}],
        }
    )
    assert result["intent"] == "pedido"
    assert result["order_candidate"] is None
    assert result["case_transition"]["action"] == "start_case"
    assert result["case_transition"]["type"] == "order"
    assert "confirm" in result["suggested_reply"].lower()


def test_confirmation_on_open_order_case_emits_candidate():
    result = route_whatsapp_message(
        {
            "sender_type": "cliente",
            "message": "si, confirmo",
            "conversation_id": "conv-1",
            "customer": {"id": "customer-1", "displayName": "Agro Norte"},
            "companies": [{"id": "company-nt", "name": "Nortech", "prefix": "NT"}],
            "open_case": {
                "id": "case-1",
                "type": "order",
                "status": "ready_for_review",
                "extractedData": {
                    "customerId": "customer-1",
                    "companyRef": "Nortech",
                    "items": [{"productRef": "FERT-001", "quantity": 10}],
                },
                "missingFields": [],
            },
        }
    )
    assert result["intent"] == "pedido"
    assert result["order_candidate"] is not None
    assert result["order_candidate"]["items"][0]["productRef"] == "FERT-001"
    assert result["order_candidate"]["customerId"] == "customer-1"
```

- [ ] **Step 2: Run them and watch them fail**

Run (from `agents/nora`): `python -m pytest tests/test_whatsapp_router.py -k "order_case or starts_case or emits_candidate" -v`
Expected: FAIL — today the first message emits `order_candidate` immediately and there is no order `case_transition`.

- [ ] **Step 3: Add confirmation-word handling for open order cases in the planner**

In `agents/nora/src/operation/planner.py`, add a module-level set (near the other `*_WORDS`):

```python
CONFIRM_WORDS = (
    "si",
    "sí",
    "confirmo",
    "confirmar",
    "dale",
    "ok",
    "okay",
    "listo",
    "de acuerdo",
    "correcto",
    "perfecto",
    "asi es",
)
```

Add a helper:

```python
def _is_order_confirmation(normalized_message: str) -> bool:
    normalized = _normalize_phrase(normalized_message)
    return any(normalized == _normalize_phrase(word) for word in CONFIRM_WORDS) or any(
        word in normalized for word in ("si confirmo", "confirmo el pedido", "confirmo")
    )
```

At the TOP of `plan_message` (right after computing `normalized`/`normalized_context`, before the existing `open_case ... order ... _wants_new_customer` block at line 55), add:

```python
    if (
        request.open_case
        and request.open_case.type == "order"
        and request.open_case.status == "ready_for_review"
        and _is_order_confirmation(normalized)
    ):
        extracted = request.open_case.extractedData or {}
        return NoraPlan(
            intent="pedido",
            actions=[
                PlannedAction(
                    domain="orders",
                    action="resolve_and_create_from_whatsapp",
                    fields={
                        "customer_id": extracted.get("customerId") or _customer_id(request),
                        "company_ref": extracted.get("companyRef"),
                        "company_id": extracted.get("companyId"),
                        "customer_zone_id": extracted.get("customerZoneId"),
                        "zone_ref": extracted.get("zoneRef"),
                        "customer_ref": extracted.get("customerRef"),
                        "items": extracted.get("items", []),
                        "notes": extracted.get("notes"),
                        "source_conversation_id": request.conversation_id,
                    },
                    confidence=0.9,
                )
            ],
            summary="Confirmacion de pedido recibida; se procede a crear.",
        )
```

- [ ] **Step 4: Carry `customer_ref` into the order candidate**

In `agents/nora/src/whatsapp_router.py`, in `_order_candidate_for_action` (line 167), add `customerRef` to the returned `NoraOrderCandidate`:

```python
    return NoraOrderCandidate(
        customerId=action.fields.get("customer_id"),
        customerRef=action.fields.get("customer_ref"),
        companyRef=action.fields.get("company_ref"),
        customerZoneId=action.fields.get("customer_zone_id"),
        zoneRef=action.fields.get("zone_ref"),
        items=items,
        notes=action.fields.get("notes"),
        sourceConversationId=action.fields.get("source_conversation_id"),
    )
```

Add the field to `NoraOrderCandidate` in `agents/nora/src/models/whatsapp_models.py` (after `companyRef`):

```python
    customerRef: str | None = None
```

And mirror it in the backend extractor (`nora-routing.service.ts` `extractOrderCandidate`, after the `companyRef` spread):

```ts
      ...(this.stringValue(source.customerRef) && {
        customerRef: this.stringValue(source.customerRef),
      }),
```

- [ ] **Step 5: Start the order case (and withhold the candidate) on first detection**

In `whatsapp_router.py` `_case_transition_for` (line 201), add a branch that fires when the plan is a fresh order (no open order case). Insert before the final `return None`:

```python
    if (
        plan.intent == "pedido"
        and not (request.open_case and request.open_case.type == "order")
    ):
        order_action = next(
            (
                action
                for action in plan.actions
                if action.domain == "orders"
                and action.action == "resolve_and_create_from_whatsapp"
            ),
            None,
        )
        if order_action and order_action.fields.get("items"):
            return NoraCaseTransition(
                action="start_case",
                type="order",
                extractedData={
                    "customerId": order_action.fields.get("customer_id"),
                    "companyRef": order_action.fields.get("company_ref"),
                    "companyId": order_action.fields.get("company_id"),
                    "customerZoneId": order_action.fields.get("customer_zone_id"),
                    "zoneRef": order_action.fields.get("zone_ref"),
                    "items": order_action.fields.get("items", []),
                    "notes": order_action.fields.get("notes"),
                },
                missingFields=[],
                lastQuestion=_order_confirmation_question(order_action),
            )
    return None
```

Add the helper at the bottom of `whatsapp_router.py`:

```python
def _order_confirmation_question(action: PlannedAction) -> str:
    lines = []
    for item in action.fields.get("items", []):
        qty = item.get("quantity")
        ref = item.get("product_ref") or item.get("productRef")
        lines.append(f"- {qty} x {ref}")
    detail = "\n".join(lines)
    return f"Voy a registrar este pedido:\n{detail}\n¿Confirmas el pedido? (responde 'sí' para crearlo)"
```

Import `PlannedAction` is already imported in `whatsapp_router.py` (line 12).

- [ ] **Step 6: Withhold `order_candidate` until confirmation**

In `whatsapp_router.py` `route_whatsapp_message`, the `order_candidate` is computed at line 76. Gate it so it is only set when there is an open order case in `ready_for_review` (i.e. a confirmation turn). Replace the `order_candidate = next(...)` assignment with:

```python
    is_order_confirmation_turn = bool(
        request.open_case
        and request.open_case.type == "order"
        and request.open_case.status == "ready_for_review"
    )
    order_candidate = (
        next(
            (
                candidate
                for candidate in (
                    _order_candidate_for_action(action) for action in plan.actions
                )
                if candidate is not None
            ),
            None,
        )
        if is_order_confirmation_turn
        else None
    )
```

- [ ] **Step 7: Run the tests to verify they pass**

Run (from `agents/nora`): `python -m pytest tests/test_whatsapp_router.py -v`
Expected: PASS, including the two new tests and the pre-existing ones (the existing `test_cliente_mode_extracts_order_intent` asserts `proposed_order` and `intent == "pedido"`, which still hold — `proposed_order` comes from proposals, not the gated `order_candidate`).

- [ ] **Step 8: Commit**

```bash
git add agents/nora/src/operation/planner.py agents/nora/src/whatsapp_router.py agents/nora/src/models/whatsapp_models.py apps/api/src/modules/whatsapp/nora-routing.service.ts agents/nora/tests/test_whatsapp_router.py
git commit -m "feat(nora): gate order creation behind a WhatsApp confirmation case"
```

---

### Task 9: Nora — comercial customer collection on order cases

**Files:**
- Modify: `agents/nora/src/operation/planner.py`
- Modify: `agents/nora/src/whatsapp_router.py`
- Test: `agents/nora/tests/test_whatsapp_router.py`

**Interfaces:**
- Consumes: order case context from Task 8.
- Produces:
  - When `sender_type == "comercial"`, intent is a fresh order, and no customer is resolved: start an order case with `missingFields=["customerRef"]`, `status` collecting (the default), and ask "¿Para qué cliente es el pedido?".
  - When `open_case.type == "order"` and `"customerRef" in open_case.missingFields` and the message is not a confirmation: emit `case_transition action="update_case"` storing `extractedData.customerRef = message` and re-ask for confirmation.

- [ ] **Step 1: Write the failing tests**

Add to `agents/nora/tests/test_whatsapp_router.py`:

```python
def test_comercial_order_without_customer_starts_case_asking_customer():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "necesito 10 bultos de FERT-001 por Nortech",
            "conversation_id": "conv-2",
            "user": {"id": "sergio", "role": "comercial", "name": "Sergio", "email": "s@n.local"},
            "companies": [{"id": "company-nt", "name": "Nortech", "prefix": "NT"}],
        }
    )
    assert result["case_transition"]["action"] == "start_case"
    assert result["case_transition"]["type"] == "order"
    assert result["case_transition"]["missingFields"] == ["customerRef"]
    assert "cliente" in result["suggested_reply"].lower()


def test_comercial_replies_customer_updates_order_case():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "Es para Agro Norte",
            "conversation_id": "conv-2",
            "user": {"id": "sergio", "role": "comercial", "name": "Sergio", "email": "s@n.local"},
            "companies": [{"id": "company-nt", "name": "Nortech", "prefix": "NT"}],
            "open_case": {
                "id": "case-2",
                "type": "order",
                "status": "collecting_info",
                "extractedData": {"companyRef": "Nortech", "items": [{"productRef": "FERT-001", "quantity": 10}]},
                "missingFields": ["customerRef"],
            },
        }
    )
    assert result["case_transition"]["action"] == "update_case"
    assert result["case_transition"]["caseId"] == "case-2"
    assert result["case_transition"]["extractedData"]["customerRef"] == "Es para Agro Norte"
    assert "confirm" in result["suggested_reply"].lower()
```

- [ ] **Step 2: Run them and watch them fail**

Run (from `agents/nora`): `python -m pytest tests/test_whatsapp_router.py -k "comercial_order_without_customer or comercial_replies_customer" -v`
Expected: FAIL.

- [ ] **Step 3: Planner — detect "providing customer" turn**

In `planner.py`, at the TOP of `plan_message` (after the confirmation branch from Task 8), add:

```python
    if (
        request.open_case
        and request.open_case.type == "order"
        and "customerRef" in (request.open_case.missingFields or [])
        and not _is_order_confirmation(normalized)
    ):
        return NoraPlan(
            intent="continuar_caso",
            actions=[],
            summary="El comercial indica el cliente del pedido en curso.",
        )
```

- [ ] **Step 4: Router — start order case with missing customer for comerciales**

In `whatsapp_router.py` `_case_transition_for`, extend the fresh-order branch (added in Task 8) so that when the order has no customer and the sender is a comercial, it marks `customerRef` missing and asks for the customer instead of confirmation. Replace the `lastQuestion=_order_confirmation_question(order_action)` line and the `missingFields=[]` with:

```python
                missingFields=(
                    []
                    if order_action.fields.get("customer_id")
                    else ["customerRef"]
                ),
                lastQuestion=(
                    _order_confirmation_question(order_action)
                    if order_action.fields.get("customer_id")
                    else "¿Para qué cliente es el pedido? Dime el nombre o NIT."
                ),
```

- [ ] **Step 5: Router — update order case when the comercial replies the customer**

In `whatsapp_router.py` `_case_transition_for`, add a branch (before the fresh-order branch) for the "providing customer" turn:

```python
    if (
        request.open_case
        and request.open_case.type == "order"
        and plan.intent == "continuar_caso"
        and "customerRef" in (request.open_case.missingFields or [])
    ):
        return NoraCaseTransition(
            action="update_case",
            caseId=request.open_case.id,
            type="order",
            extractedData={"customerRef": request.message.strip()},
            missingFields=[],
            lastQuestion=(
                "Gracias. ¿Confirmas el pedido para ese cliente? "
                "(responde 'sí' para crearlo)"
            ),
        )
```

- [ ] **Step 6: Router — suggested reply uses the case question for `continuar_caso` on order cases**

The backend already prefers `case_transition.lastQuestion` for the reply (`extractSuggestedReply`), but the Python `_suggested_reply_for` is used for `response.suggested_reply`. In `_suggested_reply_for`, add at the start of the `continuar_caso` branch (line 283):

```python
    if intent == "continuar_caso":
        if request and request.open_case and request.open_case.type == "order":
            return (
                "Gracias. ¿Confirmas el pedido para ese cliente? "
                "(responde 'sí' para crearlo)"
            )
```

(keep the existing expense/new_customer lines after this.)

- [ ] **Step 7: Run the tests to verify they pass**

Run (from `agents/nora`): `python -m pytest tests/test_whatsapp_router.py -v`
Expected: PASS (all tests, new and old).

- [ ] **Step 8: Commit**

```bash
git add agents/nora/src/operation/planner.py agents/nora/src/whatsapp_router.py agents/nora/tests/test_whatsapp_router.py
git commit -m "feat(nora): collect the customer for comercial order cases before confirming"
```

---

### Task 10: Backend — persist order cases & trigger automation only on confirmation

**Files:**
- Modify: `apps/api/src/modules/whatsapp/nora-routing.service.ts`
- Test: `apps/api/test/whatsapp.e2e-spec.ts`

**Interfaces:**
- Consumes: `NoraCaseService.createCase/updateCase/findOpenCase`, `WhatsAppOrderAutomationService.process` (Task 3).
- Produces:
  - `processCaseTransition` now supports `start_case` and `update_case` for `type: "order"` (currently only expense is handled in `start_case`).
  - On a confirmation turn (automation `decision === "created"`), the open order case is marked `executed`.
  - For `sender_type === "desconocido"`, no order automation runs and the conversation `status` is set to `pendiente` (human handoff).

- [ ] **Step 1: Write the failing test**

Add to `apps/api/test/whatsapp.e2e-spec.ts` a test that posts (or invokes the routing service with) a desconocido inbound message and asserts the conversation is set to `pendiente` and no order is created. Use the suite's existing way of invoking routing (it mocks the Nora HTTP call via `fetch`; if the suite stubs `requestNoraRoute`/`fetch`, return a Nora response with `intent: "primer_contacto"`). Assert `whatsAppConversation.update` was called with `{ status: "pendiente" }` for the desconocido conversation.

```ts
it("routes unknown senders to human review (status pendiente) without creating an order", async () => {
  conversationUpdates.length = 0; // array the whatsAppConversation.update mock pushes into
  await routing.routeInboundMessage({
    conversation: { id: "conversation-unassigned", phone: "+99", ...baseConversation },
    message: { id: "m1", body: "hola", payload: {} } as any,
  });
  expect(
    conversationUpdates.some((u) => u.where.id === "conversation-unassigned" && u.data.status === "pendiente"),
  ).toBe(true);
  expect(ordersCreated).toHaveLength(0);
});
```

(Adapt to the suite's existing invocation/mocks. `routing = moduleRef.get(NoraRoutingService)`.)

- [ ] **Step 2: Run it and watch it fail**

Run (from `apps/api`): `npm test -- whatsapp.e2e-spec.ts`
Expected: FAIL — desconocido path does not set `pendiente`.

- [ ] **Step 3: Handle desconocido handoff**

In `nora-routing.service.ts` `routeInboundMessage`, right after `await this.updateConversationIdentity(...)` (line 47), add:

```ts
    if (sender.senderType === WhatsAppSenderType.desconocido) {
      await this.prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: { status: "pendiente" },
      });
    }
```

- [ ] **Step 4: Support order cases in `processCaseTransition`**

In `processCaseTransition`, generalize the `start_case` branch (line 258) to also handle `type === "order"`. Replace the expense-only `start_case` block with:

```ts
    if (action === "start_case") {
      const type = this.stringValue(source.type);
      if (type === NoraConversationCaseType.expense) {
        const attachment = this.caseAttachmentFromMessage(message);
        return this.noraCaseService.createCase({
          conversationId,
          type: NoraConversationCaseType.expense,
          extractedData: this.objectValue(source.extractedData) ?? {},
          missingFields: this.stringArrayValue(source.missingFields),
          attachments: attachment ? [attachment] : [],
          lastQuestion: this.stringValue(source.lastQuestion) ?? null,
          riskLevel: "medium",
          createdByUserId: actorUserId,
        });
      }
      if (type === NoraConversationCaseType.order) {
        const missingFields = this.stringArrayValue(source.missingFields);
        return this.noraCaseService.createCase({
          conversationId,
          type: NoraConversationCaseType.order,
          status:
            missingFields.length === 0
              ? NoraConversationCaseStatus.ready_for_review
              : NoraConversationCaseStatus.collecting_info,
          extractedData: this.objectValue(source.extractedData) ?? {},
          missingFields,
          lastQuestion: this.stringValue(source.lastQuestion) ?? null,
          riskLevel: "high",
          createdByUserId: actorUserId,
        });
      }
      return undefined;
    }
```

For `update_case` (line 272), when the resulting case has no missing fields, also flip it to `ready_for_review` so the next confirmation turn is recognized. Replace the `updateCase` call with:

```ts
      const nextMissing = this.stringArrayValue(source.missingFields);
      return this.noraCaseService.updateCase(caseId, {
        extractedData: this.objectValue(source.extractedData) ?? {},
        missingFields: nextMissing,
        lastQuestion: this.stringValue(source.lastQuestion) ?? null,
        ...(existingCase.type === NoraConversationCaseType.order &&
          nextMissing.length === 0 && {
            status: NoraConversationCaseStatus.ready_for_review,
          }),
      });
```

Add `NoraConversationCaseStatus` to the imports from `@prisma/client` at the top of `nora-routing.service.ts`.

- [ ] **Step 5: Mark the order case executed after creation**

In `routeInboundMessage`, after computing `automationResult` (line 104-108), add:

```ts
      if (automationResult?.decision === "created") {
        const orderCase = await this.noraCaseService.findOpenCase(conversation.id);
        if (orderCase && orderCase.type === NoraConversationCaseType.order) {
          await this.noraCaseService.updateCase(orderCase.id, {
            status: NoraConversationCaseStatus.executed,
          });
        }
      }
```

> `findOpenCase` only returns cases in `openNoraCaseStatuses` (collecting_info/ready_for_review/blocked), so a `ready_for_review` order case is found at confirmation time and moved to `executed`.

- [ ] **Step 6: Run the test to verify it passes**

Run (from `apps/api`): `npm test -- whatsapp.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 7: Run the whole backend suite**

Run (from `apps/api`): `npm test`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/whatsapp/nora-routing.service.ts apps/api/test/whatsapp.e2e-spec.ts
git commit -m "feat(whatsapp): persist order cases, gate automation on confirmation, hand off unknown senders"
```

---

### Task 11: Frontend — "Pedidos en revisión" queue + detail actions

**Files:**
- Create: `apps/web/src/app/(app)/orders/review/page.tsx`
- Create: `apps/web/src/components/orders/order-review-list.tsx`
- Create: `apps/web/src/components/orders/order-review-actions.tsx`
- Modify: `apps/web/src/app/(app)/orders/[id]/page.tsx` (render review actions when `approvalStatus === "en_revision"`)
- Test: `apps/web/tests` (Playwright) — optional smoke; primary verification is manual + the API tests above.

**Interfaces:**
- Consumes: `GET /orders/review-queue`, `PATCH /orders/:id/items/:itemId/resolve`, `PATCH /orders/:id/approve`, `PATCH /orders/:id/reject` via `apiFetchClient`.
- Produces: a review queue page (role-gated to `administrador`/`facturacion`) and per-order actions to resolve items, approve, reject.

- [ ] **Step 1: Build the review-actions client component**

Create `apps/web/src/components/orders/order-review-actions.tsx`, following the existing `order-actions.tsx` pattern (`"use client"`, `apiFetchClient`, `getSessionTokenClient`/`getUserRoleFromToken`, `useRouter`, `Button`):

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { getSessionTokenClient, getUserRoleFromToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";

interface ReviewItem {
  id: string;
  productSnapshotName: string;
  customProductName: string | null;
  quantity: string | number;
  needsResolution: boolean;
}

interface OrderReviewActionsProps {
  orderId: string;
  approvalStatus: string | null;
  items: ReviewItem[];
}

const reviewRoles = ["administrador", "facturacion"];

export function OrderReviewActions({ orderId, approvalStatus, items }: OrderReviewActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const role = getUserRoleFromToken(getSessionTokenClient());
  if (approvalStatus !== "en_revision" || !role || !reviewRoles.includes(role)) {
    return null;
  }

  const unresolved = items.filter((item) => item.needsResolution);

  async function resolveItem(itemId: string, productId: string, unitPrice: number) {
    setError(null);
    setLoading(true);
    const res = await apiFetchClient(`/orders/${orderId}/items/${itemId}/resolve`, {
      method: "PATCH",
      body: JSON.stringify({ productId, unitPrice }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || "Error al resolver el ítem");
      return;
    }
    router.refresh();
  }

  async function approve() {
    setError(null);
    setLoading(true);
    const res = await apiFetchClient(`/orders/${orderId}/approve`, { method: "PATCH" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || "No se pudo aprobar");
      return;
    }
    router.refresh();
  }

  async function reject() {
    setError(null);
    setLoading(true);
    const res = await apiFetchClient(`/orders/${orderId}/reject`, {
      method: "PATCH",
      body: JSON.stringify({ reason: rejectReason }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || "No se pudo rechazar");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h3 className="font-medium">Revisión del pedido</h3>
      {unresolved.length > 0 && (
        <p className="text-sm text-amber-600">
          {unresolved.length} ítem(s) sin resolver. Resuélvelos antes de aprobar.
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={approve} disabled={loading || unresolved.length > 0}>
          Aprobar
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <textarea
          className="rounded border p-2 text-sm"
          placeholder="Motivo del rechazo"
          value={rejectReason}
          onChange={(event) => setRejectReason(event.target.value)}
        />
        <Button variant="destructive" onClick={reject} disabled={loading || !rejectReason.trim()}>
          Rechazar
        </Button>
      </div>
    </div>
  );
}
```

> Item resolution UI: render a product selector per unresolved item that calls `resolveItem(item.id, selectedProductId, price)`. Reuse the product picker used in `order-form.tsx` (import the same component/select it uses). If `order-form.tsx` uses a plain product fetch + `<select>`, replicate that minimal pattern here rather than introducing a new dependency.

- [ ] **Step 2: Render the actions on the order detail page**

In `apps/web/src/app/(app)/orders/[id]/page.tsx`, where the order is rendered, add the component (server page passes the already-fetched order):

```tsx
import { OrderReviewActions } from "@/components/orders/order-review-actions";
// ...
<OrderReviewActions
  orderId={order.id}
  approvalStatus={order.approvalStatus}
  items={order.items}
/>
```

- [ ] **Step 3: Build the review queue list + page**

Create `apps/web/src/components/orders/order-review-list.tsx` (`"use client"`), fetching `GET /orders/review-queue` with `apiFetchClient` on mount (`useEffect`), rendering a table with: order number, customer name, company, count of unresolved items, and a link to `/orders/{id}`. Follow the table styling used by `seller-goals-dashboard.tsx`.

Create `apps/web/src/app/(app)/orders/review/page.tsx`:

```tsx
import { OrderReviewList } from "@/components/orders/order-review-list";

export default function OrderReviewPage() {
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">Pedidos en revisión</h1>
      <OrderReviewList />
    </div>
  );
}
```

- [ ] **Step 4: Add navigation entry (if a sidebar/nav exists)**

Find the app nav (search `apps/web/src` for the orders nav link) and add a "Pedidos en revisión" link to `/orders/review`, gated to roles `administrador`/`facturacion` the same way other role-gated links are rendered. If no role-gated nav pattern exists, link it unconditionally — the page's API calls are already role-protected server-side.

- [ ] **Step 5: Verify the build**

Run (from `apps/web`): `npm run build`
Expected: build succeeds with no type errors in the new files.

- [ ] **Step 6: Manual smoke (optional but recommended)**

Use the `verify` skill or run the app: log in as `facturacion`, open `/orders/review`, open an order with an unresolved item, resolve it, approve it, and confirm the order advances to `orden_facturacion`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/\(app\)/orders/review apps/web/src/components/orders/order-review-list.tsx apps/web/src/components/orders/order-review-actions.tsx "apps/web/src/app/(app)/orders/[id]/page.tsx"
git commit -m "feat(web): pedidos en revisión queue and approve/reject/resolve actions"
```

---

## Self-Review

**Spec coverage:**
- Confirmation gate (spec A) → Tasks 8, 10. ✅
- Comercial customer collection / desconocido handoff (spec A) → Tasks 9 (Nora), 10 (handoff). ✅
- `OrderItem.needsResolution` + totals partial (spec B) → Tasks 1, 2, 4. ✅
- Review API: review-queue, resolve item, approve, reject (spec C) → Tasks 4, 5, 6. ✅
- WhatsApp notification on approve/reject (spec C) → Task 7. ✅
- Unresolved products no longer block (spec E) → Task 3. ✅
- Useful error propagation (spec E) → Task 3 returns `human_review` with the real reason for ambiguous customer; product failures now never error. ✅ (Order creation errors still surface via the existing catch in `process`.)
- Frontend queue + detail (spec D) → Task 11. ✅

**Placeholder scan:** No "TBD"/"implement later". Two soft spots are explicitly bounded: the product-picker reuse in Task 11 Step 1 (instructed to copy `order-form.tsx`'s existing pattern) and the e2e harness extensions (instructed to follow the existing in-memory mock pattern in each suite). These are deliberate references to existing code, not missing logic.

**Type consistency:** `customerRef` added in Nora model, Nora router candidate, and backend `extractOrderCandidate` + `ProcessOrderAutomationDto` (Tasks 3, 8). `needsResolution` consistent across schema (Task 1), `CreateOrderItemDto` (Task 2), automation payload (Task 3), service create/resolve (Tasks 2, 4), approve guard (Task 5), and frontend interface (Task 11). Case statuses use the existing `NoraConversationCaseStatus` enum values throughout (Tasks 8, 10). Service method names (`resolveOrderItem`, `findReviewQueue`, `approveOrder`, `rejectOrder`) match between service (Tasks 4, 5) and controller (Task 6).

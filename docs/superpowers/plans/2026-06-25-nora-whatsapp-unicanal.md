# Nora WhatsApp Unicanal MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first assisted WhatsApp unichannel MVP: an admin inbox where Nora classifies conversations, manages basic order cases, and lets an admin create a review order from a complete case.

**Architecture:** Reuse the existing Kapso webhook, WhatsApp conversation models, Nora routing, Nora cases, and order automation. Add lightweight conversation intent metadata through existing tags/action outputs, expose a case execution endpoint, and upgrade the existing three-column WhatsApp UI into a practical unichannel control surface.

**Tech Stack:** NestJS, Prisma, Next.js App Router, React, TypeScript, Jest/Supertest, Python Nora router tests.

---

## File Structure

- Modify `apps/api/src/modules/whatsapp/whatsapp.service.ts`: add case-based order execution helper, intent tagging helper, and conversation state handling.
- Modify `apps/api/src/modules/whatsapp/whatsapp.controller.ts`: expose `POST /whatsapp/conversations/:id/cases/:caseId/create-order`.
- Modify `apps/api/src/modules/whatsapp/nora-routing.service.ts`: persist Nora intent tags from routing output.
- Modify `apps/api/prisma/schema.prisma`: replace legacy WhatsApp states with unichannel states.
- Create `apps/api/prisma/migrations/20260625000000_whatsapp_unicanal_statuses/migration.sql`: migrate enum/data from `abierto/cerrado` to `en_gestion/resuelto`.
- Modify `apps/api/test/whatsapp.e2e-spec.ts`: add service/controller tests for intent tags and case-based order creation.
- Modify `apps/web/src/components/whatsapp/whatsapp-types.ts`: align statuses with backend and type order case payloads.
- Modify `apps/web/src/components/whatsapp/conversation-list.tsx`: surface status, assignment, intent, and needs-review signal.
- Modify `apps/web/src/components/whatsapp/nora-suggestion-panel.tsx`: replace raw JSON-first case display with operator-friendly fields.
- Modify `apps/web/src/components/whatsapp/order-draft-panel.tsx`: create an order from a ready Nora order case instead of only from legacy proposals.
- Modify `apps/web/src/components/whatsapp/whatsapp-inbox.tsx`: add status/assignment refresh plumbing and keep three-column operations layout.

## Task 1: Migrate WhatsApp Conversation States

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260625000000_whatsapp_unicanal_statuses/migration.sql`
- Test: `apps/api/test/whatsapp.e2e-spec.ts`

- [ ] **Step 1: Write the failing test**

In `apps/api/test/whatsapp.e2e-spec.ts`, add a status update test near the conversation update tests:

```ts
it("updates a WhatsApp conversation to unichannel states", async () => {
  const response = await request(app.getHttpServer())
    .patch("/whatsapp/conversations/conversation-1")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ status: "en_gestion" })
    .expect(200);

  expect(response.body.status).toBe("en_gestion");

  const resolved = await request(app.getHttpServer())
    .patch("/whatsapp/conversations/conversation-1")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ status: "resuelto" })
    .expect(200);

  expect(resolved.body.status).toBe("resuelto");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts -t "updates a WhatsApp conversation to unichannel states"`

Expected: FAIL because `WhatsAppConversationStatus` still accepts `abierto/cerrado`, not `en_gestion/resuelto`.

- [ ] **Step 3: Update Prisma enum**

In `apps/api/prisma/schema.prisma`, replace the existing enum:

```prisma
enum WhatsAppConversationStatus {
  nuevo
  abierto
  pendiente
  cerrado
}
```

with:

```prisma
enum WhatsAppConversationStatus {
  nuevo
  pendiente
  en_gestion
  resuelto
}
```

- [ ] **Step 4: Add migration SQL**

Create `apps/api/prisma/migrations/20260625000000_whatsapp_unicanal_statuses/migration.sql`:

```sql
CREATE TYPE "WhatsAppConversationStatus_new" AS ENUM (
  'nuevo',
  'pendiente',
  'en_gestion',
  'resuelto'
);

ALTER TABLE "WhatsAppConversation"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "WhatsAppConversation"
  ALTER COLUMN "status" TYPE "WhatsAppConversationStatus_new"
  USING (
    CASE "status"::text
      WHEN 'abierto' THEN 'en_gestion'
      WHEN 'cerrado' THEN 'resuelto'
      ELSE "status"::text
    END
  )::"WhatsAppConversationStatus_new";

ALTER TYPE "WhatsAppConversationStatus" RENAME TO "WhatsAppConversationStatus_old";
ALTER TYPE "WhatsAppConversationStatus_new" RENAME TO "WhatsAppConversationStatus";

ALTER TABLE "WhatsAppConversation"
  ALTER COLUMN "status" SET DEFAULT 'nuevo';

DROP TYPE "WhatsAppConversationStatus_old";
```

- [ ] **Step 5: Update test fixtures**

In `apps/api/test/whatsapp.e2e-spec.ts`, replace fixture/status expectations that use `abierto` with `en_gestion` and `cerrado` with `resuelto`.

```ts
status: WhatsAppConversationStatus.en_gestion
```

and:

```ts
status: WhatsAppConversationStatus.resuelto
```

- [ ] **Step 6: Run the focused test**

Run: `pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts -t "updates a WhatsApp conversation to unichannel states"`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260625000000_whatsapp_unicanal_statuses/migration.sql apps/api/test/whatsapp.e2e-spec.ts
git commit -m "feat: add unicanal whatsapp conversation states"
```

## Task 2: Persist Conversation Intent Tags From Nora Routing

**Files:**
- Modify: `apps/api/src/modules/whatsapp/nora-routing.service.ts`
- Test: `apps/api/test/whatsapp.e2e-spec.ts`

- [ ] **Step 1: Write the failing test**

Add a test in `apps/api/test/whatsapp.e2e-spec.ts` near the routing/webhook tests. The test should mock a Nora route response with `intent: "pedido"` and assert the conversation receives a `pedido` tag.

```ts
it("stores Nora intent as a conversation tag", async () => {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      mode: "cliente",
      intent: "pedido",
      summary: "Cliente solicita pedido",
      suggested_reply: "Recibido. Voy a validar los datos del pedido.",
      requires_human_review: true,
      risk_level: "high",
      missing_fields: [],
      proposals: [],
      case_transition: null,
    }),
  } as Response);

  await request(app.getHttpServer())
    .post("/whatsapp/webhooks/kapso")
    .send({
      type: "whatsapp.message.received",
      data: [{
        phone_number_id: "phone-1",
        message: {
          id: "wamid-intent-1",
          from: "573001112233",
          text: { body: "Necesito 5 bultos de FERT-001" },
        },
      }],
    })
    .expect(201);

  const detail = await request(app.getHttpServer())
    .get("/whatsapp/conversations/conversation-1")
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(200);

  expect(detail.body.tags).toEqual(
    expect.arrayContaining([expect.objectContaining({ label: "pedido" })]),
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts -t "stores Nora intent as a conversation tag"`

Expected: FAIL because `NoraRoutingService` does not persist intent tags yet.

- [ ] **Step 3: Implement intent tag persistence**

In `apps/api/src/modules/whatsapp/nora-routing.service.ts`, after `const output = { ... }` and before updating the action log, call a helper:

```ts
await this.persistIntentTag(conversation.id, noraResponse);
```

Add this private method inside `NoraRoutingService`:

```ts
private async persistIntentTag(
  conversationId: string,
  noraResponse: Record<string, unknown>,
) {
  const intent = this.stringValue(noraResponse.intent);
  const allowed = new Set(["pedido", "cartera", "logistica", "gasto", "reclamo", "otro"]);
  const label = intent && allowed.has(intent) ? intent : intent ? "otro" : null;

  if (!label) {
    return;
  }

  await this.prisma.whatsAppConversationTag.upsert({
    where: { conversationId_label: { conversationId, label } },
    update: {},
    create: { conversationId, label },
  });
}
```

- [ ] **Step 4: Run the focused test**

Run: `pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts -t "stores Nora intent as a conversation tag"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/whatsapp/nora-routing.service.ts apps/api/test/whatsapp.e2e-spec.ts
git commit -m "feat: tag whatsapp conversations by nora intent"
```

## Task 3: Add Case-Based Order Creation Endpoint

**Files:**
- Modify: `apps/api/src/modules/whatsapp/whatsapp.service.ts`
- Modify: `apps/api/src/modules/whatsapp/whatsapp.controller.ts`
- Test: `apps/api/test/whatsapp.e2e-spec.ts`

- [ ] **Step 1: Write the failing service test**

Add a test that creates a ready order case with extracted data and calls the new endpoint:

```ts
it("creates a review order from a ready Nora order case", async () => {
  const response = await request(app.getHttpServer())
    .post("/whatsapp/conversations/conversation-1/cases/case-order-ready/create-order")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({})
    .expect(201);

  expect(response.body.decision).toBe("created");
  expect(response.body.order).toEqual(expect.objectContaining({ approvalStatus: "en_revision" }));
  expect(response.body.case.status).toBe("executed");
  expect(response.body.case.executedEntityType).toBe("Order");
});
```

Extend the fixture `noraCases` with:

```ts
{
  id: "case-order-ready",
  conversationId: "conversation-1",
  parentCaseId: null,
  type: "order",
  status: "ready_for_review",
  extractedData: {
    customerId: "customer-1",
    companyRef: "Norgtech",
    customerZoneId: "customer-zone-1",
    items: [{ productRef: "FERT-001", quantity: 5, presentation: "bultos" }],
    notes: "Pedido desde WhatsApp",
  },
  missingFields: [],
  attachments: [],
  proposal: null,
  lastQuestion: null,
  riskLevel: "high",
  createdByUserId: "sales-user-id",
  approvedByUserId: null,
  executedEntityType: null,
  executedEntityId: null,
  createdAt: new Date("2026-06-21T16:20:00.000Z"),
  updatedAt: new Date("2026-06-21T16:20:00.000Z"),
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts -t "creates a review order from a ready Nora order case"`

Expected: FAIL with 404 because the endpoint does not exist.

- [ ] **Step 3: Add controller route**

In `apps/api/src/modules/whatsapp/whatsapp.controller.ts`, add:

```ts
@Post("conversations/:id/cases/:caseId/create-order")
createOrderFromCase(
  @CurrentUser() user: AuthUser,
  @Param("id") id: string,
  @Param("caseId") caseId: string,
) {
  return this.whatsAppService.createOrderFromCase(user, id, caseId);
}
```

- [ ] **Step 4: Add service method**

In `apps/api/src/modules/whatsapp/whatsapp.service.ts`, add:

```ts
async createOrderFromCase(user: AuthUser, conversationId: string, caseId: string) {
  const noraCase = await this.prisma.noraConversationCase.findFirst({
    where: { id: caseId, conversationId },
  });

  if (!noraCase) {
    throw new NotFoundException("Nora case not found");
  }

  if (noraCase.type !== NoraConversationCaseType.order) {
    throw new BadRequestException("Only order cases can create orders");
  }

  if (noraCase.status !== NoraConversationCaseStatus.ready_for_review) {
    throw new BadRequestException("Order case is not ready for review");
  }

  const extracted = noraCase.extractedData as Record<string, unknown>;
  const customerId = this.stringValue(extracted.customerId);
  if (customerId) {
    await this.prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: { customerId },
    });
  }

  const items = Array.isArray(extracted.items) ? extracted.items : [];
  const dto: ProcessOrderAutomationDto = {
    customerRef: this.stringValue(extracted.customerRef),
    companyRef: this.stringValue(extracted.companyRef),
    customerZoneId: this.stringValue(extracted.customerZoneId),
    zoneRef: this.stringValue(extracted.zoneRef),
    deliveryInstructions: this.stringValue(extracted.deliveryInstructions),
    notes: this.stringValue(extracted.notes),
    items: items
      .map((item) => this.orderAutomationItemFromCase(item))
      .filter((item): item is NonNullable<typeof item> => item !== null),
  };

  const result = await this.orderAutomation.process(user, conversationId, dto);

  if (result.decision === "created") {
    const orderId = typeof result.order?.id === "string" ? result.order.id : null;
    const updatedCase = await this.noraCaseService.updateCase(caseId, {
      status: NoraConversationCaseStatus.executed,
      approvedByUserId: user.id,
      executedEntityType: "Order",
      executedEntityId: orderId,
    });
    await this.sendAgentReply(
      conversationId,
      result.reply ?? "Recibimos tu pedido y queda en revision.",
    );
    return { ...result, case: updatedCase };
  }

  return { ...result, case: noraCase };
}
```

Add helpers in the same class:

```ts
private orderAutomationItemFromCase(item: unknown) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return null;
  }

  const source = item as Record<string, unknown>;
  const productRef = this.stringValue(source.productRef) ?? this.stringValue(source.product_ref);
  const quantity = this.numberValue(source.quantity);

  if (!productRef || quantity === null || quantity <= 0) {
    return null;
  }

  return {
    productRef,
    quantity,
    presentation: this.stringValue(source.presentation),
    notes: this.stringValue(source.notes),
  };
}

private stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

private numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
```

- [ ] **Step 5: Run focused test**

Run: `pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts -t "creates a review order from a ready Nora order case"`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/whatsapp/whatsapp.controller.ts apps/api/src/modules/whatsapp/whatsapp.service.ts apps/api/test/whatsapp.e2e-spec.ts
git commit -m "feat: create orders from whatsapp nora cases"
```

## Task 4: Align Frontend WhatsApp Types With Unicanal MVP

**Files:**
- Modify: `apps/web/src/components/whatsapp/whatsapp-types.ts`

- [ ] **Step 1: Update status and case types**

Replace the status type with backend-compatible values:

```ts
export type WhatsAppConversationStatus = "nuevo" | "pendiente" | "en_gestion" | "resuelto";
```

Add a typed order case data shape below `NoraConversationCaseStatus`:

```ts
export type NoraOrderCaseData = {
  customerId?: string;
  customerRef?: string;
  companyId?: string;
  companyRef?: string;
  customerZoneId?: string;
  zoneRef?: string;
  deliveryInstructions?: string;
  notes?: string;
  items?: Array<{
    productRef?: string;
    product_ref?: string;
    quantity?: number;
    presentation?: string;
    notes?: string;
  }>;
};
```

Update `NoraConversationCase.extractedData`:

```ts
extractedData: Record<string, unknown> | NoraOrderCaseData;
```

- [ ] **Step 2: Run type check/build**

Run: `pnpm --filter @norgtech/web build`

Expected: PASS, or FAIL only where frontend still assumes old status values.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/whatsapp/whatsapp-types.ts
git commit -m "chore: align whatsapp frontend types with unicanal states"
```

## Task 5: Upgrade Conversation List for Operations

**Files:**
- Modify: `apps/web/src/components/whatsapp/conversation-list.tsx`

- [ ] **Step 1: Implement operation badges**

Ensure each row shows status, latest intent tag, assigned user, and needs-review signal. Use this helper logic in `conversation-list.tsx`:

```tsx
function latestIntent(conversation: WhatsAppConversation) {
  return conversation.tags?.find((tag) =>
    ["pedido", "cartera", "logistica", "gasto", "reclamo", "otro"].includes(tag.label),
  )?.label;
}

function statusLabel(status: WhatsAppConversation["status"]) {
  const labels = {
    nuevo: "Nuevo",
    pendiente: "Pendiente",
    en_gestion: "En gestión",
    resuelto: "Resuelto",
  };
  return labels[status] ?? status;
}
```

In the row body, include:

```tsx
<div className="mt-2 flex flex-wrap items-center gap-1.5">
  <Badge variant={conversation.status === "nuevo" ? "default" : "secondary"}>
    {statusLabel(conversation.status)}
  </Badge>
  {latestIntent(conversation) ? (
    <Badge variant="outline">{latestIntent(conversation)}</Badge>
  ) : null}
  {conversation.assignedToUser ? (
    <Badge variant="secondary">{conversation.assignedToUser.name}</Badge>
  ) : (
    <Badge variant="outline">Sin asignar</Badge>
  )}
</div>
```

- [ ] **Step 2: Run frontend build**

Run: `pnpm --filter @norgtech/web build`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/whatsapp/conversation-list.tsx
git commit -m "feat: show unicanal signals in whatsapp list"
```

## Task 6: Make Nora Case Panel Operator-Friendly

**Files:**
- Modify: `apps/web/src/components/whatsapp/nora-suggestion-panel.tsx`

- [ ] **Step 1: Add readable order case preview**

Replace the raw JSON-first display in `NoraCasePreview` with field rows for order cases:

```tsx
function OrderCaseFields({ activeCase }: { activeCase: NoraConversationCase }) {
  const data = activeCase.extractedData as Record<string, unknown>;
  const items = Array.isArray(data.items) ? data.items : [];

  return (
    <div className="space-y-2">
      <FieldRow label="Cliente" value={text(data.customerRef) ?? text(data.customerId)} />
      <FieldRow label="Empresa" value={text(data.companyRef) ?? text(data.companyId)} />
      <FieldRow label="Zona/Sede" value={text(data.zoneRef) ?? text(data.customerZoneId)} />
      <FieldRow label="Notas" value={text(data.notes)} />
      <div>
        <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Items</div>
        {items.length > 0 ? (
          <div className="space-y-1">
            {items.map((item, index) => {
              const source = item as Record<string, unknown>;
              return (
                <div key={index} className="rounded border border-border p-2 text-xs">
                  <span className="font-medium">
                    {text(source.productRef) ?? text(source.product_ref) ?? "Producto sin resolver"}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}x {String(source.quantity ?? "sin cantidad")}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">Sin items extraídos</div>
        )}
      </div>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value ?? "Pendiente"}</span>
    </div>
  );
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
```

Render `<OrderCaseFields activeCase={activeCase} />` when `activeCase.type === "order"` and keep the JSON `<pre>` collapsed or removed for MVP.

- [ ] **Step 2: Run frontend build**

Run: `pnpm --filter @norgtech/web build`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/whatsapp/nora-suggestion-panel.tsx
git commit -m "feat: show readable nora order case details"
```

## Task 7: Create Orders From Ready Nora Cases in the UI

**Files:**
- Modify: `apps/web/src/components/whatsapp/order-draft-panel.tsx`

- [ ] **Step 1: Add ready-case detection**

At the top of `OrderDraftPanel`, derive the active ready order case:

```tsx
const readyOrderCase = conversation?.noraCases?.find(
  (noraCase) => noraCase.type === "order" && noraCase.status === "ready_for_review",
) ?? null;
```

Change `canCreateDraft` to allow the ready case:

```tsx
const canCreateFromCase = Boolean(readyOrderCase && !latestOrder);
```

- [ ] **Step 2: Add case execution request**

Add this function:

```tsx
async function createFromCase() {
  if (!conversation?.id || !readyOrderCase || creating) return;
  setCreating(true);
  setError(null);
  try {
    const response = await apiFetchClient(
      `/whatsapp/conversations/${conversation.id}/cases/${readyOrderCase.id}/create-order`,
      { method: "POST", body: JSON.stringify({}) },
    );

    if (!response.ok) {
      setError("No se pudo crear el pedido desde el caso");
      return;
    }

    onCreated?.();
  } finally {
    setCreating(false);
  }
}
```

Render a primary button before the legacy proposal block:

```tsx
{readyOrderCase && !latestOrder ? (
  <div className="space-y-2 rounded-md border border-border p-3">
    <div className="flex items-center justify-between gap-2">
      <div className="text-sm font-semibold">Caso listo para revisión</div>
      <Badge variant="secondary">ready_for_review</Badge>
    </div>
    <Button type="button" size="sm" onClick={createFromCase} disabled={!canCreateFromCase || creating}>
      <FilePlus2 />
      Crear pedido en revisión
    </Button>
    {error ? <div className="text-xs text-destructive">{error}</div> : null}
  </div>
) : null}
```

- [ ] **Step 3: Run frontend build**

Run: `pnpm --filter @norgtech/web build`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/whatsapp/order-draft-panel.tsx
git commit -m "feat: create whatsapp orders from nora cases"
```

## Task 8: Add Conversation Status Controls

**Files:**
- Modify: `apps/web/src/components/whatsapp/whatsapp-inbox.tsx`

- [ ] **Step 1: Add status update helper**

Inside `WhatsAppInbox`, add:

```tsx
async function updateConversationStatus(status: "nuevo" | "pendiente" | "en_gestion" | "resuelto") {
  if (!selectedId) return;
  const response = await apiFetchClient(`/whatsapp/conversations/${selectedId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  if (response.ok) {
    await refreshSelected();
  }
}
```

Pass this function to the right panel if `NoraSuggestionPanel` is extended, or render compact buttons above the right panel:

```tsx
<div className="border-b border-border p-3">
  <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Estado</div>
  <div className="grid grid-cols-2 gap-2">
    {(["pendiente", "en_gestion", "resuelto"] as const).map((status) => (
      <button
        key={status}
        type="button"
        onClick={() => updateConversationStatus(status)}
        className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
      >
        {status}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 2: Run frontend build**

Run: `pnpm --filter @norgtech/web build`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/whatsapp/whatsapp-inbox.tsx
git commit -m "feat: add whatsapp conversation status controls"
```

## Task 9: Full Verification

**Files:**
- No planned code changes unless verification finds failures.

- [ ] **Step 1: Run API WhatsApp tests**

Run: `pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts`

Expected: PASS.

- [ ] **Step 2: Run Nora router tests**

Run: `cd agents/nora && PYTHONPATH=. uv run pytest tests/test_whatsapp_router.py -q`

Expected: PASS.

- [ ] **Step 3: Run frontend build**

Run: `pnpm --filter @norgtech/web build`

Expected: PASS.

- [ ] **Step 4: Commit any verification fixes**

Only if changes were needed:

```bash
git status --short
git add apps/api/src/modules/whatsapp apps/api/test/whatsapp.e2e-spec.ts apps/web/src/components/whatsapp
git commit -m "fix: stabilize nora whatsapp unicanal mvp"
```

## Self-Review

- Spec coverage: inbox signals, statuses, notes/messages, Nora summary, order case review, order creation, linked conversation, and logs are covered by tasks 1-9.
- Out of scope preserved: no payment reconciliation, logistics linking, complaints workflow, full autonomy, or SLA analytics.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation steps remain.
- Type consistency: frontend statuses use `nuevo`, `pendiente`, `en_gestion`, `resuelto`; case creation endpoint path matches controller and UI.

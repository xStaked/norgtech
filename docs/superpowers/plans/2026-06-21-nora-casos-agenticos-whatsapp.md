# Nora Casos Agenticos WhatsApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build persistent Nora WhatsApp cases so Nora can continue order, new-customer, and expense conversations without falling back to the generic greeting.

**Architecture:** Add a `NoraConversationCase` persistence layer in NestJS as the source of truth for open operational work. Python Nora receives the open case and classifies whether a message starts or continues a case; NestJS validates, persists transitions, triggers order/gasto services, and exposes active cases to the inbox. The web inbox renders the active case and proposals while all final writes remain backend-validated and reviewable.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Jest e2e, Python FastAPI/Pydantic/pytest, Next.js React/TypeScript.

---

## File Structure

- Modify `apps/api/prisma/schema.prisma`: add `NoraConversationCase`, enums, and relation from `WhatsAppConversation`.
- Create `apps/api/prisma/migrations/20260621170000_nora_conversation_cases/migration.sql`: SQL for the new model and indexes.
- Create `apps/api/src/modules/whatsapp/dto/nora-case.dto.ts`: DTOs and TypeScript shapes for case transitions.
- Create `apps/api/src/modules/whatsapp/nora-case.service.ts`: focused case manager for open case lookup, merge, validation, and transitions.
- Modify `apps/api/src/modules/whatsapp/whatsapp.module.ts`: provide case service and import commercial expenses module.
- Modify `apps/api/src/modules/whatsapp/whatsapp.service.ts`: include active cases in conversation detail and Nora context.
- Modify `apps/api/src/modules/whatsapp/kapso-webhook.service.ts`: classify image/document metadata and keep attachment payloads useful for expense cases.
- Modify `apps/api/src/modules/whatsapp/nora-routing.service.ts`: route messages through case service before/after Python and create action logs for transitions.
- Modify `apps/api/test/whatsapp.e2e-spec.ts`: add e2e coverage for order/new-customer and expense case continuity using the existing Prisma stub style.
- Modify `agents/nora/src/models/whatsapp_models.py`: add `open_case` request model and case-aware route response fields.
- Modify `agents/nora/src/operation/planner.py`: add continuation detection for `crea uno nuevo`, expense images, expense answers, cancel/change-topic.
- Modify `agents/nora/src/whatsapp_router.py`: return case transition hints and avoid greeting when an open case applies.
- Modify `agents/nora/tests/test_whatsapp_router.py`: add Python unit tests for case continuity.
- Modify `apps/web/src/components/whatsapp/whatsapp-types.ts`: add Nora case types.
- Modify `apps/web/src/components/whatsapp/nora-suggestion-panel.tsx`: show active case status, missing fields, conflicts, and proposal.
- Modify `apps/web/src/components/whatsapp/whatsapp-inbox.tsx` only if the existing conversation detail flow does not pass `noraCases` through to the panel; prefer using conversation detail already loaded.

## Task 1: Persist Nora Conversation Cases

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260621170000_nora_conversation_cases/migration.sql`
- Test: `apps/api/test/whatsapp.e2e-spec.ts`

- [ ] **Step 1: Add failing e2e expectation for active cases in conversation detail**

In `apps/api/test/whatsapp.e2e-spec.ts`, extend the in-memory arrays near `noraActions` with:

```ts
const noraCases: Array<Record<string, unknown>> = [
  {
    id: "case-order-1",
    conversationId: "conversation-1",
    parentCaseId: null,
    type: "order",
    status: "collecting_info",
    extractedData: {
      customerRef: "Agro Costa",
      companyRef: "Nanonutricion",
      zoneRef: "Costa",
      items: [{ productRef: "Fertilizante", quantity: 5, presentation: "bultos" }],
      deliveryInstructions: "Despachar esta semana",
    },
    missingFields: ["customerId"],
    attachments: [],
    proposal: null,
    lastQuestion: "Necesito identificar el cliente antes de continuar.",
    riskLevel: "high",
    createdByUserId: "sales-user-id",
    approvedByUserId: null,
    executedEntityType: null,
    executedEntityId: null,
    createdAt: new Date("2026-06-21T16:10:00.000Z"),
    updatedAt: new Date("2026-06-21T16:10:00.000Z"),
  },
];
```

Update `buildConversation` so `include?.noraCases` returns cases:

```ts
if (include?.noraCases) {
  result.noraCases = noraCases
    .filter((item) => item.conversationId === conversation.id)
    .sort((left, right) => {
      const leftDate = left.updatedAt as Date;
      const rightDate = right.updatedAt as Date;
      return rightDate.getTime() - leftDate.getTime();
    });
}
```

Add this test after the existing conversation detail tests:

```ts
it("includes Nora active cases in conversation detail", async () => {
  const response = await request(app.getHttpServer())
    .get("/whatsapp/conversations/conversation-1")
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(200);

  expect(response.body.noraCases).toEqual([
    expect.objectContaining({
      id: "case-order-1",
      type: "order",
      status: "collecting_info",
      missingFields: ["customerId"],
      lastQuestion: "Necesito identificar el cliente antes de continuar.",
    }),
  ]);
});
```

- [ ] **Step 2: Run the failing API test**

Run:

```bash
pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts --runInBand
```

Expected: FAIL because Prisma has no `noraCases` relation and the service does not include it.

- [ ] **Step 3: Add Prisma enums and model**

In `apps/api/prisma/schema.prisma`, add enums near the WhatsApp enums:

```prisma
enum NoraConversationCaseType {
  order
  new_customer
  expense
}

enum NoraConversationCaseStatus {
  collecting_info
  ready_for_review
  approved
  executed
  cancelled
  blocked
}

enum NoraCaseRiskLevel {
  low
  medium
  high
}
```

Add the relation field to `model WhatsAppConversation`:

```prisma
  noraCases        NoraConversationCase[]
```

Add the model after `NoraActionLog`:

```prisma
model NoraConversationCase {
  id                 String                     @id @default(cuid())
  conversationId     String
  parentCaseId       String?
  type               NoraConversationCaseType
  status             NoraConversationCaseStatus @default(collecting_info)
  extractedData      Json                       @default("{}")
  missingFields      Json                       @default("[]")
  attachments        Json                       @default("[]")
  proposal           Json?
  lastQuestion       String?
  riskLevel          NoraCaseRiskLevel          @default(medium)
  createdByUserId    String?
  approvedByUserId   String?
  executedEntityType String?
  executedEntityId   String?
  createdAt          DateTime                   @default(now())
  updatedAt          DateTime                   @updatedAt

  conversation       WhatsAppConversation       @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  parentCase         NoraConversationCase?      @relation("NoraCaseChildren", fields: [parentCaseId], references: [id])
  childCases         NoraConversationCase[]     @relation("NoraCaseChildren")
  createdByUser      User?                      @relation("NoraCaseCreatedBy", fields: [createdByUserId], references: [id])
  approvedByUser     User?                      @relation("NoraCaseApprovedBy", fields: [approvedByUserId], references: [id])

  @@index([conversationId, status, updatedAt])
  @@index([parentCaseId])
  @@index([createdByUserId])
  @@index([approvedByUserId])
}
```

Add relation fields to `model User`:

```prisma
  createdNoraCases            NoraConversationCase[] @relation("NoraCaseCreatedBy")
  approvedNoraCases           NoraConversationCase[] @relation("NoraCaseApprovedBy")
```

- [ ] **Step 4: Add SQL migration**

Create `apps/api/prisma/migrations/20260621170000_nora_conversation_cases/migration.sql`:

```sql
CREATE TYPE "NoraConversationCaseType" AS ENUM ('order', 'new_customer', 'expense');
CREATE TYPE "NoraConversationCaseStatus" AS ENUM ('collecting_info', 'ready_for_review', 'approved', 'executed', 'cancelled', 'blocked');
CREATE TYPE "NoraCaseRiskLevel" AS ENUM ('low', 'medium', 'high');

CREATE TABLE "NoraConversationCase" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "parentCaseId" TEXT,
  "type" "NoraConversationCaseType" NOT NULL,
  "status" "NoraConversationCaseStatus" NOT NULL DEFAULT 'collecting_info',
  "extractedData" JSONB NOT NULL DEFAULT '{}',
  "missingFields" JSONB NOT NULL DEFAULT '[]',
  "attachments" JSONB NOT NULL DEFAULT '[]',
  "proposal" JSONB,
  "lastQuestion" TEXT,
  "riskLevel" "NoraCaseRiskLevel" NOT NULL DEFAULT 'medium',
  "createdByUserId" TEXT,
  "approvedByUserId" TEXT,
  "executedEntityType" TEXT,
  "executedEntityId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NoraConversationCase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NoraConversationCase_conversationId_status_updatedAt_idx"
  ON "NoraConversationCase"("conversationId", "status", "updatedAt");
CREATE INDEX "NoraConversationCase_parentCaseId_idx" ON "NoraConversationCase"("parentCaseId");
CREATE INDEX "NoraConversationCase_createdByUserId_idx" ON "NoraConversationCase"("createdByUserId");
CREATE INDEX "NoraConversationCase_approvedByUserId_idx" ON "NoraConversationCase"("approvedByUserId");

ALTER TABLE "NoraConversationCase"
  ADD CONSTRAINT "NoraConversationCase_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoraConversationCase"
  ADD CONSTRAINT "NoraConversationCase_parentCaseId_fkey"
  FOREIGN KEY ("parentCaseId") REFERENCES "NoraConversationCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NoraConversationCase"
  ADD CONSTRAINT "NoraConversationCase_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NoraConversationCase"
  ADD CONSTRAINT "NoraConversationCase_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 5: Include cases in WhatsApp detail**

In `apps/api/src/modules/whatsapp/whatsapp.service.ts`, add to `conversationDetailInclude`:

```ts
  noraCases: {
    orderBy: { updatedAt: "desc" },
  },
```

- [ ] **Step 6: Validate Prisma schema and rerun the test**

Run:

```bash
pnpm --filter @norgtech/api prisma validate
pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts --runInBand
```

Expected: Prisma validate passes. The e2e test now passes or fails only because the in-memory Prisma stub lacks `noraConversationCase`; that stub is added in Task 2.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260621170000_nora_conversation_cases/migration.sql apps/api/src/modules/whatsapp/whatsapp.service.ts apps/api/test/whatsapp.e2e-spec.ts
git commit -m "feat: persist nora whatsapp cases"
```

## Task 2: Add NestJS Nora Case Manager

**Files:**
- Create: `apps/api/src/modules/whatsapp/dto/nora-case.dto.ts`
- Create: `apps/api/src/modules/whatsapp/nora-case.service.ts`
- Modify: `apps/api/src/modules/whatsapp/whatsapp.module.ts`
- Modify: `apps/api/test/whatsapp.e2e-spec.ts`

- [ ] **Step 1: Add e2e coverage for continuing an order into a new-customer subcase**

In `apps/api/test/whatsapp.e2e-spec.ts`, add these helpers near the Prisma mock helpers:

```ts
const openCaseStatuses = ["collecting_info", "ready_for_review", "blocked"];

const prismaNoraConversationCase = {
  findFirst: jest.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
    const conversationId = where?.conversationId;
    const status = where?.status as { in?: string[] } | undefined;
    const allowedStatuses = status?.in ?? openCaseStatuses;
    return (
      noraCases
        .filter((item) => !conversationId || item.conversationId === conversationId)
        .filter((item) => allowedStatuses.includes(String(item.status)))
        .sort((left, right) => {
          const leftDate = left.updatedAt as Date;
          const rightDate = right.updatedAt as Date;
          return rightDate.getTime() - leftDate.getTime();
        })[0] ?? null
    );
  }),
  create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
    const item = {
      id: `case-${noraCases.length + 1}`,
      status: "collecting_info",
      extractedData: {},
      missingFields: [],
      attachments: [],
      riskLevel: "medium",
      createdAt: new Date("2026-06-21T16:11:00.000Z"),
      updatedAt: new Date("2026-06-21T16:11:00.000Z"),
      ...data,
    };
    noraCases.unshift(item);
    return item;
  }),
  update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const index = noraCases.findIndex((item) => item.id === where.id);
    if (index === -1) return null;
    noraCases[index] = {
      ...noraCases[index],
      ...data,
      updatedAt: new Date("2026-06-21T16:12:00.000Z"),
    };
    return noraCases[index];
  }),
};
```

Add `noraConversationCase: prismaNoraConversationCase` to the PrismaService mock object.

Add this test:

```ts
it("creates a new-customer subcase when an open order receives crea uno nuevo", async () => {
  const response = await request(app.getHttpServer())
    .post("/whatsapp/webhooks/kapso")
    .send({
      type: "whatsapp.message.received",
      data: {
        phone_number_id: "phone-number-1",
        message: {
          id: "kapso-create-new-customer",
          from: "+573004445566",
          text: { body: "crea uno nuevo" },
        },
      },
    })
    .expect(201);

  expect(response.body.ignored).toBe(false);
  expect(noraCases).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "new_customer",
        parentCaseId: "case-order-1",
        missingFields: expect.arrayContaining(["displayName"]),
      }),
    ]),
  );
});
```

- [ ] **Step 2: Run the failing e2e test**

Run:

```bash
pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts --runInBand
```

Expected: FAIL because `NoraCaseService` does not exist and routing does not create subcases.

- [ ] **Step 3: Create DTO and shared case types**

Create `apps/api/src/modules/whatsapp/dto/nora-case.dto.ts`:

```ts
import {
  NoraCaseRiskLevel,
  NoraConversationCaseStatus,
  NoraConversationCaseType,
} from "@prisma/client";

export type NoraCaseJsonObject = Record<string, unknown>;

export type NoraCaseAttachment = {
  messageId: string;
  kind: "image" | "document";
  provider: "kapso";
  providerMediaId?: string;
  fileName?: string;
  contentType?: string;
  caption?: string;
  payload?: Record<string, unknown>;
};

export type NoraCaseTransitionInput = {
  conversationId: string;
  type: NoraConversationCaseType;
  parentCaseId?: string | null;
  status?: NoraConversationCaseStatus;
  extractedData?: NoraCaseJsonObject;
  missingFields?: string[];
  attachments?: NoraCaseAttachment[];
  proposal?: NoraCaseJsonObject | null;
  lastQuestion?: string | null;
  riskLevel?: NoraCaseRiskLevel;
  createdByUserId?: string | null;
};

export const openNoraCaseStatuses: NoraConversationCaseStatus[] = [
  NoraConversationCaseStatus.collecting_info,
  NoraConversationCaseStatus.ready_for_review,
  NoraConversationCaseStatus.blocked,
];
```

- [ ] **Step 4: Create case service**

Create `apps/api/src/modules/whatsapp/nora-case.service.ts`:

```ts
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
    await this.assertConversation(input.conversationId);
    return this.prisma.noraConversationCase.create({
      data: {
        conversationId: input.conversationId,
        parentCaseId: input.parentCaseId ?? null,
        type: input.type,
        status: input.status ?? NoraConversationCaseStatus.collecting_info,
        extractedData: this.jsonObject(input.extractedData ?? {}),
        missingFields: input.missingFields ?? [],
        attachments: input.attachments ?? [],
        proposal: input.proposal === undefined ? undefined : this.jsonNullable(input.proposal),
        lastQuestion: input.lastQuestion ?? null,
        riskLevel: input.riskLevel ?? NoraCaseRiskLevel.medium,
        createdByUserId: input.createdByUserId ?? null,
      },
    });
  }

  async updateCase(caseId: string, input: Partial<NoraCaseTransitionInput>) {
    const existing = await this.prisma.noraConversationCase.findFirst({
      where: { id: caseId },
    });
    if (!existing) {
      throw new NotFoundException("Nora case not found");
    }

    return this.prisma.noraConversationCase.update({
      where: { id: caseId },
      data: {
        ...(input.status && { status: input.status }),
        ...(input.extractedData && {
          extractedData: this.jsonObject({
            ...(existing.extractedData as NoraCaseJsonObject),
            ...input.extractedData,
          }),
        }),
        ...(input.missingFields && { missingFields: input.missingFields }),
        ...(input.attachments && {
          attachments: [
            ...this.arrayValue<NoraCaseAttachment>(existing.attachments),
            ...input.attachments,
          ],
        }),
        ...(input.proposal !== undefined && {
          proposal: this.jsonNullable(input.proposal ?? null),
        }),
        ...(input.lastQuestion !== undefined && { lastQuestion: input.lastQuestion }),
        ...(input.riskLevel && { riskLevel: input.riskLevel }),
      },
    });
  }

  async createNewCustomerSubcase(
    orderCase: NoraConversationCase,
    createdByUserId: string | null,
  ) {
    const existing = await this.prisma.noraConversationCase.findFirst({
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

    return this.createCase({
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
      lastQuestion: "Listo. Para dejar la propuesta de cliente nuevo, dime la razon social o nombre comercial.",
      riskLevel: NoraCaseRiskLevel.high,
      createdByUserId,
    });
  }

  private async assertConversation(conversationId: string) {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
      select: { id: true },
    });
    if (!conversation) {
      throw new NotFoundException("WhatsApp conversation not found");
    }
  }

  private jsonObject(value: NoraCaseJsonObject): Prisma.InputJsonObject {
    return value as Prisma.InputJsonObject;
  }

  private jsonNullable(value: NoraCaseJsonObject | null): Prisma.InputJsonValue | null {
    return value === null ? null : (value as Prisma.InputJsonObject);
  }

  private arrayValue<T>(value: Prisma.JsonValue): T[] {
    return Array.isArray(value) ? (value as T[]) : [];
  }
}
```

- [ ] **Step 5: Register the service**

In `apps/api/src/modules/whatsapp/whatsapp.module.ts`, import and provide it:

```ts
import { NoraCaseService } from "./nora-case.service";
```

Add to providers:

```ts
    NoraCaseService,
```

- [ ] **Step 6: Rerun e2e**

Run:

```bash
pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts --runInBand
```

Expected: still FAIL until Task 4 integrates routing; service compiles.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/whatsapp/dto/nora-case.dto.ts apps/api/src/modules/whatsapp/nora-case.service.ts apps/api/src/modules/whatsapp/whatsapp.module.ts apps/api/test/whatsapp.e2e-spec.ts
git commit -m "feat: add nora whatsapp case manager"
```

## Task 3: Make Python Nora Case-Aware

**Files:**
- Modify: `agents/nora/src/models/whatsapp_models.py`
- Modify: `agents/nora/src/operation/planner.py`
- Modify: `agents/nora/src/whatsapp_router.py`
- Test: `agents/nora/tests/test_whatsapp_router.py`

- [ ] **Step 1: Add failing Python tests for open-case continuity**

Append to `agents/nora/tests/test_whatsapp_router.py`:

```python
def test_order_open_case_create_new_customer_continues_instead_of_greeting():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "crea uno nuevo",
            "conversation_id": "conversation-sergio",
            "user": {"id": "sales-user-id", "role": "comercial", "name": "Sergio"},
            "open_case": {
                "id": "case-order-1",
                "type": "order",
                "status": "collecting_info",
                "extractedData": {"customerRef": "Agro Costa"},
                "missingFields": ["customer_id"],
                "lastQuestion": "Necesito identificar el cliente antes de continuar.",
            },
        }
    )

    assert result["intent"] == "continuar_caso"
    assert result["case_transition"]["action"] == "create_new_customer_subcase"
    assert result["case_transition"]["caseId"] == "case-order-1"
    assert "razon social" in result["suggested_reply"].lower()
    assert "hola" not in result["suggested_reply"].lower()


def test_expense_image_without_context_starts_expense_case():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "[Imagen]",
            "conversation_id": "conversation-sergio",
            "user": {"id": "sales-user-id", "role": "comercial", "name": "Sergio"},
            "media": {"kind": "image", "providerMediaId": "media-1"},
        }
    )

    assert result["intent"] == "gasto"
    assert result["case_transition"]["action"] == "start_case"
    assert result["case_transition"]["type"] == "expense"
    assert "soporte" in result["suggested_reply"].lower()
    assert "hola" not in result["suggested_reply"].lower()
```

- [ ] **Step 2: Run failing pytest**

Run:

```bash
cd agents/nora && uv run pytest tests/test_whatsapp_router.py -q
```

Expected: FAIL because `open_case`, `media`, and `case_transition` are not modeled.

- [ ] **Step 3: Add Pydantic models**

In `agents/nora/src/models/whatsapp_models.py`, add above `WhatsAppRouteRequest`:

```python
class NoraOpenCaseContext(BaseModel):
    id: str
    type: Literal["order", "new_customer", "expense"]
    status: str
    extractedData: dict[str, Any] = Field(default_factory=dict)
    missingFields: list[str] = Field(default_factory=list)
    lastQuestion: str | None = None


class NoraMediaContext(BaseModel):
    kind: Literal["image", "document"]
    providerMediaId: str | None = None
    fileName: str | None = None
    contentType: str | None = None
    caption: str | None = None


class NoraCaseTransition(BaseModel):
    action: Literal[
        "none",
        "start_case",
        "update_case",
        "create_new_customer_subcase",
        "cancel_case",
    ] = "none"
    caseId: str | None = None
    type: Literal["order", "new_customer", "expense"] | None = None
    extractedData: dict[str, Any] = Field(default_factory=dict)
    missingFields: list[str] = Field(default_factory=list)
    lastQuestion: str | None = None
```

Add fields to `WhatsAppRouteRequest`:

```python
    open_case: NoraOpenCaseContext | None = None
    media: NoraMediaContext | None = None
```

Add field to `WhatsAppRouteResponse`:

```python
    case_transition: NoraCaseTransition | None = None
```

- [ ] **Step 4: Add planner case branches**

In `agents/nora/src/operation/planner.py`, extend `PlannedIntent` with:

```python
    "continuar_caso",
```

Add helper functions near `_recent_context`:

```python
def _wants_new_customer(normalized_message: str) -> bool:
    return any(
        phrase in normalized_message
        for phrase in (
            "crea uno nuevo",
            "crear uno nuevo",
            "crealo nuevo",
            "cliente nuevo",
            "nuevo cliente",
        )
    )


def _is_inbound_media(request: WhatsAppRouteRequest, normalized_message: str) -> bool:
    return request.media is not None or normalized_message.strip().lower() in ("[imagen]", "[documento]")
```

At the top of `plan_message`, after `normalized_context`:

```python
    if request.open_case and request.open_case.type == "order" and _wants_new_customer(normalized):
        return NoraPlan(
            intent="continuar_caso",
            actions=[],
            summary="El usuario quiere crear una propuesta de cliente nuevo para continuar el pedido.",
        )

    if request.sender_type == "comercial" and _is_inbound_media(request, normalized):
        return NoraPlan(
            intent="gasto",
            actions=[],
            summary="Soporte de gasto recibido por WhatsApp.",
        )
```

- [ ] **Step 5: Emit case transitions from router**

In `agents/nora/src/whatsapp_router.py`, import `NoraCaseTransition`.

After `plan = plan_message(request)`, add:

```python
    case_transition = _case_transition_for(request, plan)
```

Pass `case_transition=case_transition` to every `WhatsAppRouteResponse`.

Add helper near `_requires_review`:

```python
def _case_transition_for(request: WhatsAppRouteRequest, plan: NoraPlan) -> NoraCaseTransition | None:
    if (
        request.open_case
        and request.open_case.type == "order"
        and plan.intent == "continuar_caso"
    ):
        return NoraCaseTransition(
            action="create_new_customer_subcase",
            caseId=request.open_case.id,
            type="new_customer",
            missingFields=["displayName", "contactName"],
            lastQuestion=(
                "Listo. Para dejar la propuesta de cliente nuevo, dime la razon social "
                "o nombre comercial."
            ),
        )

    if request.sender_type == "comercial" and plan.intent == "gasto" and request.media:
        return NoraCaseTransition(
            action="start_case",
            type="expense",
            missingFields=["amount", "expenseDate", "category", "description"],
            lastQuestion=(
                "Recibi el soporte. Voy a extraer los datos; si falta cliente o valor, "
                "te lo pido enseguida."
            ),
        )

    return None
```

Update `_suggested_reply_for`:

```python
    if intent == "continuar_caso":
        return "Listo. Para dejar la propuesta de cliente nuevo, dime la razon social o nombre comercial."
```

- [ ] **Step 6: Rerun Python tests**

Run:

```bash
cd agents/nora && uv run pytest tests/test_whatsapp_router.py -q
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add agents/nora/src/models/whatsapp_models.py agents/nora/src/operation/planner.py agents/nora/src/whatsapp_router.py agents/nora/tests/test_whatsapp_router.py
git commit -m "feat: make nora whatsapp router case aware"
```

## Task 4: Integrate Cases Into Nora Routing

**Files:**
- Modify: `apps/api/src/modules/whatsapp/nora-routing.service.ts`
- Modify: `apps/api/src/modules/whatsapp/whatsapp.service.ts`
- Test: `apps/api/test/whatsapp.e2e-spec.ts`

- [ ] **Step 1: Add failing e2e for routing with Python case transition**

In the test setup in `apps/api/test/whatsapp.e2e-spec.ts`, stub `globalThis.fetch` for the new message:

```ts
globalThis.fetch = jest.fn(async (_url, init) => {
  const body = JSON.parse(String(init?.body ?? "{}"));
  if (body.message === "crea uno nuevo") {
    expect(body.open_case).toEqual(expect.objectContaining({ id: "case-order-1" }));
    return {
      ok: true,
      json: async () => ({
        mode: "comercial",
        intent: "continuar_caso",
        summary: "El usuario quiere crear una propuesta de cliente nuevo.",
        suggested_reply:
          "Listo. Para dejar la propuesta de cliente nuevo, dime la razon social o nombre comercial.",
        requires_human_review: false,
        risk_level: "high",
        missing_fields: [],
        proposals: [],
        case_transition: {
          action: "create_new_customer_subcase",
          caseId: "case-order-1",
          type: "new_customer",
          missingFields: ["displayName", "contactName"],
          lastQuestion:
            "Listo. Para dejar la propuesta de cliente nuevo, dime la razon social o nombre comercial.",
        },
      }),
    } as Response;
  }
  return originalFetch(_url, init);
}) as typeof fetch;
```

- [ ] **Step 2: Inject NoraCaseService**

In `apps/api/src/modules/whatsapp/nora-routing.service.ts`, import:

```ts
import { NoraConversationCase } from "@prisma/client";
import { NoraCaseService } from "./nora-case.service";
```

Add constructor dependency:

```ts
    private readonly noraCaseService: NoraCaseService,
```

- [ ] **Step 3: Pass open case to Python**

Before `requestNoraRoute`, load the case:

```ts
      const openCase = await this.noraCaseService.findOpenCase(conversation.id);
```

Add to payload:

```ts
        ...(openCase && { open_case: this.openCasePayload(openCase) }),
        ...(this.mediaPayloadFromMessage(message) && {
          media: this.mediaPayloadFromMessage(message),
        }),
```

Add helpers:

```ts
  private openCasePayload(openCase: NoraConversationCase) {
    return {
      id: openCase.id,
      type: openCase.type,
      status: openCase.status,
      extractedData: openCase.extractedData,
      missingFields: Array.isArray(openCase.missingFields) ? openCase.missingFields : [],
      lastQuestion: openCase.lastQuestion,
    };
  }

  private mediaPayloadFromMessage(message: WhatsAppMessage) {
    if (message.body !== "[Imagen]" && message.body !== "[Documento]") {
      return undefined;
    }
    const payload =
      message.payload && typeof message.payload === "object" && !Array.isArray(message.payload)
        ? (message.payload as Record<string, unknown>)
        : {};
    return {
      kind: message.body === "[Imagen]" ? "image" : "document",
      providerMediaId: this.stringValue(payload.mediaId) ?? this.stringValue(payload.id),
      payload,
    };
  }
```

- [ ] **Step 4: Apply case transitions after Nora response**

After `const automationResult = await this.processOrderCandidate(...)`, call:

```ts
      const caseResult = await this.processCaseTransition(
        noraResponse,
        conversation.id,
        sender,
      );
```

Include in output:

```ts
        ...(caseResult && { case_transition_result: this.toJsonSafeValue(caseResult) }),
```

Add method:

```ts
  private async processCaseTransition(
    noraResponse: Record<string, unknown>,
    conversationId: string,
    sender: ResolvedWhatsAppSender,
  ) {
    const transition = noraResponse.case_transition;
    if (!transition || typeof transition !== "object" || Array.isArray(transition)) {
      return undefined;
    }

    const source = transition as Record<string, unknown>;
    const action = this.stringValue(source.action);
    const actorUserId = "userId" in sender ? sender.userId : null;

    if (action === "create_new_customer_subcase") {
      const caseId = this.stringValue(source.caseId);
      if (!caseId) return undefined;
      const orderCase = await this.prisma.noraConversationCase.findFirst({
        where: { id: caseId, conversationId },
      });
      if (!orderCase) return undefined;
      return this.noraCaseService.createNewCustomerSubcase(orderCase, actorUserId);
    }

    if (action === "start_case" && source.type === "expense") {
      return this.noraCaseService.createCase({
        conversationId,
        type: "expense",
        extractedData: this.objectValue(source.extractedData) ?? {},
        missingFields: this.stringArrayValue(source.missingFields),
        lastQuestion: this.stringValue(source.lastQuestion) ?? null,
        riskLevel: "medium",
        createdByUserId: actorUserId,
      });
    }

    return undefined;
  }

  private objectValue(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private stringArrayValue(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  }
```

- [ ] **Step 5: Auto-reply with case transition question**

Update `extractSuggestedReply`:

```ts
    const caseTransition =
      noraResponse.case_transition &&
      typeof noraResponse.case_transition === "object" &&
      !Array.isArray(noraResponse.case_transition)
        ? (noraResponse.case_transition as Record<string, unknown>)
        : null;
    const caseQuestion = this.stringValue(caseTransition?.lastQuestion);
    if (caseQuestion) {
      return caseQuestion;
    }
```

Place it after automation reply and before `noraResponse.suggested_reply`.

- [ ] **Step 6: Rerun API e2e**

Run:

```bash
pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/whatsapp/nora-routing.service.ts apps/api/src/modules/whatsapp/whatsapp.service.ts apps/api/test/whatsapp.e2e-spec.ts
git commit -m "feat: route whatsapp messages through nora cases"
```

## Task 5: Support Expense Cases From Photo And Guided Text

**Files:**
- Modify: `apps/api/src/modules/whatsapp/kapso-webhook.service.ts`
- Modify: `apps/api/src/modules/whatsapp/nora-case.service.ts`
- Modify: `apps/api/src/modules/whatsapp/whatsapp.module.ts`
- Modify: `agents/nora/src/operation/planner.py`
- Test: `apps/api/test/whatsapp.e2e-spec.ts`
- Test: `agents/nora/tests/test_whatsapp_router.py`

- [ ] **Step 1: Add Python test for guided expense start**

Append:

```python
def test_expense_text_starts_case_when_no_open_case():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "Voy a registrar un gasto de almuerzo",
            "conversation_id": "conversation-sergio",
            "user": {"id": "sales-user-id", "role": "comercial", "name": "Sergio"},
        }
    )

    assert result["intent"] == "gasto"
    assert result["case_transition"]["action"] == "start_case"
    assert result["case_transition"]["type"] == "expense"
    assert "valor" in result["suggested_reply"].lower()
```

- [ ] **Step 2: Update router to start expense case for text**

In `_case_transition_for`, add before `return None`:

```python
    if request.sender_type == "comercial" and plan.intent == "gasto" and not request.open_case:
        return NoraCaseTransition(
            action="start_case",
            type="expense",
            extractedData={
                "description": request.message,
            },
            missingFields=["amount"],
            lastQuestion="Listo. Dime el valor del gasto y el cliente o visita a asociar.",
        )
```

- [ ] **Step 3: Preserve Kapso media metadata**

In `apps/api/src/modules/whatsapp/kapso-webhook.service.ts`, when returning image/document message bodies, add normalized media fields:

```ts
if (image?.id) {
  return {
    phoneNumberId,
    waId,
    messageId,
    senderName,
    body: "[Imagen]",
    payload: {
      ...data,
      mediaKind: "image",
      mediaId: this.asString(image.id),
      contentType: this.asString(image.mime_type),
      caption: this.asString(image.caption),
    },
  };
}
if (document?.id) {
  return {
    phoneNumberId,
    waId,
    messageId,
    senderName,
    body: "[Documento]",
    payload: {
      ...data,
      mediaKind: "document",
      mediaId: this.asString(document.id),
      contentType: this.asString(document.mime_type),
      fileName: this.asString(document.filename),
      caption: this.asString(document.caption),
    },
  };
}
```

- [ ] **Step 4: Add attachment merge helper**

In `NoraCaseService`, add:

```ts
  async appendAttachmentFromMessage(
    caseId: string,
    attachment: NoraCaseAttachment,
  ) {
    return this.updateCase(caseId, {
      attachments: [attachment],
    });
  }
```

- [ ] **Step 5: Attach image metadata when starting an expense case**

In `NoraRoutingService.processCaseTransition`, when action is `start_case` and type is `expense`, build attachment from message if present:

```ts
const media = this.mediaPayloadFromMessage(message);
const attachments = media
  ? [
      {
        messageId: message.id,
        kind: media.kind,
        provider: "kapso" as const,
        providerMediaId: this.stringValue(media.providerMediaId),
        payload: media.payload as Record<string, unknown>,
      },
    ]
  : [];
```

Pass `attachments` into `createCase`.

- [ ] **Step 6: Run tests**

Run:

```bash
cd agents/nora && uv run pytest tests/test_whatsapp_router.py -q
pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add agents/nora/src/operation/planner.py agents/nora/src/whatsapp_router.py agents/nora/tests/test_whatsapp_router.py apps/api/src/modules/whatsapp/kapso-webhook.service.ts apps/api/src/modules/whatsapp/nora-case.service.ts apps/api/src/modules/whatsapp/nora-routing.service.ts apps/api/test/whatsapp.e2e-spec.ts
git commit -m "feat: support nora expense cases from whatsapp"
```

## Task 6: Render Active Cases In WhatsApp Inbox

**Files:**
- Modify: `apps/web/src/components/whatsapp/whatsapp-types.ts`
- Modify: `apps/web/src/components/whatsapp/nora-suggestion-panel.tsx`

- [ ] **Step 1: Add TypeScript case types**

In `apps/web/src/components/whatsapp/whatsapp-types.ts`, add:

```ts
export type NoraConversationCaseType = "order" | "new_customer" | "expense";
export type NoraConversationCaseStatus =
  | "collecting_info"
  | "ready_for_review"
  | "approved"
  | "executed"
  | "cancelled"
  | "blocked";

export type NoraConversationCase = {
  id: string;
  parentCaseId?: string | null;
  type: NoraConversationCaseType;
  status: NoraConversationCaseStatus;
  extractedData: Record<string, unknown>;
  missingFields: string[];
  attachments: Array<Record<string, unknown>>;
  proposal?: Record<string, unknown> | null;
  lastQuestion?: string | null;
  riskLevel: NoraRiskLevel;
  executedEntityType?: string | null;
  executedEntityId?: string | null;
  createdAt: string;
  updatedAt: string;
};
```

Add to `WhatsAppConversationDetail`:

```ts
  noraCases: NoraConversationCase[];
```

- [ ] **Step 2: Render active case panel**

In `nora-suggestion-panel.tsx`, import type:

```ts
import type {
  NoraConversationCase,
  NoraProposal,
  WhatsAppConversationDetail,
} from "./whatsapp-types";
```

Inside the component:

```ts
  const activeCase = conversation?.noraCases?.[0] ?? null;
```

Render this before `output.suggested_reply`:

```tsx
          {activeCase ? <NoraCasePreview activeCase={activeCase} /> : null}
```

Add component at the bottom:

```tsx
function NoraCasePreview({ activeCase }: { activeCase: NoraConversationCase }) {
  return (
    <div className="rounded-md border border-border bg-background p-2 text-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold">Caso activo</span>
        <Badge variant="outline">{activeCase.type}</Badge>
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        <Badge variant="secondary">{activeCase.status}</Badge>
        <Badge variant={activeCase.riskLevel === "high" ? "destructive" : "secondary"}>
          Riesgo {riskLabels[activeCase.riskLevel] ?? activeCase.riskLevel}
        </Badge>
      </div>
      {activeCase.lastQuestion ? (
        <div className="mb-2 rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">
          {activeCase.lastQuestion}
        </div>
      ) : null}
      {activeCase.missingFields.length > 0 ? (
        <div className="mb-2 text-muted-foreground">
          Faltan: {activeCase.missingFields.join(", ")}
        </div>
      ) : null}
      {activeCase.attachments.length > 0 ? (
        <div className="mb-2 text-muted-foreground">
          Adjuntos: {activeCase.attachments.length}
        </div>
      ) : null}
      <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-xs text-muted-foreground">
        {JSON.stringify(activeCase.extractedData, null, 2)}
      </pre>
      {activeCase.proposal ? (
        <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-xs text-muted-foreground">
          {JSON.stringify(activeCase.proposal, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Run web lint/build**

Run:

```bash
pnpm --filter @norgtech/web lint
pnpm --filter @norgtech/web build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/whatsapp/whatsapp-types.ts apps/web/src/components/whatsapp/nora-suggestion-panel.tsx
git commit -m "feat: show nora cases in whatsapp inbox"
```

## Task 7: Final Verification And Hardening

**Files:**
- Verify: all files changed above
- Modify only if tests reveal compile/type failures.

- [ ] **Step 1: Run Python tests**

```bash
cd agents/nora && uv run pytest tests/test_whatsapp_router.py tests/test_operation_capabilities.py -q
```

Expected: PASS.

- [ ] **Step 2: Run API tests**

```bash
pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts --runInBand
```

Expected: PASS.

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

- [ ] **Step 5: Manual UAT through local webhook**

Start local services as the repo normally does, then send a Kapso webhook for Sergio:

```bash
curl -s -X POST http://localhost:3000/whatsapp/webhooks/kapso \
  -H "Content-Type: application/json" \
  -d '{
    "type": "whatsapp.message.received",
    "data": {
      "phone_number_id": "phone-number-1",
      "message": {
        "id": "uat-order-1",
        "from": "+573004445566",
        "text": {
          "body": "Nora, por favor prepara un pedido de 5 bultos de Fertilizante para Nanonutricion, sede Costa. Despachar esta semana."
        }
      }
    }
  }'
```

Then send:

```bash
curl -s -X POST http://localhost:3000/whatsapp/webhooks/kapso \
  -H "Content-Type: application/json" \
  -d '{
    "type": "whatsapp.message.received",
    "data": {
      "phone_number_id": "phone-number-1",
      "message": {
        "id": "uat-order-2",
        "from": "+573004445566",
        "text": { "body": "crea uno nuevo" }
      }
    }
  }'
```

Expected: the conversation has an `order` case and a child `new_customer` case; Nora asks for explicit customer data and does not return the greeting.

- [ ] **Step 6: Commit verification fixes if any**

If any fixes were required:

```bash
git add <fixed-files>
git commit -m "fix: harden nora case workflow"
```

If no fixes were required, do not create an empty commit.

## Self-Review

- Spec coverage: persistence, order continuity, new-customer proposal, expense photo/text paths, inbox rendering, audit/logging, and no-invention rules are covered.
- Known implementation boundary: actual binary download from Kapso for OCR is intentionally isolated behind persisted attachment metadata in this plan. OCR extraction can run when the provider payload includes downloadable media or a follow-up media download service is added; the case workflow itself remains functional and does not lose context.
- Plan hygiene scan: no unfinished-marker instructions are present.
- Type consistency: plan uses `NoraConversationCase`, `case_transition`, `open_case`, `noraCases`, and enum names consistently across Python, NestJS, and web.

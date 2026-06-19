# Nora WhatsApp Pedidos Semi-Automaticos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Nora convert clear WhatsApp order requests into CRM orders automatically, while asking one clarification or leaving a human-review proposal when data is missing or ambiguous.

**Architecture:** Python Nora extracts order intent and candidate refs from natural language. NestJS owns product/company/zone resolution, credit validation, order creation, WhatsApp replies, and logs. The WhatsApp inbox shows created orders, clarification questions, and human-review proposals without allowing fallback zero-price items.

**Tech Stack:** NestJS, Prisma, Jest e2e, Next.js React components, Python FastAPI/Pydantic, pytest.

---

## File Structure

- Modify `agents/nora/src/models/whatsapp_models.py`: add structured order candidate models and route response automation fields.
- Modify `agents/nora/src/operation/capabilities.py`: add `orders.resolve_and_create_from_whatsapp`.
- Modify `agents/nora/src/operation/planner.py`: extract `company_ref`, `zone_ref`, item refs and quantities.
- Modify `agents/nora/src/whatsapp_router.py`: return `order_candidate` and keep legacy proposal compatibility.
- Modify `agents/nora/tests/test_whatsapp_router.py`: cover structured extraction and clarification behavior.
- Create `apps/api/src/modules/whatsapp/dto/process-order-automation.dto.ts`: validated order candidate input.
- Create `apps/api/src/modules/whatsapp/whatsapp-order-automation.service.ts`: resolver and execution boundary for WhatsApp orders.
- Modify `apps/api/src/modules/whatsapp/whatsapp.module.ts`: provide the new service.
- Modify `apps/api/src/modules/whatsapp/whatsapp.service.ts`: expose automation method and include richer order data.
- Modify `apps/api/src/modules/whatsapp/nora-routing.service.ts`: call resolver for order intent and send reply for created/clarification results.
- Modify `apps/api/src/modules/whatsapp/whatsapp.controller.ts`: add authenticated manual automation endpoint.
- Modify `apps/api/test/whatsapp.e2e-spec.ts`: add backend e2e coverage using current in-memory Prisma stubs.
- Modify `apps/web/src/components/whatsapp/whatsapp-types.ts`: type automation result fields.
- Modify `apps/web/src/components/whatsapp/nora-suggestion-panel.tsx`: show decision, created order, question, and reason.
- Modify `apps/web/src/components/whatsapp/order-draft-panel.tsx`: remove fallback item creation and require resolved items.

## Task 1: Nora Structured Order Candidate

**Files:**
- Modify: `agents/nora/src/models/whatsapp_models.py`
- Modify: `agents/nora/src/operation/capabilities.py`
- Modify: `agents/nora/src/operation/planner.py`
- Modify: `agents/nora/src/whatsapp_router.py`
- Test: `agents/nora/tests/test_whatsapp_router.py`

- [ ] **Step 1: Add failing pytest coverage for structured order extraction**

Append these tests to `agents/nora/tests/test_whatsapp_router.py`:

```python
def test_cliente_order_returns_order_candidate_refs_and_items():
    result = route_whatsapp_message(
        {
            "sender_type": "cliente",
            "message": "Necesito 10 bultos de Fertilizante FERT-001 por Nanonutricion para Costa",
            "conversation_id": "conversation-1",
            "customer": {"id": "customer-1", "displayName": "Agro Norte"},
            "companies": [
                {"id": "company-nt", "name": "Nortech", "prefix": "NT"},
                {"id": "company-nn", "name": "Nanonutricion", "prefix": "NN"},
            ],
            "customer_zones": [{"id": "cz-costa", "name": "Costa"}],
        }
    )

    assert result["intent"] == "pedido"
    assert result["order_candidate"]["customerId"] == "customer-1"
    assert result["order_candidate"]["companyRef"] == "Nanonutricion"
    assert result["order_candidate"]["zoneRef"] == "Costa"
    assert result["order_candidate"]["items"] == [
        {
            "productRef": "Fertilizante FERT-001",
            "quantity": 10,
            "presentation": "bultos",
            "notes": "Necesito 10 bultos de Fertilizante FERT-001 por Nanonutricion para Costa",
        }
    ]
    assert result["proposals"][0]["payload"]["items"][0]["productRef"] == "Fertilizante FERT-001"


def test_cliente_order_without_quantity_marks_items_missing():
    result = route_whatsapp_message(
        {
            "sender_type": "cliente",
            "message": "Necesito Fertilizante para Costa por Nanonutricion",
            "conversation_id": "conversation-1",
            "customer": {"id": "customer-1", "displayName": "Agro Norte"},
            "companies": [
                {"id": "company-nt", "name": "Nortech", "prefix": "NT"},
                {"id": "company-nn", "name": "Nanonutricion", "prefix": "NN"},
            ],
            "customer_zones": [{"id": "cz-costa", "name": "Costa"}],
        }
    )

    assert result["intent"] == "clarification"
    assert result["missing_fields"] == ["items"]
    assert "cantidad" in result["suggested_reply"].lower()
```

- [ ] **Step 2: Run pytest and confirm failures**

Run:

```bash
cd agents/nora && uv run pytest tests/test_whatsapp_router.py -q
```

Expected: the two new tests fail because `order_candidate` is absent and quantity validation is not enforced.

- [ ] **Step 3: Add Pydantic response fields**

Modify `agents/nora/src/models/whatsapp_models.py` by adding these models above `NoraProposal`:

```python
class NoraOrderCandidateItem(BaseModel):
    productRef: str
    quantity: float
    presentation: str | None = None
    notes: str | None = None


class NoraOrderCandidate(BaseModel):
    customerId: str | None = None
    companyRef: str | None = None
    customerZoneId: str | None = None
    zoneRef: str | None = None
    items: list[NoraOrderCandidateItem] = Field(default_factory=list)
    deliveryInstructions: str | None = None
    notes: str | None = None
    sourceConversationId: str | None = None
```

Then add this field to `WhatsAppRouteResponse`:

```python
    order_candidate: NoraOrderCandidate | None = None
```

- [ ] **Step 4: Add the automation capability**

Append this capability to `CAPABILITIES` in `agents/nora/src/operation/capabilities.py` immediately after `orders.create_draft`:

```python
    NoraCapability(
        domain="orders",
        action="resolve_and_create_from_whatsapp",
        modes=("cliente",),
        kind="write",
        requires_human_review=False,
        required_fields=("customer_id", "company_ref", "items"),
        risk_level="high",
        summary="Resolver y crear pedido desde WhatsApp cuando los datos son claros",
    ),
```

- [ ] **Step 5: Implement minimal order extraction helpers**

In `agents/nora/src/operation/planner.py`, add these helpers near the existing private helpers:

```python
def _quantity_and_presentation(message: str) -> tuple[float | None, str | None]:
    match = re.search(
        r"(?P<quantity>\d+(?:[.,]\d+)?)\s*(?P<presentation>bultos?|kg|kilos?|toneladas?|unidades?)?",
        message,
        flags=re.IGNORECASE,
    )
    if not match:
        return None, None
    quantity = float(match.group("quantity").replace(",", "."))
    presentation = match.group("presentation")
    return quantity, presentation.lower() if presentation else None


def _product_ref(message: str, quantity: float | None, presentation: str | None) -> str | None:
    cleaned = message.strip()
    if quantity is not None:
        cleaned = re.sub(
            r"\b\d+(?:[.,]\d+)?\s*(?:bultos?|kg|kilos?|toneladas?|unidades?)?\b",
            "",
            cleaned,
            count=1,
            flags=re.IGNORECASE,
        ).strip()
    cleaned = re.sub(r"\b(necesito|pedido|por|para|con|de)\b", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,-")
    return cleaned or None


def _company_ref(request: WhatsAppRouteRequest, normalized_message: str) -> str | None:
    if len(request.companies) == 1:
        return request.companies[0].name or request.companies[0].prefix or request.companies[0].id
    for company in request.companies:
        for candidate in (company.name, company.prefix, company.id):
            if candidate and _phrase_matches(normalized_message, candidate):
                return candidate
    return None


def _zone_ref(request: WhatsAppRouteRequest, normalized_message: str) -> str | None:
    if len(request.customer_zones) == 1:
        return request.customer_zones[0].name
    for zone in request.customer_zones:
        if _phrase_matches(normalized_message, zone.name):
            return zone.name
    return None
```

Then replace the `ORDER_WORDS` branch fields with:

```python
        quantity, presentation = _quantity_and_presentation(message)
        product_ref = _product_ref(message, quantity, presentation)
        items = []
        if product_ref and quantity is not None:
            items.append(
                {
                    "product_ref": product_ref,
                    "quantity": quantity,
                    "presentation": presentation,
                    "notes": message,
                }
            )
        return NoraPlan(
            intent="pedido",
            actions=[
                PlannedAction(
                    domain="orders",
                    action="resolve_and_create_from_whatsapp",
                    fields={
                        "customer_id": _customer_id(request),
                        "company_ref": _company_ref(request, normalized),
                        "company_id": _company_id(request, normalized),
                        "customer_zone_id": _customer_zone_id(request, normalized),
                        "zone_ref": _zone_ref(request, normalized),
                        "items": items,
                        "notes": message,
                        "source_conversation_id": request.conversation_id,
                    },
                    confidence=0.82,
                )
            ],
            summary=_order_summary(request, message),
        )
```

- [ ] **Step 6: Map candidate fields in router**

In `agents/nora/src/whatsapp_router.py`, import the new classes:

```python
from .models.whatsapp_models import (
    NoraOrderCandidate,
    NoraOrderCandidateItem,
    NoraProposal,
    WhatsAppRouteRequest,
    WhatsAppRouteResponse,
)
```

Add:

```python
def _order_candidate_for_action(action: PlannedAction) -> NoraOrderCandidate | None:
    if action.domain != "orders" or action.action != "resolve_and_create_from_whatsapp":
        return None
    items = [
        NoraOrderCandidateItem(
            productRef=str(item["product_ref"]),
            quantity=float(item["quantity"]),
            presentation=item.get("presentation"),
            notes=item.get("notes"),
        )
        for item in action.fields.get("items", [])
        if item.get("product_ref") and item.get("quantity") is not None
    ]
    return NoraOrderCandidate(
        customerId=action.fields.get("customer_id"),
        companyRef=action.fields.get("company_ref"),
        customerZoneId=action.fields.get("customer_zone_id"),
        zoneRef=action.fields.get("zone_ref"),
        items=items,
        notes=action.fields.get("notes"),
        sourceConversationId=action.fields.get("source_conversation_id"),
    )
```

In `route_whatsapp_message`, before creating `WhatsAppRouteResponse`, compute:

```python
    order_candidate = next(
        (
            candidate
            for candidate in (_order_candidate_for_action(action) for action in plan.actions)
            if candidate is not None
        ),
        None,
    )
```

Add `order_candidate=order_candidate` to the response constructor.

- [ ] **Step 7: Keep legacy proposal payload compatible**

Update `_proposal_for_action` to accept both order actions:

```python
    if action.domain == "orders" and action.action in (
        "create_draft",
        "resolve_and_create_from_whatsapp",
    ):
        items = [
            {
                "productRef": item.get("product_ref"),
                "quantity": item.get("quantity"),
                "presentation": item.get("presentation"),
                "notes": item.get("notes"),
            }
            for item in action.fields.get("items", [])
        ]
        return NoraProposal(
            type="order_draft",
            title="Borrador de pedido",
            payload={
                "customerId": action.fields.get("customer_id"),
                "companyId": action.fields.get("company_id"),
                "companyRef": action.fields.get("company_ref"),
                "customerZoneId": action.fields.get("customer_zone_id"),
                "zoneRef": action.fields.get("zone_ref"),
                "items": items,
                "notes": action.fields.get("notes"),
                "sourceConversationId": action.fields.get("source_conversation_id"),
                "approvalStatus": "en_revision",
            },
            requires_human_review=True,
        )
```

- [ ] **Step 8: Run pytest**

Run:

```bash
cd agents/nora && uv run pytest tests/test_whatsapp_router.py -q
```

Expected: all Nora router tests pass.

- [ ] **Step 9: Commit**

```bash
git add agents/nora/src/models/whatsapp_models.py agents/nora/src/operation/capabilities.py agents/nora/src/operation/planner.py agents/nora/src/whatsapp_router.py agents/nora/tests/test_whatsapp_router.py
git commit -m "feat(nora): extract whatsapp order candidates"
```

## Task 2: Backend Order Automation DTO And Resolver Tests

**Files:**
- Create: `apps/api/src/modules/whatsapp/dto/process-order-automation.dto.ts`
- Create: `apps/api/src/modules/whatsapp/whatsapp-order-automation.service.ts`
- Modify: `apps/api/test/whatsapp.e2e-spec.ts`

- [ ] **Step 1: Create DTO**

Create `apps/api/src/modules/whatsapp/dto/process-order-automation.dto.ts`:

```ts
import { Type } from "class-transformer";
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export class OrderAutomationItemDto {
  @IsString()
  productRef!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsOptional()
  @IsString()
  presentation?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ProcessOrderAutomationDto {
  @IsOptional()
  @IsString()
  companyRef?: string;

  @IsOptional()
  @IsString()
  customerZoneId?: string;

  @IsOptional()
  @IsString()
  zoneRef?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderAutomationItemDto)
  items!: OrderAutomationItemDto[];

  @IsOptional()
  @IsString()
  deliveryInstructions?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
```

- [ ] **Step 2: Add failing e2e test for automatic creation**

In `apps/api/test/whatsapp.e2e-spec.ts`, add fixtures:

```ts
const products = [
  {
    id: "product-1",
    name: "Fertilizante",
    sku: "FERT-001",
    unit: "kg",
    presentation: "Bulto 50kg",
    basePrice: 50000,
    active: true,
  },
  {
    id: "product-2",
    name: "Fertilizante Plus",
    sku: "FERT-PLUS",
    unit: "kg",
    presentation: "Bulto 50kg",
    basePrice: 65000,
    active: true,
  },
];
```

Add this test near the existing conversation tests:

```ts
it("creates an order automatically from a clear WhatsApp order candidate", async () => {
  const response = await request(app.getHttpServer())
    .post("/whatsapp/conversations/conversation-1/order-automation")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      companyRef: "NOR",
      zoneRef: "Costa",
      items: [{ productRef: "FERT-001", quantity: 10, presentation: "bultos" }],
      notes: "Necesito 10 bultos de FERT-001 por NOR para Costa",
    })
    .expect(201);

  expect(response.body.decision).toBe("created");
  expect(response.body.order.customerId).toBe("customer-1");
  expect(response.body.order.companyId).toBe("company-1");
  expect(response.body.order.customerZoneId).toBe("customer-zone-1");
  expect(response.body.summary.items).toEqual([
    { name: "Fertilizante", sku: "FERT-001", quantity: 10, unit: "kg" },
  ]);
  expect(response.body.reply).toContain("Recibimos tu pedido");
  expect(response.body.reply).toContain("Fertilizante");
});
```

- [ ] **Step 3: Extend Prisma stub for product listing and order creation**

In the `prismaStub` inside `apps/api/test/whatsapp.e2e-spec.ts`, add:

```ts
product: {
  findMany: async () => products,
  findUnique: async ({ where: { id } }: { where: { id: string } }) =>
    products.find((product) => product.id === id) ?? null,
},
order: {
  findFirst: async () => null,
  create: async () => {
    throw new Error("order.create must run inside a transaction");
  },
},
```

Inside the transaction stub, add `order.create`:

```ts
order: {
  create: async ({ data, include }: { data: any; include?: Record<string, unknown> }) => {
    const order = {
      id: `order-${orders.length + 1}`,
      ...data,
      status: "recibido",
      items: data.items.create.map((item: Record<string, unknown>, index: number) => ({
        id: `order-item-${orders.length + 1}-${index + 1}`,
        orderId: `order-${orders.length + 1}`,
        ...item,
      })),
      customer: customers.find((customer) => customer.id === data.customerId) ?? null,
      company: companies.find((company) => company.id === data.companyId) ?? null,
      sourceConversation: conversations.find(
        (conversation) => conversation.id === data.sourceConversationId,
      ) ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    orders.push(order);
    return order;
  },
  findFirst: async () => null,
},
```

Add `company.findMany`, `customerZone.findMany`, and `customerZone.findUnique` stubs:

```ts
company: {
  findMany: async () => companies.filter((company) => company.isActive),
  findUnique: async ({ where }: { where: { id: string } }) =>
    companies.find((company) => company.id === where.id) ?? null,
},
customerZone: {
  findMany: async ({ where }: { where: { customerId?: string; isActive?: boolean } }) =>
    customerZones
      .filter((customerZone) => !where.customerId || customerZone.customerId === where.customerId)
      .filter((customerZone) => where.isActive === undefined || customerZone.isActive === where.isActive)
      .map((customerZone) => ({
        ...customerZone,
        zone: zones.find((zone) => zone.id === customerZone.zoneId) ?? null,
      })),
  findUnique: async ({ where }: { where: { id: string } }) =>
    customerZones.find((customerZone) => customerZone.id === where.id) ?? null,
},
```

- [ ] **Step 4: Run failing API test**

Run:

```bash
pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts
```

Expected: FAIL with `Cannot POST /whatsapp/conversations/conversation-1/order-automation` or missing provider.

## Task 3: Backend Resolver Implementation

**Files:**
- Create: `apps/api/src/modules/whatsapp/whatsapp-order-automation.service.ts`
- Modify: `apps/api/src/modules/whatsapp/whatsapp.module.ts`
- Modify: `apps/api/src/modules/whatsapp/whatsapp.service.ts`
- Modify: `apps/api/src/modules/whatsapp/whatsapp.controller.ts`

- [ ] **Step 1: Create resolver service**

Create `apps/api/src/modules/whatsapp/whatsapp-order-automation.service.ts`:

```ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateOrderDto } from "../orders/dto/create-order.dto";
import { OrdersService } from "../orders/orders.service";
import { PrismaService } from "../../prisma/prisma.service";
import { ProcessOrderAutomationDto } from "./dto/process-order-automation.dto";

type AutomationDecision = "created" | "needs_clarification" | "human_review";

@Injectable()
export class WhatsAppOrderAutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
  ) {}

  async process(user: AuthUser, conversationId: string, dto: ProcessOrderAutomationDto) {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
      include: {
        customer: true,
        contact: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException("WhatsApp conversation not found");
    }

    if (!conversation.customerId || !conversation.customer) {
      return this.clarification("customerId", "Necesito identificar el cliente antes de preparar el pedido.");
    }

    const company = await this.resolveCompany(dto.companyRef);
    if (!company) {
      return this.clarification("companyId", "Para preparar el pedido, dime por cual empresa debe salir.");
    }

    const customerZoneResult = await this.resolveCustomerZone(
      conversation.customerId,
      dto.customerZoneId,
      dto.zoneRef,
    );
    if (customerZoneResult.decision !== "resolved") {
      return this.clarification("customerZoneId", customerZoneResult.question);
    }

    const resolvedItems = await this.resolveItems(dto.items);
    if (resolvedItems.decision === "needs_clarification") {
      return this.clarification(resolvedItems.missingField, resolvedItems.question);
    }
    if (resolvedItems.decision === "human_review") {
      return {
        decision: "human_review" as AutomationDecision,
        reason: resolvedItems.reason,
        proposal: {
          type: "order_draft",
          payload: {
            customerId: conversation.customerId,
            companyId: company.id,
            customerZoneId: customerZoneResult.customerZoneId,
            items: dto.items,
            notes: dto.notes,
            sourceConversationId: conversationId,
            approvalStatus: "en_revision",
          },
        },
      };
    }

    const payload: CreateOrderDto = {
      customerId: conversation.customerId,
      companyId: company.id,
      customerZoneId: customerZoneResult.customerZoneId ?? undefined,
      sourceConversationId: conversationId,
      requesterName: conversation.contact?.fullName ?? conversation.senderName ?? undefined,
      requesterPhone: conversation.phone,
      deliveryInstructions: dto.deliveryInstructions,
      notes: dto.notes,
      approvalStatus: "en_revision",
      items: resolvedItems.items,
    };

    try {
      const order = await this.ordersService.create(user, payload);
      const summary = this.summaryFor(order);
      return {
        decision: "created" as AutomationDecision,
        order,
        summary,
        reply: this.replyFor(summary),
      };
    } catch (error) {
      return {
        decision: "human_review" as AutomationDecision,
        reason: error instanceof Error ? error.message : "No se pudo crear el pedido automaticamente",
        proposal: {
          type: "order_draft",
          payload,
        },
      };
    }
  }

  private async resolveCompany(companyRef?: string) {
    const companies = await this.prisma.company.findMany({ where: { isActive: true } });
    if (companies.length === 1 && !companyRef) return companies[0];
    const normalized = this.normalize(companyRef ?? "");
    return (
      companies.find((company) =>
        [company.id, company.name, company.legalName, company.prefix]
          .filter(Boolean)
          .some((value) => this.normalize(String(value)) === normalized),
      ) ?? null
    );
  }

  private async resolveCustomerZone(customerId: string, customerZoneId?: string, zoneRef?: string) {
    const zones = await this.prisma.customerZone.findMany({
      where: { customerId, isActive: true },
      include: { zone: true },
    });

    if (zones.length === 0) {
      return { decision: "resolved" as const, customerZoneId: null };
    }
    if (customerZoneId) {
      const exact = zones.find((customerZone) => customerZone.id === customerZoneId);
      if (exact) return { decision: "resolved" as const, customerZoneId: exact.id };
    }
    if (zones.length === 1 && !zoneRef) {
      return { decision: "resolved" as const, customerZoneId: zones[0].id };
    }
    const normalized = this.normalize(zoneRef ?? "");
    const matches = zones.filter((customerZone) =>
      this.normalize(customerZone.zone?.name ?? "") === normalized,
    );
    if (matches.length === 1) {
      return { decision: "resolved" as const, customerZoneId: matches[0].id };
    }
    return {
      decision: "needs_clarification" as const,
      question: "Para preparar el pedido, dime la zona o sede de despacho.",
    };
  }

  private async resolveItems(items: ProcessOrderAutomationDto["items"]) {
    if (!items.length) {
      return {
        decision: "needs_clarification" as const,
        missingField: "items",
        question: "Dime que productos y cantidades necesita el pedido.",
      };
    }

    const products = await this.prisma.product.findMany({ where: { active: true } });
    const resolved: CreateOrderDto["items"] = [];

    for (const item of items) {
      const candidates = this.productCandidates(products, item.productRef);
      if (candidates.length === 0) {
        return {
          decision: "needs_clarification" as const,
          missingField: "items",
          question: `No encontre el producto "${item.productRef}". Puedes enviarme SKU o referencia exacta?`,
        };
      }
      if (candidates.length > 1) {
        const options = candidates.slice(0, 3).map((product) => `${product.name} (${product.sku})`).join(", ");
        return {
          decision: "human_review" as const,
          reason: `Producto ambiguo para "${item.productRef}": ${options}`,
        };
      }
      resolved.push({
        productId: candidates[0].id,
        quantity: item.quantity,
        unitPrice: Number(candidates[0].basePrice),
        presentation: item.presentation,
        notes: item.notes,
      });
    }

    return { decision: "resolved" as const, items: resolved };
  }

  private productCandidates(products: Array<{ id: string; name: string; sku: string; active: boolean; basePrice: Prisma.Decimal | number | string }>, ref: string) {
    const normalized = this.normalize(ref);
    const exactSku = products.filter((product) => this.normalize(product.sku) === normalized);
    if (exactSku.length) return exactSku;
    const exactName = products.filter((product) => this.normalize(product.name) === normalized);
    if (exactName.length) return exactName;
    return products.filter((product) => {
      const name = this.normalize(product.name);
      const sku = this.normalize(product.sku);
      return name.includes(normalized) || normalized.includes(name) || sku.includes(normalized);
    });
  }

  private clarification(missingField: string, question: string) {
    return {
      decision: "needs_clarification" as AutomationDecision,
      missingField,
      question,
    };
  }

  private summaryFor(order: any) {
    return {
      company: order.company?.name ?? order.companyId,
      zone: order.customerZone?.zone?.name ?? null,
      items: (order.items ?? []).map((item: any) => ({
        name: item.productSnapshotName,
        sku: item.productSnapshotSku,
        quantity: Number(item.quantity),
        unit: item.unit,
      })),
      total: Number(order.total),
    };
  }

  private replyFor(summary: ReturnType<WhatsAppOrderAutomationService["summaryFor"]>) {
    const items = summary.items
      .map((item) => `- ${item.name}: ${item.quantity} ${item.unit}`)
      .join("\n");
    const zone = summary.zone ? `\nZona/sede: ${summary.zone}` : "";
    return [
      "Recibimos tu pedido y queda en revision.",
      "",
      `Empresa: ${summary.company}${zone}`,
      "Productos:",
      items,
      `Total estimado: ${new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(summary.total)}`,
      "",
      "Te confirmamos facturacion y despacho en breve.",
    ].join("\n");
  }

  private normalize(value: string) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }
}
```

- [ ] **Step 2: Provide service in module**

Modify `apps/api/src/modules/whatsapp/whatsapp.module.ts` so providers include:

```ts
providers: [WhatsAppService, KapsoWebhookService, NoraRoutingService, WhatsAppOrderAutomationService],
```

and import:

```ts
import { WhatsAppOrderAutomationService } from "./whatsapp-order-automation.service";
```

- [ ] **Step 3: Add service facade method**

In `apps/api/src/modules/whatsapp/whatsapp.service.ts`, inject the automation service:

```ts
import { ProcessOrderAutomationDto } from "./dto/process-order-automation.dto";
import { WhatsAppOrderAutomationService } from "./whatsapp-order-automation.service";
```

Constructor:

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly orderAutomation: WhatsAppOrderAutomationService,
  ) {}
```

Add:

```ts
  processOrderAutomation(user: AuthUser, conversationId: string, dto: ProcessOrderAutomationDto) {
    return this.orderAutomation.process(user, conversationId, dto);
  }
```

- [ ] **Step 4: Add controller endpoint**

In `apps/api/src/modules/whatsapp/whatsapp.controller.ts`, import DTO:

```ts
import { ProcessOrderAutomationDto } from "./dto/process-order-automation.dto";
```

Add endpoint:

```ts
  @Post("conversations/:id/order-automation")
  processOrderAutomation(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: ProcessOrderAutomationDto,
  ) {
    return this.whatsAppService.processOrderAutomation(user, id, dto);
  }
```

- [ ] **Step 5: Run API test**

Run:

```bash
pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts
```

Expected: WhatsApp e2e tests pass, including `creates an order automatically from a clear WhatsApp order candidate`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/whatsapp apps/api/test/whatsapp.e2e-spec.ts
git commit -m "feat(api): resolve whatsapp orders automatically"
```

## Task 4: Connect Nora Routing To Automation

**Files:**
- Modify: `apps/api/src/modules/whatsapp/nora-routing.service.ts`
- Modify: `apps/api/src/modules/whatsapp/whatsapp.service.ts`
- Modify: `apps/api/test/whatsapp.e2e-spec.ts`

- [ ] **Step 1: Add failing webhook routing test**

In `apps/api/test/whatsapp.e2e-spec.ts`, set mocked Nora response to include:

```ts
order_candidate: {
  customerId: "customer-1",
  companyRef: "NOR",
  zoneRef: "Costa",
  items: [{ productRef: "FERT-001", quantity: 10, presentation: "bultos" }],
  notes: "Necesito 10 bultos de FERT-001 por NOR para Costa",
  sourceConversationId: "conversation-2",
},
```

Add a test:

```ts
it("webhook creates a clear order candidate and sends summary reply", async () => {
  await request(app.getHttpServer())
    .post("/whatsapp/webhooks/kapso")
    .send({
      type: "whatsapp.message.received",
      data: [
        {
          phone_number_id: "phone-number-1",
          message: {
            id: "msg-auto-order",
            from: "573001112233",
            text: { body: "Necesito 10 bultos de FERT-001 por NOR para Costa" },
            profile: { name: "Laura Cliente" },
          },
        },
      ],
    })
    .expect(201);

  expect(orders.some((order) => order.sourceConversationId)).toBe(true);
  expect(messages.some((message) => message.direction === "outbound" && String(message.body).includes("Recibimos tu pedido"))).toBe(true);
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts
```

Expected: FAIL because `NoraRoutingService` does not call order automation.

- [ ] **Step 3: Inject automation service into routing**

In `apps/api/src/modules/whatsapp/nora-routing.service.ts`, import:

```ts
import { WhatsAppOrderAutomationService } from "./whatsapp-order-automation.service";
```

Update constructor:

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsAppService: WhatsAppService,
    private readonly orderAutomation: WhatsAppOrderAutomationService,
  ) {}
```

- [ ] **Step 4: Add system actor builder**

Add this helper in `NoraRoutingService`:

```ts
  private systemActorForAutomation(sender: ResolvedWhatsAppSender) {
    if ("userId" in sender) {
      return {
        id: sender.userId,
        email: sender.userEmail,
        role: sender.userRole,
      };
    }

    return {
      id: process.env.NORA_AUTOMATION_USER_ID ?? "admin-user-id",
      email: "nora@norgtech.local",
      role: "administrador" as const,
    };
  }
```

- [ ] **Step 5: Process order candidate after Nora response**

In `routeInboundMessage`, after `noraResponse` is received and before sending a reply, add:

```ts
      const automationResult = await this.maybeProcessOrderCandidate(
        conversation.id,
        sender,
        noraResponse,
      );
      const output = automationResult
        ? { ...noraResponse, order_automation: automationResult }
        : noraResponse;

      const updatedLog = await this.prisma.noraActionLog.update({
        where: { id: actionLog.id },
        data: {
          status: automationResult?.decision === "created"
            ? NoraActionStatus.executed
            : NoraActionStatus.proposed,
          output: output as Prisma.InputJsonValue,
        },
      });

      const suggestedReply =
        automationResult?.reply ??
        automationResult?.question ??
        this.extractSuggestedReply(noraResponse);
```

Replace the existing `updatedLog` block with this version so `output` includes automation.

Add helper:

```ts
  private async maybeProcessOrderCandidate(
    conversationId: string,
    sender: ResolvedWhatsAppSender,
    noraResponse: Record<string, unknown>,
  ) {
    if (noraResponse.intent !== "pedido" || !noraResponse.order_candidate) {
      return null;
    }

    const candidate = noraResponse.order_candidate as {
      companyRef?: string;
      customerZoneId?: string;
      zoneRef?: string;
      items?: Array<{ productRef: string; quantity: number; presentation?: string; notes?: string }>;
      deliveryInstructions?: string;
      notes?: string;
    };

    return this.orderAutomation.process(
      this.systemActorForAutomation(sender),
      conversationId,
      {
        companyRef: candidate.companyRef,
        customerZoneId: candidate.customerZoneId,
        zoneRef: candidate.zoneRef,
        items: candidate.items ?? [],
        deliveryInstructions: candidate.deliveryInstructions,
        notes: candidate.notes,
      },
    );
  }
```

- [ ] **Step 6: Ensure send policy includes created and clarification**

Keep this behavior in `routeInboundMessage`:

```ts
      if (suggestedReply && !this.requiresHumanReview(noraResponse)) {
```

Change it to:

```ts
      if (
        suggestedReply &&
        (automationResult?.decision === "created" ||
          automationResult?.decision === "needs_clarification" ||
          !this.requiresHumanReview(noraResponse))
      ) {
```

- [ ] **Step 7: Run test**

Run:

```bash
pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts
```

Expected: WhatsApp e2e passes.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/whatsapp apps/api/test/whatsapp.e2e-spec.ts
git commit -m "feat(api): automate whatsapp order routing"
```

## Task 5: Inbox UI For Automation Results

**Files:**
- Modify: `apps/web/src/components/whatsapp/whatsapp-types.ts`
- Modify: `apps/web/src/components/whatsapp/nora-suggestion-panel.tsx`
- Modify: `apps/web/src/components/whatsapp/order-draft-panel.tsx`

- [ ] **Step 1: Extend WhatsApp types**

In `apps/web/src/components/whatsapp/whatsapp-types.ts`, add:

```ts
export type OrderAutomationResult =
  | {
      decision: "created";
      order?: { id: string; orderNumber?: string | null; status?: string | null };
      summary?: {
        company?: string | null;
        zone?: string | null;
        items?: Array<{ name: string; sku?: string; quantity: number; unit?: string }>;
        total?: number;
      };
      reply?: string;
    }
  | {
      decision: "needs_clarification";
      missingField?: string;
      question: string;
    }
  | {
      decision: "human_review";
      reason: string;
      proposal?: NoraProposal;
    };
```

Extend the Nora action output type with:

```ts
  order_automation?: OrderAutomationResult;
  order_candidate?: Record<string, unknown>;
```

- [ ] **Step 2: Show automation result in suggestion panel**

In `apps/web/src/components/whatsapp/nora-suggestion-panel.tsx`, add after `const proposals`:

```ts
  const automation = output?.order_automation ?? null;
```

Render before response suggested:

```tsx
          {automation ? (
            <div className="rounded-md border border-border bg-background p-2 text-sm">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-semibold">Automatización de pedido</span>
                <Badge variant={automation.decision === "created" ? "secondary" : "outline"}>
                  {automation.decision}
                </Badge>
              </div>
              {automation.decision === "created" ? (
                <div className="space-y-1 text-muted-foreground">
                  <div>Empresa: {automation.summary?.company ?? "Sin empresa"}</div>
                  <div>Zona: {automation.summary?.zone ?? "Sin zona"}</div>
                  <div>Total: {formatCurrency(automation.summary?.total ?? 0)}</div>
                </div>
              ) : null}
              {automation.decision === "needs_clarification" ? (
                <div className="text-amber-700">{automation.question}</div>
              ) : null}
              {automation.decision === "human_review" ? (
                <div className="text-muted-foreground">{automation.reason}</div>
              ) : null}
            </div>
          ) : null}
```

Add helper at bottom:

```ts
function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}
```

- [ ] **Step 3: Remove fallback item creation**

In `apps/web/src/components/whatsapp/order-draft-panel.tsx`, replace:

```ts
    items:
      items.length > 0
        ? items
        : [{ productName: "Item por confirmar", quantity: 1, unitPrice: 0 }],
```

with:

```ts
    items,
```

Replace `canCreateDraft` with:

```ts
  const proposalItems = Array.isArray(latestProposal?.items) ? latestProposal.items : [];
  const canCreateDraft = Boolean(
    conversation?.customer?.id &&
      latestProposal &&
      !latestOrder &&
      proposalItems.length > 0 &&
      proposalItems.every((item) => Boolean((item as Record<string, unknown>).productId)),
  );
```

Update button title:

```tsx
            title={
              canCreateDraft
                ? "Crear pedido"
                : "La propuesta necesita productos resueltos antes de crear pedido"
            }
```

- [ ] **Step 4: Build web app**

Run:

```bash
pnpm --filter @norgtech/web build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/whatsapp
git commit -m "feat(web): show whatsapp order automation results"
```

## Task 6: Final Verification

**Files:**
- Verify only; no planned edits.

- [ ] **Step 1: Run Nora tests**

```bash
cd agents/nora && uv run pytest tests/test_whatsapp_router.py -q
```

Expected: all tests pass.

- [ ] **Step 2: Run API WhatsApp tests**

```bash
pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts
```

Expected: all tests pass.

- [ ] **Step 3: Run API build**

```bash
pnpm --filter @norgtech/api build
```

Expected: Nest build succeeds.

- [ ] **Step 4: Run web build**

```bash
pnpm --filter @norgtech/web build
```

Expected: Next build succeeds.

- [ ] **Step 5: Check git state**

```bash
git status --short
```

Expected: clean worktree.

## Self-Review Checklist

- Spec coverage: structured extraction, NestJS resolver, auto creation, one-question clarification, human-review fallback, WhatsApp reply, inbox visibility, safety, and tests are covered.
- Placeholder scan: no open sections or unspecified implementation steps remain.
- Type consistency: `order_candidate`, `order_automation`, `companyRef`, `zoneRef`, `items.productRef`, `decision`, `created`, `needs_clarification`, and `human_review` are used consistently across agent, API, and web.

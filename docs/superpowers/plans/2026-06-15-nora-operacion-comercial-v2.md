# Nora Operacion Comercial v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Nora from a limited WhatsApp keyword router into a capability-driven commercial operations assistant for WhatsApp and CRM workflows.

**Architecture:** Keep NestJS as the source of truth for permissions, validations, orders, credit, zones, companies, expenses and invoices. Add an explicit capability registry plus deterministic planner/validator in the Nora service for the first covered scenarios, then have NestJS enrich WhatsApp route requests with CRM context and persist richer `NoraActionLog` outputs. Frontend changes focus on making Nora's intent, risk, extracted data and proposals actionable in the existing WhatsApp inbox.

**Tech Stack:** Python FastAPI/Pydantic/LangGraph, NestJS/Prisma, Next.js React, TypeScript, pnpm, pytest, Jest/Supertest.

---

## File Structure

### Nora agent

- Create `agents/nora/src/operation/__init__.py`: package marker.
- Create `agents/nora/src/operation/capabilities.py`: registry of supported Nora commercial operations.
- Create `agents/nora/src/operation/planner.py`: deterministic first-pass planner for WhatsApp/CRM messages.
- Create `agents/nora/src/operation/validator.py`: validates required fields, supported capabilities and review rules.
- Modify `agents/nora/src/models/whatsapp_models.py`: extend route request/response with context, proposals, risk and missing fields.
- Modify `agents/nora/src/whatsapp_router.py`: replace keyword-only routing with capability planner + validator, keeping safe fallback behavior.
- Test `agents/nora/tests/test_operation_capabilities.py`.
- Test `agents/nora/tests/test_whatsapp_router.py`.

### NestJS API

- Modify `apps/api/src/modules/whatsapp/nora-routing.service.ts`: send richer context to Nora and persist richer outputs.
- Modify `apps/api/src/modules/whatsapp/whatsapp.service.ts`: include company/zone/order detail needed by the inbox and expose conversation context helper.
- Test `apps/api/test/whatsapp.e2e-spec.ts`.

### Web app

- Modify `apps/web/src/components/whatsapp/whatsapp-types.ts`: add generic Nora proposal/result types.
- Modify `apps/web/src/components/whatsapp/nora-suggestion-panel.tsx`: render mode, intent, risk, summary, missing fields, proposed order, support/payment/logistics proposals and action status.
- Modify `apps/web/src/components/whatsapp/order-draft-panel.tsx`: read the new `proposals` array while keeping legacy `proposed_order` compatibility.

### Verification

- From `agents/nora`, run `PYTHONPATH=. uv run pytest tests -q`.
- Run `pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts` or the closest existing API test command.
- Run `pnpm --filter @norgtech/web build`.

---

### Task 1: Add Nora Capability Registry

**Files:**
- Create: `agents/nora/src/operation/__init__.py`
- Create: `agents/nora/src/operation/capabilities.py`
- Test: `agents/nora/tests/test_operation_capabilities.py`

- [ ] **Step 1: Write failing capability tests**

Create `agents/nora/tests/test_operation_capabilities.py`:

```python
from src.operation.capabilities import get_capability, list_capabilities


def test_lists_core_commercial_capabilities():
    capabilities = list_capabilities()

    assert any(cap.domain == "orders" and cap.action == "create_draft" for cap in capabilities)
    assert any(cap.domain == "credit" and cap.action == "summary" for cap in capabilities)
    assert any(cap.domain == "whatsapp" and cap.action == "summarize_conversation" for cap in capabilities)


def test_order_draft_requires_human_review_and_core_fields():
    capability = get_capability("orders", "create_draft")

    assert capability is not None
    assert capability.requires_human_review is True
    assert capability.required_fields == ["customer_id", "company_id", "items"]
    assert capability.risk_level == "high"


def test_unsupported_capability_returns_none():
    assert get_capability("orders", "bulk_delete") is None
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd agents/nora
PYTHONPATH=. uv run pytest tests/test_operation_capabilities.py -q
```

Expected: FAIL because `src.operation.capabilities` does not exist.

- [ ] **Step 3: Create package marker**

Create `agents/nora/src/operation/__init__.py`:

```python
"""Commercial operation planning helpers for Nora."""
```

- [ ] **Step 4: Implement capability registry**

Create `agents/nora/src/operation/capabilities.py`:

```python
from dataclasses import dataclass
from typing import Literal


Mode = Literal["cliente", "comercial", "admin"]
CapabilityKind = Literal["read", "write"]
RiskLevel = Literal["low", "medium", "high"]


@dataclass(frozen=True)
class NoraCapability:
    domain: str
    action: str
    modes: tuple[Mode, ...]
    kind: CapabilityKind
    requires_human_review: bool
    required_fields: list[str]
    risk_level: RiskLevel
    summary: str


CAPABILITIES: tuple[NoraCapability, ...] = (
    NoraCapability(
        domain="customers",
        action="search",
        modes=("comercial", "admin"),
        kind="read",
        requires_human_review=False,
        required_fields=[],
        risk_level="low",
        summary="Buscar clientes",
    ),
    NoraCapability(
        domain="orders",
        action="status",
        modes=("cliente", "comercial", "admin"),
        kind="read",
        requires_human_review=False,
        required_fields=[],
        risk_level="low",
        summary="Consultar estado de pedidos",
    ),
    NoraCapability(
        domain="orders",
        action="create_draft",
        modes=("cliente", "comercial", "admin"),
        kind="write",
        requires_human_review=True,
        required_fields=["customer_id", "company_id", "items"],
        risk_level="high",
        summary="Preparar borrador de pedido",
    ),
    NoraCapability(
        domain="credit",
        action="summary",
        modes=("comercial", "admin"),
        kind="read",
        requires_human_review=False,
        required_fields=["customer_id"],
        risk_level="medium",
        summary="Consultar cupo y cartera",
    ),
    NoraCapability(
        domain="payments",
        action="register_support_event",
        modes=("cliente", "admin"),
        kind="write",
        requires_human_review=True,
        required_fields=["customer_id"],
        risk_level="high",
        summary="Registrar soporte de pago para revision",
    ),
    NoraCapability(
        domain="logistics",
        action="register_tracking_event",
        modes=("admin",),
        kind="write",
        requires_human_review=True,
        required_fields=[],
        risk_level="high",
        summary="Registrar guia o evento logistico para revision",
    ),
    NoraCapability(
        domain="visits",
        action="agenda",
        modes=("comercial",),
        kind="read",
        requires_human_review=False,
        required_fields=[],
        risk_level="low",
        summary="Consultar agenda comercial",
    ),
    NoraCapability(
        domain="expenses",
        action="create_expense_draft",
        modes=("comercial",),
        kind="write",
        requires_human_review=True,
        required_fields=["expense_date", "category", "amount", "description"],
        risk_level="medium",
        summary="Preparar gasto comercial para revision",
    ),
    NoraCapability(
        domain="dashboard",
        action="sales_summary",
        modes=("comercial", "admin"),
        kind="read",
        requires_human_review=False,
        required_fields=[],
        risk_level="low",
        summary="Consultar resumen de ventas",
    ),
    NoraCapability(
        domain="whatsapp",
        action="summarize_conversation",
        modes=("admin",),
        kind="read",
        requires_human_review=False,
        required_fields=[],
        risk_level="low",
        summary="Resumir conversacion de WhatsApp",
    ),
)


def list_capabilities() -> tuple[NoraCapability, ...]:
    return CAPABILITIES


def get_capability(domain: str, action: str) -> NoraCapability | None:
    return next(
        (
            capability
            for capability in CAPABILITIES
            if capability.domain == domain and capability.action == action
        ),
        None,
    )
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
cd agents/nora
PYTHONPATH=. uv run pytest tests/test_operation_capabilities.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add agents/nora/src/operation/__init__.py agents/nora/src/operation/capabilities.py agents/nora/tests/test_operation_capabilities.py
git commit -m "feat: add nora operation capability registry"
```

---

### Task 2: Extend WhatsApp Route Models For Operational Outputs

**Files:**
- Modify: `agents/nora/src/models/whatsapp_models.py`
- Test: `agents/nora/tests/test_whatsapp_router.py`

- [ ] **Step 1: Extend router tests for the new response contract**

Append to `agents/nora/tests/test_whatsapp_router.py`:

```python
def test_cliente_order_response_includes_structured_proposal_list():
    result = route_whatsapp_message(
        {
            "sender_type": "cliente",
            "message": "Necesito 10 bultos de producto A para la costa",
            "conversation_id": "conversation-1",
            "customer": {"id": "customer-1", "displayName": "Agro Norte"},
            "companies": [{"id": "company-nt", "name": "Nortech", "prefix": "NT"}],
            "customer_zones": [{"id": "zone-costa", "name": "Costa"}],
        }
    )

    assert result["mode"] == "cliente"
    assert result["intent"] == "pedido"
    assert result["risk_level"] == "high"
    assert result["requires_human_review"] is True
    assert result["proposals"][0]["type"] == "order_draft"
    assert result["proposals"][0]["payload"]["customerId"] == "customer-1"
    assert result["proposals"][0]["payload"]["companyId"] == "company-nt"
    assert result["proposals"][0]["payload"]["customerZoneId"] == "zone-costa"
    assert result["proposals"][0]["payload"]["sourceConversationId"] == "conversation-1"


def test_cliente_order_missing_company_asks_one_clarification():
    result = route_whatsapp_message(
        {
            "sender_type": "cliente",
            "message": "Necesito 10 bultos de producto A para la costa",
            "conversation_id": "conversation-1",
            "customer": {"id": "customer-1", "displayName": "Agro Norte"},
            "companies": [
                {"id": "company-nt", "name": "Nortech", "prefix": "NT"},
                {"id": "company-nn", "name": "Nanonutricion", "prefix": "NN"},
            ],
            "customer_zones": [{"id": "zone-costa", "name": "Costa"}],
        }
    )

    assert result["intent"] == "clarification"
    assert result["missing_fields"] == ["company_id"]
    assert "empresa" in result["suggested_reply"].lower()
    assert result["proposals"] == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd agents/nora
PYTHONPATH=. uv run pytest tests/test_whatsapp_router.py -q
```

Expected: FAIL because response fields such as `risk_level`, `missing_fields` and `proposals` do not exist yet.

- [ ] **Step 3: Replace WhatsApp models**

Edit `agents/nora/src/models/whatsapp_models.py` to:

```python
from typing import Any, Literal

from pydantic import BaseModel, Field


class NoraCompanyContext(BaseModel):
    id: str
    name: str | None = None
    prefix: str | None = None


class NoraZoneContext(BaseModel):
    id: str
    name: str


class NoraMessageContext(BaseModel):
    role: str
    body: str


class WhatsAppRouteRequest(BaseModel):
    sender_type: Literal["cliente", "comercial", "admin", "desconocido"]
    message: str
    conversation_id: str | None = None
    customer: dict[str, Any] | None = None
    contact: dict[str, Any] | None = None
    companies: list[NoraCompanyContext] = Field(default_factory=list)
    customer_zones: list[NoraZoneContext] = Field(default_factory=list)
    recent_messages: list[NoraMessageContext] = Field(default_factory=list)


class NoraProposal(BaseModel):
    type: Literal[
        "order_draft",
        "payment_support",
        "logistics_event",
        "expense_draft",
    ]
    title: str
    payload: dict[str, Any] = Field(default_factory=dict)
    requires_human_review: bool = True


class WhatsAppRouteResponse(BaseModel):
    mode: Literal["cliente", "comercial", "admin"]
    intent: str
    summary: str
    suggested_reply: str
    requires_human_review: bool = True
    risk_level: Literal["low", "medium", "high"] = "medium"
    missing_fields: list[str] = Field(default_factory=list)
    blocked_reason: str | None = None
    proposals: list[NoraProposal] = Field(default_factory=list)
    proposed_order: dict[str, Any] | None = None
```

- [ ] **Step 4: Run tests**

Run:

```bash
cd agents/nora
PYTHONPATH=. uv run pytest tests/test_whatsapp_router.py -q
```

Expected: existing tests may still pass or fail only on fields implemented in the next task. The model import should pass.

- [ ] **Step 5: Commit**

```bash
git add agents/nora/src/models/whatsapp_models.py agents/nora/tests/test_whatsapp_router.py
git commit -m "feat: extend nora whatsapp response contract"
```

---

### Task 3: Add Deterministic Planner And Validator

**Files:**
- Create: `agents/nora/src/operation/planner.py`
- Create: `agents/nora/src/operation/validator.py`
- Modify: `agents/nora/src/whatsapp_router.py`
- Test: `agents/nora/tests/test_whatsapp_router.py`

- [ ] **Step 1: Create planner**

Create `agents/nora/src/operation/planner.py`:

```python
from dataclasses import dataclass, field
from typing import Any, Literal

from ..models.whatsapp_models import WhatsAppRouteRequest


PlannedIntent = Literal[
    "pedido",
    "consulta_pedidos",
    "consulta_cartera",
    "soporte_pago",
    "guia_logistica",
    "gasto",
    "agenda",
    "resumen_conversacion",
    "clasificacion",
]


ORDER_WORDS = ("pedido", "necesito", "cotizar", "bulto", "bultos", "tonelada", "kg")
STATUS_WORDS = ("estado", "pendiente", "despachado", "facturado", "factura")
CREDIT_WORDS = ("cupo", "cartera", "credito", "crédito", "debe", "saldo")
PAYMENT_WORDS = ("pago", "pagamos", "soporte", "comprobante", "transferencia")
LOGISTICS_WORDS = ("guia", "guía", "transportadora", "despacho", "transito", "tránsito")
EXPENSE_WORDS = ("gasto", "almuerzo", "hotel", "gasolina", "peaje", "parqueadero")
AGENDA_WORDS = ("agenda", "visita", "pendiente hoy", "tengo hoy")
SUMMARY_WORDS = ("resume", "resumen", "clasifica", "intencion", "intención")


@dataclass
class PlannedAction:
    domain: str
    action: str
    fields: dict[str, Any] = field(default_factory=dict)
    confidence: float = 0.75


@dataclass
class NoraPlan:
    intent: PlannedIntent
    actions: list[PlannedAction]
    summary: str


def plan_message(request: WhatsAppRouteRequest) -> NoraPlan:
    message = request.message.strip()
    normalized = message.lower()

    if any(word in normalized for word in PAYMENT_WORDS):
        return NoraPlan(
            intent="soporte_pago",
            actions=[
                PlannedAction(
                    domain="payments",
                    action="register_support_event",
                    fields={"customer_id": _customer_id(request), "notes": message},
                    confidence=0.82,
                )
            ],
            summary=f"Soporte o mensaje de pago recibido: {message}",
        )

    if any(word in normalized for word in LOGISTICS_WORDS):
        return NoraPlan(
            intent="guia_logistica",
            actions=[
                PlannedAction(
                    domain="logistics",
                    action="register_tracking_event",
                    fields={"notes": message},
                    confidence=0.78,
                )
            ],
            summary=f"Mensaje logistico recibido: {message}",
        )

    if any(word in normalized for word in CREDIT_WORDS):
        return NoraPlan(
            intent="consulta_cartera",
            actions=[
                PlannedAction(
                    domain="credit",
                    action="summary",
                    fields={"customer_id": _customer_id(request)},
                    confidence=0.8,
                )
            ],
            summary=f"Consulta de cupo o cartera: {message}",
        )

    if any(word in normalized for word in EXPENSE_WORDS):
        return NoraPlan(
            intent="gasto",
            actions=[
                PlannedAction(
                    domain="expenses",
                    action="create_expense_draft",
                    fields={"description": message},
                    confidence=0.72,
                )
            ],
            summary=f"Posible gasto comercial: {message}",
        )

    if any(word in normalized for word in AGENDA_WORDS):
        return NoraPlan(
            intent="agenda",
            actions=[PlannedAction(domain="visits", action="agenda", confidence=0.85)],
            summary=f"Consulta de agenda: {message}",
        )

    if any(word in normalized for word in SUMMARY_WORDS) and request.sender_type == "admin":
        return NoraPlan(
            intent="resumen_conversacion",
            actions=[PlannedAction(domain="whatsapp", action="summarize_conversation", confidence=0.82)],
            summary=_conversation_summary(request),
        )

    if any(word in normalized for word in STATUS_WORDS):
        return NoraPlan(
            intent="consulta_pedidos",
            actions=[PlannedAction(domain="orders", action="status", confidence=0.78)],
            summary=f"Consulta relacionada con pedidos: {message}",
        )

    if any(word in normalized for word in ORDER_WORDS):
        return NoraPlan(
            intent="pedido",
            actions=[
                PlannedAction(
                    domain="orders",
                    action="create_draft",
                    fields={
                        "customer_id": _customer_id(request),
                        "company_id": _company_id(request, normalized),
                        "customer_zone_id": _customer_zone_id(request, normalized),
                        "items": [{"rawText": message}],
                        "notes": message,
                        "source_conversation_id": request.conversation_id,
                    },
                    confidence=0.82,
                )
            ],
            summary=_order_summary(request, message),
        )

    return NoraPlan(
        intent="clasificacion",
        actions=[],
        summary=f"Mensaje pendiente de clasificacion: {message}",
    )


def _customer_id(request: WhatsAppRouteRequest) -> str | None:
    if not request.customer:
        return None
    value = request.customer.get("id")
    return str(value) if value else None


def _company_id(request: WhatsAppRouteRequest, normalized_message: str) -> str | None:
    if len(request.companies) == 1:
        return request.companies[0].id

    for company in request.companies:
        candidates = [company.id, company.name or "", company.prefix or ""]
        if any(candidate and candidate.lower() in normalized_message for candidate in candidates):
            return company.id

    return None


def _customer_zone_id(request: WhatsAppRouteRequest, normalized_message: str) -> str | None:
    if len(request.customer_zones) == 1:
        return request.customer_zones[0].id

    for zone in request.customer_zones:
        if zone.name.lower() in normalized_message:
            return zone.id

    return None


def _order_summary(request: WhatsAppRouteRequest, message: str) -> str:
    customer_name = None
    if request.customer:
        customer_name = request.customer.get("displayName") or request.customer.get("legalName")
    prefix = f"{customer_name} solicita un pedido" if customer_name else "Solicitud de pedido"
    return f"{prefix}: {message}"


def _conversation_summary(request: WhatsAppRouteRequest) -> str:
    if not request.recent_messages:
        return "No hay mensajes recientes suficientes para resumir la conversacion."
    text = " ".join(message.body for message in request.recent_messages[-4:])
    return f"Resumen operativo de la conversacion: {text[:400]}"
```

- [ ] **Step 2: Create validator**

Create `agents/nora/src/operation/validator.py`:

```python
from dataclasses import dataclass, field

from .capabilities import get_capability
from .planner import NoraPlan, PlannedAction
from ..models.whatsapp_models import WhatsAppRouteRequest


@dataclass
class ValidationResult:
    ok: bool
    missing_fields: list[str] = field(default_factory=list)
    blocked_reason: str | None = None


def validate_plan(request: WhatsAppRouteRequest, plan: NoraPlan) -> ValidationResult:
    missing: list[str] = []

    for action in plan.actions:
        capability = get_capability(action.domain, action.action)
        if capability is None:
            return ValidationResult(
                ok=False,
                blocked_reason=f"Nora no soporta la accion {action.domain}.{action.action}.",
            )

        mode = mode_for_sender(request.sender_type)
        if mode not in capability.modes:
            return ValidationResult(
                ok=False,
                blocked_reason="Este remitente no tiene permisos para esa accion.",
            )

        missing.extend(_missing_required_fields(action, capability.required_fields))

        if action.domain == "orders" and action.action == "create_draft":
            if len(request.customer_zones) > 1 and not action.fields.get("customer_zone_id"):
                missing.append("customer_zone_id")

    unique_missing = list(dict.fromkeys(missing))
    return ValidationResult(ok=len(unique_missing) == 0, missing_fields=unique_missing)


def mode_for_sender(sender_type: str) -> str:
    if sender_type in ("cliente", "desconocido"):
        return "cliente"
    if sender_type == "admin":
        return "admin"
    return "comercial"


def _missing_required_fields(action: PlannedAction, required_fields: list[str]) -> list[str]:
    missing: list[str] = []
    for field_name in required_fields:
        value = action.fields.get(field_name)
        if value is None or value == "" or value == []:
            missing.append(field_name)
    return missing
```

- [ ] **Step 3: Replace WhatsApp router implementation**

Edit `agents/nora/src/whatsapp_router.py` to:

```python
from typing import Any

from .models.whatsapp_models import NoraProposal, WhatsAppRouteRequest, WhatsAppRouteResponse
from .operation.capabilities import get_capability
from .operation.planner import PlannedAction, plan_message
from .operation.validator import mode_for_sender, validate_plan


def route_whatsapp_message(payload: dict[str, Any] | WhatsAppRouteRequest) -> dict[str, Any]:
    request = (
        payload
        if isinstance(payload, WhatsAppRouteRequest)
        else WhatsAppRouteRequest.model_validate(payload)
    )
    mode = mode_for_sender(request.sender_type)
    plan = plan_message(request)
    validation = validate_plan(request, plan)

    if not validation.ok and validation.missing_fields:
        response = WhatsAppRouteResponse(
            mode=mode,
            intent="clarification",
            summary=plan.summary,
            suggested_reply=_clarification_for(validation.missing_fields),
            requires_human_review=True,
            risk_level=_risk_for(plan.actions),
            missing_fields=validation.missing_fields,
            proposals=[],
        )
        return response.model_dump()

    if not validation.ok:
        response = WhatsAppRouteResponse(
            mode=mode,
            intent="unsupported",
            summary=plan.summary,
            suggested_reply=validation.blocked_reason or "No puedo hacer esa accion desde Nora.",
            requires_human_review=True,
            risk_level="medium",
            missing_fields=[],
            blocked_reason=validation.blocked_reason,
            proposals=[],
        )
        return response.model_dump()

    proposals = [_proposal_for_action(action) for action in plan.actions]
    proposals = [proposal for proposal in proposals if proposal is not None]

    response = WhatsAppRouteResponse(
        mode=mode,
        intent=plan.intent,
        summary=plan.summary,
        suggested_reply=_suggested_reply_for(mode, plan.intent),
        requires_human_review=_requires_review(plan.actions),
        risk_level=_risk_for(plan.actions),
        missing_fields=[],
        proposals=proposals,
        proposed_order=_legacy_order_payload(proposals),
    )
    return response.model_dump()


def _proposal_for_action(action: PlannedAction) -> NoraProposal | None:
    if action.domain == "orders" and action.action == "create_draft":
        return NoraProposal(
            type="order_draft",
            title="Borrador de pedido",
            payload={
                "customerId": action.fields.get("customer_id"),
                "companyId": action.fields.get("company_id"),
                "customerZoneId": action.fields.get("customer_zone_id"),
                "items": action.fields.get("items", []),
                "notes": action.fields.get("notes"),
                "sourceConversationId": action.fields.get("source_conversation_id"),
                "approvalStatus": "en_revision",
            },
            requires_human_review=True,
        )

    if action.domain == "payments" and action.action == "register_support_event":
        return NoraProposal(
            type="payment_support",
            title="Soporte de pago para revision",
            payload={
                "customerId": action.fields.get("customer_id"),
                "notes": action.fields.get("notes"),
            },
            requires_human_review=True,
        )

    if action.domain == "logistics" and action.action == "register_tracking_event":
        return NoraProposal(
            type="logistics_event",
            title="Evento logistico para revision",
            payload={"notes": action.fields.get("notes")},
            requires_human_review=True,
        )

    if action.domain == "expenses" and action.action == "create_expense_draft":
        return NoraProposal(
            type="expense_draft",
            title="Gasto comercial para completar",
            payload={"description": action.fields.get("description")},
            requires_human_review=True,
        )

    return None


def _requires_review(actions: list[PlannedAction]) -> bool:
    if not actions:
        return True
    for action in actions:
        capability = get_capability(action.domain, action.action)
        if capability is None or capability.requires_human_review:
            return True
    return False


def _risk_for(actions: list[PlannedAction]) -> str:
    ranking = {"low": 0, "medium": 1, "high": 2}
    risk = "low"
    for action in actions:
        capability = get_capability(action.domain, action.action)
        if capability and ranking[capability.risk_level] > ranking[risk]:
            risk = capability.risk_level
    return risk if actions else "medium"


def _legacy_order_payload(proposals: list[NoraProposal]) -> dict[str, Any] | None:
    for proposal in proposals:
        if proposal.type == "order_draft":
            payload = dict(proposal.payload)
            payload["source"] = "whatsapp"
            return payload
    return None


def _suggested_reply_for(mode: str, intent: str) -> str:
    if intent == "pedido":
        return "Recibido. Voy a validar los datos del pedido y te confirmamos en breve."
    if intent == "consulta_pedidos":
        if mode == "cliente":
            return "Recibido. Voy a revisar el estado del pedido y te respondemos en breve."
        return "Voy a revisar tus pedidos pendientes y te comparto el resumen."
    if intent == "consulta_cartera":
        return "Voy a revisar la informacion de cupo y cartera disponible."
    if intent == "soporte_pago":
        return "Recibido el soporte. Lo dejamos para revision administrativa."
    if intent == "guia_logistica":
        return "Recibido. Dejamos la informacion logistica para revision."
    if intent == "agenda":
        return "Voy a revisar tu agenda y pendientes."
    if intent == "resumen_conversacion":
        return "Prepare un resumen operativo de esta conversacion."
    return "Recibido. Dejamos el mensaje pendiente de revision."


def _clarification_for(missing_fields: list[str]) -> str:
    if "company_id" in missing_fields:
        return "Para preparar el pedido, dime si debe salir por Nortech o por Nanonutricion."
    if "customer_zone_id" in missing_fields:
        return "Para preparar el pedido, dime la zona o sede de despacho."
    if "customer_id" in missing_fields:
        return "Necesito identificar el cliente antes de continuar."
    if "items" in missing_fields:
        return "Dime que productos y cantidades necesita el pedido."
    return "Me falta un dato para continuar. Puedes confirmarme la informacion faltante?"
```

- [ ] **Step 4: Run focused Python tests**

Run:

```bash
cd agents/nora
PYTHONPATH=. uv run pytest tests/test_operation_capabilities.py tests/test_whatsapp_router.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agents/nora/src/operation/planner.py agents/nora/src/operation/validator.py agents/nora/src/whatsapp_router.py agents/nora/tests/test_whatsapp_router.py
git commit -m "feat: plan and validate nora whatsapp operations"
```

---

### Task 4: Enrich WhatsApp Context Sent To Nora

**Files:**
- Modify: `apps/api/src/modules/whatsapp/whatsapp.service.ts`
- Modify: `apps/api/src/modules/whatsapp/nora-routing.service.ts`
- Test: `apps/api/test/whatsapp.e2e-spec.ts`

- [ ] **Step 1: Add e2e expectation for enriched Nora payload**

In `apps/api/test/whatsapp.e2e-spec.ts`, find the test that receives a Kapso message and stubs the Nora route request. Add assertions to the captured request body:

```typescript
expect(noraRouteBody).toMatchObject({
  sender_type: "cliente",
  conversation_id: expect.any(String),
  customer: expect.objectContaining({ id: expect.any(String) }),
});
expect(Array.isArray(noraRouteBody.companies)).toBe(true);
expect(Array.isArray(noraRouteBody.customer_zones)).toBe(true);
expect(Array.isArray(noraRouteBody.recent_messages)).toBe(true);
```

If the test currently does not capture `noraRouteBody`, wrap the fetch mock used for `NORA_API_URL` so it stores `JSON.parse(init.body as string)` before returning the fake Nora response.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts
```

Expected: FAIL because `companies`, `customer_zones` and `recent_messages` are not sent yet.

- [ ] **Step 3: Add context helper to WhatsAppService**

In `apps/api/src/modules/whatsapp/whatsapp.service.ts`, add this public method before `resolveSenderByPhone`:

```typescript
  async getNoraConversationContext(conversationId: string) {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
      include: {
        customer: {
          include: {
            customerZones: {
              where: { isActive: true },
              include: { zone: true },
            },
          },
        },
        contact: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 8,
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException("WhatsApp conversation not found");
    }

    const companies = await this.prisma.company.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, prefix: true },
    });

    return {
      customer: conversation.customer
        ? {
            id: conversation.customer.id,
            displayName: conversation.customer.displayName,
            legalName: conversation.customer.legalName,
          }
        : null,
      contact: conversation.contact
        ? {
            id: conversation.contact.id,
            fullName: conversation.contact.fullName,
          }
        : null,
      companies,
      customer_zones:
        conversation.customer?.customerZones.map((customerZone) => ({
          id: customerZone.id,
          name: customerZone.zone.name,
        })) ?? [],
      recent_messages: conversation.messages
        .slice()
        .reverse()
        .map((message) => ({
          role: message.role,
          body: message.body,
        })),
    };
  }
```

If TypeScript reports that `customerZones` is not the relation name on `Customer`, inspect `apps/api/prisma/schema.prisma` and use the actual relation field name from the generated Prisma type.

- [ ] **Step 4: Send enriched payload from NoraRoutingService**

In `apps/api/src/modules/whatsapp/nora-routing.service.ts`, inside `routeInboundMessage`, before `requestNoraRoute`, add:

```typescript
      const context = await this.whatsAppService.getNoraConversationContext(conversation.id);
```

Then replace the `requestNoraRoute` payload with:

```typescript
      const noraResponse = await this.requestNoraRoute({
        sender_type: sender.senderType,
        message: message.body,
        conversation_id: conversation.id,
        customer:
          context.customer ??
          ("customerId" in sender
            ? {
                id: sender.customerId,
              }
            : undefined),
        contact: context.contact ?? undefined,
        companies: context.companies,
        customer_zones: context.customer_zones,
        recent_messages: context.recent_messages,
      });
```

- [ ] **Step 5: Run API test**

Run:

```bash
pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/whatsapp/whatsapp.service.ts apps/api/src/modules/whatsapp/nora-routing.service.ts apps/api/test/whatsapp.e2e-spec.ts
git commit -m "feat: enrich nora whatsapp routing context"
```

---

### Task 5: Persist And Render Rich Nora Outputs In Inbox

**Files:**
- Modify: `apps/web/src/components/whatsapp/whatsapp-types.ts`
- Modify: `apps/web/src/components/whatsapp/nora-suggestion-panel.tsx`
- Modify: `apps/web/src/components/whatsapp/order-draft-panel.tsx`

- [ ] **Step 1: Extend frontend types**

Edit `apps/web/src/components/whatsapp/whatsapp-types.ts` so the Nora output types include:

```typescript
export type NoraRiskLevel = "low" | "medium" | "high";

export type NoraProposal = {
  type: "order_draft" | "payment_support" | "logistics_event" | "expense_draft";
  title: string;
  payload: Record<string, unknown>;
  requires_human_review: boolean;
};

export type NoraActionOutput = {
  mode?: string;
  intent?: string;
  summary?: string;
  suggested_reply?: string;
  requires_human_review?: boolean;
  risk_level?: NoraRiskLevel;
  missing_fields?: string[];
  blocked_reason?: string | null;
  proposals?: NoraProposal[];
  proposed_order?: Record<string, unknown>;
};
```

Then change `NoraActionLog.output` to:

```typescript
  output?: NoraActionOutput | null;
```

- [ ] **Step 2: Update suggestion panel rendering**

Replace the body of `apps/web/src/components/whatsapp/nora-suggestion-panel.tsx` with:

```tsx
import { Badge } from "@/components/ui/badge";
import type { NoraProposal, WhatsAppConversationDetail } from "./whatsapp-types";

type NoraSuggestionPanelProps = {
  conversation: WhatsAppConversationDetail | null;
};

const riskLabels: Record<string, string> = {
  low: "Bajo",
  medium: "Medio",
  high: "Alto",
};

export function NoraSuggestionPanel({ conversation }: NoraSuggestionPanelProps) {
  const latestAction = conversation?.noraActions?.[0] ?? null;
  const output = latestAction?.output ?? null;
  const proposals = output?.proposals ?? [];

  if (!conversation) {
    return (
      <div className="border-b border-border p-3">
        <div className="text-sm font-semibold">Nora</div>
        <p className="mt-1 text-sm text-muted-foreground">Selecciona una conversacion.</p>
      </div>
    );
  }

  return (
    <div className="border-b border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">Nora</div>
        {latestAction ? <Badge variant="secondary">{latestAction.status}</Badge> : null}
      </div>

      {!output ? (
        <p className="mt-2 text-sm text-muted-foreground">Sin sugerencias todavia.</p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {output.mode ? <Badge variant="outline">{output.mode}</Badge> : null}
            {output.intent ? <Badge variant="outline">{output.intent}</Badge> : null}
            {output.risk_level ? (
              <Badge variant={output.risk_level === "high" ? "destructive" : "secondary"}>
                Riesgo {riskLabels[output.risk_level] ?? output.risk_level}
              </Badge>
            ) : null}
          </div>

          {output.summary ? (
            <div className="rounded-md border border-border bg-muted p-2 text-sm text-foreground">
              {output.summary}
            </div>
          ) : null}

          {output.blocked_reason ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
              {output.blocked_reason}
            </div>
          ) : null}

          {output.missing_fields && output.missing_fields.length > 0 ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
              Falta: {output.missing_fields.join(", ")}
            </div>
          ) : null}

          {output.suggested_reply ? (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Respuesta sugerida
              </div>
              <div className="rounded-md border border-border bg-background p-2 text-sm">
                {output.suggested_reply}
              </div>
            </div>
          ) : null}

          {proposals.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase text-muted-foreground">
                Propuestas
              </div>
              {proposals.map((proposal, index) => (
                <ProposalPreview key={`${proposal.type}-${index}`} proposal={proposal} />
              ))}
            </div>
          ) : null}

          {latestAction?.error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
              {latestAction.error}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ProposalPreview({ proposal }: { proposal: NoraProposal }) {
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">{proposal.title}</div>
        <Badge variant="secondary">{proposal.type}</Badge>
      </div>
      <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-xs text-muted-foreground">
        {JSON.stringify(proposal.payload, null, 2)}
      </pre>
    </div>
  );
}
```

- [ ] **Step 3: Read proposals array in order draft panel**

In `apps/web/src/components/whatsapp/order-draft-panel.tsx`, replace:

```typescript
  const latestProposal = conversation?.noraActions?.find((action) => action.output?.proposed_order)
    ?.output?.proposed_order;
```

with:

```typescript
  const latestProposal =
    conversation?.noraActions
      ?.flatMap((action) => action.output?.proposals ?? [])
      .find((proposal) => proposal.type === "order_draft")?.payload ??
    conversation?.noraActions?.find((action) => action.output?.proposed_order)?.output
      ?.proposed_order;
```

- [ ] **Step 4: Run web build**

Run:

```bash
pnpm --filter @norgtech/web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/whatsapp/whatsapp-types.ts apps/web/src/components/whatsapp/nora-suggestion-panel.tsx apps/web/src/components/whatsapp/order-draft-panel.tsx
git commit -m "feat: render rich nora whatsapp suggestions"
```

---

### Task 6: Add Support And Logistics Proposal Coverage

**Files:**
- Modify: `agents/nora/tests/test_whatsapp_router.py`
- Modify: `agents/nora/src/operation/planner.py`
- Modify: `agents/nora/src/operation/validator.py`
- Modify: `agents/nora/src/whatsapp_router.py`

- [ ] **Step 1: Add tests for payment and logistics proposals**

Append to `agents/nora/tests/test_whatsapp_router.py`:

```python
def test_payment_support_message_creates_review_proposal():
    result = route_whatsapp_message(
        {
            "sender_type": "cliente",
            "message": "Ya pagamos la factura, adjunto soporte de transferencia",
            "customer": {"id": "customer-1", "displayName": "Agro Norte"},
        }
    )

    assert result["intent"] == "soporte_pago"
    assert result["risk_level"] == "high"
    assert result["requires_human_review"] is True
    assert result["proposals"][0]["type"] == "payment_support"
    assert result["proposals"][0]["payload"]["customerId"] == "customer-1"


def test_admin_logistics_message_creates_review_proposal():
    result = route_whatsapp_message(
        {
            "sender_type": "admin",
            "message": "Pedido despachado por Coordinadora con guia 12345",
        }
    )

    assert result["intent"] == "guia_logistica"
    assert result["risk_level"] == "high"
    assert result["requires_human_review"] is True
    assert result["proposals"][0]["type"] == "logistics_event"
```

- [ ] **Step 2: Run tests**

Run:

```bash
cd agents/nora
PYTHONPATH=. uv run pytest tests/test_whatsapp_router.py -q
```

Expected: PASS if Task 3 already covers these cases. If it fails, adjust the planner keyword ordering so payment words are checked before generic invoice/status words and logistics words are checked before generic order status words.

- [ ] **Step 3: Commit**

```bash
git add agents/nora/tests/test_whatsapp_router.py agents/nora/src/operation/planner.py agents/nora/src/operation/validator.py agents/nora/src/whatsapp_router.py
git commit -m "test: cover nora payment and logistics proposals"
```

---

### Task 7: End-To-End Route Logging Regression

**Files:**
- Modify: `apps/api/test/whatsapp.e2e-spec.ts`
- Modify: `apps/api/src/modules/whatsapp/nora-routing.service.ts`

- [ ] **Step 1: Add log persistence assertions**

In the Kapso webhook routing test in `apps/api/test/whatsapp.e2e-spec.ts`, make the mocked Nora response include rich fields:

```typescript
const noraResponse = {
  mode: "cliente",
  intent: "pedido",
  summary: "Agro Norte solicita un pedido",
  suggested_reply: "Recibido. Voy a validar los datos del pedido y te confirmamos en breve.",
  requires_human_review: true,
  risk_level: "high",
  missing_fields: [],
  proposals: [
    {
      type: "order_draft",
      title: "Borrador de pedido",
      payload: {
        customerId: "customer-1",
        companyId: "company-nt",
        customerZoneId: "zone-costa",
        sourceConversationId: "conversation-1",
        items: [],
      },
      requires_human_review: true,
    },
  ],
};
```

Then assert the stored action log:

```typescript
expect(action.output).toMatchObject({
  intent: "pedido",
  risk_level: "high",
  proposals: [
    expect.objectContaining({
      type: "order_draft",
      payload: expect.objectContaining({ sourceConversationId: expect.any(String) }),
    }),
  ],
});
expect(action.status).toBe("proposed");
```

- [ ] **Step 2: Run test**

Run:

```bash
pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts
```

Expected: PASS. If the action log status is different, inspect `NoraRoutingService` and keep `proposed` for human-review outputs.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/whatsapp.e2e-spec.ts apps/api/src/modules/whatsapp/nora-routing.service.ts
git commit -m "test: persist rich nora action outputs"
```

---

### Task 8: Final Verification

**Files:**
- All changed files from Tasks 1-7.

- [ ] **Step 1: Run Nora Python tests**

Run:

```bash
cd agents/nora
PYTHONPATH=. uv run pytest tests -q
```

Expected: PASS.

- [ ] **Step 2: Run API WhatsApp tests**

Run:

```bash
pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts
```

Expected: PASS.

- [ ] **Step 3: Build web**

Run:

```bash
pnpm --filter @norgtech/web build
```

Expected: PASS.

- [ ] **Step 4: Inspect git status**

Run:

```bash
git status --short
```

Expected: only intentional changed files remain, or clean tree after all commits.

- [ ] **Step 5: Record verification result**

If all commands pass, add a short note to the final implementation summary:

```markdown
Verification:
- Nora tests: PASS
- API WhatsApp tests: PASS
- Web build: PASS
```

If any command fails for environment reasons, include the exact failing command and the first actionable error line in the final summary.

---

## Self-Review

- Spec coverage: covers capability registry, modes, planner, validator, WhatsApp context, `NoraActionLog`, proposals, frontend inbox rendering, safety and rollout.
- Scope control: first delivery does not add OCR, accounting integration, large dashboards or autonomous high-risk actions.
- Type consistency: Python response fields map to frontend `NoraActionOutput` and existing Prisma JSON action log storage.
- Backward compatibility: `proposed_order` remains in the Nora response while the new `proposals` array is introduced.

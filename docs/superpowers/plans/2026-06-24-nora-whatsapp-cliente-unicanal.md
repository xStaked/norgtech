# Nora — Cliente externo por WhatsApp (híbrido) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un cliente externo por WhatsApp reciba respuestas de Nora sobre sus propios pedidos/cartera (desde un snapshot scopeado server-side) y sea derivado al buzón único (Magali) cuando necesita un humano, gateado por un flag de entorno con fallback al planner.

**Architecture:** Un agente de cliente stateless en Python (`whatsapp_customer_agent.py`) que responde desde un `customer_snapshot` pasado en la petición y expone una sola tool `derivar_a_unicanal`; expuesto en `POST /whatsapp/agent/customer`. En NestJS, una rama nueva (gateada por `NORA_WHATSAPP_CUSTOMER_AGENT`) arma el snapshot vía Prisma scopeado al `customerId` resuelto, llama al agente, y si hay handoff asigna la conversación a `NORA_UNICANAL_USER_ID` + nota interna; en error/flag-off cae al planner. Sin auth de cliente, sin endpoints de API nuevos, sin modelo de áreas.

**Tech Stack:** Python 3.14, LangGraph (StateGraph stateless), FastAPI, Pydantic; NestJS (TypeScript) + Prisma, Jest e2e; `pytest`.

## Global Constraints

- Espejar el patrón del Sub-proyecto A (agente general): agente stateless Python + flag de entorno + fallback al planner. Referencias: `agents/nora/src/whatsapp_general_agent.py`, `whatsapp_agent.py`, y la rama de `nora-routing.service.ts`.
- El agente de cliente es **stateless** (historial por turno; sin checkpointer) y **sin tools de escritura/lectura del CRM**; su único tool es `derivar_a_unicanal(motivo, intent)`.
- El cliente **nunca** ejecuta escrituras; hacer/cambiar pedido, reclamos, o info fuera del snapshot → handoff.
- Acceso a datos: **sin token ni rol de cliente**. El `customer_snapshot` se arma server-side en NestJS vía Prisma, **estrictamente scopeado al `customerId`** resuelto del remitente.
- Ruteo humano: **buzón único** = `process.env.NORA_UNICANAL_USER_ID`. Sin modelo de áreas.
- Gating NestJS: la rama nueva SOLO actúa con `process.env.NORA_WHATSAPP_CUSTOMER_AGENT === "true"`; apagada o en error → planner actual (sin regresión).
- NO tocar: `whatsapp_agent.py`/`EXPENSE_TOOLS`, `whatsapp_general_agent.py`, el planner (`/whatsapp/route`/`requestNoraRoute`), el agente web, ni `apps/web`. Las extensiones a los modelos compartidos deben ser **aditivas y opcionales** (no romper gastos ni el agente general).
- Tests: Python → `cd agents/nora && python -m pytest` (`.venv`; `source .venv/bin/activate` si falla import). NestJS e2e → `cd apps/api && npx jest --config test/jest-e2e.json test/whatsapp.e2e-spec.ts`.

---

### Task 1: Modelos compartidos + agente de cliente (Python)

**Files:**
- Modify: `agents/nora/src/models/whatsapp_models.py` (modelos nuevos + campos aditivos)
- Create: `agents/nora/src/whatsapp_customer_agent.py`
- Test: `agents/nora/tests/test_whatsapp_customer_agent.py`

**Interfaces:**
- Consumes: `create_llm` de `agent.py`; `WhatsAppAgentRequest`/`WhatsAppAgentResponse`, `NoraMessageContext` de `models/whatsapp_models.py`.
- Produces:
  - Modelos `NoraCustomerSnapshot` (`customerName: str | None`, `recentOrders: list[dict]`, `cartera: dict`) y `NoraHandoff` (`needed: bool`, `reason: str | None`, `intent: str | None`).
  - `WhatsAppAgentRequest.customer_snapshot: NoraCustomerSnapshot | None` (default None).
  - `WhatsAppAgentResponse.handoff: NoraHandoff | None` (default None).
  - `CUSTOMER_AGENT_PROMPT: str`, `derivar_a_unicanal` (tool), `_snapshot_block`, `_to_messages`, `_extract_handoff`, `run_whatsapp_customer_agent(request) -> WhatsAppAgentResponse`.

- [ ] **Step 1: Write the failing test**

```python
"""Deterministic tests for whatsapp_customer_agent (no LLM, no network)."""
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from src.models.whatsapp_models import (
    NoraCustomerSnapshot,
    NoraMessageContext,
    WhatsAppAgentRequest,
)
from src.whatsapp_customer_agent import _extract_handoff, _snapshot_block, _to_messages


def _snapshot() -> NoraCustomerSnapshot:
    return NoraCustomerSnapshot(
        customerName="Avicola del Valle",
        recentOrders=[{"orderNumber": "NT-100", "status": "despachado", "orderDate": "2026-06-20", "total": 1500000}],
        cartera={"saldo": 800000, "vencidasCount": 1},
    )


def _req(**kwargs) -> WhatsAppAgentRequest:
    defaults = dict(current_message="¿cómo va mi pedido?", history=[], auth="", conversation_id="conv_1",
                    customer_snapshot=_snapshot())
    defaults.update(kwargs)
    return WhatsAppAgentRequest(**defaults)


def test_snapshot_block_includes_orders_and_cartera():
    block = _snapshot_block(_req())
    assert "Avicola del Valle" in block
    assert "NT-100" in block
    assert "despachado" in block
    assert "800000" in block


def test_snapshot_block_handles_no_snapshot():
    block = _snapshot_block(_req(customer_snapshot=None))
    assert "sin datos" in block.lower() or "no hay" in block.lower()


def test_first_two_messages_are_prompt_and_snapshot():
    msgs = _to_messages(_req())
    assert isinstance(msgs[0], SystemMessage) and "Nora" in msgs[0].content
    assert isinstance(msgs[1], SystemMessage) and "DATOS DEL CLIENTE" in msgs[1].content


def test_current_message_not_duplicated_when_last_history():
    req = _req(
        history=[NoraMessageContext(role="user", body="hola")],
        current_message="hola",
    )
    msgs = _to_messages(req)
    assert sum(1 for m in msgs if isinstance(m, HumanMessage) and m.content == "hola") == 1


def test_extract_handoff_detects_derivation():
    msgs = [ToolMessage(content="DERIVADO|pedido|quiere hacer un pedido", tool_call_id="tc_1", name="derivar_a_unicanal")]
    h = _extract_handoff(msgs)
    assert h.needed is True
    assert h.intent == "pedido"
    assert h.reason == "quiere hacer un pedido"


def test_extract_handoff_returns_not_needed_without_tool():
    msgs = [AIMessage(content="Tu pedido NT-100 va despachado.")]
    h = _extract_handoff(msgs)
    assert h.needed is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents/nora && python -m pytest tests/test_whatsapp_customer_agent.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'src.whatsapp_customer_agent'` (o ImportError de los modelos nuevos).

- [ ] **Step 3a: Add the shared models** (`agents/nora/src/models/whatsapp_models.py`)

Añadir estos modelos (cerca de `WhatsAppAgentRequest`/`WhatsAppAgentResponse`):

```python
class NoraCustomerSnapshot(BaseModel):
    customerName: str | None = None
    recentOrders: list[dict] = Field(default_factory=list)
    cartera: dict = Field(default_factory=dict)


class NoraHandoff(BaseModel):
    needed: bool = False
    reason: str | None = None
    intent: str | None = None
```

Y extender (aditivo, opcional) los contratos existentes:

```python
class WhatsAppAgentRequest(BaseModel):
    current_message: str
    history: list[NoraMessageContext] = Field(default_factory=list)
    open_case: NoraOpenCaseContext | None = None
    attachments: list[NoraAgentAttachment] = Field(default_factory=list)
    sender: NoraUserContext | None = None
    conversation_id: str | None = None
    auth: str
    customer_snapshot: "NoraCustomerSnapshot | None" = None
```

```python
class WhatsAppAgentResponse(BaseModel):
    reply_text: str
    case_update: dict[str, Any] | None = None
    executed_entity: dict[str, Any] | None = None
    handoff: "NoraHandoff | None" = None
```

(Define `NoraCustomerSnapshot`/`NoraHandoff` ANTES de las clases que los referencian, o deja las anotaciones como string — Pydantic v2 las resuelve. `Field` y `Any` ya están importados en el módulo.)

- [ ] **Step 3b: Implement the customer agent** (`agents/nora/src/whatsapp_customer_agent.py`)

```python
"""
Stateless WhatsApp customer agent (external clients).

Answers a client's questions about their OWN orders/cartera from a snapshot
passed in by NestJS (scoped server-side to the resolved customerId). It cannot
read the CRM; anything needing a human is handed off to the unicanal via the
single `derivar_a_unicanal` tool. Stateless: full history passed per turn.
"""
import json
from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from .agent import create_llm
from .models.whatsapp_models import NoraHandoff, WhatsAppAgentRequest, WhatsAppAgentResponse

CUSTOMER_AGENT_PROMPT = """Eres Nora, la asistente de Norgtech, atendiendo a un CLIENTE externo por WhatsApp.

Tono: amable, claro y breve. Texto plano (sin markdown ni tablas).

Qué puedes hacer:
- Responder sobre los pedidos y la cartera del cliente USANDO SOLO los datos del
  bloque [DATOS DEL CLIENTE]. Nunca inventes números, estados ni fechas.

Cuándo derivar a un asesor humano (usa la tool derivar_a_unicanal):
- El cliente quiere hacer, cambiar o cancelar un pedido.
- Tiene un reclamo, una queja o un problema.
- Pide información que NO está en [DATOS DEL CLIENTE].
- Pide hablar con un área (cartera, contabilidad, logística, comercial) o con una persona.
En esos casos llama a derivar_a_unicanal con un 'intent' corto (ej: "pedido",
"cartera", "logistica", "reclamo", "comercial") y un 'motivo' de una frase, y luego
dile al cliente en tono cálido que ya un asesor lo va a contactar.

Si puedes resolver con los datos disponibles, responde directo y no derives.
"""


@tool
def derivar_a_unicanal(motivo: str, intent: str) -> str:
    """Deriva la conversación a un asesor humano (buzón único) cuando el cliente
    necesita algo que no puedes resolver con los datos disponibles: hacer/cambiar
    un pedido, reclamos, info faltante, o hablar con un área/persona.

    Args:
        motivo: Frase corta con el motivo de la derivación.
        intent: Etiqueta corta del tema (pedido, cartera, logistica, reclamo, comercial).
    """
    return f"DERIVADO|{intent}|{motivo}"


CUSTOMER_TOOLS = [derivar_a_unicanal]


class _CustomerState(TypedDict):
    messages: Annotated[list, add_messages]


def _build_customer_graph():
    llm = create_llm().bind_tools(CUSTOMER_TOOLS)
    tool_node = ToolNode(CUSTOMER_TOOLS)

    def call_model(state: _CustomerState) -> dict:
        return {"messages": [llm.invoke(state["messages"])]}

    def should_continue(state: _CustomerState):
        last = state["messages"][-1]
        if getattr(last, "tool_calls", None):
            return "tools"
        return "__end__"

    workflow = StateGraph(_CustomerState)
    workflow.add_node("agent", call_model)
    workflow.add_node("tools", tool_node)
    workflow.set_entry_point("agent")
    workflow.add_conditional_edges("agent", should_continue, {"tools": "tools", "__end__": END})
    workflow.add_edge("tools", "agent")
    return workflow.compile()


_customer_graph = _build_customer_graph()


def _snapshot_block(request: WhatsAppAgentRequest) -> str:
    snap = request.customer_snapshot
    if not snap:
        return "[DATOS DEL CLIENTE] Sin datos disponibles."
    return (
        "[DATOS DEL CLIENTE]\n"
        f"- cliente: {snap.customerName or 'desconocido'}\n"
        f"- pedidos recientes: {json.dumps(snap.recentOrders, ensure_ascii=False)}\n"
        f"- cartera: {json.dumps(snap.cartera, ensure_ascii=False)}"
    )


def _to_messages(request: WhatsAppAgentRequest) -> list:
    messages: list = [
        SystemMessage(content=CUSTOMER_AGENT_PROMPT),
        SystemMessage(content=_snapshot_block(request)),
    ]
    for item in request.history:
        if item.role == "assistant":
            messages.append(AIMessage(content=item.body))
        else:
            messages.append(HumanMessage(content=item.body))
    if not request.history or request.history[-1].body != request.current_message:
        messages.append(HumanMessage(content=request.current_message))
    return messages


def _extract_handoff(messages: list) -> NoraHandoff:
    """Scan in reverse for a derivar_a_unicanal ToolMessage ('DERIVADO|intent|motivo')."""
    for msg in reversed(messages):
        if isinstance(msg, ToolMessage) and msg.name == "derivar_a_unicanal":
            parts = (msg.content or "").split("|", 2)
            if len(parts) == 3 and parts[0] == "DERIVADO":
                return NoraHandoff(needed=True, intent=parts[1] or None, reason=parts[2] or None)
            return NoraHandoff(needed=True)
    return NoraHandoff(needed=False)


async def run_whatsapp_customer_agent(request: WhatsAppAgentRequest) -> WhatsAppAgentResponse:
    """Run one stateless turn of the customer agent and return reply + handoff."""
    state: _CustomerState = {"messages": _to_messages(request)}
    result = await _customer_graph.ainvoke(state)

    reply_text = ""
    for msg in reversed(result["messages"]):
        if isinstance(msg, AIMessage) and msg.content and not getattr(msg, "tool_calls", None):
            reply_text = msg.content
            break
    if not reply_text:
        reply_text = "Gracias por escribir. Ya un asesor te va a contactar."

    return WhatsAppAgentResponse(
        reply_text=reply_text,
        case_update=None,
        executed_entity=None,
        handoff=_extract_handoff(result["messages"]),
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agents/nora && python -m pytest tests/test_whatsapp_customer_agent.py -v`
Expected: PASS (6 passed).

- [ ] **Step 5: Commit**

```bash
git add agents/nora/src/models/whatsapp_models.py agents/nora/src/whatsapp_customer_agent.py agents/nora/tests/test_whatsapp_customer_agent.py
git commit -m "feat(nora): stateless customer WhatsApp agent + handoff contracts"
```

---

### Task 2: Endpoint `POST /whatsapp/agent/customer` (Python)

**Files:**
- Modify: `agents/nora/src/main.py` (import + endpoint)
- Test: `agents/nora/tests/test_whatsapp_customer_endpoint.py`

**Interfaces:**
- Consumes: `run_whatsapp_customer_agent` de `whatsapp_customer_agent.py`; `WhatsAppAgentRequest`/`WhatsAppAgentResponse`.
- Produces: ruta `POST /whatsapp/agent/customer` → `WhatsAppAgentResponse`.

- [ ] **Step 1: Write the failing test**

```python
from unittest.mock import patch

from fastapi.testclient import TestClient

from src.main import app
from src.models.whatsapp_models import NoraHandoff, WhatsAppAgentResponse


def test_whatsapp_customer_endpoint_returns_reply_and_handoff():
    client = TestClient(app)

    async def fake_run(request):
        return WhatsAppAgentResponse(
            reply_text="Ya un asesor te contacta.",
            case_update=None,
            executed_entity=None,
            handoff=NoraHandoff(needed=True, intent="pedido", reason="quiere pedir"),
        )

    with patch("src.main.run_whatsapp_customer_agent", side_effect=fake_run):
        response = client.post(
            "/whatsapp/agent/customer",
            json={"current_message": "quiero hacer un pedido", "history": [], "auth": "", "conversation_id": "conv_1"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["reply_text"] == "Ya un asesor te contacta."
    assert body["handoff"]["needed"] is True
    assert body["handoff"]["intent"] == "pedido"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents/nora && python -m pytest tests/test_whatsapp_customer_endpoint.py -v`
Expected: FAIL — 404 (ruta inexistente) o AttributeError al parchear.

- [ ] **Step 3: Implement**

En `agents/nora/src/main.py`, añadir el import junto a los otros agentes WhatsApp:

```python
from .whatsapp_customer_agent import run_whatsapp_customer_agent
```

Y el endpoint después de `@app.post("/whatsapp/agent/general", ...)`:

```python
@app.post("/whatsapp/agent/customer", response_model=WhatsAppAgentResponse)
async def whatsapp_customer_agent(payload: WhatsAppAgentRequest) -> WhatsAppAgentResponse:
    return await run_whatsapp_customer_agent(payload)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agents/nora && python -m pytest tests/test_whatsapp_customer_endpoint.py -v`
Expected: PASS.

- [ ] **Step 5: Full suite + commit**

Run: `cd agents/nora && python -m pytest -q`
Expected: toda la suite pasa.

```bash
git add agents/nora/src/main.py agents/nora/tests/test_whatsapp_customer_endpoint.py
git commit -m "feat(nora): expose POST /whatsapp/agent/customer"
```

---

### Task 3: Snapshot + ruteo de cliente + handoff (NestJS)

**Files:**
- Modify: `apps/api/src/modules/whatsapp/nora-routing.service.ts` (snapshot builder + rama de cliente + handoff + `requestNoraCustomerAgent`)
- Test: `apps/api/test/whatsapp.e2e-spec.ts` (nuevos `it(...)`)

**Interfaces:**
- Consumes: `this.prisma` (order/invoice/whatsAppConversation/whatsAppInternalNote), `this.authService`/`this.whatsAppService.sendAgentReply`, `context.recent_messages`, `sender` (con `customerId` cuando `senderType === cliente`), `openCase`, `mediaPayload`, `actionLog`.
- Produces: método `requestNoraCustomerAgent(payload)`; método `buildCustomerSnapshot(customerId)`; rama de ruteo gateada.

- [ ] **Step 1: Write the failing test**

Añadir en `apps/api/test/whatsapp.e2e-spec.ts` (dentro del `describe` principal). Estudia el test existente que postea un webhook de CLIENTE (busca un test con `senderType` cliente o un contacto resuelto; si no hay helper reutilizable, extrae uno local `postCustomerWebhookText(body)` siguiendo el patrón del webhook de comercial ~línea 1814 pero con un teléfono que resuelva a un Contact/cliente). El test:

```typescript
describe("customer-agent branch (NORA_WHATSAPP_CUSTOMER_AGENT)", () => {
  it("routes a customer message to the customer agent and hands off to the unicanal inbox", async () => {
    const prevFlag = process.env.NORA_WHATSAPP_CUSTOMER_AGENT;
    const prevUnicanal = process.env.NORA_UNICANAL_USER_ID;
    process.env.NORA_WHATSAPP_CUSTOMER_AGENT = "true";
    process.env.NORA_UNICANAL_USER_ID = "user-magali";
    try {
      (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          reply_text: "Ya un asesor te contacta.",
          case_update: null,
          executed_entity: null,
          handoff: { needed: true, intent: "pedido", reason: "quiere pedir" },
        }),
      });

      await postCustomerWebhookText("quiero hacer un pedido");

      const customerCall = (globalThis.fetch as jest.Mock).mock.calls.find(
        ([url]) => typeof url === "string" && url.endsWith("/whatsapp/agent/customer"),
      );
      expect(customerCall).toBeDefined();

      const routeCall = (globalThis.fetch as jest.Mock).mock.calls.find(
        ([url]) => typeof url === "string" && url.endsWith("/whatsapp/route"),
      );
      expect(routeCall).toBeUndefined();

      // handoff assigns the conversation to the unicanal user and writes a note
      expect(conversationUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ assignedToUserId: "user-magali" }) }),
      );
      expect(internalNoteCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ authorUserId: "user-magali" }) }),
      );
    } finally {
      process.env.NORA_WHATSAPP_CUSTOMER_AGENT = prevFlag;
      process.env.NORA_UNICANAL_USER_ID = prevUnicanal;
    }
  });

  it("falls back to the planner for a customer message when the flag is off", async () => {
    const prevFlag = process.env.NORA_WHATSAPP_CUSTOMER_AGENT;
    delete process.env.NORA_WHATSAPP_CUSTOMER_AGENT;
    try {
      (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ mode: "cliente", intent: "consulta", summary: "", suggested_reply: "Hola", requires_human_review: false, risk_level: "low", missing_fields: [], proposals: [] }),
      });
      await postCustomerWebhookText("hola");
      const routeCall = (globalThis.fetch as jest.Mock).mock.calls.find(
        ([url]) => typeof url === "string" && url.endsWith("/whatsapp/route"),
      );
      expect(routeCall).toBeDefined();
      const customerCall = (globalThis.fetch as jest.Mock).mock.calls.find(
        ([url]) => typeof url === "string" && url.endsWith("/whatsapp/agent/customer"),
      );
      expect(customerCall).toBeUndefined();
    } finally {
      process.env.NORA_WHATSAPP_CUSTOMER_AGENT = prevFlag;
    }
  });
});
```

Nota implementador: `conversationUpdateMock`/`internalNoteCreateMock`/`postCustomerWebhookText` deben venir del setup de mocks Prisma del e2e (mira cómo el archivo mockea `whatsAppConversation.update` y, si no existe, `whatsAppInternalNote.create`, en el bloque `beforeEach`/objeto prisma mock ~líneas 286-340). Si falta el mock de `whatsAppInternalNote.create`, agrégalo al objeto prisma mock con `jest.fn()` y captúralo en una variable, igual que los demás. NO debilites las aserciones de asignación/nota.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest --config test/jest-e2e.json test/whatsapp.e2e-spec.ts -t "customer-agent branch"`
Expected: FAIL — hoy el mensaje de cliente va al planner; no hay llamada a `/whatsapp/agent/customer` ni asignación al unicanal.

- [ ] **Step 3: Implement**

En `nora-routing.service.ts`, dentro de `routeInboundMessage`, insertar la rama de cliente DESPUÉS de la rama del agente general (la de `NORA_WHATSAPP_GENERAL_AGENT`) y ANTES del `const noraResponse = await this.requestNoraRoute({...})`:

```typescript
      if (
        process.env.NORA_WHATSAPP_CUSTOMER_AGENT === "true" &&
        sender.senderType === WhatsAppSenderType.cliente &&
        "customerId" in sender &&
        sender.customerId &&
        !openCase &&
        !mediaPayload
      ) {
        try {
          const customerSnapshot = await this.buildCustomerSnapshot(sender.customerId);
          const agentResponse = await this.requestNoraCustomerAgent({
            current_message: message.body,
            history: context.recent_messages,
            conversation_id: conversation.id,
            auth: "",
            customer_snapshot: customerSnapshot,
          });

          if (agentResponse.handoff?.needed) {
            const unicanalUserId = process.env.NORA_UNICANAL_USER_ID?.trim();
            if (unicanalUserId) {
              await this.prisma.whatsAppConversation.update({
                where: { id: conversation.id },
                data: { assignedToUserId: unicanalUserId, status: "pendiente" },
              });
              await this.prisma.whatsAppInternalNote.create({
                data: {
                  conversationId: conversation.id,
                  authorUserId: unicanalUserId,
                  body: `Derivación Nora — intent: ${agentResponse.handoff.intent ?? "n/d"}. Motivo: ${agentResponse.handoff.reason ?? "n/d"}`,
                },
              });
            } else {
              this.logger.warn("Customer handoff requested but NORA_UNICANAL_USER_ID is not set");
            }
          }

          await this.prisma.noraActionLog.update({
            where: { id: actionLog.id },
            data: {
              status: agentResponse.handoff?.needed
                ? NoraActionStatus.proposed
                : NoraActionStatus.executed,
              output: agentResponse as unknown as Prisma.InputJsonObject,
            },
          });

          if (agentResponse.reply_text) {
            await this.whatsAppService.sendAgentReply(conversation.id, agentResponse.reply_text);
          }
          return;
        } catch (error) {
          this.logger.error(
            `Nora customer agent failed, falling back to planner: ${String(error)}`,
          );
          // fall through to the planner path below
        }
      }
```

Añadir el builder del snapshot y el cliente HTTP (junto a `requestNoraGeneralAgent`):

```typescript
  private async buildCustomerSnapshot(customerId: string) {
    const [customer, orders, invoices] = await Promise.all([
      this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { displayName: true },
      }),
      this.prisma.order.findMany({
        where: { customerId },
        orderBy: { orderDate: "desc" },
        take: 5,
        select: { orderNumber: true, status: true, orderDate: true, total: true },
      }),
      this.prisma.invoice.findMany({
        where: { customerId },
        select: { dueDate: true, totalAmount: true, totalPaid: true, creditNoteTotal: true },
      }),
    ]);

    const now = new Date();
    let saldo = 0;
    let vencidasCount = 0;
    for (const inv of invoices) {
      const balance =
        Number(inv.totalAmount) - Number(inv.totalPaid) - Number(inv.creditNoteTotal ?? 0);
      if (balance > 0) {
        saldo += balance;
        if (inv.dueDate < now) {
          vencidasCount += 1;
        }
      }
    }

    return {
      customerName: customer?.displayName ?? null,
      recentOrders: orders.map((o) => ({
        orderNumber: o.orderNumber,
        status: o.status,
        orderDate: o.orderDate.toISOString(),
        total: Number(o.total),
      })),
      cartera: { saldo, vencidasCount },
    };
  }

  private async requestNoraCustomerAgent(payload: Record<string, unknown>) {
    const noraApiUrl = process.env.NORA_API_URL ?? "http://localhost:8000";
    const response = await fetch(`${noraApiUrl}/whatsapp/agent/customer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Nora customer agent request failed with status ${response.status}`);
    }
    return response.json() as Promise<{
      reply_text: string;
      case_update: Record<string, unknown> | null;
      executed_entity: Record<string, unknown> | null;
      handoff: { needed: boolean; reason: string | null; intent: string | null } | null;
    }>;
  }
```

Notas:
- `WhatsAppSenderType` y `NoraActionStatus` ya están importados en el archivo; `Prisma` también.
- La rama solo actúa para `senderType === cliente` con `customerId`; comerciales/admin no entran aquí (los maneja la rama del agente general / gastos).
- `!openCase` evita secuestrar un caso en progreso; `!mediaPayload` deja media al planner.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest --config test/jest-e2e.json test/whatsapp.e2e-spec.ts -t "customer-agent branch"`
Expected: PASS (2 passed).

- [ ] **Step 5: Full whatsapp e2e + commit**

Run: `cd apps/api && npx jest --config test/jest-e2e.json test/whatsapp.e2e-spec.ts`
Expected: toda la suite de whatsapp pasa (sin regresión en gastos/general/planner).

```bash
git add apps/api/src/modules/whatsapp/nora-routing.service.ts apps/api/test/whatsapp.e2e-spec.ts
git commit -m "feat(nora): route customer WhatsApp messages to customer agent with unicanal handoff (env-flagged)"
```

---

## Self-Review

**Spec coverage:**
- Acceso a datos sin auth nueva (snapshot server-side por customerId) → Task 3 (`buildCustomerSnapshot`) ✓
- Agente de cliente stateless, sin escritura, solo tool `derivar_a_unicanal`, responde desde snapshot → Task 1 ✓
- Handoff vía tool detectada por el runner → `_extract_handoff` (Task 1) + campo `handoff` en la respuesta ✓
- Endpoint `/whatsapp/agent/customer` → Task 2 ✓
- Ruteo NestJS gateado por `NORA_WHATSAPP_CUSTOMER_AGENT`, asigna a `NORA_UNICANAL_USER_ID` + nota + status en handoff, reply, fallback al planner → Task 3 ✓
- Política: cliente nunca escribe; pedir → handoff (prompt + sin tools de escritura) ✓
- Contratos aditivos/opcionales (`customer_snapshot`, `handoff`) → Task 1 ✓
- Fuera de alcance (áreas, token de cliente, endpoints de API, memoria persistente) → no incluido ✓

**Placeholder scan:** sin TBD/TODO; todo el código está completo. La única indirección es el helper de e2e `postCustomerWebhookText` y los mocks Prisma (`conversationUpdateMock`/`internalNoteCreateMock`), con instrucción explícita de extraer/añadir del setup existente — no es lógica de producción pendiente.

**Type consistency:** `NoraCustomerSnapshot`/`NoraHandoff` y los campos `customer_snapshot`/`handoff` consistentes entre Task 1 (modelos+agente), Task 2 (endpoint) y Task 3 (NestJS construye el snapshot con las mismas claves `customerName`/`recentOrders`/`cartera{saldo,vencidasCount}` y lee `handoff.needed/intent/reason`). `run_whatsapp_customer_agent`, `_extract_handoff`, `_snapshot_block`, `_to_messages` consistentes. Payload de `requestNoraCustomerAgent` (`current_message`, `history`, `conversation_id`, `auth:""`, `customer_snapshot`) satisface `WhatsAppAgentRequest`.

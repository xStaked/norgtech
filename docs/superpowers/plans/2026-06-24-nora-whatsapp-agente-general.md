# Nora — Agente general por WhatsApp (comercial) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los mensajes generales del comercial/admin por WhatsApp corran el agente Nora completo (`ALL_TOOLS`) en modo agéntico, gateado por un flag de entorno, espejando el patrón del flujo de gastos.

**Architecture:** Un agente general stateless en Python (`whatsapp_general_agent.py`) que vincula `ALL_TOOLS` con el token scoped, expuesto en `POST /whatsapp/agent/general`. En NestJS, una rama nueva en `NoraRoutingService` gateada por `NORA_WHATSAPP_GENERAL_AGENT` que mintea el token y llama a ese endpoint, con fallback al planner si falla. No se toca el flujo de gastos, el planner, ni el agente web.

**Tech Stack:** Python 3.14, LangGraph (StateGraph stateless), FastAPI; NestJS (TypeScript), Jest e2e; `pytest`.

## Global Constraints

- Espejar el patrón existente de gastos: `whatsapp_agent.py` (Python) y la rama de `isExpenseFlowTurn` en `nora-routing.service.ts` (NestJS).
- El agente general es **stateless** (historial pasado por turno; sin `MemorySaver`).
- Reutilizar los contratos `WhatsAppAgentRequest` / `WhatsAppAgentResponse` (`agents/nora/src/models/whatsapp_models.py`) — NO crear modelos nuevos. `WhatsAppAgentRequest`: `current_message: str`, `history: list[NoraMessageContext]`, `auth: str`, `conversation_id: str | None`, `sender`/`open_case`/`attachments` opcionales. `NoraMessageContext` tiene `role: str` y `body: str`.
- El token scoped se inyecta como `auth_token` en el estado para que `ALL_TOOLS` (que usan `InjectedState("auth_token")`) funcionen igual que en web.
- Gating NestJS: la rama nueva SOLO actúa con `process.env.NORA_WHATSAPP_GENERAL_AGENT === "true"`; apagada → comportamiento idéntico al actual (planner). En error → fallback al planner (try/catch, como gastos).
- NO tocar: `whatsapp_agent.py`/`EXPENSE_TOOLS`, el planner (`/whatsapp/route` y `requestNoraRoute`), el agente web (`agent.py` `nora_graph`/`/messages`), Prisma, `apps/web`.
- Tests Python: `cd agents/nora && python -m pytest` (`.venv`; `source .venv/bin/activate` si los imports fallan). Tests NestJS e2e: `cd apps/api && npx jest --config test/jest-e2e.json test/whatsapp.e2e-spec.ts`.

---

### Task 1: Agente general stateless (Python)

**Files:**
- Create: `agents/nora/src/whatsapp_general_agent.py`
- Test: `agents/nora/tests/test_whatsapp_general_agent.py`

**Interfaces:**
- Consumes: `create_llm`, `ALL_TOOLS` de `agent.py`; `NORA_SYSTEM_PROMPT` de `prompts/system.py`; `WhatsAppAgentRequest`/`WhatsAppAgentResponse`, `NoraMessageContext` de `models/whatsapp_models.py`.
- Produces:
  - `WHATSAPP_ADDENDUM: str` (constante).
  - `_to_messages(request: WhatsAppAgentRequest) -> list` (system+addendum, historial, mensaje actual sin duplicar el último turno).
  - `run_whatsapp_general_agent(request: WhatsAppAgentRequest) -> WhatsAppAgentResponse`.

- [ ] **Step 1: Write the failing test**

```python
"""Deterministic tests for whatsapp_general_agent (no LLM, no network)."""
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from src.models.whatsapp_models import NoraMessageContext, WhatsAppAgentRequest
from src.whatsapp_general_agent import _to_messages


def _req(**kwargs) -> WhatsAppAgentRequest:
    defaults = dict(current_message="¿qué tengo hoy?", history=[], auth="Bearer scoped", conversation_id="conv_1")
    defaults.update(kwargs)
    return WhatsAppAgentRequest(**defaults)


def test_first_message_is_system_prompt_with_whatsapp_addendum():
    msgs = _to_messages(_req())
    assert isinstance(msgs[0], SystemMessage)
    assert "Nora" in msgs[0].content          # NORA_SYSTEM_PROMPT marker
    assert "WhatsApp" in msgs[0].content       # addendum marker


def test_history_converted_in_order_and_roles():
    req = _req(
        history=[
            NoraMessageContext(role="assistant", body="Hola"),
            NoraMessageContext(role="user", body="Chao"),
        ],
        current_message="Chao",  # equals last history item -> no duplicate
    )
    msgs = _to_messages(req)
    assert isinstance(msgs[1], AIMessage) and msgs[1].content == "Hola"
    assert isinstance(msgs[2], HumanMessage) and msgs[2].content == "Chao"
    human = [m for m in msgs if isinstance(m, HumanMessage)]
    assert sum(1 for m in human if m.content == "Chao") == 1


def test_current_message_appended_when_not_last_history():
    req = _req(history=[NoraMessageContext(role="assistant", body="¿algo más?")], current_message="sí")
    msgs = _to_messages(req)
    assert isinstance(msgs[-1], HumanMessage) and msgs[-1].content == "sí"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents/nora && python -m pytest tests/test_whatsapp_general_agent.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'src.whatsapp_general_agent'`.

- [ ] **Step 3: Write minimal implementation**

```python
"""
Stateless WhatsApp general agent runner (comercial/admin).

Runs Nora's full toolset (ALL_TOOLS) over WhatsApp in agentic mode, mirroring
whatsapp_agent.py but with every CRM tool instead of only the expense tools.
NestJS passes the full conversation history on every turn (no checkpointer).
"""
from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from .agent import ALL_TOOLS, create_llm
from .models.whatsapp_models import WhatsAppAgentRequest, WhatsAppAgentResponse
from .prompts.system import NORA_SYSTEM_PROMPT

WHATSAPP_ADDENDUM = (
    "\n\n## Canal: WhatsApp\n"
    "Estás hablando con un comercial del equipo por WhatsApp. Responde en texto "
    "plano, breve y claro: sin tablas ni markdown pesado, frases cortas. Si una "
    "respuesta es larga, resúmela. Confirma de forma natural antes de crear o "
    "modificar algo (pedido, visita, cliente, seguimiento)."
)


class _GeneralState(TypedDict):
    messages: Annotated[list, add_messages]
    auth_token: str
    session_id: str | None


def _build_general_graph():
    llm = create_llm().bind_tools(ALL_TOOLS)
    tool_node = ToolNode(ALL_TOOLS)

    def call_model(state: _GeneralState) -> dict:
        return {"messages": [llm.invoke(state["messages"])]}

    def should_continue(state: _GeneralState):
        last = state["messages"][-1]
        if getattr(last, "tool_calls", None):
            return "tools"
        return "__end__"

    workflow = StateGraph(_GeneralState)
    workflow.add_node("agent", call_model)
    workflow.add_node("tools", tool_node)
    workflow.set_entry_point("agent")
    workflow.add_conditional_edges("agent", should_continue, {"tools": "tools", "__end__": END})
    workflow.add_edge("tools", "agent")
    # No checkpointer: full history passed in on every call (stateless).
    return workflow.compile()


_general_graph = _build_general_graph()


def _to_messages(request: WhatsAppAgentRequest) -> list:
    """System prompt (+WhatsApp addendum) + history + current message (no dup)."""
    messages: list = [SystemMessage(content=NORA_SYSTEM_PROMPT + WHATSAPP_ADDENDUM)]
    for item in request.history:
        if item.role == "assistant":
            messages.append(AIMessage(content=item.body))
        else:
            messages.append(HumanMessage(content=item.body))
    if not request.history or request.history[-1].body != request.current_message:
        messages.append(HumanMessage(content=request.current_message))
    return messages


async def run_whatsapp_general_agent(request: WhatsAppAgentRequest) -> WhatsAppAgentResponse:
    """Run one stateless turn of the general agent and return the reply."""
    state: _GeneralState = {
        "messages": _to_messages(request),
        "auth_token": request.auth,
        "session_id": request.conversation_id,
    }
    result = await _general_graph.ainvoke(state)

    reply_text = ""
    for msg in reversed(result["messages"]):
        if isinstance(msg, AIMessage) and msg.content and not getattr(msg, "tool_calls", None):
            reply_text = msg.content
            break
    if not reply_text:
        reply_text = "¿En qué más te ayudo?"

    return WhatsAppAgentResponse(reply_text=reply_text, case_update=None, executed_entity=None)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agents/nora && python -m pytest tests/test_whatsapp_general_agent.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add agents/nora/src/whatsapp_general_agent.py agents/nora/tests/test_whatsapp_general_agent.py
git commit -m "feat(nora): stateless general WhatsApp agent (ALL_TOOLS)"
```

---

### Task 2: Endpoint `POST /whatsapp/agent/general` (Python)

**Files:**
- Modify: `agents/nora/src/main.py` (import + nuevo endpoint, junto al de `/whatsapp/agent`)
- Test: `agents/nora/tests/test_whatsapp_general_endpoint.py`

**Interfaces:**
- Consumes: `run_whatsapp_general_agent` de `whatsapp_general_agent.py`; `WhatsAppAgentRequest`/`WhatsAppAgentResponse`.
- Produces: ruta FastAPI `POST /whatsapp/agent/general` → `WhatsAppAgentResponse`.

- [ ] **Step 1: Write the failing test**

```python
from unittest.mock import patch

from fastapi.testclient import TestClient

from src.main import app
from src.models.whatsapp_models import WhatsAppAgentResponse


def test_whatsapp_general_endpoint_returns_reply():
    client = TestClient(app)

    async def fake_run(request):
        return WhatsAppAgentResponse(reply_text="Hoy tienes 2 visitas.", case_update=None, executed_entity=None)

    with patch("src.main.run_whatsapp_general_agent", side_effect=fake_run):
        response = client.post(
            "/whatsapp/agent/general",
            json={
                "current_message": "¿qué tengo hoy?",
                "history": [],
                "auth": "Bearer scoped",
                "conversation_id": "conv_1",
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["reply_text"] == "Hoy tienes 2 visitas."
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents/nora && python -m pytest tests/test_whatsapp_general_endpoint.py -v`
Expected: FAIL — `404` (ruta inexistente) o `AttributeError` al parchear `run_whatsapp_general_agent` (no importado en `main`).

- [ ] **Step 3: Write minimal implementation**

En `agents/nora/src/main.py`, añadir el import junto al de `run_whatsapp_agent` (actualmente `from .whatsapp_agent import run_whatsapp_agent`):

```python
from .whatsapp_general_agent import run_whatsapp_general_agent
```

Y añadir el endpoint justo después del de `@app.post("/whatsapp/agent", ...)`:

```python
@app.post("/whatsapp/agent/general", response_model=WhatsAppAgentResponse)
async def whatsapp_general_agent(payload: WhatsAppAgentRequest) -> WhatsAppAgentResponse:
    return await run_whatsapp_general_agent(payload)
```

(`WhatsAppAgentRequest`/`WhatsAppAgentResponse` ya están importados en `main.py` para el endpoint de gastos.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agents/nora && python -m pytest tests/test_whatsapp_general_endpoint.py -v`
Expected: PASS.

- [ ] **Step 5: Full suite + commit**

Run: `cd agents/nora && python -m pytest -q`
Expected: toda la suite pasa.

```bash
git add agents/nora/src/main.py agents/nora/tests/test_whatsapp_general_endpoint.py
git commit -m "feat(nora): expose POST /whatsapp/agent/general"
```

---

### Task 3: Ruteo NestJS al agente general (gateado por flag)

**Files:**
- Modify: `apps/api/src/modules/whatsapp/nora-routing.service.ts` (rama nueva en `routeInboundMessage` + método `requestNoraGeneralAgent`)
- Test: `apps/api/test/whatsapp.e2e-spec.ts` (nuevo `it(...)`)

**Interfaces:**
- Consumes: `this.authService.mintScopedToken`, `this.whatsAppService.sendAgentReply`, `context.recent_messages`, `openCase`, `mediaPayload` (ya disponibles en `routeInboundMessage`).
- Produces: método privado `requestNoraGeneralAgent(payload) -> Promise<{reply_text, case_update, executed_entity}>` que llama `${NORA_API_URL}/whatsapp/agent/general`.

- [ ] **Step 1: Write the failing test**

Añadir este test en `apps/api/test/whatsapp.e2e-spec.ts` (dentro del `describe("WhatsApp inbox", ...)`), siguiendo el patrón del test existente "routes CRM commercial user phones to Nora with user context" (mockea `globalThis.fetch`, simula webhook entrante de un comercial). Reutiliza los helpers/fixtures de ese test para construir el webhook de un teléfono de usuario comercial sin caso abierto ni media.

```typescript
it("routes a commercial general message to the Nora general agent when the flag is on", async () => {
  const prev = process.env.NORA_WHATSAPP_GENERAL_AGENT;
  process.env.NORA_WHATSAPP_GENERAL_AGENT = "true";
  try {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reply_text: "Hoy tienes 2 visitas.", case_update: null, executed_entity: null }),
    });

    await postCommercialWebhookText("¿qué tengo hoy?");  // helper from the existing commercial-routing test

    const generalCall = (globalThis.fetch as jest.Mock).mock.calls.find(
      ([url]) => typeof url === "string" && url.endsWith("/whatsapp/agent/general"),
    );
    expect(generalCall).toBeDefined();

    const routeCall = (globalThis.fetch as jest.Mock).mock.calls.find(
      ([url]) => typeof url === "string" && url.endsWith("/whatsapp/route"),
    );
    expect(routeCall).toBeUndefined();  // planner NOT used when general agent handles it
  } finally {
    process.env.NORA_WHATSAPP_GENERAL_AGENT = prev;
  }
});
```

Nota para el implementador: el test "routes CRM commercial user phones to Nora with user context" (≈línea 1814) ya monta un webhook de comercial y deja `NORA_WHATSAPP_GENERAL_AGENT` sin definir, por lo que sigue yendo al planner (`/whatsapp/route`) — eso valida la rama apagada (sin regresión). Si ese test no expone un helper reutilizable para postear el webhook, extrae la construcción del webhook a una función local `postCommercialWebhookText(body)` y úsala en ambos.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest --config test/jest-e2e.json test/whatsapp.e2e-spec.ts -t "routes a commercial general message"`
Expected: FAIL — hoy no hay llamada a `/whatsapp/agent/general` (el mensaje va al planner).

- [ ] **Step 3: Write minimal implementation**

En `nora-routing.service.ts`, dentro de `routeInboundMessage`, insertar esta rama JUSTO DESPUÉS del bloque de gastos (el `if (... isExpenseFlowTurn ...) { ... }`, que termina ~línea 136) y ANTES del `const noraResponse = await this.requestNoraRoute({...})`:

```typescript
      if (
        process.env.NORA_WHATSAPP_GENERAL_AGENT === "true" &&
        "userId" in sender &&
        sender.userId &&
        !openCase &&
        !mediaPayload
      ) {
        try {
          const scopedToken = await this.authService.mintScopedToken(sender.userId);
          const agentResponse = await this.requestNoraGeneralAgent({
            current_message: message.body,
            history: context.recent_messages,
            conversation_id: conversation.id,
            auth: `Bearer ${scopedToken}`,
          });

          await this.prisma.noraActionLog.update({
            where: { id: actionLog.id },
            data: {
              status: agentResponse.executed_entity
                ? NoraActionStatus.executed
                : NoraActionStatus.proposed,
              output: agentResponse as unknown as Prisma.InputJsonObject,
            },
          });

          if (agentResponse.reply_text) {
            await this.whatsAppService.sendAgentReply(conversation.id, agentResponse.reply_text);
          }
          return;
        } catch (error) {
          this.logger.error(
            `Nora general agent failed, falling back to planner: ${String(error)}`,
          );
          // fall through to the planner path below
        }
      }
```

Y añadir el método privado junto a `requestNoraAgent` (después de él, ~línea 312):

```typescript
  private async requestNoraGeneralAgent(payload: Record<string, unknown>) {
    const noraApiUrl = process.env.NORA_API_URL ?? "http://localhost:8000";
    const response = await fetch(`${noraApiUrl}/whatsapp/agent/general`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Nora general agent request failed with status ${response.status}`);
    }
    return response.json() as Promise<{
      reply_text: string;
      case_update: Record<string, unknown> | null;
      executed_entity: Record<string, unknown> | null;
    }>;
  }
```

Notas:
- `openCase` y `mediaPayload` ya están en scope (declarados al inicio del `try` de `routeInboundMessage`).
- La rama replica la de gastos: mint → request → log → reply → `return`; en error, log + fall-through al planner.
- `!openCase` (ningún caso abierto) asegura que la rama nueva NO secuestra un caso de gasto u orden en progreso; `!mediaPayload` deja las fotos (gastos) al planner.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest --config test/jest-e2e.json test/whatsapp.e2e-spec.ts -t "routes a commercial general message"`
Expected: PASS.

- [ ] **Step 5: Full whatsapp e2e + commit**

Run: `cd apps/api && npx jest --config test/jest-e2e.json test/whatsapp.e2e-spec.ts`
Expected: toda la suite de whatsapp pasa (incluye el test de comercial→planner con el flag apagado, sin regresión).

```bash
git add apps/api/src/modules/whatsapp/nora-routing.service.ts apps/api/test/whatsapp.e2e-spec.ts
git commit -m "feat(nora): route commercial general WhatsApp messages to general agent (env-flagged)"
```

---

## Self-Review

**Spec coverage:**
- Agente general stateless Python con `ALL_TOOLS` + addendum WhatsApp + token como `auth_token` → Task 1 ✓
- Endpoint `POST /whatsapp/agent/general` reutilizando contratos → Task 2 ✓
- Rama NestJS gateada por `NORA_WHATSAPP_GENERAL_AGENT`, mint token, llamar agente general, log, reply, fallback al planner; regla de ruteo (no caso abierto, no media) → Task 3 ✓
- Fuera de alcance (clientes externos, ruteo a áreas, cases para el agente general, memoria persistente, gasto solo-texto) → no incluido ✓.

**Placeholder scan:** sin TBD/TODO; todo el código de cada step está completo. La única indirección es el helper `postCommercialWebhookText` del e2e, con instrucción explícita de reutilizar/extraer del test de comercial existente (no es un placeholder de lógica de producción).

**Type consistency:** `WhatsAppAgentRequest`/`WhatsAppAgentResponse` usados igual que en el flujo de gastos; `_to_messages`/`run_whatsapp_general_agent` consistentes entre Task 1 (impl), Task 1 (tests) y Task 2 (endpoint). El payload de `requestNoraGeneralAgent` (`current_message`, `history`, `conversation_id`, `auth`) satisface `WhatsAppAgentRequest` (sender/open_case/attachments opcionales). `NoraActionStatus`, `mintScopedToken`, `sendAgentReply`, `requestNoraAgent` referenciados como existen en el servicio.

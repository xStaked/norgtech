# Nora Cliente Externo — Estado/guía + Pedido con filtro humano — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El customer agent responde estado/guía de pedidos desde un snapshot enriquecido y, cuando el cliente pide/repite un pedido, arma un `NoraConversationCase` order `ready_for_review` que un asesor confirma (filtro humano) — sin que Nora cree el pedido real ni pise al asesor.

**Architecture:** Se enriquece el `customer_snapshot` (NestJS) con guía/tracking, ítems, empresa y zona por pedido. El customer agent (Python, stateless) gana una tool `armar_pedido`; su respuesta gana un campo `order_case`. NestJS, al recibir `order_case`, crea un caso de pedido `ready_for_review` (reusando `NoraCaseService.createCase` + luego `createOrderFromCase` que ya existe) y deriva al buzón único. Un guard silencia a Nora una vez la conversación queda asignada a un humano.

**Tech Stack:** Python (LangGraph, Pydantic, pytest), NestJS (Prisma, Jest/Supertest).

## Global Constraints

- El LLM NUNCA fija montos/empresa/zona: para "repetir", `unitPrice`/`companyRef`/`customerZoneId` se toman server-side del snapshot ya scopeado, no del texto del modelo.
- El cliente externo sigue sandboxed al snapshot; no se le da acceso al CRM ni tools nuevas más allá de `armar_pedido`.
- Texto al cliente en tono cálido, plano (sin markdown), consistente con `CUSTOMER_AGENT_PROMPT`.
- Fallback: si falla el agente o falta `NORA_UNICANAL_USER_ID`, comportamiento actual (derivación/nota + log warning), nunca romper el flujo.
- Caso de pedido de cliente externo: `createdByUserId = null` (el campo es nullable).

## File Structure

- `agents/nora/src/models/whatsapp_models.py` — nuevo modelo `NoraOrderDraft`; campo `order_case` en `WhatsAppAgentResponse`.
- `agents/nora/src/whatsapp_customer_agent.py` — tool `armar_pedido`, extractor `_extract_order`, prompt ampliado, wiring en `run_whatsapp_customer_agent`.
- `agents/nora/tests/test_whatsapp_customer_agent.py` — tests de `_extract_order` y prompt.
- `apps/api/src/modules/whatsapp/nora-routing.service.ts` — mapper `buildSnapshotOrderEntry`, enriquecer `buildCustomerSnapshot`, rama `order_case` + guard de silencio, tipo de retorno de `requestNoraCustomerAgent`.
- `apps/api/test/whatsapp.e2e-spec.ts` — e2e de creación de caso de pedido desde `order_case` y guard de silencio.

---

## Task 1: Customer agent — tool `armar_pedido` + respuesta `order_case` (Python)

**Files:**
- Modify: `agents/nora/src/models/whatsapp_models.py`
- Modify: `agents/nora/src/whatsapp_customer_agent.py`
- Test: `agents/nora/tests/test_whatsapp_customer_agent.py`

**Interfaces:**
- Produces: `NoraOrderDraft(orderRef: str | None, items: list[dict], motivo: str)`; `WhatsAppAgentResponse.order_case: NoraOrderDraft | None`; `_extract_order(messages) -> NoraOrderDraft | None`. The `armar_pedido` tool returns a `ToolMessage` whose content is `PEDIDO|{json}` where json = `{"orderRef": str|null, "items": [{"productRef": str, "quantity": number}], "motivo": str}`.
- Consumes: existing `WhatsAppAgentRequest`, `_customer_graph`, `create_llm`.

- [ ] **Step 1: Write the failing tests**

Add to `agents/nora/tests/test_whatsapp_customer_agent.py`:

```python
from src.models.whatsapp_models import NoraOrderDraft
from src.whatsapp_customer_agent import _extract_order


def test_extract_order_detects_repeat_by_order_ref():
    payload = '{"orderRef": "NT-100", "items": [], "motivo": "repetir ultimo pedido"}'
    msgs = [ToolMessage(content=f"PEDIDO|{payload}", tool_call_id="tc_1", name="armar_pedido")]
    draft = _extract_order(msgs)
    assert draft is not None
    assert draft.orderRef == "NT-100"
    assert draft.motivo == "repetir ultimo pedido"
    assert draft.items == []


def test_extract_order_detects_new_items():
    payload = '{"orderRef": null, "items": [{"productRef": "FERT-001", "quantity": 10}], "motivo": "pedido nuevo"}'
    msgs = [ToolMessage(content=f"PEDIDO|{payload}", tool_call_id="tc_2", name="armar_pedido")]
    draft = _extract_order(msgs)
    assert draft is not None
    assert draft.orderRef is None
    assert draft.items == [{"productRef": "FERT-001", "quantity": 10}]


def test_extract_order_returns_none_without_tool():
    msgs = [AIMessage(content="Tu pedido NT-100 va despachado.")]
    assert _extract_order(msgs) is None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd agents/nora && uv run pytest tests/test_whatsapp_customer_agent.py -k extract_order -v`
Expected: FAIL con `ImportError`/`AttributeError` (`_extract_order` y `NoraOrderDraft` no existen).

- [ ] **Step 3: Add the `NoraOrderDraft` model and response field**

In `agents/nora/src/models/whatsapp_models.py`, after `NoraHandoff`:

```python
class NoraOrderDraft(BaseModel):
    orderRef: str | None = None
    items: list[dict] = Field(default_factory=list)
    motivo: str = ""
```

Then extend `WhatsAppAgentResponse`:

```python
class WhatsAppAgentResponse(BaseModel):
    reply_text: str
    case_update: dict[str, Any] | None = None
    executed_entity: dict[str, Any] | None = None
    handoff: "NoraHandoff | None" = None
    order_case: "NoraOrderDraft | None" = None
```

- [ ] **Step 4: Add the tool, extractor, prompt, and wiring**

In `agents/nora/src/whatsapp_customer_agent.py`:

Add the import:

```python
from .models.whatsapp_models import (
    NoraHandoff,
    NoraOrderDraft,
    WhatsAppAgentRequest,
    WhatsAppAgentResponse,
)
```

Add the tool next to `derivar_a_unicanal`:

```python
@tool
def armar_pedido(motivo: str, order_ref: str = "", items: list[dict] | None = None) -> str:
    """Arma un pedido para que un asesor lo confirme. Úsala cuando el cliente
    quiere HACER o REPETIR un pedido.

    Args:
        motivo: Frase corta con lo que pidió el cliente.
        order_ref: Si el cliente quiere repetir un pedido anterior, el número de ese
            pedido tal como aparece en [DATOS DEL CLIENTE] (ej. "NT-100"). Vacío si es nuevo.
        items: Para un pedido nuevo, lista de {"productRef": nombre del producto, "quantity": cantidad}.
    """
    payload = json.dumps(
        {"orderRef": order_ref or None, "items": items or [], "motivo": motivo},
        ensure_ascii=False,
    )
    return f"PEDIDO|{payload}"


CUSTOMER_TOOLS = [derivar_a_unicanal, armar_pedido]
```

Replace `CUSTOMER_AGENT_PROMPT` body (keep the header lines) so it reads:

```python
CUSTOMER_AGENT_PROMPT = """Eres Nora, la asistente de Norgtech, atendiendo a un CLIENTE externo por WhatsApp.

Tono: amable, claro y breve. Texto plano (sin markdown ni tablas).

Qué puedes hacer:
- Responder sobre los pedidos y la cartera del cliente USANDO SOLO los datos del
  bloque [DATOS DEL CLIENTE]. Nunca inventes números, estados, guías ni fechas.
- Si el cliente pregunta por el estado o la guía de un pedido, respóndelo desde los
  campos del pedido (estado, transportadora, guía, link, fechas) si están presentes.

Cuando el cliente quiere HACER o REPETIR un pedido (usa la tool armar_pedido):
- Si quiere repetir uno anterior, pasa order_ref con el número del pedido de [DATOS DEL CLIENTE].
- Si es un pedido nuevo, pasa items con [{"productRef": producto, "quantity": cantidad}].
- Siempre pasa un 'motivo' de una frase. Luego dile al cliente, cálido, que un asesor
  confirma su pedido y le avisa. NO prometas precios ni fechas.

Deriva a un asesor humano (usa derivar_a_unicanal) cuando: hay un reclamo/queja/problema,
piden info que NO está en [DATOS DEL CLIENTE], o piden hablar con un área o persona.
En ese caso pasa 'intent' corto (ej: "cartera", "logistica", "reclamo", "comercial") y 'motivo'.

Si puedes resolver con los datos disponibles, responde directo y no derives.
"""
```

Add the extractor after `_extract_handoff`:

```python
def _extract_order(messages: list) -> NoraOrderDraft | None:
    """Scan in reverse for an armar_pedido ToolMessage ('PEDIDO|{json}')."""
    for msg in reversed(messages):
        if isinstance(msg, ToolMessage) and msg.name == "armar_pedido":
            parts = (msg.content or "").split("|", 1)
            if len(parts) == 2 and parts[0] == "PEDIDO":
                try:
                    data = json.loads(parts[1])
                except json.JSONDecodeError:
                    return NoraOrderDraft(motivo="pedido")
                return NoraOrderDraft(
                    orderRef=data.get("orderRef"),
                    items=data.get("items") or [],
                    motivo=data.get("motivo") or "pedido",
                )
    return None
```

Wire it into the return of `run_whatsapp_customer_agent` (add the `order_case` field; when an order was armed, prefer a neutral reply if the model produced none):

```python
    order_case = _extract_order(result["messages"])
    if not reply_text:
        reply_text = (
            "¡Gracias! Ya un asesor confirma tu pedido y te avisa."
            if order_case
            else "Gracias por escribir. Ya un asesor te va a contactar."
        )

    return WhatsAppAgentResponse(
        reply_text=reply_text,
        case_update=None,
        executed_entity=None,
        handoff=_extract_handoff(result["messages"]),
        order_case=order_case,
    )
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd agents/nora && uv run pytest tests/test_whatsapp_customer_agent.py -v`
Expected: PASS (nuevos tests + los existentes de handoff/snapshot siguen verdes).

- [ ] **Step 6: Commit**

```bash
git add agents/nora/src/models/whatsapp_models.py agents/nora/src/whatsapp_customer_agent.py agents/nora/tests/test_whatsapp_customer_agent.py
git commit -m "feat(nora): customer agent can arm an order for human review"
```

---

## Task 2: Enriquecer el customer snapshot con guía, ítems, empresa y zona (NestJS)

**Files:**
- Modify: `apps/api/src/modules/whatsapp/nora-routing.service.ts` (método `buildCustomerSnapshot`, línea ~903)
- Test: `apps/api/test/whatsapp.e2e-spec.ts`

**Interfaces:**
- Produces: cada entrada de `recentOrders` ahora incluye, además de `orderNumber/status/orderDate/total`: `carrierName`, `trackingNumber`, `trackingUrl`, `dispatchDate`, `committedDeliveryDate`, `deliveryDate` (ISO string o null), `companyRef` (prefix de la empresa), `customerZoneId`, e `items: [{ productRef, quantity, unitPrice }]` (productRef = `productSnapshotSku`).
- Consumes: modelos Prisma `Order`, `OrderItem`, `Company`.

> **Convenciones del bloque de tests del customer agent** (~línea 4470): usa la fixture dedicada `conversation-customer-agent` (cliente `customer-2`, phone `+573009998877`), el helper `postCustomerWebhookText(body)`, el usuario de unicanal `user-magali`, los spies `conversationUpdateMock` / `internalNoteCreateMock`, y limpieza de env en `try/finally`. Los tests de esta y la Task 3 van DENTRO de ese `describe`.

- [ ] **Step 1: Seed de un pedido para `customer-2` con guía e ítems**

El array `orders` en memoria (~línea 193) solo tiene un pedido de `customer-1`. En el `beforeEach`/`afterEach` del bloque del customer agent (los que hacen `accounts.push(...)` / `removeMatching(...)`), añade y limpia un pedido de `customer-2` con relaciones embebidas (el mock de `order.findMany` aplica `applySelect`, que es shallow: las relaciones se guardan como objetos planos):

```ts
// dentro del beforeEach del bloque customer-agent, tras conversations.push(...)
orders.push({
  id: "order-customer-agent",
  customerId: "customer-2",
  orderNumber: "NT-100",
  status: "despachado",
  orderDate: new Date("2026-06-20T10:00:00.000Z"),
  total: 1500000,
  carrierName: "Envia",
  trackingNumber: "TRK-777",
  trackingUrl: "https://track/TRK-777",
  dispatchDate: new Date("2026-06-21T10:00:00.000Z"),
  committedDeliveryDate: new Date("2026-06-23T10:00:00.000Z"),
  deliveryDate: null,
  customerZoneId: "customer-zone-1",
  company: { prefix: "NT" },
  items: [{ productSnapshotSku: "FERT-001", quantity: 10, unitPrice: 150000 }],
} as unknown as (typeof orders)[number]);

// dentro del afterEach del mismo bloque
removeMatching(orders, (item) => item.id === "order-customer-agent");
```

- [ ] **Step 2: Write the failing test**

Dentro del `describe` del customer agent, añade:

```ts
it("sends order tracking and items in the customer snapshot", async () => {
  const prevFlag = process.env.NORA_WHATSAPP_CUSTOMER_AGENT;
  process.env.NORA_WHATSAPP_CUSTOMER_AGENT = "true";
  try {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reply_text: "ok", case_update: null, executed_entity: null, handoff: { needed: false }, order_case: null }),
    });

    await postCustomerWebhookText("¿dónde va mi pedido?");

    const call = (globalThis.fetch as jest.Mock).mock.calls.find(
      ([url]) => typeof url === "string" && url.endsWith("/whatsapp/agent/customer"),
    );
    expect(call).toBeDefined();
    const body = JSON.parse((call as any)[1].body);
    const order = body.customer_snapshot.recentOrders[0];
    expect(order.trackingNumber).toBe("TRK-777");
    expect(order.companyRef).toBe("NT");
    expect(Array.isArray(order.items)).toBe(true);
    expect(order.items[0].productRef).toBe("FERT-001");
  } finally {
    if (prevFlag === undefined) delete process.env.NORA_WHATSAPP_CUSTOMER_AGENT;
    else process.env.NORA_WHATSAPP_CUSTOMER_AGENT = prevFlag;
  }
});
```

Nota: el segundo arg de `fetch` es `{ method, headers, body }`; parsea `JSON.parse(call[1].body)` (ajusta el acceso a `call[1].body` según el tipado del mock — el resto de tests del archivo ya leen `call[1].body`).

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts -t "sends order tracking and items in the customer snapshot"`
Expected: FAIL — hoy `recentOrders` no tiene `trackingNumber`, `companyRef` ni `items`.

- [ ] **Step 4: Permitir selects de relación en el mock `applySelect`**

El mock `applySelect` (~línea 393) descarta claves cuyo valor de select no sea `=== true`, por lo que `company: { select: ... }` e `items: { select: ... }` se perderían. Cámbialo para pasar relaciones (objeto de select) devolviendo el objeto sembrado tal cual:

```ts
    return Object.fromEntries(
      Object.entries(select)
        .filter(([, enabled]) => enabled === true || (enabled !== null && typeof enabled === "object"))
        .map(([key]) => [key, record[key]]),
    );
```

- [ ] **Step 5: Enriquecer la query y el mapeo en `buildCustomerSnapshot`**

En `nora-routing.service.ts`, dentro de `buildCustomerSnapshot`, reemplaza el `findMany` de `orders` para traer los campos e includes necesarios:

```ts
      this.prisma.order.findMany({
        where: { customerId },
        orderBy: { orderDate: "desc" },
        take: 5,
        select: {
          orderNumber: true,
          status: true,
          orderDate: true,
          total: true,
          carrierName: true,
          trackingNumber: true,
          trackingUrl: true,
          dispatchDate: true,
          committedDeliveryDate: true,
          deliveryDate: true,
          customerZoneId: true,
          company: { select: { prefix: true } },
          items: { select: { productSnapshotSku: true, quantity: true, unitPrice: true } },
        },
      }),
```

Reemplaza el `recentOrders` del `return` por un mapeo con guía e ítems:

```ts
      recentOrders: orders.map((o) => ({
        orderNumber: o.orderNumber,
        status: o.status,
        orderDate: o.orderDate.toISOString(),
        total: Number(o.total),
        carrierName: o.carrierName ?? null,
        trackingNumber: o.trackingNumber ?? null,
        trackingUrl: o.trackingUrl ?? null,
        dispatchDate: o.dispatchDate ? o.dispatchDate.toISOString() : null,
        committedDeliveryDate: o.committedDeliveryDate ? o.committedDeliveryDate.toISOString() : null,
        deliveryDate: o.deliveryDate ? o.deliveryDate.toISOString() : null,
        companyRef: o.company?.prefix ?? null,
        customerZoneId: o.customerZoneId ?? null,
        items: o.items.map((it) => ({
          productRef: it.productSnapshotSku,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
        })),
      })),
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts -t "sends order tracking and items in the customer snapshot"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/whatsapp/nora-routing.service.ts apps/api/test/whatsapp.e2e-spec.ts
git commit -m "feat(whatsapp): enrich customer snapshot with tracking, items, company, zone"
```

---

## Task 3: Crear caso de pedido desde `order_case` + silenciar a Nora tras derivar (NestJS)

**Files:**
- Modify: `apps/api/src/modules/whatsapp/nora-routing.service.ts` (rama de cliente ~228-285, tipo de `requestNoraCustomerAgent` ~956-961)
- Test: `apps/api/test/whatsapp.e2e-spec.ts`

**Interfaces:**
- Consumes: `WhatsAppAgentResponse.order_case` de Task 1 (`{ orderRef, items, motivo }`); el `customerSnapshot` de Task 2; `NoraCaseService.createCase({ conversationId, type, status, extractedData, createdByUserId })`; enum `NoraConversationCaseType.order`, `NoraConversationCaseStatus.ready_for_review`.
- Produces: al recibir `order_case`, un `NoraConversationCase` order `ready_for_review` con `extractedData = { customerId, companyRef?, customerZoneId?, items: [{ productRef, quantity }], notes }`, la conversación asignada a `NORA_UNICANAL_USER_ID` (status `pendiente`) y una nota interna.

- [ ] **Step 1: Write the failing tests**

En `apps/api/test/whatsapp.e2e-spec.ts`, DENTRO del `describe` del customer agent, añade dos tests (reusan la fixture `conversation-customer-agent` / `customer-2` y el pedido semilla `order-customer-agent` con `orderNumber: "NT-100"` de la Task 2). Añade también en el `afterEach` del bloque la limpieza `removeMatching(noraCases, (item) => item.conversationId === "conversation-customer-agent");`:

```ts
it("creates a ready-for-review order case when the customer agent arms an order", async () => {
  const prevFlag = process.env.NORA_WHATSAPP_CUSTOMER_AGENT;
  const prevUnicanal = process.env.NORA_UNICANAL_USER_ID;
  process.env.NORA_WHATSAPP_CUSTOMER_AGENT = "true";
  process.env.NORA_UNICANAL_USER_ID = "user-magali";
  const casesBefore = noraCases.length;
  try {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reply_text: "¡Gracias! Ya un asesor confirma tu pedido y te avisa.",
        case_update: null,
        executed_entity: null,
        handoff: { needed: false },
        order_case: { orderRef: "NT-100", items: [], motivo: "repetir ultimo pedido" },
      }),
    });

    await postCustomerWebhookText("repite mi último pedido");

    const created = noraCases.find(
      (c) => c.conversationId === "conversation-customer-agent" && String(c.type) === "order",
    );
    expect(noraCases.length).toBe(casesBefore + 1);
    expect(created).toBeDefined();
    expect(String((created as Record<string, unknown>).status)).toBe("ready_for_review");
    const data = (created as Record<string, unknown>).extractedData as Record<string, unknown>;
    expect(data.customerId).toBe("customer-2");
    expect((data.items as unknown[]).length).toBeGreaterThan(0);
    expect((data.items as Array<Record<string, unknown>>)[0].productRef).toBe("FERT-001");

    // conversación asignada al buzón único + nota interna
    expect(conversationUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ assignedToUserId: "user-magali", status: "pendiente" }) }),
    );
    expect(internalNoteCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ authorUserId: "user-magali" }) }),
    );
  } finally {
    if (prevFlag === undefined) delete process.env.NORA_WHATSAPP_CUSTOMER_AGENT; else process.env.NORA_WHATSAPP_CUSTOMER_AGENT = prevFlag;
    if (prevUnicanal === undefined) delete process.env.NORA_UNICANAL_USER_ID; else process.env.NORA_UNICANAL_USER_ID = prevUnicanal;
  }
});

it("does not run the customer agent when the conversation is already assigned to a human", async () => {
  const prevFlag = process.env.NORA_WHATSAPP_CUSTOMER_AGENT;
  process.env.NORA_WHATSAPP_CUSTOMER_AGENT = "true";
  // la fixture customerAgentConversation ya está en el array; simula handoff previo
  customerAgentConversation.assignedToUserId = "user-magali";
  customerAgentConversation.status = WhatsAppConversationStatus.pendiente;
  try {
    await postCustomerWebhookText("sigo por aquí");

    const customerCall = (globalThis.fetch as jest.Mock).mock.calls.find(
      ([url]) => typeof url === "string" && url.endsWith("/whatsapp/agent/customer"),
    );
    expect(customerCall).toBeUndefined();
  } finally {
    customerAgentConversation.assignedToUserId = null;
    customerAgentConversation.status = WhatsAppConversationStatus.nuevo;
    if (prevFlag === undefined) delete process.env.NORA_WHATSAPP_CUSTOMER_AGENT; else process.env.NORA_WHATSAPP_CUSTOMER_AGENT = prevFlag;
  }
});
```

Nota: `conversationUpdateMock` / `internalNoteCreateMock` son los spies ya definidos en el archivo (~líneas 720 y 839). El enum `WhatsAppConversationStatus` ya está importado en el spec. Confirma que `user-magali` existe en el seed `users` (~línea 33); si no, añádelo.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts -t "arms an order"`
Expected: FAIL — hoy no se crea ningún caso desde el customer agent y no hay guard de silencio.

- [ ] **Step 3: Extender el tipo de retorno de `requestNoraCustomerAgent`**

En `nora-routing.service.ts`, en `requestNoraCustomerAgent`, añade `order_case` al tipo:

```ts
    return response.json() as Promise<{
      reply_text: string;
      case_update: Record<string, unknown> | null;
      executed_entity: Record<string, unknown> | null;
      handoff: { needed: boolean; reason: string | null; intent: string | null } | null;
      order_case: { orderRef: string | null; items: Array<Record<string, unknown>>; motivo: string } | null;
    }>;
```

- [ ] **Step 4: Añadir el guard de silencio (solo cliente externo) antes de la rama de cliente**

En `routeInboundMessage`, justo antes del bloque `if (process.env.NORA_WHATSAPP_CUSTOMER_AGENT === "true" && ...)`, añade el guard acotado a `senderType === cliente` (para NO silenciar los flujos internos de comercial/admin, que también pueden estar asignados):

```ts
      if (
        sender.senderType === WhatsAppSenderType.cliente &&
        conversation.assignedToUserId &&
        (conversation.status === "pendiente" || conversation.status === "en_gestion")
      ) {
        return;
      }
```

- [ ] **Step 5: Manejar `order_case` dentro de la rama de cliente**

Dentro del `try` de la rama de cliente, después de obtener `agentResponse` y ANTES del bloque `if (agentResponse.handoff?.needed)`, inserta el manejo de pedido:

```ts
          if (agentResponse.order_case) {
            const draft = agentResponse.order_case;
            const referenced = draft.orderRef
              ? customerSnapshot.recentOrders.find((o) => o.orderNumber === draft.orderRef)
              : undefined;

            const items = referenced
              ? referenced.items.map((it) => ({ productRef: it.productRef, quantity: it.quantity }))
              : (draft.items ?? [])
                  .map((it) => ({
                    productRef: this.stringValue(it.productRef) ?? this.stringValue(it.product_ref),
                    quantity: Number(it.quantity),
                  }))
                  .filter((it) => it.productRef && Number.isFinite(it.quantity) && it.quantity > 0);

            if (items.length > 0) {
              await this.noraCaseService.createCase({
                conversationId: conversation.id,
                type: NoraConversationCaseType.order,
                status: NoraConversationCaseStatus.ready_for_review,
                createdByUserId: null,
                extractedData: {
                  customerId: sender.customerId,
                  ...(referenced?.companyRef && { companyRef: referenced.companyRef }),
                  ...(referenced?.customerZoneId && { customerZoneId: referenced.customerZoneId }),
                  items,
                  notes: draft.motivo,
                },
              });

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
                    body: `Pedido armado por Nora — ${draft.motivo}`,
                  },
                });
              } else {
                this.logger.warn("Order case armed but NORA_UNICANAL_USER_ID is not set");
              }

              await this.prisma.noraActionLog.update({
                where: { id: actionLog.id },
                data: {
                  status: NoraActionStatus.proposed,
                  output: agentResponse as unknown as Prisma.InputJsonObject,
                },
              });

              if (agentResponse.reply_text) {
                await this.whatsAppService.sendAgentReply(conversation.id, agentResponse.reply_text);
              }
              return;
            }
          }
```

Asegúrate de que `NoraConversationCaseStatus` esté importado desde `@prisma/client` en el archivo (junto a `NoraConversationCaseType`, que ya lo está).

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts -t "arms an order"` y luego `-t "already assigned to a human"`
Expected: PASS ambos.

- [ ] **Step 7: Run the full whatsapp suite (regresión)**

Run: `pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts`
Expected: PASS toda la suite (el guard de silencio está acotado a `senderType === cliente`, así que los flujos de comercial/admin no se ven afectados aunque estén asignados).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/whatsapp/nora-routing.service.ts apps/api/test/whatsapp.e2e-spec.ts
git commit -m "feat(whatsapp): arm order case from customer agent and mute Nora after handoff"
```

---

## Verificación end-to-end (manual, tras las 3 tasks)

1. `NORA_WHATSAPP_CUSTOMER_AGENT=true`, `NORA_UNICANAL_USER_ID=<id real>`.
2. Cliente escribe "¿dónde va mi pedido?" → Nora responde estado + guía desde el snapshot.
3. Cliente escribe "repite mi último pedido" → se crea `NoraConversationCase` order `ready_for_review`, la conversación aparece asignada al buzón (status pendiente) con nota "Pedido armado por Nora".
4. En el inbox, la persona de filtro hace 1 clic → `POST /whatsapp/conversations/:id/cases/:caseId/create-order` → pedido real (ambiguos → human_review).
5. Un mensaje más del cliente en esa conversación NO dispara auto-respuesta de Nora.

## Notas de alcance (del spec)

- Fuera de alcance: detalle de cartera por factura, catálogo/precios como tool, ruteo a áreas separadas, que Nora cree el pedido real sin humano, conversación de pedido multi-turno extensa.
- Para pedido nuevo sin `orderRef`, el caso lleva solo `items` (sin empresa/zona); la persona de filtro completa empresa/zona al confirmar. Es el comportamiento esperado.

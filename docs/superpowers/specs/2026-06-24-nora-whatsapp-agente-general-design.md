# Nora — Agente general por WhatsApp (comercial) — Sub-proyecto A

**Fecha:** 2026-06-24
**Estado:** Aprobado, pendiente de plan de implementación

## Contexto

En la reunión del 2026-05-22 se pidió que el equipo comercial le pueda hablar a
Nora por WhatsApp y que ella resuelva (agenda, ventas, cartera, pedidos, etc.),
no solo el flujo de gastos por foto que ya existe.

Estado actual (confirmado en el código):
- Inbound funciona: Kapso → `POST /whatsapp/webhooks/kapso` → `NoraRoutingService.routeInboundMessage`.
- Hay **modo agéntico solo para gastos**, activado por el flag de entorno
  `NORA_WHATSAPP_AGENT_EXPENSES === "true"`: para usuarios con `userId` resuelto y
  un caso de gasto abierto, NestJS mintea un token scoped (`mintScopedToken`), llama
  a Nora `POST /whatsapp/agent` (que corre un grafo stateless con `EXPENSE_TOOLS`),
  loguea en `noraActionLog`, responde por WhatsApp, y **si algo falla cae de vuelta
  al planner**.
- Todo lo demás (mensajes generales) va al **planner** `POST /whatsapp/route`, que
  solo clasifica intención y **sugiere texto, sin ejecutar herramientas**.
- El agente CRM completo (`nora_graph` con `ALL_TOOLS`: clientes, pedidos, agenda,
  oportunidades, seguimientos, analítica) es **solo web** (`POST /messages`).

Este sub-proyecto sube los mensajes generales del **comercial/admin** del planner
al **mismo modo agéntico** que tan bien funcionó para gastos, pero con todas las
herramientas. Replica el patrón del flag de entorno: prendido = Nora agente real;
apagado o con error = comportamiento actual (planner).

Decisiones de alcance (brainstorming):
- Audiencia v1: **comercial/admin** (auth ya lista vía `mintScopedToken`). Clientes
  externos = Sub-proyecto B (después).
- Capacidades v1: **lectura + acciones** (consultas + crear pedido/visita/cliente/seguimiento).

## Decisión de diseño

Reutilizar el patrón agéntico existente de gastos para los mensajes generales:

1. **Python** — un agente general stateless que corre `ALL_TOOLS` con el token
   scoped, espejando `whatsapp_agent.py`.
2. **NestJS** — una rama nueva en el router, gateada por un flag de entorno
   `NORA_WHATSAPP_GENERAL_AGENT`, que mintea token y llama al agente general, con
   **fallback al planner** si falla.

No se toca el flujo de gastos, ni el planner, ni el agente web.

## Lado Python

### Nuevo módulo `agents/nora/src/whatsapp_general_agent.py`
- Construye un grafo stateless (sin `MemorySaver`; historial pasado por turno),
  espejando `_build_expense_graph` de `whatsapp_agent.py`, pero:
  - vincula `ALL_TOOLS` (importadas de `agent.py`).
  - usa el system prompt `NORA_SYSTEM_PROMPT` (el del agente web) **+ un addendum de
    WhatsApp**: respuestas en texto plano, concisas, sin tablas ni markdown pesado;
    estás hablando con un comercial del equipo por WhatsApp.
- `run_whatsapp_general_agent(request: WhatsAppAgentRequest) -> WhatsAppAgentResponse`:
  - arma los mensajes: `[SystemMessage(prompt+addendum)] + history (como Human/AI) + HumanMessage(current_message)`, evitando duplicar el último turno (mismo cuidado que `_to_messages`).
  - construye el estado con `auth_token = request.auth` (token scoped "Bearer ...") y
    `session_id = request.conversation_id`, de modo que `ALL_TOOLS` (que usan
    `InjectedState("auth_token")`) funcionen igual que en web.
  - ejecuta el grafo, extrae el último texto del asistente como `reply_text`.
  - `executed_entity`: best-effort; si no se detecta, `None` (no bloquea).
  - `case_update`: `None` (este flujo no usa cases).

### Nuevo endpoint en `agents/nora/src/main.py`
- `POST /whatsapp/agent/general` → `run_whatsapp_general_agent(payload)`,
  con `response_model=WhatsAppAgentResponse`. Reutiliza `WhatsAppAgentRequest`.

### Contratos
Se reutilizan tal cual `WhatsAppAgentRequest` y `WhatsAppAgentResponse`
(`models/whatsapp_models.py`). No se crean modelos nuevos.

## Lado NestJS

### `NoraRoutingService.routeInboundMessage` (`apps/api/src/modules/whatsapp/nora-routing.service.ts`)
Agregar una rama nueva **después** del bloque de gastos y **antes** del planner:

```
si NORA_WHATSAPP_GENERAL_AGENT === "true"
   y "userId" in sender y sender.userId            // comercial/admin
   y NO es turno de gasto (no hay caso de gasto abierto)
   y el mensaje NO trae imagen adjunta (mediaPayload sin imagen):
     - mintScopedToken(sender.userId)
     - requestNoraGeneralAgent({ current_message, history: context.recent_messages,
         conversation_id, auth: `Bearer ${scopedToken}`, sender: <NoraUserContext> })
     - noraActionLog.update(status executed|proposed, output)
     - sendAgentReply(reply_text)
     - return
   en try/catch: si falla, log y cae al planner (igual que gastos).
```

- `requestNoraGeneralAgent` es un método nuevo análogo a `requestNoraAgent`, pero
  apunta a `${NORA_API_URL}/whatsapp/agent/general`.
- `open_case` no se envía (este flujo no usa cases).
- El gating por flag asegura: apagado → comportamiento idéntico al actual.

### Regla de ruteo (resumen)
1. Caso de gasto abierto **o** imagen adjunta → flujo de gastos (intacto).
2. Si no, comercial/admin con flag prendido → **agente general** (nuevo).
3. Si no (clientes/desconocidos, o flag apagado, o error) → planner (intacto).

Limitación conocida (ponytail): un gasto escrito solo-texto del comercial iría al
agente general; Nora responderá pidiendo la foto de la factura. Aceptable v1.

## Manejo de errores
- NestJS: try/catch alrededor de la llamada al agente general; en error, log y
  fallback al planner (mismo patrón que gastos). Nunca deja al usuario sin respuesta.
- Python: las tools ya manejan `NestJSAPIError`/genérico y devuelven texto. Si el
  grafo no produce texto, `reply_text` cae a un genérico ("¿En qué más te ayudo?").

## Seguridad / scoping
- Mismo modelo que gastos: token scoped de 10 min por turno, scopeado al usuario;
  las tools llaman a la API con ese token (la API filtra por rol comercial).
- Solo usuarios con `userId` resuelto (comercial/admin). Clientes quedan fuera (B).

## Tests
- **Python** (`tests/test_whatsapp_general_agent.py`, patrón de `test_whatsapp_agent.py`):
  - el runner arma los mensajes con system prompt + historial + mensaje actual sin
    duplicar el último turno.
  - inyecta `auth` como `auth_token` (una tool mockeada lo recibe).
  - devuelve `reply_text` del último mensaje del asistente; genérico si vacío.
- **Python** (`tests/test_whatsapp_agent_endpoint.py` o nuevo): `POST /whatsapp/agent/general`
  responde con el shape `WhatsAppAgentResponse`.
- **NestJS** (e2e, `apps/api/test/whatsapp.e2e-spec.ts`): con el flag prendido y un
  remitente comercial sin caso de gasto ni imagen, el router llama al agente general
  y responde; con el flag apagado, usa el planner (sin regresión).

## Fuera de alcance (Sub-proyecto B y otros)
- Clientes externos / contactos (auth de cliente, políticas, ruteo a áreas).
- Cases/propuestas con revisión para el agente general (las acciones se ejecutan
  directo; el pedido ya entra `en_revision` por sí mismo).
- Memoria persistente entre sesiones (se usa historial stateless por turno).
- Gasto escrito solo-texto del comercial por el agente general.

# Nora — Cliente externo por WhatsApp (híbrido: autoservicio + unicanal) — Sub-proyecto B

**Fecha:** 2026-06-24
**Estado:** Aprobado, pendiente de plan de implementación

## Contexto

La reunión del 2026-05-22 pidió un "unicanal": el WhatsApp de la empresa donde un
cliente escribe, Nora lo recibe, responde lo que pueda y, si necesita un humano,
lo deriva a una persona que redirige internamente ("Magali maneja el unicanal").
Política explícita: las acciones del cliente (p.ej. hacer un pedido) **siempre pasan
por revisión humana**.

Estado actual (confirmado en el código):
- Inbound y resolución de remitente ya funcionan: `teléfono → Contact → customerId`,
  `senderType = "cliente"` (`WhatsAppService.resolveSenderByPhone`).
- Hoy los mensajes de cliente van al **planner** (`/whatsapp/route`), que clasifica y
  **auto-responde lo seguro** (a menos que `requires_human_review === true`).
- `WhatsAppConversation` tiene `status` y `assignedToUserId`. **No existe modelo de
  Áreas/Departamentos**. No existe token/login de cliente.
- Sub-proyecto A (agente general para comerciales) ya estableció el patrón:
  flag de entorno + agente stateless en Python + fallback al planner.

Decisiones de alcance (brainstorming):
- Corazón v1: **híbrido** — autoservicio seguro del cliente + derivación a humano.
- Ruteo humano: **buzón único** (Magali), configurado por `NORA_UNICANAL_USER_ID`.
  Sin modelo de áreas; Nora etiqueta la intención detectada y un humano redirige.

## Decisión de diseño

Un **agente de cliente** stateless que responde desde un **snapshot de datos del
propio cliente** (armado server-side, sin auth nueva) y **deriva al buzón único**
cuando hace falta un humano. Gateado por flag de entorno, con fallback al planner.
Espejando el patrón del Sub-proyecto A.

### 1. Acceso a datos del cliente — SIN auth nueva (clave)
No se añade token de cliente, ni rol nuevo, ni endpoints nuevos en la API.
NestJS ya resuelve `customerId` desde el teléfono. Se extiende
`WhatsAppService.getNoraConversationContext` (o el contexto que arma el router) para,
cuando el remitente es cliente, incluir un **`customer_snapshot`** compacto, armado
**vía Prisma server-side y estrictamente scopeado a ese `customerId`**:
- `customerName`
- `recentOrders`: últimos ~5 pedidos `{ orderNumber, status, orderDate, total }`
- `cartera`: `{ saldo, vencidasCount }` (saldo total pendiente y # de facturas vencidas)

El agente responde **solo** desde ese snapshot. No consulta nada por su cuenta, así
que no puede ver datos de otros clientes.

### 2. Agente de cliente (Python) — `agents/nora/src/whatsapp_customer_agent.py`
- Grafo stateless **sin tools de escritura ni de lectura del CRM**. El único tool es
  `derivar_a_unicanal(motivo, intent)` (ver sección 3); responde desde prompt + contexto.
- System prompt nuevo `CUSTOMER_AGENT_PROMPT`: Nora atendiendo a un **cliente externo**
  por WhatsApp; tono amable y claro; responde estado de pedido/cartera **desde el
  snapshot**; **nunca inventa datos** — si la info no está en el snapshot o requiere
  acción (hacer pedido, reclamo, cambio, hablar con alguien) → marcar **handoff**.
- `run_whatsapp_customer_agent(request) -> ...`: arma mensajes con el prompt + el
  snapshot (como bloque de sistema, estilo `_case_context_block`) + historial +
  mensaje actual; devuelve `reply_text` y un **`handoff`**.

### 3. Handoff al unicanal
- Se agrega a `WhatsAppAgentResponse` un campo **opcional aditivo**:
  `handoff: NoraHandoff | None` con `{ needed: bool, reason: str | None, intent: str | None }`.
  (No afecta a gastos ni al agente general: queda `None` por defecto.)
- Mecanismo: el agente expone **una sola tool** `derivar_a_unicanal(motivo, intent)`.
  Cuando Nora la invoca, la tool devuelve una confirmación simple (no llama a la API);
  el runner **detecta esa tool call** (estilo `_extract_executed_entity` del agente de
  gastos) y arma `handoff = { needed: True, reason: motivo, intent }`. Si no se invocó,
  `handoff.needed = False`. El contrato externo es el campo `handoff`.

### 4. Ruteo NestJS (`nora-routing.service.ts`)
Nueva rama para `senderType === "cliente"`, gateada por
`NORA_WHATSAPP_CUSTOMER_AGENT === "true"`, **antes** del planner:
- arma el `customer_snapshot` (server-side, por `customerId`),
- llama `POST /whatsapp/agent/customer` (método `requestNoraCustomerAgent`),
- si `handoff.needed`: asigna la conversación a `NORA_UNICANAL_USER_ID`, setea status,
  deja una nota interna con `intent`/`reason`,
- envía `reply_text` al cliente,
- en error o flag apagado → **fallback al planner actual** (try/catch, como A).

### 5. Endpoint Python (`main.py`)
`POST /whatsapp/agent/customer` → `run_whatsapp_customer_agent(payload)`.

### 6. Política
El cliente **nunca** ejecuta escrituras. Pedir un pedido / reclamos / cambios →
`handoff` a Magali (revisión humana), como pidió la reunión.

## Contratos
- Reusar `WhatsAppAgentRequest` para la petición, **extendido** con el snapshot:
  agregar campo opcional `customer_snapshot: NoraCustomerSnapshot | None`.
- Extender `WhatsAppAgentResponse` con `handoff: NoraHandoff | None`.
- Nuevos modelos pequeños en `models/whatsapp_models.py`: `NoraCustomerSnapshot`
  (`customerName`, `recentOrders: list[dict]`, `cartera: dict`) y `NoraHandoff`
  (`needed: bool`, `reason: str | None`, `intent: str | None`).

## Manejo de errores
- NestJS: try/catch; en error → log + fallback al planner. Nunca deja al cliente sin
  respuesta.
- Python: si el grafo no produce texto, `reply_text` cae a un genérico amable. Si el
  snapshot viene vacío/None, el agente responde de forma general y deriva si hace falta.
- Seguridad: el snapshot se arma server-side scopeado al `customerId` resuelto; el
  agente no recibe datos de otros clientes ni puede consultarlos.

## Tests
- **Python** (`tests/test_whatsapp_customer_agent.py`, patrón determinista de A):
  - armado de mensajes (prompt + snapshot block + historial + mensaje, sin duplicar
    el último turno).
  - el bloque de snapshot incluye pedidos y cartera del snapshot.
  - parsing del handoff: cuando el agente deriva, `handoff.needed = True` con motivo.
  - endpoint `POST /whatsapp/agent/customer` devuelve el shape correcto (TestClient,
    runner parcheado).
- **NestJS** (e2e, `apps/api/test/whatsapp.e2e-spec.ts`):
  - con flag prendido y remitente cliente: llama `/whatsapp/agent/customer` (no el
    planner); cuando la respuesta trae `handoff.needed`, la conversación queda asignada
    a `NORA_UNICANAL_USER_ID` y se envía la respuesta.
  - con flag apagado: usa el planner (sin regresión).
  - el `customer_snapshot` enviado está scopeado al `customerId` del remitente.

## Fuera de alcance
- Modelo de Áreas / ruteo directo por área (queda buzón único).
- Token/login de cliente; endpoints de API para clientes.
- Que el cliente cree o modifique entidades por su cuenta.
- Memoria persistente entre sesiones (stateless con historial por turno).

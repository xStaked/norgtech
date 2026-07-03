# Nora Cliente Externo — Consulta de estado/guía + Pedido con filtro humano

**Fecha:** 2026-07-02
**Estado:** Diseño aprobado — pendiente de plan de implementación

## Objetivo

Que un CLIENTE externo por WhatsApp pueda, sin intervención humana:
1. **Consultar el estado y la guía de sus pedidos** ("¿dónde va mi pedido?"): estado, transportadora, número de guía, link de tracking, fecha estimada/entrega.
2. **Pedir o repetir un pedido**, que SIEMPRE termina en el buzón único (unicanal) para que una persona de filtro lo confirme antes de que sea un pedido real.

Respeta lo pedido en la reunión del cliente (2026-05-22): validación humana en oficina antes de facturación.

## Contexto actual (lo que ya existe)

- Inbound WhatsApp entra por Kapso → `nora-routing.service.ts:routeInboundMessage`.
- Branch de cliente externo (flag `NORA_WHATSAPP_CUSTOMER_AGENT`), gateado a `senderType === cliente`, `customerId` resuelto, `!openCase`, `!mediaPayload`. Llama a `agents/nora/src/whatsapp_customer_agent.py` con un `customer_snapshot` scopeado server-side.
- El customer agent es stateless, responde SOLO desde el snapshot, y su única tool es `derivar_a_unicanal(motivo, intent)`. En handoff, NestJS asigna la conversación a `NORA_UNICANAL_USER_ID`, status `pendiente`, y crea nota interna.
- Snapshot actual (`buildCustomerSnapshot`): `customerName`, `recentOrders` = `{orderNumber, status, orderDate, total}` (últimos 5), `cartera` = `{saldo, vencidasCount}`.
- Infra de pedido reusable: `NoraConversationCase` (type=order), `createOrderFromCase(user, conversationId, caseId)` en `whatsapp.service.ts:395` — exige `type=order` + `status=ready_for_review`, lee `extractedData` (customerId, customerRef, companyRef, customerZoneId, zoneRef, items), y ejecuta vía `WhatsAppOrderAutomationService.process`. Los ítems se resuelven server-side por `productRef` (nombre o sku, match difuso); ambiguos → `human_review`.
- `NoraConversationCase.createdByUserId` es **nullable** → un caso originado por cliente externo (sin usuario interno) es válido.

## Enfoque elegido

**A — Enriquecer el snapshot + nueva tool `armar_pedido` en el customer agent.** El agente arma los datos del pedido y NestJS los persiste como `NoraConversationCase` type=order en `ready_for_review` + deriva al unicanal. Reusa `createOrderFromCase`. Mantiene el aislamiento: el cliente sigue sandboxed al snapshot; no toca el CRM.

Descartados: (B) reusar el planner/flujo interno — rompe el aislamiento de seguridad; (C) handoff de texto libre — no entrega el "repetir pedido casi listo".

## Diseño

### 1. Snapshot más rico

En `nora-routing.service.ts:buildCustomerSnapshot`, extender `recentOrders`. Por pedido, además de lo actual, incluir:

- Guía/logística: `carrierName`, `trackingNumber`, `trackingUrl`, `dispatchDate`, `committedDeliveryDate`, `deliveryDate`.
- Para poder repetir: `items` = `[{ productRef, quantity, unitPrice }]` (productRef = nombre o sku del producto), `companyRef` (prefix o nombre de la empresa), `customerZoneId`.

Los modelos en Prisma (`Order`) actualizados con estos campos por el mapeo `NoraCustomerSnapshot` en `agents/nora/src/models/whatsapp_models.py` (`recentOrders: list[dict]` ya lo permite; se documenta la forma esperada).

### 2. Prompt del customer agent

Ampliar `CUSTOMER_AGENT_PROMPT` en `whatsapp_customer_agent.py`:
- Responder estado/guía usando SOLO los campos del snapshot (nunca inventar guía ni fechas).
- Cuando el cliente quiere pedir o repetir: usar la tool `armar_pedido` (no `derivar_a_unicanal`).
- Mantener: cualquier otra cosa fuera de alcance → `derivar_a_unicanal`.

### 3. Nueva tool `armar_pedido(order_ref, items, motivo)`

En `whatsapp_customer_agent.py`, junto a `derivar_a_unicanal`:
- `order_ref` (opcional): referencia a un pedido del snapshot (ej. `orderNumber`) → NestJS clona ítems + empresa + zona de ese pedido.
- `items` (opcional): lista `[{productRef, quantity}]` capturada del chat, para pedido nuevo.
- `motivo`: frase corta.
- Devuelve un marcador estructurado, ej. `PEDIDO|{json}`, que NestJS parsea (mismo patrón que `DERIVADO|intent|motivo`). El extractor (`_extract_handoff` → nuevo `_extract_order`) lo lee del `ToolMessage`.

La respuesta del agente (`WhatsAppAgentResponse`) gana un campo opcional `order_case` (o se reusa/expande `handoff`) con `{ orderRef?, items?, motivo }`.

### 4. NestJS: al recibir `armar_pedido`

En el branch de cliente de `routeInboundMessage`, si la respuesta trae `order_case`:
- Resolver ítems: si `orderRef`, copiar `items/companyRef/customerZoneId` del pedido correspondiente del snapshot ya construido (server-side, no confiar en datos del LLM para montos). Si `items` libres, usarlos como `[{productRef, quantity}]`.
- Crear `NoraConversationCase`: `type=order`, `status=ready_for_review`, `createdByUserId=null`, `extractedData = { customerId, companyRef, customerZoneId, items, notes: motivo }`.
- Asignar conversación a `NORA_UNICANAL_USER_ID`, status `pendiente`, nota interna ("Pedido armado por Nora — <motivo>").
- Responder al cliente en tono cálido: "Ya un asesor confirma tu pedido y te avisa."

La persona de filtro, en el inbox del unicanal, hace **1 clic → `createOrderFromCase`** (server resuelve productos; ambiguos → `human_review` para que ella los ajuste).

Si falta `NORA_UNICANAL_USER_ID`, se hace fallback a la nota/derivación actual (log de warning), como hoy.

### 5. Silenciar a Nora tras derivar

Guard en el branch de cliente: si la conversación ya está `assignedToUserId != null` **y** status `pendiente`/`en_gestion`, el customer agent NO auto-responde (evita pisar al asesor). Un humano lleva la conversación desde ahí.

### 6. Gating

El branch de cliente exige hoy `!openCase`. Ajuste: permitir el turno que dispara `armar_pedido`, pero una vez creado el caso de pedido + derivado, el punto 5 corta las respuestas automáticas. No se busca conversación multi-turno larga con el cliente: Nora captura el pedido en el mínimo de turnos y entrega al humano.

## Flujo end-to-end (pedido)

1. Cliente: "Repite mi último pedido" / "Quiero 10 bultos de X".
2. Customer agent (snapshot) → tool `armar_pedido` con `order_ref` o `items`.
3. NestJS crea `NoraConversationCase` order `ready_for_review` + deriva a unicanal + nota + responde al cliente.
4. Persona de filtro revisa en el inbox → `createOrderFromCase` → pedido real (o ajusta ambiguos).
5. Nora queda en silencio en esa conversación (asignada a humano).

## Fuera de alcance

- Detalle de cartera por factura (solo total agregado, como hoy).
- Catálogo/precios como tool para el cliente.
- Ruteo a áreas separadas (sigue buzón único `NORA_UNICANAL_USER_ID`).
- Que Nora cree el pedido real sin filtro humano.
- Conversación de pedido multi-turno extensa con el cliente.

## Testing

- Python: test de `armar_pedido` (repetir con `order_ref`, nuevo con `items`) y de que el snapshot con guía se refleja en el bloque de datos (patrón de `test_snapshot_block_includes_orders_and_cartera`).
- NestJS e2e (`whatsapp.e2e-spec.ts`): dado un `order_case` de respuesta del agente, se crea el `NoraConversationCase` order `ready_for_review` con `extractedData` esperado y la conversación queda asignada/pendiente; guard de silencio cuando ya está asignada a humano.

## Riesgos / notas

- El LLM no debe fijar montos: los `unitPrice`/empresa/zona para "repetir" se toman server-side del snapshot ya scopeado, no del texto del modelo.
- Productos de pedido nuevo se resuelven al confirmar (server), no en el chat; los ambiguos los ve la persona de filtro — consistente con el filtro humano.

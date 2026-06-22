# Diseño: Completar el flujo de pedidos de Nora (WhatsApp → confirmación → revisión → facturación)

- **Fecha:** 2026-06-21
- **Feature:** #2 del backlog de la reunión 2026-05-22 (pedidos en Nora)
- **Estado:** Aprobado por el usuario — listo para plan de implementación

## Contexto

El camino WhatsApp → pedido ya existe end-to-end: Nora detecta la intención de pedido,
extrae ítems, resuelve empresa/zona/producto y crea la `Order` en `approvalStatus="en_revision"`.

Problemas reales del estado actual:
1. **No hay flujo de aprobación**: la orden queda en `en_revision` y no existe endpoint ni UI
   para que alguien la apruebe o rechace. Nunca avanza a facturación.
2. **Sin compuerta de confirmación**: Nora crea el pedido inmediatamente al detectar ítems,
   sin que el remitente confirme.
3. **Resolución de productos frágil**: si el texto libre no empareja (0 o varias coincidencias),
   el flujo se traba con `needs_clarification`.
4. **Cliente no identificado**: si el teléfono no resuelve a un cliente/contacto, el flujo se traba.
5. **Manejo de errores genérico**: los fallos de `ordersService.create()` devuelven un mensaje vago.

## Decisiones tomadas (brainstorming)

| Tema | Decisión |
|------|----------|
| Flujo de aprobación | Confirmación por WhatsApp **+** revisión interna (doble control) |
| Revisor interno | Rol **`facturacion`** (+ `administrador`), en la web |
| Al aprobar | `approvalStatus=aprobado`, `status=orden_facturacion`, **notifica al remitente por WhatsApp** |
| Al rechazar | `approvalStatus=rechazado` + motivo, **notifica al remitente por WhatsApp con el motivo** |
| Producto ambiguo | Crear el pedido igual con el ítem **marcado "sin resolver"**; facturación lo resuelve al revisar |
| Cliente sin resolver | Comercial → Nora pregunta "¿para qué cliente?"; número desconocido → atención humana, sin crear pedido |

## Hallazgos del schema que simplifican el trabajo

- `Order` ya tiene `approvalStatus String?`, `approvalReason String?`, `approvalName String?`,
  `reviewDate DateTime?` → infraestructura de aprobación/rechazo ya presente, solo hay que cablearla.
- `OrderItem.productId` ya es **opcional** y existe `customProductName String?` → se pueden crear
  ítems sin producto resuelto con migración mínima.
- `OrderStatus` enum incluye `recibido`, `orden_facturacion`, `facturado`, `despachado`,
  `en_transito`, `entregado`.
- `NoraConversationCase` ya soporta estados: `collecting_info`, `ready_for_review`, `approved`,
  `executed`, `cancelled`, `blocked`, y tipo `order`.

## Arquitectura

### A. Flujo conversacional (Nora / WhatsApp)

Insertar una **compuerta de confirmación** usando el `NoraConversationCase` (tipo `order`):

1. Nora extrae el pedido → crea/actualiza el caso en `ready_for_review` con los datos extraídos.
   **No crea la `Order` todavía.**
2. Responde con resumen del pedido y pide confirmación
   ("Empresa X, cliente Y, 10 bultos de Z… ¿confirmas?").
3. El remitente confirma (reutilizar las palabras de confirmación ya ampliadas en `planner.py`)
   → caso pasa a `approved` → **ahí sí** se dispara `WhatsAppOrderAutomationService.process()`
   y se crea la `Order` en `approvalStatus="en_revision"`.
4. Identificación:
   - **Comercial sin cliente resuelto** → Nora pregunta "¿para qué cliente?" y resuelve por
     nombre/NIT (búsqueda de cliente). Caso en `collecting_info` hasta resolver.
   - **Número desconocido** (no es contacto ni usuario) → no intenta pedido; marca la conversación
     `status=pendiente` para atención humana (gancho mínimo hacia el feature #7).

### B. Modelo de datos (migración mínima)

- `OrderItem`: agregar `needsResolution Boolean @default(false)`.
  - Ítem sin emparejar → `productId=null`, `customProductName`=texto crudo del remitente,
    `unitPrice=0`, `needsResolution=true`. `productSnapshotName`/`productSnapshotSku` se rellenan
    con el texto crudo / placeholder.
- `Order`: sin cambios estructurales. Uso de campos existentes:
  - `approvalStatus`: `en_revision` → `aprobado` / `rechazado`
  - `approvalReason`: motivo de rechazo
  - `approvalName`: nombre de quien revisó
  - `reviewDate`: fecha de revisión
- **Totales**: mientras haya ítems con `needsResolution=true`, el total es parcial.
  La orden **no se puede aprobar** hasta resolver todos los ítems y el cliente.

### C. API de revisión (backend NestJS)

Nuevos endpoints en `orders.controller.ts`, rol `facturacion` + `administrador`:

- `GET /orders/review-queue` → pedidos con `approvalStatus="en_revision"`, con flag de cuántos
  ítems quedan sin resolver.
- `PATCH /orders/:id/items/:itemId/resolve` `{ productId, unitPrice }` → resuelve un ítem:
  setea producto, precio, `needsResolution=false`, recalcula totales (subtotal, impuestos, total).
- `PATCH /orders/:id/approve` → valida que no queden ítems con `needsResolution` ni cliente sin
  resolver → `approvalStatus=aprobado`, `status=orden_facturacion`, `reviewDate=now`,
  `approvalName=<usuario>`; **notifica al remitente por WhatsApp**.
- `PATCH /orders/:id/reject` `{ reason }` → `approvalStatus=rechazado`, `approvalReason=reason`,
  `reviewDate`, `approvalName`; **notifica al remitente por WhatsApp con el motivo**.
- Notificación: mensaje saliente sobre la `sourceConversation` del pedido, reutilizando el envío
  outbound existente (`POST /whatsapp/conversations/:id/messages` o el servicio subyacente).

### D. Frontend (Next.js / apps/web)

- Bandeja **"Pedidos en revisión"** visible para roles `facturacion` / `administrador`:
  lista de `review-queue` con indicador de ítems sin resolver.
- Detalle del pedido en revisión:
  - Resolver ítems sin emparejar (selector de producto + precio).
  - Botón **Aprobar** (deshabilitado mientras queden pendientes).
  - Botón **Rechazar** con campo de motivo.

### E. Robustez

- Resolución de productos: mantener el matching actual en `WhatsAppOrderAutomationService`;
  lo que no resuelva → ítem marcado `needsResolution` (ya no traba la conversación).
- Manejo de errores de `ordersService.create()`: propagar un mensaje útil al `NoraActionLog` y a
  la respuesta de Nora, en vez del genérico "No fue posible crear el pedido".

## Componentes afectados

- `agents/nora/src/operation/planner.py` — compuerta de confirmación, intención de cliente faltante.
- `agents/nora/src/whatsapp_router.py` — construcción del candidato y transición de caso.
- `apps/api/src/modules/whatsapp/nora-routing.service.ts` — disparo de creación solo al confirmar;
  manejo de desconocido.
- `apps/api/src/modules/whatsapp/whatsapp-order-automation.service.ts` — ítems sin resolver,
  errores útiles.
- `apps/api/src/modules/orders/orders.controller.ts` + `orders.service.ts` — endpoints de revisión,
  aprobación, rechazo, resolución de ítem, recálculo de totales, notificación WhatsApp.
- `apps/api/prisma/schema.prisma` — `OrderItem.needsResolution`.
- `apps/web` — bandeja y detalle de revisión de pedidos.

## Fuera de alcance (YAGNI)

- Routing completo multi-área del unicanal (es el feature #7; aquí solo el gancho mínimo
  de marcar `status=pendiente` para desconocidos).
- Reglas de aprobación más complejas (montos, límites de crédito como bloqueo automático).
- Edición libre de cualquier campo del pedido en la bandeja (solo resolver ítems + aprobar/rechazar).

## Criterios de éxito

1. Un comercial escribe un pedido por WhatsApp, Nora resume y pide confirmación; al confirmar,
   se crea la orden en `en_revision`.
2. Si un producto no empareja, la orden se crea igual con el ítem marcado; la conversación no se traba.
3. Un usuario `facturacion` ve la bandeja, resuelve los ítems pendientes y aprueba; la orden pasa a
   `orden_facturacion` y el remitente recibe aviso por WhatsApp.
4. Al rechazar con motivo, el remitente recibe el aviso con el motivo por WhatsApp.
5. No se puede aprobar una orden con ítems o cliente sin resolver.

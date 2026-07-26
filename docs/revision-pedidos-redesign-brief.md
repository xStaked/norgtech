# Brief para Claude Design — Lista "Revisión de pedidos"

## Qué es

Cola de aprobación. Los pedidos que crea **Nora (el agente de WhatsApp)** a partir de un chat con el
cliente entran con `approvalStatus = "en_revision"` y **no existen comercialmente** hasta que alguien
de Administración o Facturación los aprueba. Es el único punto de control humano entre "el cliente
escribió por WhatsApp" y "hay una orden de facturación que compromete cupo de crédito".

Ruta: `/orders/review` · Nav: grupo "Comercial", label "Revisión pedidos" (`apps/web/src/lib/theme.ts:138`)
Roles con acceso: `administrador`, `facturacion` (nadie más ve la ruta ni el endpoint).

## Archivos

| Qué | Dónde |
|---|---|
| Página (server, 10 líneas, solo título + lista) | `apps/web/src/app/(app)/orders/review/page.tsx` |
| **La lista a rediseñar** (client component, fetch en `useEffect`) | `apps/web/src/components/orders/order-review-list.tsx` |
| Panel de resolución/aprobación (vive en el detalle del pedido) | `apps/web/src/components/orders/order-review-actions.tsx` |
| Endpoint | `GET /orders/review-queue` → `apps/api/src/modules/orders/orders.service.ts:728` |
| Origen de los pedidos | `apps/api/src/modules/whatsapp/whatsapp-order-automation.service.ts:127` |

## El flujo real (importante para el diseño)

1. Cliente pide por WhatsApp → Nora arma el pedido → `approvalStatus: "en_revision"`.
2. Si Nora **no pudo mapear un producto** al catálogo, ese ítem queda con `needsResolution: true`
   (guarda `customProductName`, el texto crudo del cliente, y precio 0/estimado).
3. El revisor abre el pedido → resuelve cada ítem sin resolver (elige producto del catálogo + precio
   unitario, `PATCH /orders/:id/items/:itemId/resolve`).
4. **No se puede aprobar mientras quede un ítem sin resolver** (validado en front y back).
5. Aprobar (`PATCH /orders/:id/approve`) → valida cupo de crédito del cliente → el pedido pasa a
   `orden_facturacion`. Rechazar (`PATCH /orders/:id/reject`) exige un motivo escrito.
6. Mientras el pedido está en revisión, el cliente en WhatsApp **sigue esperando**: cada hora que
   pasa es un cliente sin respuesta. La antigüedad del pedido en la cola es información crítica y hoy
   solo se muestra como una fecha corta (`dd/mm/yyyy`), sin urgencia visual.

## Estado actual de la lista (lo que hay que rediseñar)

Tabla HTML cruda de 6 columnas, con `<Th>`/`<Td>` definidos a mano en el mismo archivo — **no usa
ninguno de los componentes del design system** (`DataTable`, `PageHeader`, `SectionCard`,
`ListFilters`, `StatCard`, `EmptyState`, `StatusBadge`), a diferencia del resto del CRM.

Columnas actuales: `Pedido` (orderNumber o `#`+últimos 6 del id) · `Cliente` · `Empresa` ·
`Ítems sin resolver` (badge ámbar "N sin resolver" / verde "Listos") · `Fecha` · `Acción` ("Ver pedido →").

Sin filtros, sin buscador, sin orden configurable, sin contador, sin paginación, sin acciones en línea,
sin estado vacío diseñado (solo un párrafo gris), sin skeleton (solo el texto "Cargando…").

## Datos disponibles en el endpoint (hoy se usa una fracción)

`findReviewQueue()` hace `findMany({ where: { approvalStatus: "en_revision" }, include: { items: true,
customer: true, company: true }, orderBy: { createdAt: "desc" } })`. Es decir, **el objeto Order completo**
llega al cliente. Campos aprovechables que hoy se ignoran:

- `total`, `subtotal` (Decimal como string) — cuánto dinero espera aprobación. Hoy no se muestra nada
  de plata, ni en la fila ni en un agregado.
- `items[]` completo: `productSnapshotName`, `customProductName`, `quantity`, `unitPrice`,
  `needsResolution`. Se puede previsualizar los ítems problemáticos sin abrir el pedido.
- `createdAt` / `orderDate` — para antigüedad ("hace 3 h") en vez de fecha seca.
- `customer` completo: `displayName`, NIT, y `customerNameSnapshot` / `customerNitSnapshot`.
- `company` (empresa facturadora, tiene `name` y `prefix`); hoy solo se usa el snapshot del nombre.
- `sourceConversationId` — el pedido viene de un chat de WhatsApp; hay módulo de conversaciones y se
  podría enlazar al hilo original ("ver la conversación").
- `sellerUserId` / `seller`, `zone`, `requesterName` / `requesterPhone` (quién pidió por WhatsApp),
  `notes`, `requestedDeliveryDate`.

## Ideas de producto que el rediseño podría resolver

- Separar visualmente **"listo para aprobar"** de **"necesita resolución manual"**: son dos trabajos
  distintos; hoy solo los distingue un badge en la 4ª columna.
- Priorizar por antigüedad (cliente esperando) y por monto.
- Cabecera con agregados: pedidos en cola, cuántos bloqueados por ítems, monto total represado.
- Aprobar desde la lista cuando no hay ítems por resolver (hoy obliga a entrar al detalle para todo).
- Mostrar en la fila **qué** producto no se pudo mapear (el `customProductName` textual del cliente):
  es lo primero que el revisor quiere saber.
- Buscador + filtro por empresa/vendedor, consistentes con `ListFilters` del resto del CRM.

## Convenciones del sistema de diseño (respetarlas)

- Next.js App Router + Tailwind. Componentes en `apps/web/src/components/ui/`: `page-header`,
  `section-card`, `stat-card`, `status-badge` (tonos `info | warning | success | neutral`),
  `data-table`, `list-filters`, `empty-state`, `select` (propio, con búsqueda), `button`, `badge`.
- El CRM está migrando al look "Enterprise". Dos referencias vivas y opuestas:
  - **Tabla estándar**: `apps/web/src/app/(app)/orders/page.tsx` — `PageHeader` + fila de `StatCard`
    + `ListFilters` + `SectionCard` + `DataTable`.
  - **Tarjetas (lo más nuevo, hecho por Claude Design)**: `apps/web/src/app/(app)/products/page.tsx`
    — grid `1 / sm:2 / lg:3`, tarjeta `rounded-[11px] border border-border bg-card p-4`, hover
    `hover:border-[#c7d3df] hover:shadow-[0_6px_18px_rgba(12,44,68,.08)]`, avatar de iniciales con
    color derivado del nombre, cifras en `font-mono tabular-nums`, metadatos en fila con separadores `·`.
- Paleta en uso: tinta `#0c2c44`, secundario `#44556e`, apagado `#6b7787`/`#7a8696`, líneas `#f0f2f6`
  y `#d5dbe3`, azul de enlace `#0f5c8a`, verde `#00a651`, naranja/alerta `#f58221`.
- Español (es-CO). Moneda COP sin decimales: `Intl.NumberFormat("es-CO", { style: "currency",
  currency: "COP", maximumFractionDigits: 0 })`.
- Soporta dark mode vía tokens (`bg-card`, `text-muted-foreground`, `border-border`), aunque el
  rediseño de productos usa varios hex fijos.

## Restricciones técnicas

- Hoy es **client component** con `useEffect` + `apiFetchClient` porque el endpoint es rol-restringido;
  se puede pasar a server component con `apiFetch` (patrón de `/orders` y `/products`) si el rediseño
  no necesita interactividad inmediata — o mantenerlo client si se quieren acciones en línea.
- El volumen esperado es bajo (decenas), no hay paginación en el API. No hace falta virtualización.
- Cualquier acción de aprobar/rechazar/resolver ya tiene endpoint; la lógica está en
  `order-review-actions.tsx` y se puede reutilizar tal cual.

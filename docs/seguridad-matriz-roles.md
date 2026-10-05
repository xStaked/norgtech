# Matriz de acceso por rol — Frente 0 seguridad (fase 2 comercial)

Fuente de verdad para los Frentes 1–3. Toda fila está anclada en código real:

- API: `@Roles` de cada controller en `apps/api/src/modules/*/*.controller.ts`
  (agrupaciones en `apps/api/src/modules/auth/permissions.ts`, `ROLE_GROUPS`).
- Web lectura/nav: `apps/web/src/lib/auth.ts:100-134` (`canAccess`),
  `apps/web/src/lib/theme.ts:33-210` (`primaryNavItems`, `requiredRoles`) y
  `noraNavItem` (`theme.ts:243-250`).
- Web creación: `apps/web/src/lib/auth.ts:146-166` (`canCreate`) y
  `apps/web/src/lib/route-guards.ts:37-49` (`roleRestrictedRoutes`).
- Reglas de alcance por fila (forzados por rol): services citados en cada caso.

Roles válidos: `administrador` (adm), `director_comercial` (dir), `comercial` (com),
`tecnico` (tec), `facturacion` (fac), `logistica` (log).

Convenciones de la tabla:

- **V** = ver (lista + detalle; el nav lo muestra y el guard deja pasar).
- **C** = crear (botón/acción de creación disponible; ver columna «Crear (web)» para el matiz).
- **O** = oculto (sin nav; el guard redirige a `/dashboard?forbidden=1` o al login).
- «Crear (web)» cita la entidad de `canCreate` cuando existe; si dice «—», la
  creación/acción especial la gobierna solo el `@Roles` del endpoint.

> Principio: la web nunca abre lo que la API cierra. Cuando la API es más
> permisiva que la web (divergencias D1–D7 al final), la web mantiene lo
> restrictivo hasta que el Frente 0 lo decida.

## Tabla rol × módulo

| Módulo (ruta) | adm | dir | com | tec | fac | log | Crear (web) | Fuentes |
|---|---|---|---|---|---|---|---|---|
| Dashboard (`/dashboard`) | V | V | V | V | V | V | — | `@Roles` en `dashboard.controller.ts:18` (summary, los 6 roles); `canAccess "/dashboard"`; nav `theme.ts:33-41` |
| Agenda (`/agenda`) | V | V | V | V | O | O | — (crea visitas/seguimientos) | No hay `@Roles` directo para Agenda porque no existe un controller propio: agrega `visits` + `follow-up-tasks` (`agenda/page.tsx`); `canAccess "/agenda"` (adm, dir, com, tec); nav `theme.ts:42-49` |
| WhatsApp (`/whatsapp`) | V | V | V | V | V | V | — (notas, mensajes y borrador de pedido bajo el mismo guard) | `@Roles` a nivel de clase `whatsapp.controller.ts:45-52` (los 6 roles); `canAccess "/whatsapp"`; nav `theme.ts:50-57` |
| Magali (`/nora`) | V | V | V | V | O | O | — | No hay `@Roles` directo para la pantalla `/nora` porque la atiende el `NoraAgentController` de WhatsApp, no un controller `/nora`; `canAccess "/nora"` (adm, dir, com, tec); nav `noraNavItem theme.ts:243-250`; API de gastos de Nora admite fac (ver D6) |
| Visitas (`/visits`) | V+C | V+C | V+C | V+C | O | O | `visit` = adm, dir, com, tec | `@Roles` en `visits.controller.ts:30-133` (crear, listar, detalle, estados: los 4 roles); `canAccess "/visits"`; `canCreate visit`; nav `theme.ts:58-65` |
| Gastos (`/expenses`) | V+C | V+C | V+C | O | V | O | `expense` = adm, dir, com (ver D2: la API admite fac en POST) | `@Roles expenseRoles` en `commercial-expenses.controller.ts:31-36,64-166` (adm, dir, com, fac; `PATCH :id/status` solo adm, dir, fac en línea 156); `canAccess "/expenses"`; `canCreate expense`; nav `theme.ts:66-73` |
| Analítica (`/analytics`: ventas, cartera, embudo, desempeño) | V | V | V propio | O | O | O | — | `@Roles` de clase `analytics.controller.ts:88` (adm, dir, com); `canAccess "/analytics"`; nav `theme.ts:74-89` + hijos ventas/cartera/embudo/desempeño; alcance en §R1 |
| Reportes (`/reports`) | V+C | V+C | O | V+C | O | O | `report` = adm, dir, tec | `@Roles` en `reports.controller.ts:26-62` (generar, listar, detalle, PDF: los 3 roles); `canAccess "/reports"`; `canCreate report`; nav `theme.ts:90-97` |
| Seguimientos (`/follow-ups`) | V+C | V+C | V+C | V+C | O | O | `followUp` = adm, dir, com, tec | `@Roles` en `follow-up-tasks.controller.ts:27-101` (crear, listar, detalle, estados: los 4 roles); `canAccess "/follow-ups"`; `canCreate followUp`; nav `theme.ts:98-105` |
| Clientes (`/customers`) | V+C | V+C | V+C | V | V | V | `customer` = adm, dir, com; asignar vendedor/zona solo adm, dir | `@Roles` en `customers.controller.ts:30-113` (POST: adm, com, dir; GET/`:id`: los 6; PATCH: adm, dir, com; zonas: adm, dir); `canAccess "/customers"`; `canCreate customer`; `canAssignCustomers` (`auth.ts:142-144`); nav `theme.ts:106-113` |
| Oportunidades (`/opportunities`) | V+C | V+C | V+C | O (ver D1) | O | O | `opportunity` = adm, dir, com | `@Roles` en `opportunities.controller.ts:25-69` (POST/PATCH: adm, com, dir; GET/`:id`: + tec, ver D1); `canAccess "/opportunities"` (sin tec); `canCreate opportunity`; nav `theme.ts:114-121` |
| Cotizaciones (`/quotes`) | V+C | V+C | V+C | O | V | O | `quote` = adm, dir, com (fac ve, no crea) | `@Roles` en `quotes.controller.ts:26-95` (POST/preview/estado/facturación: adm, com, dir; GET/`:id`: + fac); `canAccess "/quotes"`; `canCreate quote`; nav `theme.ts:122-129` |
| Pedidos (`/orders`) | V+C | V+C | V+C | O | V | V+C | `order` = adm, dir, com, log (fac ve, no crea) | `@Roles` en `orders.controller.ts:33-184` (POST/preview: adm, com, dir, log; GET/`:id`/export: + fac; `review-queue`: adm, fac; estado: adm, com, dir, log; logística: adm, log; aprobar/rechazar/resolver: adm, fac; `billing-request`: adm, com, dir, fac; `invoice`: adm, dir, fac); `canAccess "/orders"`; `canCreate order`; nav `theme.ts:130-137` |
| Revisión pedidos (`/orders/review`) | V | O | O | O | V | O | — (aprobar/rechazar solo adm, fac) | `@Roles("administrador", "facturacion")` en `orders.controller.ts:71-72` (`review-queue`), `:132-155` (aprobar/rechazar/resolver); nav `theme.ts:138-145` (`requiredRoles: administrador, facturacion`); ver D5 (sin entrada en `canAccess`) |
| Facturación (`/billing-requests`) | V+C | V+C | O | O | V+C | O | `billingRequest` = adm, dir, fac | `@Roles` en `billing-requests.controller.ts:27-58` (los 4 endpoints: adm, dir, fac); `canAccess "/billing-requests"`; `canCreate billingRequest`; nav `theme.ts:146-153`. El comercial crea solicitudes vía `POST /orders/:id/billing-request` y `POST /quotes/:id/billing-request`, sin pantalla propia |
| Cartera (`/invoices`) | V+C | V+C | V | O | V+C | O | `invoice` = adm, dir, fac (com ve, no crea) | `invoiceRoles` (lectura: adm, dir, fac, com) y `controlRoles` (escritura: adm, dir, fac) en `invoices.controller.ts:29-40,65-160`; `canAccess "/invoices"`; `canCreate invoice`; nav `theme.ts:154-161`; alcance en §R3 |
| Devoluciones (`/returns`) | V+C | V+C | V+C | O | V+C | O | `returns` = adm, dir, fac, com | `@Roles(...returnRoles)` en `returns.controller.ts:20-60` (crear, listar, detalle: los 4 roles); `canAccess "/returns"`; `canCreate returns`; nav `theme.ts:162-169` |
| Productos (`/products`) | V+C | V+C | V | O | O (ver D3) | O | `product` = adm, dir (com ve, no crea) | `@Roles` en `products.controller.ts:34-102` (POST/PATCH/presentaciones: adm, dir; GET/`:id`: adm, dir, com, fac, ver D3; precio por cliente: adm, dir, com); `canAccess "/products"` (adm, dir, com); `canCreate product`; nav `theme.ts:170-177` |
| Listas de precios (`/price-lists`) | V | V | V | O | V | O | — (editar precios solo adm, dir) | `@Roles` en `price-lists.controller.ts:26-46` (GET/`:id`: adm, dir, com, fac; `PUT :id/items`: adm, dir); `canAccess "/price-lists"`; nav `theme.ts:178-185` |
| Zonas (`/zones`) | V+C | V+C | O (ver D4) | O | O | O | — (crear/editar solo adm, dir) | `@Roles` en `zones.controller.ts:18-46` (POST/PATCH: `ADMIN_AND_DIRECTOR`; GET lista: adm, dir, com, ver D4; GET `:id`: adm, dir); `canAccess "/zones"` (adm, dir); nav `theme.ts:186-193` |
| Usuarios (`/users`) | V+C | O | O | O | O | O | — (altas/edición solo adm) | `@Roles("administrador")` de clase en `users.controller.ts:32` (listar, crear, editar, eliminar); excepciones: `GET /users/sellers` (adm, com, dir, log, tec, fac, líneas 51-62, solo lista mínima para formularios) y `GET /users/logistics` (adm, log, línea 69); `canAccess "/users"` (solo adm); nav `theme.ts:194-201` |
| Empresas (`/companies`) | V+C | V+C | O | O | O | O | — (crear/editar solo adm, dir) | `@Roles(...ADMIN_AND_DIRECTOR)` en `companies.controller.ts:28-53` (POST y PATCH; GET/`:id` solo con sesión, ver D7); `canAccess "/companies"` (adm, dir); nav `theme.ts:202-209` |

## Reglas a nivel de campo (los Frentes 1–3 deben implementarlas)

**R1 — Datos de otros vendedores (analítica y desempeño).**
Un `comercial` entra a las mismas 4 pantallas de `/analytics`, pero `resolveFilters`
le fuerza `sellerUserId` a su propio id (`analytics.shared.ts:64-97`); el comentario
de `auth.ts:121-124` y del `AnalyticsController` (`analytics.controller.ts:78-85`)
lo exigen en espejo. Reglas para el front: no mostrar selectores de vendedor ni
comparativos entre vendedores al rol `comercial`; no enviar `sellerUserId` ajeno
(el back lo ignora/fuerza igual). La pantalla de desempeño expone por vendedor
venta neta, pedidos, gasto, costo sobre venta %, costo por pedido, cumplimiento de
visitas y tareas vencidas (`analytics.controller.ts:63-75` y
`seller-performance.service.ts`): todo eso es visible completo solo para adm y dir.

**R2 — Metas y avance ajenos.**
`SellerGoalsController`: lectura para adm, dir y comercial, pero el service solo
autoriza a dirección o al propio usuario (`ensureCanRead` en
`seller-goals.service.ts:227-233`); escritura solo adm y dir
(`seller-goals.controller.ts:27-99`). El front no debe enlazar ni mostrar metas,
progreso ni bonos/comisiones de otros usuarios al rol `comercial`; la vista
`GET /dashboard/seller-goals` es solo adm y dir (`dashboard.controller.ts:42-56`).

**R3 — Cartera y cupos (comercial acotado a su cartera).**
En facturas, el `comercial` solo opera sobre clientes asignados a él
(`invoices.service.ts:420-431`); crear factura, cambiar estado y registrar pagos
es solo rol de control adm/dir/fac (`invoices.controller.ts:65-128`,
`isControlRole` en `invoices.service.ts:460-461`). El CSV de cartera expone por
cliente vendedor, saldo, vencido, cupo, uso del cupo y condición de pago
(`analytics.controller.ts:43-52`): el front no muestra esos campos de clientes
ajenos al `comercial`. El resumen de crédito por cliente (`credit.controller.ts:12-16`,
adm/dir/com/fac) muestra cupo y mora: visible solo dentro de los módulos ya
autorizados (clientes/cartera).

**R4 — Gastos ajenos y soportes.**
Fuera de roles de control (adm, dir, fac), el listado se fuerza al propio usuario
(`buildWhere` en `commercial-expenses.service.ts:540-555`); editar exige ser el
dueño (`líneas 230, 622`) y cambiar estado es solo control (`línea 156`,
`isControlRole` en línea 636). El front: sin filtro «por usuario» ni columna de
radicador para el `comercial`; los soportes descargables (`GET :id/supports/:supportId`)
solo se enlazan sobre gastos propios salvo rol de control. El resumen/exportado
por usuario (`líneas 504-515`) es material de dirección.

**R5 — Cartera de clientes: asignación y activación.**
Repartir cartera es de dirección: `canAssignCustomers` (`auth.ts:142-144`) solo
adm/dir, en espejo de `CustomersService.create/update` (`customers.service.ts:236`).
Un `comercial` crea clientes pero no puede asignarles vendedor, reasignarlos ni
activarlos; el front oculta esos campos/acciones fuera de adm/dir. Igual para
zonas del cliente (solo adm/dir, `customers.controller.ts:85-113`).

**R6 — Precios y costos.**
Cambiar un precio cambia lo cotizado: `PUT /price-lists/:id/items` y crear/editar
productos y presentaciones son solo adm/dir (`price-lists.controller.ts:42-46`,
`products.controller.ts:34-102`). El front muestra precio de venta/lista según el
módulo autorizado, pero jamás expone campos de costo interno ni permite editar
precios fuera de adm/dir. La calculadora de costos (`calculators.controller.ts:14-45`)
recibe el costo unitario como parámetro de cálculo, no lo persiste: no requiere
ocultamiento, pero su pantalla vive bajo las reglas del módulo que la invoque.
El informe de desempeño traduce el gasto en «costo sobre venta» por vendedor: rige R1.

**R7 — Pedidos: estados sensibles y logística.**
Aprobar/rechazar/resolver partidas es solo adm/fac; la sección logística del
pedido es solo adm/log (`orders.controller.ts:115-155`). El front oculta esas
acciones y secciones a los demás roles aunque vean el pedido. El selector de
vendedor del formulario usa `GET /users/sellers` (lista mínima id+nombre), no el
listado completo de usuarios.

**R8 — Usuarios y empresas.**
Gestión de usuarios (altas, roles, estado) solo adm (`users.controller.ts:32-93`).
Ningún front fuera de `/users` muestra datos personales, roles ni estado de
acceso de terceros; los selectores usan los endpoints mínimos (`sellers`,
`logistics`). Empresas: crear/editar solo adm/dir; lectura amplia con sesión
(ver D7), sin exponer nada fuera de la pantalla `/companies`.

## Divergencias conocidas (no abrir en web sin decisión del Frente 0)

- **D1 — Oportunidades +tec en API.** `GET /opportunities` admite `tecnico`
  (`opportunities.controller.ts:58-69`), pero `canAccess "/opportunities"` y el
  nav lo excluyen. Mantener oculto en web.
- **D2 — Gastos: fac crea en API, no en web.** `POST /commercial-expenses`
  admite `facturacion`, pero `canCreate("expense")` no la incluye. Decidir: o se
  agrega `facturacion` a `canCreate expense` o se mantiene el botón oculto.
- **D3 — Productos +fac en lectura API.** `GET /products` admite `facturacion`
  (`products.controller.ts:50-61`), pero `canAccess "/products"` y el nav la
  excluyen. Mantener oculto en web.
- **D4 — Zonas: com lista en API.** `GET /zones` admite `comercial` (solo nombres,
  para el filtro de analítica, `zones.controller.ts:24-32`), pero la pantalla
  `/zones` es solo adm/dir. No exponer la pantalla; el endpoint de lista sigue
  disponible para selects.
- **D5 — `/orders/review` sin entrada en `canAccess`.**
  `route-guards.ts:37-49` no la restringe por rol; hoy solo la gobierna
  `requiredRoles` del nav (`theme.ts:138-145`). **Dueño: Cierre** (ruling 2 del
  ledger): aplicar `requiredRoles` del nav en el guard o agregar la entrada
  `"/orders/review"` antes de construir sobre esa ruta.
- **D6 — Nora +fac en API de gastos.** `NoraAgentController`
  (`nora-agent.controller.ts:16-49`) admite `facturacion` en gastos vía WhatsApp,
  aunque el nav de Magali la excluye. Coherente (fac registra gastos sin pantalla
  Nora): no abrir el nav.
- **D7 — `GET /companies` sin `RolesGuard`.** Lectura con cualquier sesión válida
  (`companies.controller.ts:39-49`). Si se agregan datos sensibles de empresa,
  endurecer con `@Roles` o documentarlo como público-interno. Pendiente de
  revisión en la Task 3.

## Verificación de completitud (Step 2)

- Los 22 ítems del sidebar están cubiertos: los 21 de `primaryNavItems`
  (`theme.ts:33-210`) + Magali (`noraNavItem`, `theme.ts:243-250`).
- Cada fila cita su `@Roles` del controller, su entrada de
  `canAccess`/`canCreate` (o declara «—» con el guard que la sustituye) y su
  entrada del nav.
- `canCreate` cubre 12 entidades (`auth.ts:146-166`): customer, opportunity,
  quote, visit, expense, followUp, order, billingRequest, invoice, returns,
  report, product. Las rutas `/…/new` protegidas en `route-guards.ts:38-42`
  (customers, opportunities, quotes, orders, invoices) usan esas entradas.

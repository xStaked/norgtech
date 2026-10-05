# Brechas API vs web — Frente 0 seguridad (fase 2 comercial)

Auditoría docs-only: ningún código cambia aquí. Cada brecha se reporta con su
frente dueño, que la cierra en su propio frente. Fuente de verdad de roles:
`docs/seguridad-matriz-roles.md`. Pins web vigentes: `apps/web/src/lib/auth.ts`
(`canAccess` líneas 100-134, `canCreate` líneas 146-166) y
`apps/web/src/lib/route-guards.ts` (restricciones líneas 37-49, pins en
`route-guards.test.ts`).

Convención: **dueño** = frente que la cierra. **Frente 0** = requiere decisión
de matriz antes de tocar código. **Cierre** = transversal (barrido + pruebas
por rol, según spec fase 2 comercial).

## A. Endpoints API sin `RolesGuard` / sin `@Roles`

| # | Endpoint | Estado | Dueño |
|---|---|---|---|
| B-API-1 | `GET /customers/:id/zones` — solo `JwtAuthGuard`, sin `RolesGuard` ni `@Roles` (`customers.controller.ts:78-82`). Cualquier sesión (tec, fac, log, com incluidos) lee las zonas de un cliente, mientras que escribirlas es solo adm/dir (`:85-113`) y la matriz (R5) reserva zonas a dirección. Lectura más abierta que la regla. | Nueva | Cierre (agregar `@Roles` adm/dir o el set que decida Frente 0) |
| B-API-2 (= D7 matriz) | `GET /companies` y `GET /companies/:id` — solo `JwtAuthGuard`, sin `RolesGuard` (`companies.controller.ts:39-49`). Cualquier sesión válida lista/lee empresas; crear/editar sí es adm/dir (`:27-53`). | Parked D7, confirmar | Frente 0 decide (endurecer con `@Roles` o documentar público-interno); aplica Cierre |

Revisados sin hallazgo (no son brechas, constan para completitud del barrido):
`notifications.controller.ts:12-40` (4 endpoints sin `@Roles` por diseño: cada
uno filtra por `user.id`, comentario línea 8-11); `POST /whatsapp/webhooks/kapso`
(`whatsapp.controller.ts:29`, webhook externo sin sesión por diseño);
`auth.controller.ts:43-123` (login/refresh/logout/forgot/reset públicos por
diseño; `GET me` solo `JwtAuthGuard`); `GET /search` (6 roles +
`VISIBLE_TO` por tipo en `search.service.ts:21-30`, espejo del nav).

## B. Divergencias API-más-permisiva-que-web (D1–D6 de la matriz)

La web mantiene lo restrictivo. Se recapitulan con dueño y acción esperada.

| # | Divergencia | Dueño / acción |
|---|---|---|
| D1 | `GET /opportunities` y `GET /opportunities/:id` admiten `tecnico` (`opportunities.controller.ts:58-69`); `canAccess "/opportunities"` y nav lo excluyen. Espejo en guards web: `/opportunities` no está en `roleRestrictedRoutes`, así que un tec **sí entra hoy por URL directa** (ver C-WEB-6). | Cierre (agregar guard o aceptar y cerrar D1 en matriz) |
| D2 | `POST /commercial-expenses` admite `facturacion` (`expenseRoles`, `commercial-expenses.controller.ts:31-36,64-65`); `canCreate("expense")` no la incluye (`auth.ts:154`). | Frente 0 decide (abrir `canCreate` o cerrar API); aplica Cierre |
| D3 | `GET /products` y `GET /products/:id` admiten `facturacion` (`products.controller.ts:50-61`); `canAccess "/products"` y nav la excluyen. Un fac **sí entra por URL directa** (ver C-WEB-12). | Frente 2 respeta (no abrir a fac sin decisión Frente 0); guard en Cierre |
| D4 | `GET /zones` admite `comercial` (`zones.controller.ts:28-32`, intencional para el filtro de analítica); pantalla `/zones` solo adm/dir y con guard (`route-guards.ts:44`). | Sin acción (intencional, documentado) |
| D5 | `/orders/review` sin entrada en `canAccess` (`auth.ts:100-134`); `route-guards.ts:37-49` no la restringe; solo la gobierna `requiredRoles` del nav (`theme.ts:138-145`, adm+fac). Cualquier rol con sesión entra por URL directa (ver C-WEB-8). | Cierre (ruling 2 del ledger; el guard lo pone Cierre junto con C-WEB-8) |
| D6 | `POST/PATCH /whatsapp/agent/expenses` admiten `facturacion` (`nora-agent.controller.ts:16-49`); nav Magali la excluye. Coherente (fac registra gastos sin pantalla Nora). | Sin acción |

## C. Pantallas web sin entrada en `roleRestrictedRoutes` (bypass por URL)

El middleware (`apps/web/src/middleware.ts:50`) solo aplica rol a
`/customers/new`, `/opportunities/new`, `/quotes/new`, `/orders/new`,
`/invoices/new`, `/companies`, `/zones`, `/analytics`, `/reports`,
`/price-lists`, `/users` (`route-guards.ts:37-49`). El resto de pantallas solo
se ocultan en el nav: con sesión válida, escribir la URL entra aunque
`canAccess` diga que no (la API luego puede dar 403 en los datos, pero el
guard no redirige). Dueño de todo el bloque: **Cierre** (agregar entradas +
tests por rol como los de Task 2).

| # | Pantalla | `canAccess` permite | Entran hoy por URL (sesión válida) | Fuente API espejo | Dueño |
|---|---|---|---|---|---|
| C-WEB-1 | `/visits` | adm, dir, com, tec | fac, log | `visits.controller.ts:30-134` (4 roles, consistente) | Cierre |
| C-WEB-2 | `/expenses` | adm, dir, com, fac | tec, log | `commercial-expenses.controller.ts:64-167` (+D2) | Cierre |
| C-WEB-3 | `/follow-ups` | adm, dir, com, tec | fac, log | `follow-up-tasks.controller.ts:27-95` (4 roles) | Cierre |
| C-WEB-4 | `/agenda` | adm, dir, com, tec | fac, log | Sin controller propio (agrega visits+follow-ups) | Cierre |
| C-WEB-5 | `/nora` | adm, dir, com, tec | fac, log | `nora-agent.controller.ts:16-49` admite fac (D6) | Cierre |
| C-WEB-6 | `/opportunities` | adm, dir, com | tec (D1: la API la admite), log | `opportunities.controller.ts:58-69` | Cierre |
| C-WEB-7 | `/quotes` | adm, dir, com, fac | tec, log | `quotes.controller.ts:57-65` (GET +fac) | Cierre |
| C-WEB-8 | `/orders/review` | (sin entrada; nav adm+fac) | dir, com, tec, log | `orders.controller.ts:71-72` (`review-queue` adm+fac) — D5 | Cierre |
| C-WEB-9 | `/billing-requests` | adm, dir, fac | com, tec, log | `billing-requests.controller.ts:27-58` (3 roles) | Cierre |
| C-WEB-10 | `/invoices` (lista) | adm, dir, fac, com | tec, log | `invoices.controller.ts:75-99` (`invoiceRoles` 4 roles) | Cierre |
| C-WEB-11 | `/returns` | adm, dir, fac, com | tec, log | `returns.controller.ts:39-60` (`returnRoles` 4 roles) | Cierre |
| C-WEB-12 | `/products` | adm, dir, com | tec, fac (D3), log | `products.controller.ts:50-61` | Cierre |
| C-WEB-13 | `/orders` (lista) | adm, dir, com, fac, log | tec | `orders.controller.ts:64-65` (GET +fac,+log) | Cierre |

Sin brecha (acceso total o guard ya aplicado): `/dashboard`, `/whatsapp`,
`/customers` (los 6 roles en API y web), `/companies`, `/zones`,
`/analytics`, `/reports`, `/price-lists`, `/users` (pin Task 2).

## D. Filtros por vendedor / alcance (`sellerUserId=self` donde aplica)

Verificados OK (el back fuerza el alcance aunque el front mande otro valor):
analítica 4 pantallas (`resolveFilters` + `resolveAsOf` en
`analytics.shared.ts:64-112`); dashboard (`dashboard.service.ts:264-273`,
`assignedToUserId`/`sellerUserId` para comercial); gastos (`buildWhere`,
`commercial-expenses.service.ts:540-555` + dueño-edita + estado-solo-control);
cartera (`buildWhere` y `getOverdueInvoices`,
`invoices.service.ts:420-431`); devoluciones (`returns.service.ts:122-124`,
comercial acotado a sus clientes); metas (`ensureCanRead`,
`seller-goals.service.ts:227-233`); clientes crear/actualizar
(`customers.service.ts:36-37,234-247`, comercial no asigna ni activa).

| # | Brecha / observación | Dueño |
|---|---|---|
| B-FILT-1 | `GET /credit/customers/:customerId/summary` (adm, dir, com, fac, `credit.controller.ts:12-16`) **no acota por cartera**: `getCreditSummary` (`credit.service.ts:141-166`) no recibe usuario ni filtra por `assignedToUserId`. Un comercial con el id (los ids son enumerables vía `GET /customers`, abierto a los 6 roles) lee cupo, mora y exposición de clientes ajenos. R3 exige comercial acotado a su cartera. | Frente 1 (cartera/deudores la tocan: acotar o heredar el `where` de invoices) |
| B-FILT-2 | `GET /customers/:id/goals` y `GET /customers/:id/goal-progress` abiertos a los **6 roles** sin acote por vendedor (`customer-goals.controller.ts:43-94`). No hay pantalla ni guard web que las consuma hoy; quien construya metas las hereda abiertas. | Frente 3 (al construir comisiones/metas: acotar lectura o restringir roles) |
| OBS-1 | `GET /search` sin acote por vendedor (`search.service.ts:38-58`): un comercial encuentra clientes/pedidos ajenos. Consistente con la matriz (lecturas V sin acotar en customers/orders), pero tensiona el principio "comercial solo sus clientes/ventas" del spec. | Frente 0 decide si la matriz acota lecturas; sin código hasta entonces |

## E. `canCreate` vs `@Roles` de escritura (resumen, 12 entidades)

Resumen del comparativo (el detalle con citas file:line por entidad vive en
la matriz, tabla rol × módulo): 11/12 consistentes (mismo set en API y web): customer, opportunity, quote
(`POST`, `preview`, `status`, `:id/billing-request` — adm/com/dir;
el comercial crea solicitudes de facturación vía quotes/pedidos sin pantalla
propia, intencional según matriz), visit, followUp, order (adm/com/dir/log),
billingRequest, invoice (`controlRoles`), returns, report, product. Única
divergencia: **D2** (expense +fac en API, ver bloque B).

## Completitud del barrido (30 controllers en `apps/api/src/modules/`)

audit, analytics, auth, billing-requests, calculators, commercial-expenses,
companies, credit, customer-goals, customer-segments, customers, dashboard,
follow-up-tasks, invoices, nora-agent, notifications, opportunities, orders,
price-lists, products, quotes, reports, returns, search, seller-goals, users,
visits, whatsapp (controller + webhooks), zones. Rutas web verificadas contra
`apps/web/src/app/(app)/` (21 dirs) + `canAccess` (22 entradas con Magali).

## Cierre (fase 2, Frente Cierre)

Verificación estado-actual hecho en la branch `cierre-fase2` sobre
`f97a4df` (merge #5, post-Frentes 1-3). Cada brecha con su disposición:
**cerrada** (con cambio + test), **aceptada** (divergencia intencional
documentada, sin código) o **sin acción** (ya documentada como intencional).
Evidencia = file:line del estado post-cierre; commit de cierre en el report
`task-1-report.md`.

| # | Disposición | Evidencia |
|---|---|---|
| B-API-1 | **Cerrada**: `GET /customers/:id/zones` declara regla: RolesGuard + `@Roles` de los 6 roles (misma regla de lectura de cliente de la matriz; escritura de zonas sigue adm/dir). | `apps/api/src/modules/customers/customers.controller.ts` (`getZones`); pin: `apps/api/test/rbac-coverage.e2e-spec.ts` — «GET /customers/:id/zones declara @Roles»; set respaldado por consumidores reales: `apps/web/src/app/(app)/customers/[id]/page.tsx:164` (los 6 roles leen clientes y la ficha lo pinta) y `apps/web/src/components/orders/order-form.tsx:129` (log crea pedidos y consulta zonas) |
| B-API-2 (D7) | **Aceptada, sin código**: lectura de `/companies` queda con sesión (público-interno). Endurecerla a adm/dir rompería los selects multi-rol que cargan empresas. | Consumidores que la necesitan abierta: `dashboard/page.tsx:131`, `customers/page.tsx:191`, `components/companies/company-select.tsx:33` (pedidos y facturación), `lib/analytics.ts:105` (comercial); la matriz (R8) ya lo documenta: «lectura amplia con sesión (ver D7)» |
| D1 | **Cerrada en web; aceptada en API**: el guard bloquea a tec en la pantalla `/opportunities` (C-WEB-6). El `+tec` del GET API se MANTIENE porque es load-bearing: los flujos de visitas y seguimientos lo consumen con tec creando. | Web: `route-guards.ts` entrada `/opportunities` + test C-WEB-6. API: `apps/web/src/app/(app)/visits/page.tsx:155` y `apps/web/src/app/(app)/follow-ups/page.tsx:173` cargan `/opportunities` para `canCreate(visit|followUp)` que incluye tec; `visits/new`, `follow-ups/new`, `quotes/new` y `orders/new` también lo cargan para vincular |
| D2 | **Cerrada en web; aceptada en API**: crear gasto por URL ya no lo logra fac (`/expenses/new` con `canCreate expense`, espeja el botón oculto). El POST API que admite fac es intencional (D6: fac registra gastos por Nora sin pantalla). | Web: `route-guards.ts` entrada `/expenses/new` + test «D2 /expenses/new bloquea fac». API: sin cambio; coherencia documentada en la propia matriz (D6) |
| D3 | **Cerrada en web; aceptada en API**: la pantalla `/products` nunca abre a fac (guard C-WEB-12). La lectura API +fac se mantiene: fac es rol de cartera y la matriz solo dice «no abrir a fac sin decisión Frente 0» — no se abre nada nuevo en web. | Web: `route-guards.ts` entrada `/products` + test C-WEB-12. API: `products.controller.ts` sin cambio |
| D4 | **Sin acción** (ya documentada como intencional en la matriz). | `zones.controller.ts` GET lista honra `com` para selects; sin cambio |
| D5 | **Cerrada**: `/orders/review` gobierna adm+fac en web: entrada `"/orders/review"` en `canAccess` + restricción en el guard ANTES del genérico de `/orders`. La API ya estaba correcta. | `apps/web/src/lib/auth.ts` (`/orders/review`: adm, fac), `route-guards.ts`, test «C-WEB-8 /orders/review solo adm y fac»; API `orders.controller.ts:70-75` (review-queue adm+fac, ya pinneada) |
| D6 | **Sin acción** (ya documentada como coherente). | `nora-agent.controller.ts` sin cambio |
| C-WEB-1 `/visits` | **Cerrada**: entrada en guard; fac/log → `/dashboard?forbidden=1`. | `route-guards.ts` + test «C-WEB-1» |
| C-WEB-2 `/expenses` | **Cerrada**: tec/log fuera; fac sigue viendo la lista. | `route-guards.ts` + test «C-WEB-2» |
| C-WEB-3 `/follow-ups` | **Cerrada**: fac/log fuera. | `route-guards.ts` + test «C-WEB-3» |
| C-WEB-4 `/agenda` | **Cerrada**: fac/log fuera. | `route-guards.ts` + test «C-WEB-4» |
| C-WEB-5 `/nora` | **Cerrada**: fac/log fuera (registran gastos por WhatsApp, sin pantalla Nora). | `route-guards.ts` + test «C-WEB-5» |
| C-WEB-6 `/opportunities` | **Cerrada**: tec/fac/log fuera (D1 en web). | `route-guards.ts` + test «C-WEB-6» |
| C-WEB-7 `/quotes` | **Cerrada**: tec/log fuera; fac ve (no crea: `/quotes/new` sigue canCreate). | `route-guards.ts` + tests «C-WEB-7» y «específicas de /invoices y /quotes sobreviven» |
| C-WEB-8 `/orders/review` | **Cerrada** (junto con D5). | ver D5 |
| C-WEB-9 `/billing-requests` | **Cerrada**: com/tec/log fuera. | `route-guards.ts` + test «C-WEB-9» |
| C-WEB-10 `/invoices` | **Cerrada**: tec/log fuera; com ve (no crea: `/invoices/new` sigue canCreate). | `route-guards.ts` + tests «C-WEB-10» y «específicas…» |
| C-WEB-11 `/returns` | **Cerrada**: tec/log fuera. | `route-guards.ts` + test «C-WEB-11» |
| C-WEB-12 `/products` | **Cerrada**: tec/fac/log fuera (D3 en web). | `route-guards.ts` + test «C-WEB-12» |
| C-WEB-13 `/orders` | **Cerrada**: tec fuera; fac/log ven (fac no crea: `/orders/new` sigue canCreate). | `route-guards.ts` + tests «C-WEB-13» y «específicas de /orders sobreviven» |
| B-FILT-1 | **Cerrada**: `getCreditSummary` acota el comercial a su cartera (R3, espejo de `invoices.service.buildWhere`): cliente asignado a otro vendedor → 403. adm/dir/fac sin cambio. El cálculo de cupo de `approveOrder`/`findReviewQueue` (llamadas internas de sistema) no cambia. | `apps/api/src/modules/credit/credit.service.ts` (`ensureOwnPortfolio`, `getCreditSummary(customerId, user?)`), `credit.controller.ts` (pasa `@CurrentUser`); RED→GREEN: `apps/api/test/credit.e2e-spec.ts` — «comercial recibe 403 en el resumen de credito de un cliente ajeno» (antes 200), «comercial lee … SU cliente» 200, «facturacion sigue viendo clientes ajenos» 200 |
| B-FILT-2 | **Cerrada**: `GET /customers/:id/goals` y `GET /customers/:id/goal-progress` acotan el comercial a su cartera (403 si el cliente no es suyo). Los demás roles de lectura (tec/fac/log) siguen viendo metas, como ya lo hace la ficha de cliente. El barrido de notificaciones (`notifications.cron.ts`) llama sin usuario y no se acota. | `apps/api/src/modules/customer-goals/customer-goals.service.ts` (`ensureOwnPortfolio`, `user` opcional al final), `customer-goals.controller.ts` (pasa `@CurrentUser`); RED→GREEN: `apps/api/test/customer-goals.e2e-spec.ts` — 403 ajeno en goals y goal-progress (antes 200/404), 200 propio y 200 fac |
| OBS-1 | **Sin acción**: la matriz no acota las lecturas V de customers/orders y `VISIBLE_TO` en search la espeja. Queda documentada como tensión; si Frente 0 acota lecturas de cliente, `search.service.ts` hereda el filtro en el mismo punto. | `search.service.ts:38-58` sin cambio |

### Pre-existentes que quedan (no son brechas de esta matriz)

- Sweep `rbac-coverage` permitía pasar por omisión: `POST /auth/forgot-password`
  y `POST /auth/reset-password` están **públicos por diseño** según este
  documento (sección A, sin hallazgo), y ahora constan en
  `ALLOWLIST_OPEN` con justificación (misma clase que login/refresh/logout).
- `customers.e2e-spec.ts` — «paymentCondition invalida responde 400» ya fallaba
  en base `f97a4df` (no lo toca este cierre; queda anotado como pendiente).
- Suites con PG real (`credit-concurrency.e2e-spec.ts`,
  `commission-atomicity.e2e-spec.ts`): requieren `DATABASE_URL` accesible; sin
  ella no corren (documentado por los propios specs).

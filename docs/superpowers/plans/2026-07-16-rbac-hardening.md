# RBAC Hardening — Implementation Plan

**Date:** 2026-07-16
**Spec:** `docs/superpowers/specs/2026-07-16-rbac-hardening-design.md`
**Branch:** `fix/qa-p0-seguridad-dinero`
**Merge base:** `TBD`

**Comandos de test**
- API e2e: `cd apps/api && npx jest --config test/jest-e2e.json`
- API unit: `cd apps/api && npx jest`
- Front (Playwright): `cd apps/web && npx playwright test`

**Convenciones**
- TDD estricto: primero el test que falla, se verifica el fallo, se implementa, se verifica el verde, se hace commit.
- Prosa en español, código en inglés.
- El enforcement real vive en el backend (`@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)`). El front (middleware + menú) es defensa en profundidad, no la barrera de seguridad.
- El `RolesGuard` (`apps/api/src/modules/auth/roles.guard.ts`) NO se modifica: hoy si un handler no declara `@Roles` devuelve `true` (deja pasar). Ese es exactamente el bug de raíz; el plan lo cierra agregando el decorador donde falta y unificando la fuente de verdad.

**Estado actual observado en el código staged (no asumir "todo abierto")**
- `customers.controller.ts`: YA tiene `@Roles("administrador","comercial","director_comercial")` en `@Post()` y `@Patch(":id")`, pero con literales de string sueltos (no comparte matriz). → Refactor, no alta.
- `companies.controller.ts`: `@Post()` y `@Patch(":id")` restringidos a `@Roles("administrador")` únicamente; NO existe `@Delete`. → Elevar a `ADMIN_AND_DIRECTOR` (RBAC-01) y revisar borrado.
- `returns.controller.ts`: guard a nivel de clase + `const returnRoles = [...]` local con `administrador, director_comercial, facturacion, comercial`. → Refactor al grupo compartido.
- El resto (opportunities, quotes, commercial-expenses, orders, follow-up-tasks, visits, invoices, zones) se audita en la Task 2 y se corrige en 3–6.

**Credenciales QA (las 6 del reporte)** usadas en todos los e2e/Playwright: un usuario por rol → `administrador`, `director_comercial`, `comercial`, `tecnico`, `facturacion`, `logistica`. Se resuelven vía un helper `loginAs(role)` (Task 1, Step auxiliar) que hace `POST /auth/login` con el email semilla del rol y devuelve el `access_token`.

---

## Task 1: Crear la matriz de permisos compartida (API + espejo front)

**Files:**
- Create `apps/api/src/modules/auth/permissions.ts`
- Create `apps/web/src/lib/permissions.ts` (espejo)
- Create `apps/api/test/helpers/login-as.ts` (helper de e2e para las 6 credenciales)
- Test `apps/api/test/permissions.spec.ts` (unit, valida forma de la matriz)

**Interfaces:**
- Produce `ROLE_GROUPS` (backend) tipado con `UserRole` de `@prisma/client`.
- Produce en el front `ROLE_GROUPS` + tipo `UserRole` (unión de string, sin depender de `@prisma/client` en web) con **exactamente los mismos miembros** que el backend.
- Consume: todos los controllers (Task 3–6), `middleware.ts` (Task 7) y el sidebar/dashboard (Task 8).

- [ ] Step 1: Escribir `apps/api/test/permissions.spec.ts` que falle por inexistencia del módulo. Casos concretos:
  - `ROLE_GROUPS.ADMIN_AND_DIRECTOR` contiene exactamente `["administrador","director_comercial"]` (RBAC-01: Director comercial gestiona Empresas y Zonas).
  - `ROLE_GROUPS.COMMERCIAL_WRITERS` = `["administrador","director_comercial","comercial"]`.
  - `ROLE_GROUPS.FIELD_OPS` incluye `tecnico` además de los COMMERCIAL_WRITERS.
  - `ROLE_GROUPS.BILLING` = `["administrador","director_comercial","facturacion"]`.
  - `ROLE_GROUPS.LOGISTICS` = `["administrador","logistica"]`.
  - `ROLE_GROUPS.ADMIN_ONLY` = `["administrador"]`.
  - Invariante: `administrador` está presente en TODOS los grupos (recorrer `Object.values(ROLE_GROUPS)`).
  - Invariante: todo miembro de todo grupo es un valor válido de `UserRole` (comparar contra `Object.values(UserRole)`).
- [ ] Step 2: Correr y verificar fallo: `cd apps/api && npx jest permissions.spec`.
- [ ] Step 3: Implementar `apps/api/src/modules/auth/permissions.ts`:
  ```typescript
  import { UserRole } from "@prisma/client";

  export const ROLE_GROUPS = {
    COMMERCIAL_WRITERS: [UserRole.administrador, UserRole.director_comercial, UserRole.comercial],
    FIELD_OPS: [UserRole.administrador, UserRole.director_comercial, UserRole.comercial, UserRole.tecnico],
    BILLING: [UserRole.administrador, UserRole.director_comercial, UserRole.facturacion],
    RETURNS_WRITERS: [UserRole.administrador, UserRole.director_comercial, UserRole.facturacion, UserRole.comercial],
    LOGISTICS: [UserRole.administrador, UserRole.logistica],
    ADMIN_AND_DIRECTOR: [UserRole.administrador, UserRole.director_comercial], // Empresas y Zonas (RBAC-01)
    ADMIN_ONLY: [UserRole.administrador],
  } as const;
  ```
  (Nota: `RETURNS_WRITERS` = `BILLING + comercial`, materializa la fila "Devolución" del spec §3.2 sin spreads frágiles en el controller.)
- [ ] Step 4: Implementar `apps/web/src/lib/permissions.ts` como espejo literal (mismos miembros), con `export type UserRole = "administrador" | "director_comercial" | "comercial" | "tecnico" | "facturacion" | "logistica";` y el mismo `ROLE_GROUPS`. Añadir comentario: "Debe mantenerse en sync con apps/api/src/modules/auth/permissions.ts".
- [ ] Step 5: Implementar `apps/api/test/helpers/login-as.ts`: función `loginAs(app, role): Promise<string>` que mapea rol→email semilla (según `apps/api/prisma/seed.ts`) y hace `request(app.getHttpServer()).post('/auth/login')`, devolviendo `access_token`. Exporta también `ALL_ROLES` y `authHeader(token)`.
- [ ] Step 6: Correr y verificar verde: `cd apps/api && npx jest permissions.spec`.
- [ ] Step 7: Commit: `git add apps/api/src/modules/auth/permissions.ts apps/web/src/lib/permissions.ts apps/api/test/helpers/login-as.ts apps/api/test/permissions.spec.ts && git commit -m "feat(rbac): shared role-permission matrix (API + web mirror) + e2e login helper"`

---

## Task 2: Test de auditoría de cobertura de endpoints de escritura

**Files:**
- Test `apps/api/test/rbac-coverage.spec.ts` (unit, sin DB)
- (posible) Create `apps/api/test/helpers/allowlist-open-endpoints.ts`

**Interfaces:**
- Consume los metadatos `ROLES_KEY` de cada handler vía `Reflector`/`Reflect.getMetadata`.
- Produce una garantía CI: falla si cualquier `@Post/@Patch/@Put/@Delete` en `src/modules/**/*.controller.ts` no declara `ROLES_KEY` (ni por handler ni por clase) y no está en el allowlist.

- [ ] Step 1: Escribir `apps/api/test/rbac-coverage.spec.ts` que falle. Mecánica:
  - Cargar el `AppModule` (o instanciar cada controller) y usar `DiscoveryService`/`MetadataScanner` de `@nestjs/core` para recorrer todos los controllers registrados.
  - Para cada método con metadata de ruta `PATH_METADATA` cuyo `METHOD_METADATA` sea `POST|PATCH|PUT|DELETE`, leer `Reflect.getMetadata(ROLES_KEY, handler)` **o** `Reflect.getMetadata(ROLES_KEY, controllerClass)` (soporta el patrón a nivel de clase de `returns.controller.ts`).
  - Assert: la lista de endpoints de escritura SIN `ROLES_KEY` y NO presentes en `ALLOWLIST_OPEN` debe estar vacía; el mensaje de fallo imprime `METHOD path (ControllerName.handler)` de cada hueco.
  - `ALLOWLIST_OPEN` inicial documentado: `POST /auth/login` (público), y webhooks entrantes de WhatsApp/Kapso protegidos por `service-token.guard` (listar los paths reales encontrados en el barrido). Cada entrada lleva comentario justificando por qué queda abierta (spec §3.2, §6).
- [ ] Step 2: Correr y verificar fallo (debe listar los huecos actuales: p.ej. opportunities/quotes/orders/invoices/visits/follow-up-tasks/zones si no tienen `@Roles`): `cd apps/api && npx jest rbac-coverage.spec`.
- [ ] Step 3: (Este test se queda ROJO a propósito hasta que Task 3–6 lo pongan verde.) No implementar nada de producción aquí salvo el allowlist. Commit del test + allowlist:
  `git add apps/api/test/rbac-coverage.spec.ts apps/api/test/helpers/allowlist-open-endpoints.ts && git commit -m "test(rbac): failing coverage sweep for write endpoints missing ROLES_KEY"`
- [ ] Step 4 (nota de cierre): la Task 6 termina con este spec en VERDE; se re-corre en Task 9. Si al final quedan endpoints intencionalmente abiertos, se reportan en el resumen final.

---

## Task 3: Proteger/unificar controllers COMMERCIAL_WRITERS

**Files:**
- Modify `apps/api/src/modules/customers/customers.controller.ts` (RBAC-04 — refactor: ya tiene literales)
- Modify `apps/api/src/modules/opportunities/opportunities.controller.ts` (RBAC-05)
- Modify `apps/api/src/modules/quotes/quotes.controller.ts` (RBAC-06)
- Modify `apps/api/src/modules/commercial-expenses/commercial-expenses.controller.ts` (RBAC-07)
- Modify `apps/api/src/modules/orders/orders.controller.ts` (RBAC-08 — solo endpoints de creación comercial; NO tocar acciones de logística, ver Task 6/nota)
- Test `apps/api/test/rbac-commercial-writers.e2e-spec.ts`

**Interfaces:**
- Cada `@Post()`/`@Patch()` de creación/edición comercial declara `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...ROLE_GROUPS.COMMERCIAL_WRITERS)`.
- Consume `ROLE_GROUPS` de `permissions.ts` (Task 1).

- [ ] Step 1: Escribir `apps/api/test/rbac-commercial-writers.e2e-spec.ts`. Para cada recurso (`customers`, `opportunities`, `quotes`, `commercial-expenses`, `orders`) y cada uno de los 6 roles:
  - Rol autorizado (`administrador`, `director_comercial`, `comercial`) → `POST` con payload mínimo válido responde 2xx (o 400/422 de validación, NUNCA 403).
  - Rol no autorizado (`tecnico`, `facturacion`, `logistica`) → `POST` responde **403** (assert exacto `expect(res.status).toBe(403)`), con cuerpo cuyo mensaje esté en español.
  - Usar `loginAs(app, role)` del helper de Task 1. Tabla de casos parametrizada con `describe.each`.
- [ ] Step 2: Correr y verificar fallo: `cd apps/api && npx jest --config test/jest-e2e.json rbac-commercial-writers`. (Esperado: customers verde parcial; opportunities/quotes/expenses/orders en rojo por 2xx donde debería ser 403.)
- [ ] Step 3: `customers.controller.ts` — reemplazar los literales por el grupo compartido en `@Post()` y `@Patch(":id")`:
  ```typescript
  import { ROLE_GROUPS } from "../auth/permissions";
  // @Post()
  @Roles(...ROLE_GROUPS.COMMERCIAL_WRITERS)
  // @Patch(":id")
  @Roles(...ROLE_GROUPS.COMMERCIAL_WRITERS)
  ```
  (Mantener intactos `refreshSegments`, `assign/update/removeZone` que ya usan `["administrador","director_comercial"]`; esos NO son parte de este grupo — o migrarlos a `ROLE_GROUPS.ADMIN_AND_DIRECTOR` para consistencia, sin cambiar la semántica.)
- [ ] Step 4: `opportunities.controller.ts`, `quotes.controller.ts`, `commercial-expenses.controller.ts`, `orders.controller.ts` — en cada `@Post()`/`@Patch()` de creación/edición comercial agregar (si falta) `@UseGuards(JwtAuthGuard, RolesGuard)` a nivel de clase e insertar `@Roles(...ROLE_GROUPS.COMMERCIAL_WRITERS)` sobre el handler. Importar `ROLE_GROUPS`, `Roles`, `JwtAuthGuard`, `RolesGuard`.
  - En `orders.controller.ts`: aplicar SOLO a la creación/edición comercial de pedidos. Los endpoints de logística (guía, despacho, tracking) se protegen con `LOGISTICS` en la Task 6; no re-etiquetar aquí.
- [ ] Step 5: Correr y verificar verde: `cd apps/api && npx jest --config test/jest-e2e.json rbac-commercial-writers`.
- [ ] Step 6: Commit: `git add apps/api/src/modules/{customers,opportunities,quotes,commercial-expenses,orders} apps/api/test/rbac-commercial-writers.e2e-spec.ts && git commit -m "feat(rbac): enforce COMMERCIAL_WRITERS on customers/opportunities/quotes/expenses/orders (RBAC-04..08)"`

---

## Task 4: Proteger controllers FIELD_OPS (incluye técnico)

**Files:**
- Modify `apps/api/src/modules/follow-up-tasks/follow-up-tasks.controller.ts` (RBAC-09)
- Modify `apps/api/src/modules/visits/visits.controller.ts` (RBAC-12)
- Test `apps/api/test/rbac-field-ops.e2e-spec.ts`

**Interfaces:**
- `@Post()` de tareas de seguimiento y visitas declara `@Roles(...ROLE_GROUPS.FIELD_OPS)` (admin, director, comercial, tecnico).

- [ ] Step 1: Escribir `apps/api/test/rbac-field-ops.e2e-spec.ts`:
  - Autorizados (`administrador`, `director_comercial`, `comercial`, `tecnico`) → `POST /follow-up-tasks` y `POST /visits` → 2xx / no-403.
  - No autorizados (`facturacion`, `logistica`) → 403.
- [ ] Step 2: Correr y verificar fallo: `cd apps/api && npx jest --config test/jest-e2e.json rbac-field-ops`.
- [ ] Step 3: Implementar en ambos controllers: `@UseGuards(JwtAuthGuard, RolesGuard)` (clase) + `@Roles(...ROLE_GROUPS.FIELD_OPS)` en el `@Post()`. Importar `ROLE_GROUPS`.
- [ ] Step 4: Correr y verificar verde: `cd apps/api && npx jest --config test/jest-e2e.json rbac-field-ops`.
- [ ] Step 5: Commit: `git add apps/api/src/modules/follow-up-tasks apps/api/src/modules/visits apps/api/test/rbac-field-ops.e2e-spec.ts && git commit -m "feat(rbac): enforce FIELD_OPS on follow-up-tasks/visits (RBAC-09, RBAC-12)"`

---

## Task 5: Proteger Devoluciones y Facturación

**Files:**
- Modify `apps/api/src/modules/returns/returns.controller.ts` (RBAC-10 — refactor del `const returnRoles` local)
- Modify `apps/api/src/modules/invoices/invoices.controller.ts` (RBAC-11)
- Test `apps/api/test/rbac-billing.e2e-spec.ts`

**Interfaces:**
- Returns: `@Roles(...ROLE_GROUPS.RETURNS_WRITERS)` (BILLING + comercial).
- Invoices / solicitud de facturación: `@Roles(...ROLE_GROUPS.BILLING)`.

- [ ] Step 1: Escribir `apps/api/test/rbac-billing.e2e-spec.ts`:
  - `POST /returns`: autorizados `administrador, director_comercial, facturacion, comercial` → no-403; `tecnico, logistica` → 403.
  - `POST /invoices` (y el endpoint de solicitud de facturación si existe, p.ej. `POST /billing-requests`): autorizados `administrador, director_comercial, facturacion` → no-403; `comercial, tecnico, logistica` → 403.
- [ ] Step 2: Correr y verificar fallo: `cd apps/api && npx jest --config test/jest-e2e.json rbac-billing`.
- [ ] Step 3: `returns.controller.ts` — reemplazar `const returnRoles = [...] as const;` por `import { ROLE_GROUPS } from "../auth/permissions";` y usar `@Roles(...ROLE_GROUPS.RETURNS_WRITERS)` en el `@Post()`. Mantener el guard a nivel de clase existente.
- [ ] Step 4: `invoices.controller.ts` — agregar `@UseGuards(JwtAuthGuard, RolesGuard)` (clase) + `@Roles(...ROLE_GROUPS.BILLING)` en `@Post()`/`@Patch()` de emisión/registro de factura y en el endpoint de solicitud de facturación. (Verificar durante la implementación si "solicitud de facturación" vive en `invoices.controller.ts` o en un `billing-requests.controller.ts`; proteger donde esté.)
- [ ] Step 5: Correr y verificar verde: `cd apps/api && npx jest --config test/jest-e2e.json rbac-billing`.
- [ ] Step 6: Commit: `git add apps/api/src/modules/returns apps/api/src/modules/invoices apps/api/test/rbac-billing.e2e-spec.ts && git commit -m "feat(rbac): enforce RETURNS_WRITERS/BILLING on returns/invoices (RBAC-10, RBAC-11)"`

---

## Task 6: Empresas, Zonas (ADMIN_AND_DIRECTOR) y Logística de pedido; cerrar la auditoría

**Files:**
- Modify `apps/api/src/modules/companies/companies.controller.ts` (RBAC-01, RBAC-02 — hoy `admin` only; falta `@Delete`)
- Modify `apps/api/src/modules/zones/zones.controller.ts` (RBAC-03)
- Modify `apps/api/src/modules/orders/orders.controller.ts` (endpoints de logística → `LOGISTICS`)
- Test `apps/api/test/rbac-admin-director-logistics.e2e-spec.ts`

**Interfaces:**
- Companies/Zones `@Post/@Patch/@Delete` → `@Roles(...ROLE_GROUPS.ADMIN_AND_DIRECTOR)`.
- Endpoints de logística de pedido (guía, despacho, tracking) → `@Roles(...ROLE_GROUPS.LOGISTICS)`.

- [ ] Step 1: Escribir `apps/api/test/rbac-admin-director-logistics.e2e-spec.ts`:
  - `POST/PATCH/DELETE /companies` y `POST/PATCH/DELETE /zones`: `administrador` y `director_comercial` → no-403; los otros 4 roles → 403 (RBAC-01/02/03). Incluye explícitamente el caso del spec §8: "todos menos admin/director → 403".
  - Endpoints de logística de pedido (p.ej. `PATCH /orders/:id/dispatch`, `PATCH /orders/:id/tracking` — confirmar nombres reales al implementar): `administrador`, `logistica` → no-403; `comercial`, `director_comercial`, `tecnico`, `facturacion` → 403.
- [ ] Step 2: Correr y verificar fallo: `cd apps/api && npx jest --config test/jest-e2e.json rbac-admin-director-logistics`.
- [ ] Step 3: `companies.controller.ts` — cambiar `@Roles("administrador")` por `@Roles(...ROLE_GROUPS.ADMIN_AND_DIRECTOR)` en `@Post()` y `@Patch(":id")`. Si el borrado de empresa debe existir/exponerse, añadir `@Delete(":id")` con el mismo grupo; si no existe endpoint de borrado, dejar constancia en el test (no crear features nuevas — el spec §3.2 lista DELETE, verificar contra `companies.service.ts` antes de crear el handler).
- [ ] Step 4: `zones.controller.ts` — aplicar `@UseGuards(JwtAuthGuard, RolesGuard)` (clase) + `@Roles(...ROLE_GROUPS.ADMIN_AND_DIRECTOR)` en `@Post/@Patch/@Delete`.
- [ ] Step 5: `orders.controller.ts` — en los handlers de logística agregar `@Roles(...ROLE_GROUPS.LOGISTICS)`.
- [ ] Step 6: Correr y verificar verde el nuevo spec Y re-correr la auditoría de Task 2:
  `cd apps/api && npx jest --config test/jest-e2e.json rbac-admin-director-logistics` y luego `cd apps/api && npx jest rbac-coverage.spec` (debe pasar; si quedan huecos, o se protegen o se añaden al `ALLOWLIST_OPEN` con justificación).
- [ ] Step 7: Commit: `git add apps/api/src/modules/companies apps/api/src/modules/zones apps/api/src/modules/orders apps/api/test/rbac-admin-director-logistics.e2e-spec.ts apps/api/test/helpers/allowlist-open-endpoints.ts && git commit -m "feat(rbac): ADMIN_AND_DIRECTOR on companies/zones + LOGISTICS on order dispatch; close coverage sweep (RBAC-01..03)"`

---

## Task 7: Guardas de ruta en el front (`middleware.ts`)

**Files:**
- Modify `apps/web/src/middleware.ts`
- Test `apps/web/tests/route-guards.spec.ts` (Playwright)

**Interfaces:**
- Consume el rol del usuario desde el token/cookie de sesión (mismo mecanismo que ya usa el middleware para auth). Consume `ROLE_GROUPS` de `apps/web/src/lib/permissions.ts` (Task 1).
- Produce redirección a `/` (con query `?forbidden=1` para aviso) cuando el rol no está en la lista de la ruta.

- [ ] Step 1: Escribir `apps/web/tests/route-guards.spec.ts` (Playwright). Casos del spec §8:
  - Login como `logistica` → `page.goto('/orders/new')` termina redirigido fuera (URL final es `/` o `?forbidden=1`).
  - Login como `tecnico` → `/customers/new`, `/quotes/new`, `/invoices/new` redirigen.
  - Login como `comercial` → `/companies` y `/zones` redirigen; `/customers/new` NO redirige.
  - Login como `administrador` → ninguna de las anteriores redirige.
  - Usar un helper `loginUI(page, role)` con las 6 credenciales QA.
- [ ] Step 2: Correr y verificar fallo: `cd apps/web && npx playwright test route-guards`.
- [ ] Step 3: Implementar en `middleware.ts` el mapa prefijo→roles (spec §4.1) usando los grupos del espejo:
  ```typescript
  import { ROLE_GROUPS, UserRole } from "@/lib/permissions";

  const ROUTE_ROLES: { prefix: string; roles: readonly UserRole[] }[] = [
    { prefix: "/companies", roles: ROLE_GROUPS.ADMIN_AND_DIRECTOR },
    { prefix: "/zones", roles: ROLE_GROUPS.ADMIN_AND_DIRECTOR },
    { prefix: "/customers/new", roles: ROLE_GROUPS.COMMERCIAL_WRITERS },
    { prefix: "/opportunities/new", roles: ROLE_GROUPS.COMMERCIAL_WRITERS },
    { prefix: "/quotes/new", roles: ROLE_GROUPS.COMMERCIAL_WRITERS },
    { prefix: "/orders/new", roles: ROLE_GROUPS.COMMERCIAL_WRITERS },
    { prefix: "/expenses/new", roles: ROLE_GROUPS.COMMERCIAL_WRITERS },
    { prefix: "/follow-ups/new", roles: ROLE_GROUPS.FIELD_OPS },
    { prefix: "/visits/new", roles: ROLE_GROUPS.FIELD_OPS },
    { prefix: "/returns/new", roles: ROLE_GROUPS.RETURNS_WRITERS },
    { prefix: "/invoices/new", roles: ROLE_GROUPS.BILLING },
  ];
  ```
  Lógica: tras validar sesión, si `pathname` coincide con algún `prefix` y `role` no está en `roles`, `return NextResponse.redirect(new URL("/?forbidden=1", req.url))`. Ajustar el `matcher` del middleware para incluir estos prefijos. Confirmar los nombres reales de ruta contra `apps/web/src/app/(app)/**` durante la implementación (p.ej. si es `/expenses/new` vs `/commercial-expenses/new`).
- [ ] Step 4: Correr y verificar verde: `cd apps/web && npx playwright test route-guards`.
- [ ] Step 5: Commit: `git add apps/web/src/middleware.ts apps/web/tests/route-guards.spec.ts && git commit -m "feat(rbac): front route guards by role in middleware (RBAC-04..12, RBAC-20)"`

---

## Task 8: Visibilidad de menú, "Control comercial avanzado" y botón "Ver facturación"

**Files:**
- Modify el componente del sidebar del layout `(app)` (`apps/web/src/components/**` o `apps/web/src/app/(app)/layout.tsx` — localizar durante implementación)
- Modify `apps/web/src/app/(app)/dashboard/**` (sección "Control comercial avanzado")
- Modify la vista de Pedidos (`apps/web/src/app/(app)/orders/**`) — botón "Ver facturación"
- Test `apps/web/tests/menu-visibility.spec.ts` (Playwright)

**Interfaces:**
- Consume `ROLE_GROUPS` del espejo front para decidir visibilidad.

- [ ] Step 1: Escribir `apps/web/tests/menu-visibility.spec.ts`. Casos del spec §8:
  - Sidebar: `comercial` NO ve "Empresas" ni "Zonas"; `administrador` SÍ; `director_comercial` SÍ (RBAC-02/03).
  - Dashboard: `comercial` NO ve "Control comercial avanzado"; `administrador`/`director_comercial` SÍ (RBAC-13).
  - Pedidos: botón "Ver facturación" oculto para `logistica`, `tecnico`, `comercial`; visible para `administrador`, `director_comercial`, `facturacion` (RBAC-14).
- [ ] Step 2: Correr y verificar fallo: `cd apps/web && npx playwright test menu-visibility`.
- [ ] Step 3: Implementar:
  - Sidebar: filtrar los ítems "Empresas"/"Zonas" con `ROLE_GROUPS.ADMIN_AND_DIRECTOR.includes(role)`.
  - Dashboard: envolver la sección "Control comercial avanzado" en `ROLE_GROUPS.ADMIN_AND_DIRECTOR.includes(role)` (comercial excluido) — no renderizar si false.
  - Pedidos: renderizar el botón "Ver facturación" solo si `ROLE_GROUPS.BILLING.includes(role)`.
  - El rol del usuario en cliente se lee del contexto de sesión existente (mismo del que se alimenta el middleware).
- [ ] Step 4: Correr y verificar verde: `cd apps/web && npx playwright test menu-visibility`.
- [ ] Step 5: Commit: `git add apps/web/src/components apps/web/src/app/(app) apps/web/tests/menu-visibility.spec.ts && git commit -m "feat(rbac): sidebar/dashboard/orders visibility by role (RBAC-02,03,13,14)"`

---

## Task 9: Verificación integral (6 credenciales + suites completas)

**Files:**
- (posible) Test `apps/api/test/rbac-smoke-6-roles.e2e-spec.ts` (matriz consolidada)
- Sin cambios de producción salvo fixes que surjan.

**Interfaces:** cierra el ciclo; ninguna nueva interfaz pública.

- [ ] Step 1: Escribir `apps/api/test/rbac-smoke-6-roles.e2e-spec.ts`: una matriz consolidada que, con las 6 credenciales QA, recorra un endpoint representativo por grupo (customers/opportunities/quotes/orders/expenses/follow-ups/visits/returns/invoices/companies/zones/logística) y afirme 2xx-o-no-403 para autorizados y 403 para no autorizados. Sirve de regresión única.
- [ ] Step 2: Correr todas las suites API:
  - `cd apps/api && npx jest --config test/jest-e2e.json` (todos los e2e RBAC + smoke)
  - `cd apps/api && npx jest` (unit: `permissions.spec` + `rbac-coverage.spec` verde)
- [ ] Step 3: Correr Playwright completo: `cd apps/web && npx playwright test` (route-guards + menu-visibility en los 6 roles).
- [ ] Step 4: Verificar que `rbac-coverage.spec` no reporta huecos; recopilar la lista final de endpoints intencionalmente abiertos (`auth/login`, webhooks con `service-token.guard`) para el report.
- [ ] Step 5: Commit: `git add apps/api/test/rbac-smoke-6-roles.e2e-spec.ts && git commit -m "test(rbac): consolidated 6-credential smoke matrix + full-suite green"`

---

## Notas de riesgo / decisiones abiertas

- **Nombres reales de rutas y handlers de logística/facturación** (Task 5/6/7): el spec lista endpoints (guía, despacho, solicitud de facturación, `/expenses/new`) cuyos paths exactos deben confirmarse contra el código al implementar cada task; no crear features nuevas, solo etiquetar las existentes.
- **`companies` DELETE**: el controller staged no expone `@Delete`; si el servicio no soporta borrado, no inventarlo — protegerlo solo si existe.
- **Espejo front/back de `permissions.ts`**: riesgo de drift. Mitigación: comentario cruzado + (opcional futuro) un test que compare ambos ficheros. No se automatiza en esta iteración.
- **`RolesGuard` "fail-open"**: se mantiene el default permisivo (spec §3.3); la seguridad depende de que la auditoría de Task 2 no deje huecos. Ese test es el guardián de la regresión.

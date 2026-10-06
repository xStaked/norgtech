# Rol Promotor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar el rol `promotor` (admin en todo, analítica/desempeño solo propio).

**Architecture:** Nuevo valor en el `enum UserRole` de Prisma; promotor se suma a cada `@Roles("administrador", ...)` excepto gestión de metas/comisiones; los checks `role === "comercial"` no lo tocan (ve todo); `resolveFilters`, ledger de comisiones y `commercial-advanced` lo fuerzan a sí mismo.

**Tech Stack:** NestJS 11 + Prisma 6 (Postgres), Next.js, Python (Nora), Jest e2e.

**Spec:** `docs/superpowers/specs/2026-10-06-rol-promotor-design.md`

## Global Constraints

- El fallo e2e pre-existente `customers > paymentCondition invalida responde 400` sigue fallando en `main`; no es causado por este trabajo y no debe "arreglarse" aquí.
- Ningún `role === "comercial"` existente debe cambiar su condición: promotor ve todo por omisión.
- `WRITE_ROLES` de seller-goals y de commission-rules NO incluyen a promotor (decisión de diseño: gestión de metas/comisiones ajenas = desempeño de otros).
- Cada task termina con suite verde + commit.

## Review Focus

- Promotor pide `sellerUserId` ajeno en `/analytics/*` → se ignora y devuelve solo lo propio (test en Task 3).
- Promotor lee metas de otro vendedor (`GET /users/:otro/seller-goals`) → 403 (test en Task 3).
- `Record<UserRole, ...>` o switch exhaustivo en TS que exija el nuevo valor: dejar que `tsc` guíe, no adivinar (Task 2/4).
- Migración del enum en Postgres con filas existentes: solo `ADD VALUE`, sin reescritura (Task 1).
- Nora `tools_for_role("promotor")`: debe caer en `_FULL_ROLES` explícito, nunca en fallback (test en Task 5).

---

### Task 1: Enum en DB + Prisma Client + helper de tests

**Files:**
- Modify: `apps/api/prisma/schema.prisma:10-15` (agregar `promotor` al `enum UserRole`)
- Create: `apps/api/prisma/migrations/<timestamp>_add_promotor_role/migration.sql`
- Modify: `apps/api/test/helpers/login-as.ts:5-12,39-88` (agregar a `ALL_ROLES` y `MOCK_USERS` con id `...007`, email `promotor@norgtech.local`)

**Interfaces:**
- Consumes: nada (primera task).
- Produces: `UserRole.promotor` disponible en API, web y tests; `loginAs(app, UserRole.promotor)` funcional.

- [ ] **Step 1: Agregar `promotor` al enum en `schema.prisma` y crear la migración con `ALTER TYPE "UserRole" ADD VALUE 'promotor';`**
- [ ] **Step 2: Regenerar el cliente (`npx prisma generate --schema prisma/schema.prisma`) y validar (`npx prisma validate`)**

Run: `npx prisma validate` en `apps/api`
Expected: PASS sin errores
- [ ] **Step 3: Agregar entrada promotor en `ALL_ROLES` y `MOCK_USERS` de `login-as.ts` (mismo shape que las existentes)**
- [ ] **Step 4: Verificar compilación y suite existente**

Run: `npx tsc --noEmit -p tsconfig.json` en `apps/api` + `npm test -- --runInBand` (aceptar solo el fallo pre-existente conocido)
Expected: tsc limpio; MOCK_USERS compila (prueba que el enum viaja)
- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/<dir> apps/api/test/helpers/login-as.ts
git commit -m "feat(api): rol promotor en enum UserRole + migracion + helper de tests"
```

---

### Task 2: Backend — `@Roles`, control roles y elegibilidad

**Files:**
- Modify: todos los `*.controller.ts` con `@Roles("administrador", ...)` (~98 sitios; lista completa vía `grep -rn '@Roles("administrador"' apps/api/src`): agregar `"promotor"` junto a administrador, EXCEPTO:
  - `seller-goals.controller.ts:27,73,91` (create/update/delete de metas: solo admin+director)
  - `dashboard.controller.ts:42` (seller-goals del equipo: solo admin+director)
  - `commissions.controller.ts` (rules, 4 endpoints: solo admin+director)
  - `commissions-ledger.controller.ts:42` (verificar en sitio: si es resumen global, excluir; si es lectura propia, incluir)
- Modify: `invoices.service.ts:500 isControlRole`, `commercial-expenses.service.ts:635 isControlRole` (incluir promotor)
- Modify: `seller-eligibility.ts:12-15 SELLER_ROLES` (agregar `UserRole.promotor`: sus ventas se le atribuyen, base de "lo propio")
- Modify: `unicanal-roles.ts:12-15 UNICANAL_SUPERVISOR_ROLES` (agregar `UserRole.promotor`)
- Modify: `seller-goals.controller.ts:44,54` (lectura de metas: agregar promotor; el service ya solo le deja ver las suyas vía `ensureCanRead`)

**Interfaces:**
- Consumes: `UserRole.promotor` (Task 1).
- Produces: promotor entra a toda la operación; gestión de metas/comisiones ajenas sigue 403.

- [ ] **Step 1: Test e2e failing — promotor lee metas propias OK y ajenas 403**

```typescript
const token = await loginAs(app, UserRole.promotor);
await request(app.getHttpServer()).get(`/users/${OWN_ID}/seller-goals`).set(authHeader(token)).expect(200);
await request(app.getHttpServer()).get(`/users/${OTHER_ID}/seller-goals`).set(authHeader(token)).expect(403);
```

- [ ] **Step 2: Correr el test y verificar que falla (403 vs 200 invertidos / rol desconocido)**

Run: `npm test -- test/seller-goals.e2e-spec.ts --runInBand` (o spec equivalente)
Expected: FAIL en las nuevas aserciones
- [ ] **Step 3: Aplicar el sweep `@Roles` + `isControlRole` + `SELLER_ROLES` + `UNICANAL_SUPERVISOR_ROLES` según la lista de excepciones de arriba**
- [ ] **Step 4: Verificar que el test pasa y la suite existente sigue verde**

Run: `npx tsc --noEmit -p tsconfig.json` + `npm test -- --runInBand`
Expected: tsc limpio; verde salvo el fallo pre-existente conocido
- [ ] **Step 5: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): promotor entra como admin salvo metas/comisiones ajenas"
```

---

### Task 3: Backend — scoping "solo lo propio"

**Files:**
- Modify: `analytics.shared.ts:97` (`user.role === "comercial"` → incluir `UserRole.promotor`; `resolveAsOf` lo hereda)
- Modify: `analytics.controller.ts:93` (`@Roles` + promotor)
- Modify: `commissions.service.ts:370-377` (`READ_ROLES` + promotor; forzado `sellerUserId = user.id` también para promotor)
- Modify: `commissions-ledger.controller.ts:26` (`@Roles` + promotor)
- Modify: `dashboard.service.ts:264 isSellerScoped` (incluir promotor: `commercial-advanced` acotado a sí mismo; `getSummary` queda como admin salvo `recentActivity` —verificar en sitio que no filtra por rol—)
- Modify: `dashboard.controller.ts:28` (`@Roles` + promotor; el 42 queda excluido)

**Interfaces:**
- Consumes: Task 2 (promotor entra a los endpoints).
- Produces: analítica/ledger/avanzado devuelven solo lo propio para promotor.

- [ ] **Step 1: Tests e2e failing — analytics con `sellerUserId` ajeno devuelve solo lo propio; ledger ajeno devuelve solo lo propio; `seller-goals` dashboard 403**

```typescript
const token = await loginAs(app, UserRole.promotor);
const res = await request(app.getHttpServer()).get(`/analytics/sales?sellerUserId=${OTHER}`).set(authHeader(token)).expect(200);
expect(res.body.filters.sellerUserId).toBe(OWN_ID);
await request(app.getHttpServer()).get("/dashboard/seller-goals").set(authHeader(token)).expect(403);
```

- [ ] **Step 2: Correr y verificar FAIL**
- [ ] **Step 3: Implementar los forzados (analytics.shared, commissions.service, dashboard.service) + `@Roles`**
- [ ] **Step 4: Verificar PASS + suite verde**

Run: specs de analytics/commissions/dashboard + `npx tsc --noEmit -p tsconfig.json`
Expected: PASS
- [ ] **Step 5: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): analitica y desempeño de promotor acotados a si mismo"
```

---

### Task 4: Frontend web

**Files:**
- Modify: `apps/web/src/lib/auth.ts` (`USER_ROLES`, `ROLE_LABELS` + "Promotor", `moduleAccess` +promotor donde esté admin INCLUIDO `/analytics`, `canCreate` +promotor donde esté admin, `canAssignCustomers` +promotor)
- Modify: `apps/web/src/lib/theme.ts` (cada `requiredRoles` con administrador → +promotor, incl. `/users`)
- Modify: `apps/web/src/lib/route-guards.ts`, `apps/web/src/middleware.ts` (misma regla)
- Modify: `apps/web/src/app/(app)/dashboard/page.tsx` (ocultar `SellerGoalsDashboard` si `role === "promotor"`; `sellerGoalsRoles` NO incluye promotor)
- Modify: páginas `apps/web/src/app/(app)/analytics/{ventas,cartera,embudo,comercial}/page.tsx` (`lockedSeller = role === "comercial"` → incluir promotor; el back ignora el filtro de todos modos)
- Modify: `apps/web/src/lib/auth.ts` espejo en `agents/nora/src/roles.py` NO (eso es Task 5)

**Interfaces:**
- Consumes: API de Tasks 2-3.
- Produces: promotor navega todo menos widgets ajenos; analytics con selector bloqueado.

- [ ] **Step 1: Verificación manual — `tsc` debe fallar antes del cambio en `Record<UserRole, ...>` si existe (el compilador guía los archivos faltantes)**

Run: `npx tsc --noEmit -p tsconfig.json` en `apps/web`
Expected: errores listando cada sitio que exige el nuevo valor
- [ ] **Step 2: Aplicar los cambios de esta task siguiendo los errores del compilador + la regla admin→admin+promotor**
- [ ] **Step 3: Verificar compilación y lint**

Run: `npx tsc --noEmit -p tsconfig.json` + `eslint` del repo en `apps/web`
Expected: PASS
- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): rol promotor en nav, guards, dashboard y analytics"
```

---

### Task 5: Nora + seed + verificación de aceptación

**Files:**
- Modify: `agents/nora/src/roles.py` (`_FULL_ROLES` + `"promotor"`; `_RESTRICTED["get_analytics"/"compare_analytics"]` + `"promotor"`; `get_team_goals` SIN promotor; `_PROMPT_BY_ROLE["promotor"]` nuevo: ve toda la operación como admin pero analítica/desempeño solo propio, hablar de "tus ventas" solo en analítica)
- Modify: `agents/nora/src/tools/customers.py:85-98` (actualizar comentario desactualizado "El API no acota..." + mantener el filtro client-side como defensa en profundidad)
- Modify: `apps/api/prisma/seed.ts:14-86` (usuario promotor seed `promotor@norgtech.com`)
- Test: `agents/nora/tests/test_roles.py` (agregar casos promotor: `tools_for_role` incluye analytics y excluye team_goals; `role_prompt` menciona alcance)

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: criterios de aceptación §7 de la spec verificados.

- [ ] **Step 1: Tests failing de roles.py para promotor**

```python
def test_promotor_analytics_own_only():
    tools = tools_for_role("promotor", all_tools)
    names = {t.name for t in tools}
    assert "get_analytics" in names
    assert "get_team_goals" not in names
```

Run: `pytest agents/nora/tests/test_roles.py -v`
Expected: FAIL (rol desconocido → fallback)
- [ ] **Step 2: Implementar cambios de esta task**
- [ ] **Step 3: Correr tests Python + suite e2e API completa + checklist §7 de la spec (login promotor, GET /customers|/orders|/quotes|/opportunities sin filtro = todo, analytics ajeno→propio, seller-goals dashboard 403, asignar/activar clientes OK)**

Run: `pytest agents/nora/tests/test_roles.py -v` + `npm test -- --runInBand` en `apps/api`
Expected: PASS (salvo el fallo pre-existente conocido)
- [ ] **Step 4: Commit**

```bash
git add agents/nora/src/roles.py agents/nora/src/tools/customers.py agents/nora/tests/test_roles.py apps/api/prisma/seed.ts
git commit -m "feat(nora): rol promotor con analitica propia + seed"
```

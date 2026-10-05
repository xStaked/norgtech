# Frente 0 — Seguridad por rol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar escrita y probada la matriz de acceso rol × módulo × campo que los Frentes 1–3 deben respetar.

**Architecture:** Documento matriz como fuente de verdad; pines de comportamiento actual con tests `node --test` sobre las funciones puras de guards; reporte de brechas endpoint-vs-pantalla.

**Tech Stack:** Next.js 16 + NestJS 11, tests `node --test` en `apps/web`, jest e2e en `apps/api`.

**Spec:** `docs/superpowers/specs/2026-10-05-fase2-comercial-design.md` (Frente 0).

## Global Constraints

- Node 22, pnpm 10.32.1 workspaces, TS 5.8 estricto (`npx tsc --noEmit` limpio).
- Tests web: `node --test src/lib/<file>.test.ts` desde `apps/web`.
- Lint: `eslint . --max-warnings=0`.
- Roles válidos: `administrador | director_comercial | comercial | tecnico | facturacion | logistica`.
- Todo `@Roles` del API debe espejarse en `canAccess`/`canCreate` (`apps/web/src/lib/auth.ts`).
- TDD: test que falla primero, código mínimo después.
- UI en español es-CO.

## Review Focus

- Un comercial viendo datos de otro vendedor por query directa al API aunque la pantalla los oculte.
- Un campo sensible (costo, comisión ajena) visible porque el guard solo cubre la ruta.
- Un endpoint nuevo de Frentes 1–3 sin `@Roles` y sin entrada en `canAccess`.
- Un `resolveRoleRedirect` que deja pasar una ruta nueva por no estar en `protectedPaths`.
- Divergencia `permissions.ts` (API) vs `auth.ts` (web) tras un cambio de roles.

---
### Task 1: Matriz de acceso

**Files:**
- Create: `docs/seguridad-matriz-roles.md`
- Modify: none
- Test: none (documento; se verifica por revisión en Task 3)

**Interfaces:**
- Consumes: `apps/api/src/modules/auth/permissions.ts`, `apps/web/src/lib/auth.ts:100-133`, `apps/web/src/lib/theme.ts:33-202`
- Produces: tabla rol × módulo (ver/crear) + reglas a nivel de campo que los Frentes 1–3 deben implementar

- [ ] **Step 1: Escribir `docs/seguridad-matriz-roles.md`** con una fila por módulo del sidebar y columnas por rol (ver/crear/oculto), más sección de campos sensibles por módulo (costos, comisiones ajenas, datos de otros vendedores).
- [ ] **Step 2: Verificar que cada fila cita el `@Roles` del controller y la entrada de `canAccess`/`canCreate` correspondientes.**
- [ ] **Step 3: Commit**

```bash
git add docs/seguridad-matriz-roles.md
git commit -m "docs: matriz de acceso por rol frente 0"
```

### Task 2: Pines de guards web

**Files:**
- Create: `apps/web/src/lib/route-guards.test.ts`
- Modify: none
- Test: `apps/web/src/lib/route-guards.test.ts`

**Interfaces:**
- Consumes: `resolveRoleRedirect`, `matchesPrefix` de `apps/web/src/lib/route-guards.ts`
- Produces: red de seguridad que falla si una ruta nueva queda sin protección

- [ ] **Step 1: Write the failing test**

```typescript
// node --test src/lib/route-guards.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRoleRedirect } from "./route-guards.ts";

test("comercial no entra a /users", () => {
  assert.equal(resolveRoleRedirect("/users", "comercial"), "/dashboard?forbidden=1");
});

test("/price-lists exige rol de la matriz", () => {
  assert.equal(resolveRoleRedirect("/price-lists", "tecnico"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/price-lists", "facturacion"), null);
});

test("ruta desconocida no redirige", () => {
  assert.equal(resolveRoleRedirect("/no-existe", "comercial"), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/route-guards.test.ts` (desde `apps/web`)
Expected: FAIL (módulo sin export o casos que no pasan con la matriz actual — ajustar casos a la matriz de Task 1)

- [ ] **Step 3: Implement lo mínimo en `apps/web/src/lib/route-guards.ts`** para que los casos pasen sin cambiar comportamiento de rutas existentes.
- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/lib/route-guards.test.ts src/lib/list-filter.test.ts`
Expected: PASS todo

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/route-guards.test.ts apps/web/src/lib/route-guards.ts
git commit -m "test(web): pines de guards por rol"
```

### Task 3: Reporte de brechas API vs web

**Files:**
- Create: `docs/seguridad-brechas.md`
- Modify: none
- Test: none (auditoría; la verifican los tests de Task 2 y el plan de cierre)

**Interfaces:**
- Consumes: barrido de `src/modules/**/*.controller.ts` (`@Roles`), `apps/web/src/lib/auth.ts`, matriz de Task 1
- Produces: lista de brechas (endpoint sin rol, pantalla sin guard, filtro por vendedor ausente) que los Frentes 1–3 y el cierre deben cerrar

- [ ] **Step 1: Barrer todos los `@Get/@Post/@Patch/@Delete` y anotar por endpoint: roles permitidos vs `canAccess`/`canCreate` vs filtro `sellerUserId=self` donde aplique.**
- [ ] **Step 2: Escribir `docs/seguridad-brechas.md`** con tabla brecha → frente dueño (0/1/2/3/cierre).
- [ ] **Step 3: Commit**

```bash
git add docs/seguridad-brechas.md
git commit -m "docs: brechas de acceso api-vs-web"
```

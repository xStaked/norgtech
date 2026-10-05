# Cierre — Auditoría + calendario Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar la fase con la matriz de acceso verificada por rol y el calendario entregado.

**Architecture:** Auditoría ejecutando los pines del Frente 0 contra brechas reales y corrigiendo; calendario como componente propio siguiendo el patrón `Select` sobre `@base-ui/react`, sin librerías pesadas salvo aprobación.

**Tech Stack:** Next.js 16, tests `node --test`, `@base-ui/react` ya instalado.

**Spec:** `docs/superpowers/specs/2026-10-05-fase2-comercial-design.md` (Cierre).

## Global Constraints

- Node 22, pnpm 10.32.1 workspaces, TS 5.8 estricto (`npx tsc --noEmit` limpio).
- Tests web: `node --test src/lib/<file>.test.ts` desde `apps/web`.
- Lint: `eslint . --max-warnings=0`.
- No instalar librerías de calendario sin aprobación explícita del usuario.
- Respetar la matriz de `docs/seguridad-matriz-roles.md` (Frente 0).
- TDD: test que falla primero, código mínimo después.
- UI en español es-CO.

## Review Focus

- Brecha del Frente 0 cerrada en pantalla pero abierta en API directa.
- Corrección de seguridad que rompe un flujo legítimo (falso positivo por rol).
- Calendario que muestra visitas de otros vendedores a un comercial.
- Date-picker que emite la fecha en zona del servidor y desfasa el día (ver `VIS-03` en `visit-form.tsx`).
- Vista mensual que no pagina y pide todas las visitas del año de una vez.

---
### Task 1: Auditoría de cierre por rol

**Files:**
- Modify: los que indique `docs/seguridad-brechas.md` (Frente 0, Task 3)
- Test: `apps/web/src/lib/route-guards.test.ts` (ampliar), e2e de API donde aplique

**Interfaces:**
- Consumes: matriz (Frente 0 Task 1), brechas (Frente 0 Task 3), código de Frentes 1–3
- Produces: brechas en cero + tests que lo prueban

- [ ] **Step 1: Write the failing test** (un caso por brecha: rol indebido → 403/forbidden).
- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/route-guards.test.ts` / e2e según el caso
Expected: FAIL

- [ ] **Step 3: Implement correcciones mínimas** (guards, `@Roles`, filtros `sellerUserId=self`).
- [ ] **Step 4: Run tests to verify they pass**

Run: suites afectadas completas
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: auditoria de cierre por rol"
```

### Task 2: Date-picker con estilo del sistema

**Files:**
- Create: `apps/web/src/components/ui/date-picker.tsx`, `apps/web/src/lib/date-grid.test.ts`, `apps/web/src/lib/date-grid.ts`
- Modify: none
- Test: `apps/web/src/lib/date-grid.test.ts`

**Interfaces:**
- Consumes: `@base-ui/react` (mismo patrón que `Select`), valor ISO `YYYY-MM-DD`
- Produces: `<DatePicker value onChange required />` con la misma API visual que `Select`/`Input`, reutilizable en formularios

- [ ] **Step 1: Write the failing test** (construcción de grilla mensual: primer día de semana, días del mes, emisión ISO sin desfase de zona).
- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/date-grid.test.ts` (desde `apps/web`)
Expected: FAIL

- [ ] **Step 3: Implement helper + componente.**
- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/lib/date-grid.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/date-picker.tsx apps/web/src/lib/date-grid.ts apps/web/src/lib/date-grid.test.ts
git commit -m "feat(web): date-picker del sistema"
```

### Task 3: Vista mensual en agenda

**Files:**
- Modify: `apps/web/src/app/(app)/agenda/page.tsx` (vista mes/semana/lista conmutables, clic a detalle)
- Test: sin lógica nueva sin test (usa `date-grid.test.ts`); verificación `tsc`

**Interfaces:**
- Consumes: `DatePicker`/grilla de Task 2, `GET /visits` + seguimientos existentes de la página
- Produces: `/agenda` con vista mensual que respeta filtros por rol ya existentes

- [ ] **Step 1: Implementar la vista mensual** (respeta `assignedToMe`/rol de la página actual).
- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit` (desde `apps/web`)
Expected: sin errores

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(app)/agenda/page.tsx"
git commit -m "feat(web): vista mensual en agenda"
```

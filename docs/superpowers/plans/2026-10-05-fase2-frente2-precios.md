# Frente 2 — Motor de precios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Listas especiales con aprobación, bonificaciones por línea y trazabilidad de precios.

**Architecture:** Estados de lista en Prisma + endpoint de aprobación con `@Roles` admin/director; campos de bonificación en items con cálculo puro testeado; auditoría reaprovechando `AuditModule` + consulta de último precio vendido.

**Tech Stack:** NestJS 11 + Prisma 6.7 + PostgreSQL, Next.js 16, tests `node --test` (web) y jest (`apps/api/test/jest-e2e.json`).

**Spec:** `docs/superpowers/specs/2026-10-05-fase2-comercial-design.md` (Frente 2).

## Global Constraints

- Node 22, pnpm 10.32.1 workspaces, TS 5.8 estricto (`npx tsc --noEmit` limpio).
- Tests web: `node --test src/lib/<file>.test.ts` desde `apps/web`; API: `jest --config test/jest-e2e.json` desde `apps/api`.
- Lint: `eslint . --max-warnings=0`.
- Precios tal cual importación (sin/con IVA no derivados); IVA observado 0%/5%.
- COP sin decimales en listados; jamás convertir monedas.
- Solo `administrador`/`director_comercial` mutan precios o aprueban listas.
- Respetar la matriz de `docs/seguridad-matriz-roles.md` (Frente 0).
- TDD: test que falla primero, código mínimo después.
- UI en español es-CO.

## Review Focus

- Lista pendiente usada para cotizar cuando solo la aprobada debería liberar precio.
- Bonificación aplicada sobre precio con IVA cuando debía ser sobre sin IVA (o viceversa — fijar contra la respuesta a la pregunta abierta 2 del spec).
- Historial que registra lecturas o duplicas por cada `findOne` en vez de solo mutaciones.
- Último precio vendido tomando la cotización en vez del pedido/factura real.
- Aprobación sin `@Roles` que un comercial puede llamar directo al API.

---
### Task 1: Estados y aprobación de listas especiales

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (enum + campo en `PriceList`), `apps/api/src/modules/price-lists/price-lists.service.ts`, `price-lists.controller.ts`
- Test: `apps/api/test/price-lists-approval.e2e-spec.ts` (o service spec según convención del repo — revisar `apps/api/test/` primero)

**Interfaces:**
- Consumes: `PUT /price-lists/:id/items` existente
- Produces: `PATCH /price-lists/:id/approval { action: "aprobar" | "rechazar" }` (solo admin/director); `PriceList.status: borrador | en_revision | aprobada | rechazada`; regla `solo aprobada libera precio` consumida por Task 3 y el pricing

- [ ] **Step 1: Write the failing test** (crear lista en revisión → 403 para comercial aprobando; 200 para admin; cotización con lista pendiente no toma sus precios).
- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config test/jest-e2e.json <archivo>` (desde `apps/api`)
Expected: FAIL

- [ ] **Step 3: Implement migración + servicio + controller** (incluye `prisma migrate dev` y `prisma generate`).
- [ ] **Step 4: Run tests to verify they pass**

Run: suite del módulo + `npx tsc --noEmit` si aplica
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/modules/price-lists apps/api/test
git commit -m "feat(api): aprobacion de listas especiales"
```

### Task 2: Bonificaciones 10/20/30/40% por línea

**Files:**
- Create: `apps/web/src/lib/bonus-line.ts`, `apps/web/src/lib/bonus-line.test.ts`
- Modify: `QuoteItem`/`OrderItem` (campos `bonusPercent`, `bonusQty`), `apps/api/src/modules/pricing/pricing.service.ts`, forms de cotización/pedido (select 10/20/30/40)
- Test: `apps/web/src/lib/bonus-line.test.ts` + e2e del cálculo

**Interfaces:**
- Consumes: precio de lista (sin/con IVA) + `bonusPercent: 10 | 20 | 30 | 40`
- Produces: `applyBonus(line)` → `{ chargedQty, bonusQty, unitPrice: 0 en bonificadas, ivaCalculado }` con la base de IVA fijada por la pregunta abierta 2 del spec (si sigue abierta, el task la cierra con el usuario antes del Step 1)

- [ ] **Step 1: Write the failing test** (línea de 10 uds al 20% → 8 cobradas + 2 a $0 con IVA; validar que el total cobrado no incluye bonificadas y el IVA sí).
- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/bonus-line.test.ts` (desde `apps/web`)
Expected: FAIL

- [ ] **Step 3: Implement helper + migración + pricing + UI** (mínimo para pasar).
- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/lib/bonus-line.test.ts` + e2e del módulo
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/bonus-line.ts apps/web/src/lib/bonus-line.test.ts apps/api/prisma apps/api/src/modules/pricing
git commit -m "feat: bonificaciones por linea 10/20/30/40"
```

### Task 3: Histórico + último precio vendido

**Files:**
- Modify: `apps/api/src/modules/price-lists/price-lists.service.ts` (`upsertItem` registra en `AuditModule`), `apps/web/src/app/(app)/price-lists/[id]/page.tsx` (timeline solo lectura)
- Create: helper `lastSoldPrice(customerId, productId)` (API: query sobre `OrderItem`/`Invoice` cobrado; web: sección "Último vendido" en producto/cliente)
- Test: e2e de auditoría en `upsertItem` + `node --test` del helper de presentación si lleva lógica pura

**Interfaces:**
- Consumes: `auditService.record` existente, `PUT /price-lists/:id/items`
- Produces: timeline quién/cuándo/antes/después por presentación; `GET` de último precio vendido por (cliente, producto) desde pedidos/facturas reales, no cotizaciones

- [ ] **Step 1: Write the failing test** (cambiar un precio → registro de auditoría con antes/después; último vendido ignora cotizaciones).
- [ ] **Step 2: Run test to verify it fails**

Run: e2e del módulo / `node --test` según el caso
Expected: FAIL

- [ ] **Step 3: Implement auditoría + UI de timeline + sección último vendido + warning en cotización cuando el cliente va a precio base (punto 1 de `docs/pendientes-fase2.md`).**
- [ ] **Step 4: Run tests to verify they pass**

Run: suite afectada + `npx tsc --noEmit` (web)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/price-lists "apps/web/src/app/(app)/price-lists"
git commit -m "feat: historico de precios y ultimo vendido"
```

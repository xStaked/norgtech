# Frente 3 — Comisiones al vendedor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Liquidar comisiones como % sobre venta cobrada, causadas al registrarse el pago.

**Architecture:** Regla `%` por vendedor por periodo (nuevo modelo); causación en el flujo de pagos existente (`InvoicePayment`); reporte de liquidación con estados causada/pagada. Depende del Frente 1 (cartera estable).

**Tech Stack:** NestJS 11 + Prisma 6.7 + PostgreSQL, Next.js 16, jest e2e en API.

**Spec:** `docs/superpowers/specs/2026-10-05-fase2-comercial-design.md` (Frente 3).

## Global Constraints

- Node 22, pnpm 10.32.1 workspaces, TS 5.8 estricto.
- Tests API: `jest --config test/jest-e2e.json` desde `apps/api`; web `node --test` si lleva helpers puros.
- Lint: `eslint . --max-warnings=0`.
- Solo `administrador`/`director_comercial` configuran reglas y marcan pagadas.
- Un comercial solo ve sus propias comisiones (matriz Frente 0).
- COP sin decimales en listados; jamás convertir monedas.
- TDD: test que falla primero, código mínimo después.
- UI en español es-CO.

## Review Focus

- Comisión causada al facturar en vez de al cobrar (el hecho generador es el pago).
- Pago parcial que causa el 100% en vez de la parte proporcional cobrada.
- Nota crédito posterior que no reversa la comisión causada.
- Devolución/pago anulado que deja la comisión viva.
- Un vendedor viendo comisiones ajenas por falta de filtro `sellerUserId=self`.

---
### Task 1: Regla de % por vendedor por periodo

**Files:**
- Create: `apps/api/src/modules/commissions/` (`commissions.module.ts`, `commissions.service.ts`, `commissions.controller.ts`, `dto/`)
- Modify: `apps/api/prisma/schema.prisma` (`CommissionRule { sellerUserId, periodType, periodValue, percent }`), `apps/api/src/app.module.ts`
- Test: e2e de CRUD con guards por rol

**Interfaces:**
- Consumes: `User` vendedor, periodo (`anual|trimestral|mensual` + valor como `CustomerGoal`)
- Produces: `GET/POST/PATCH /commissions/rules` (solo admin/director); `CommissionRule` consumida por Task 2

- [ ] **Step 1: Write the failing test** (crear regla como comercial → 403; como admin → 201; vendedor sin regla → 0%).
- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config test/jest-e2e.json <archivo>` (desde `apps/api`)
Expected: FAIL

- [ ] **Step 3: Implement modelo + migración + módulo** (seguir convención de `seller-goals/`).
- [ ] **Step 4: Run tests to verify they pass**

Run: suite del módulo
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma apps/api/src/modules/commissions apps/api/src/app.module.ts
git commit -m "feat(api): reglas de comision por vendedor"
```

### Task 2: Causación al cobrar

**Files:**
- Modify: `apps/api/src/modules/commissions/commissions.service.ts` (`accrueFromPayment`), flujo que crea `InvoicePayment` (hook post-pago en transacción)
- Test: e2e del flujo de pago

**Interfaces:**
- Consumes: `InvoicePayment` creado + `CommissionRule` vigente del `sellerUserId` de la factura/pedido
- Produces: `Commission { sellerUserId, invoiceId, paymentId, base, percent, amount, status: causada }` proporcional al pago; reversa ante nota crédito/devolución

- [ ] **Step 1: Write the failing test** (pago parcial del 50% → comisión del 50% de la base; pago total → 100%; nota crédito posterior → reverso).
- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config test/jest-e2e.json <archivo>`
Expected: FAIL

- [ ] **Step 3: Implement causación proporcional + reverso** dentro de la transacción del pago.
- [ ] **Step 4: Run tests to verify they pass**

Run: suite de invoices + commissions
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/commissions apps/api/src/modules/invoices
git commit -m "feat(api): causacion de comisiones al cobrar"
```

### Task 3: Liquidación por periodo

**Files:**
- Create: `apps/web/src/app/(app)/commissions/page.tsx` (tabla + CSV, filtro periodo/vendedor según rol)
- Modify: `apps/web/src/lib/{auth,theme,route-guards}.ts`, `middleware.ts` (mismo patrón que `/price-lists`)
- Test: `node --test` si hay helper puro (totales por estado); si no, verificación `tsc` + e2e

**Interfaces:**
- Consumes: `GET /commissions?from&to&sellerId` (agregar endpoint de lectura en Task 2 si falta)
- Produces: `/commissions` con totales causada/pagada y acción de marcar pagada (solo admin/director)

- [ ] **Step 1: Write the failing test** (helper de totales o e2e de la guarda por rol: comercial ve solo las suyas).
- [ ] **Step 2: Run test to verify it fails**

Run: según el caso
Expected: FAIL

- [ ] **Step 3: Implement endpoint de lectura + página.**
- [ ] **Step 4: Run tests to verify they pass**

Run: suite afectada + `npx tsc --noEmit` (web)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/commissions "apps/web/src/app/(app)/commissions" apps/web/src/lib apps/web/src/middleware.ts
git commit -m "feat: liquidacion de comisiones"
```

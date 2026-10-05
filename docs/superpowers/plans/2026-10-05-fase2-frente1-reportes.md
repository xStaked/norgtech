# Frente 1 — Reportes para administración Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llevar a la reunión con administración reportes de deudores y contables funcionando, más morosos como consulta en el agente.

**Architecture:** Helpers puros de aging/IVA en `apps/web/src/lib` con `node --test`; UI de solo lectura sobre `GET /invoices` existente; en Nora un tool de consulta (sin acciones de cobro).

**Tech Stack:** Next.js 16, NestJS 11 (sin cambios de API salvo que un task lo exija), Nora Python FastAPI.

**Spec:** `docs/superpowers/specs/2026-10-05-fase2-comercial-design.md` (Frente 1).

## Global Constraints

- Node 22, pnpm 10.32.1 workspaces, TS 5.8 estricto (`npx tsc --noEmit` limpio).
- Tests web: `node --test src/lib/<file>.test.ts` desde `apps/web`.
- Lint: `eslint . --max-warnings=0`.
- COP sin decimales en listados (`formatPrice(v, "COP", true)`); USD con 2 decimales; jamás convertir monedas.
- Vencido siempre derivado (`dueDate < asOf`), nunca columna de estado.
- Respetar la matriz de `docs/seguridad-matriz-roles.md` (Frente 0): solo roles con acceso a cartera/analítica.
- TDD: test que falla primero, código mínimo después.
- UI en español es-CO.

## Review Focus

- Factura `anulada` sumando en el saldo de deudor (debe excluirse como en `returns/new`).
- Nota crédito no restada del saldo (`total - pagado - creditNoteTotal`, mismo cálculo que `returns/new/page.tsx:43-44`).
- Pago parcial contado como deuda total en vez de saldo pendiente.
- Bucket de aging con borde off-by-one (30 vs 31 días).
- CSV con separador/punto decimal que Excel es-CO abre mal (usar `;` y coma decimal).

---
### Task 1: Helper de aging de deudores

**Files:**
- Create: `apps/web/src/lib/debtor-aging.ts`
- Test: `apps/web/src/lib/debtor-aging.test.ts`

**Interfaces:**
- Consumes: facturas con `{ id, customerId, customerName, totalAmount, totalPaid, creditNoteTotal?, dueDate, status, invoiceNumber }`
- Produces: `bucketAging(invoices, asOfISO): DebtorRow[]` con `{ customerId, customerName, balance, current, d1_30, d31_60, d61_90, d90plus, oldestDueDate }`

- [ ] **Step 1: Write the failing test**

```typescript
// node --test src/lib/debtor-aging.test.ts
test("excluye anuladas y resta notas credito", () => {
  const rows = bucketAging([
    { id: "a", customerId: "c1", customerName: "A", totalAmount: "100", totalPaid: "20", creditNoteTotal: "10", dueDate: "2026-09-01", status: "emitida", invoiceNumber: "F1" },
    { id: "b", customerId: "c1", customerName: "A", totalAmount: "50", totalPaid: "0", dueDate: "2026-09-01", status: "anulada", invoiceNumber: "F2" },
  ], "2026-10-05");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].balance, 70);
});

test("ubica saldos en el bucket correcto", () => {
  const rows = bucketAging([
    { id: "a", customerId: "c1", customerName: "A", totalAmount: "100", totalPaid: "0", dueDate: "2026-09-20", status: "emitida", invoiceNumber: "F1" },
  ], "2026-10-05");
  assert.equal(rows[0].d1_30, 100);
  assert.equal(rows[0].d31_60, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/debtor-aging.test.ts` (desde `apps/web`)
Expected: FAIL with "does not provide an export named 'bucketAging'"

- [ ] **Step 3: Implement `bucketAging` en `apps/web/src/lib/debtor-aging.ts`** (excluir `anulada`, saldo = total − pagado − notas, buckets por días de mora).
- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/lib/debtor-aging.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/debtor-aging.ts apps/web/src/lib/debtor-aging.test.ts
git commit -m "feat(web): aging de deudores"
```

### Task 2: Pantalla de deudores + CSV

**Files:**
- Create: `apps/web/src/app/(app)/invoices/debtors/page.tsx`
- Modify: `apps/web/src/lib/theme.ts` (hijo de Cartera — evaluar si el nav soporta children en Comercial; si no, link desde `/invoices`), `apps/web/src/lib/auth.ts` + `route-guards.ts` + `middleware.ts` (misma guarda que `/invoices`)
- Test: reutiliza `debtor-aging.test.ts` (sin lógica nueva sin test)

**Interfaces:**
- Consumes: `bucketAging` de Task 1, `apiFetch("/invoices")`, `DataTable`, `SectionCard`, `PageHeader`
- Produces: `/invoices/debtors` visible solo para roles con acceso a cartera

- [ ] **Step 1: Implementar la página** (server component; tabla por cliente con buckets + botón CSV con `;` y coma decimal).
- [ ] **Step 2: Verificar**

Run: `node --test src/lib/debtor-aging.test.ts && npx tsc --noEmit` (desde `apps/web`)
Expected: PASS y sin errores de tipos

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(app\)/invoices/debtors/page.tsx apps/web/src/lib/theme.ts apps/web/src/lib/auth.ts apps/web/src/lib/route-guards.ts apps/web/src/middleware.ts
git commit -m "feat(web): reporte de deudores"
```

### Task 3: Reportes contables de solo lectura

**Files:**
- Create: `apps/web/src/app/(app)/invoices/accounting/page.tsx`, `apps/web/src/lib/accounting-report.test.ts`, `apps/web/src/lib/accounting-report.ts`
- Modify: guards/nav como Task 2
- Test: `apps/web/src/lib/accounting-report.test.ts`

**Interfaces:**
- Consumes: `GET /invoices` (usa `taxAmount`, `subtotal`, `totalAmount`, pagos y notas)
- Produces: `summarizeAccounting(invoices, fromISO, toISO)` → `{ salesByTax: { rate0, rate5 }, paymentsReceived, creditNotes }` + página con CSV

- [ ] **Step 1: Write the failing test** (ventas agregadas por tarifa de IVA 0%/5% desde `taxAmount`/`subtotal`; pagos y notas sumados en el rango).
- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/accounting-report.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement helper + página** (mismo patrón que Task 2).
- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/lib/accounting-report.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/accounting-report.ts apps/web/src/lib/accounting-report.test.ts "apps/web/src/app/(app)/invoices/accounting/page.tsx"
git commit -m "feat(web): reportes contables de lectura"
```

### Task 4: Morosos como consulta en el agente

**Files:**
- Create/modify: tool de consulta en `agents/nora/src` (seguir el patrón de tools existentes) + collection en API si falta exponer morosos (`GET /invoices?overdue=true` ya existe — verificar y reusar)
- Test: prueba manual por chat +Registrar criterio en el task

**Interfaces:**
- Consumes: `GET /invoices?overdue=true` (verificar que el DTO lo acepta: `apps/api/src/modules/invoices/dto/list-invoices.dto.ts`)
- Produces: respuesta del agente listando morosos; PROHIBIDO: enviar mensajes o cobros automáticos

- [ ] **Step 1: Verificar el endpoint y agregar el tool de solo lectura en Nora.**
- [ ] **Step 2: Verificar por chat**: preguntar "clientes en mora" y "+30 días"; confirmar que lista sin ejecutar acciones.
- [ ] **Step 3: Commit**

```bash
git add agents/nora/src apps/api/src/modules/invoices
git commit -m "feat(nora): consulta de morosos solo lectura"
```

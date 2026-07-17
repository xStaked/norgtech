# Crédito/Cupo (exposición con pedidos aprobados) — Implementation Plan

**Date:** 2026-07-16
**Spec:** `/tmp/2026-07-16-credito-exposicion-pedidos-design.md`
**Feature:** `credito-exposicion-pedidos` (Fase P0)
**Branch:** `fix/qa-p0-seguridad-dinero`
**Merge base:** TBD (`git merge-base HEAD origin/main` al abrir el PR)

**Cierra:** ORD-01 (permite pedido excediendo cupo), ORD-02 (no descuenta crédito tras un pedido)

## Comandos de test

- API (unit + e2e): `cd apps/api && npx jest`
- Front (e2e): `cd apps/web && npx playwright test`
- Un solo archivo API: `cd apps/api && npx jest credit.service.spec`

## Convenciones

- Prosa en español, identificadores y código en inglés.
- TDD estricto: cada paso escribe primero un test que falla, se corre para verlo rojo, se implementa el código concreto, se corre para verlo verde, y se commitea.
- Todo el enforcement vive en el **backend**. El front solo refleja el `summary`.
- La exposición es **derivada** (no se persiste ningún contador): al cancelar/rechazar/anular deja de contar solo.

## Constantes compartidas (referencia)

En `apps/api/src/modules/credit/credit.service.ts`, cerca de `ALERT_THRESHOLD_PERCENT` (línea 7):

```typescript
import { InvoiceStatus, OrderStatus, Prisma } from "@prisma/client";

// Pedidos que YA comprometen cupo (aprobados, aún no cubiertos por factura activa).
// Excluye 'recibido' (borrador) y 'facturado' (cubierto por su factura).
const ORDER_EXPOSURE_STATUSES: OrderStatus[] = [
  OrderStatus.orden_facturacion,
  OrderStatus.despachado,
  OrderStatus.en_transito,
  OrderStatus.entregado,
];
```

Referencias reales verificadas:
- `credit.service.ts`: `getOpenInvoiceTotal` L13-28; `assertCreditLimit` L30-52 (usa `getOpenInvoiceTotal` en L44); `getCreditSummary.currentBalance` en L62; `getCreditAlerts` groupBy solo-facturas en L128.
- `orders.service.ts`: `create` llama `assertCreditLimit(dto.customerId, orderSubtotal)` en L101 (subtotal SIN IVA); `order.total` con IVA se calcula en L194; `createInvoiceFromOrder` valida crédito en L315; `updateStatus` L425 (update en L450, hoy sin check de crédito); `approveOrder` L656 (setea `orden_facturacion` en L686-688).
- `schema.prisma`: `enum OrderStatus` L37-44; `enum InvoiceStatus` (`anulada` en L93); `Order.invoices Invoice[]` L715; `Customer.creditLimit` L510.

---

## Task 1 — `CreditService.getCustomerExposure` (base de exposición)

Nueva función privada que suma **facturas abiertas + pedidos aprobados no facturados**, con soporte de `tx` y de `excludeOrderId` para evitar el doble conteo pedido/su factura.

**Files**
- `apps/api/src/modules/credit/credit.service.ts` (implementación)
- `apps/api/src/modules/credit/credit.service.spec.ts` (nuevo — unit tests con Prisma mockeado)

**Interfaces**

```typescript
private async getCustomerExposure(
  customerId: string,
  tx?: Prisma.TransactionClient,
  opts?: { excludeOrderId?: string },
): Promise<Prisma.Decimal>
```

**Steps**
- [ ] Escribir `credit.service.spec.ts` con un `PrismaService` mock (`invoice.aggregate`, `order.findMany`, `customer.findUnique`). Casos que deben FALLAR primero:
  - `getCustomerExposure` suma facturas abiertas + pedidos en `orden_facturacion` (ej: facturas $0 + pedido $8M = $8M).
  - un pedido en `recibido` NO cuenta (mock `order.findMany` respeta el `where.status.in` → devuelve solo aprobados).
  - un pedido con factura activa cuenta **una sola vez**: `order.findMany` filtra por `invoices: { none: { status: { not: "anulada" } } }` y la factura se cuenta vía `invoice.aggregate`.
  - `excludeOrderId` excluye ese pedido del `where` (`id: { not: excludeOrderId }`).
  - pedido con factura **anulada** vuelve a contar como no facturado.
- [ ] Correr `cd apps/api && npx jest credit.service.spec` → ROJO (método no existe).
- [ ] Implementar en `credit.service.ts` (insertar tras `getOpenInvoiceTotal`, ~L28):

```typescript
private async getCustomerExposure(
  customerId: string,
  tx?: Prisma.TransactionClient,
  opts?: { excludeOrderId?: string },
): Promise<Prisma.Decimal> {
  const client = tx ?? this.prisma;

  const invoiceAgg = await client.invoice.aggregate({
    where: { customerId, status: { notIn: ["pagada", "anulada"] } },
    _sum: { totalAmount: true },
  });

  const orders = await client.order.findMany({
    where: {
      customerId,
      status: { in: ORDER_EXPOSURE_STATUSES },
      invoices: { none: { status: { not: InvoiceStatus.anulada } } },
      ...(opts?.excludeOrderId ? { id: { not: opts.excludeOrderId } } : {}),
    },
    select: { total: true },
  });

  const ordersTotal = orders.reduce(
    (sum, o) => sum.plus(o.total),
    new Prisma.Decimal(0),
  );

  return new Prisma.Decimal(invoiceAgg._sum.totalAmount ?? 0).plus(ordersTotal);
}
```

- [ ] Correr `npx jest credit.service.spec` → VERDE.
- [ ] Commit: `test(credit): add getCustomerExposure with orders exposure` + `feat(credit): compute exposure from open invoices + approved unbilled orders`.

---

## Task 2 — `assertCreditLimit` y `getCreditSummary` usan la exposición

Reemplazar `getOpenInvoiceTotal` por `getCustomerExposure` en el punto de validación (L44) y en el `currentBalance` del summary (L62), propagando `opts` en `assertCreditLimit`.

**Files**
- `apps/api/src/modules/credit/credit.service.ts`
- `apps/api/src/modules/credit/credit.service.spec.ts`

**Interfaces**

```typescript
async assertCreditLimit(
  customerId: string,
  amount: Prisma.Decimal,
  tx?: Prisma.TransactionClient,
  opts?: { excludeOrderId?: string },
): Promise<void>
```

**Steps**
- [ ] Añadir tests que FALLEN:
  - `assertCreditLimit`: cliente con `creditLimit $10M`, exposición $8M (1 pedido aprobado), `amount $4M` → lanza `BadRequestException` con mensaje `Disponible: $2.000.000`. (Hoy pasa porque solo mira facturas = $0.)
  - `assertCreditLimit` reenvía `opts.excludeOrderId` a `getCustomerExposure`.
  - cliente sin `creditLimit`/`= 0` → nunca lanza (regresión).
  - `getCreditSummary.currentBalance` refleja pedidos aprobados (no solo facturas) y `availableCredit = creditLimit - exposición`.
- [ ] Correr → ROJO.
- [ ] Implementar:
  - L44: `const currentTotal = await this.getCustomerExposure(customerId, tx, opts);`
  - Firma de `assertCreditLimit` (L30-34): agregar `opts?: { excludeOrderId?: string }`.
  - L62: `const currentBalance = (await this.getCustomerExposure(customerId)).toNumber();`
  - Mantener el texto del throw (L48-50) tal cual.
- [ ] Correr → VERDE.
- [ ] Commit: `feat(credit): assertCreditLimit and summary use full exposure (invoices + orders)`.

> Nota: `getCreditAlerts` (L128) sigue mirando solo facturas; ampliarlo es P1 (fuera de scope de este plan) — dejar `// TODO(P1): incluir pedidos aprobados en alertas`.

---

## Task 3 — Punto de enforcement: aprobar / avanzar / facturar / crear

Mover el bloqueo al momento en que el pedido se **compromete** (`orden_facturacion`+), mantenerlo al facturar excluyendo su propio pedido, y en `create` validar solo si nace comprometido, usando `order.total` con IVA.

**Files**
- `apps/api/src/modules/orders/orders.service.ts`
- `apps/api/src/modules/orders/orders.service.spec.ts` (nuevo — unit con `CreditService` mockeado)

**Steps**

### 3a. `approveOrder` (L656)
- [ ] Test ROJO: aprobar un pedido `recibido`→`orden_facturacion` cuyo `order.total` excede el disponible → 400 y NO se actualiza. Verificar que se llama `credit.assertCreditLimit(customerId, order.total, tx, { excludeOrderId: order.id })`.
- [ ] Implementar: dentro de la transacción, tras las validaciones (~L673, antes del `tx.order.update`) y solo cuando el pedido va a comprometerse:

```typescript
if (order.status === OrderStatus.recibido) {
  await this.credit.assertCreditLimit(
    order.customerId,
    new Prisma.Decimal(order.total),
    tx,
    { excludeOrderId: order.id },
  );
}
```
- [ ] Correr → VERDE.

### 3b. `updateStatus` → `orden_facturacion` (L425)
- [ ] Test ROJO: `updateStatus` con `dto.status === 'orden_facturacion'` que excede → 400; con `dto.status === 'recibido'` u otro NO valida crédito.
- [ ] Implementar: tras validar la transición (~L434, antes del `tx.order.update` de L450):

```typescript
if (dto.status === OrderStatus.orden_facturacion) {
  await this.credit.assertCreditLimit(
    order.customerId,
    new Prisma.Decimal(order.total),
    tx,
    { excludeOrderId: order.id },
  );
}
```
- [ ] Correr → VERDE.

### 3c. `createInvoiceFromOrder` (L315) — excluir su propio pedido
- [ ] Test ROJO: facturar un pedido ya contado en exposición NO debe doble-contar; se llama `assertCreditLimit(order.customerId, totals.totalAmount, tx, { excludeOrderId: order.id })`.
- [ ] Implementar: cambiar L315 a:

```typescript
await this.credit.assertCreditLimit(
  order.customerId,
  totals.totalAmount,
  tx,
  { excludeOrderId: order.id },
);
```
- [ ] Correr → VERDE.

### 3d. `create` (L101) — validar solo si nace comprometido, con IVA
- [ ] Test ROJO:
  - crear pedido que nace en `recibido` (default) NO valida crédito aunque exceda.
  - crear pedido que nace en un estado `orden_facturacion`+ valida con `total` (CON IVA), no con `orderSubtotal`.
- [ ] Implementar: reemplazar la llamada suelta de L101. El `total` con IVA ya existe pero se calcula en L194; mover el cálculo de `total`/`subtotal` (L190-197) antes de la validación, o validar dentro de la transacción tras crear con el `total` conocido. Estado inicial: `dto.status ?? OrderStatus.recibido`.

```typescript
const initialStatus = dto.status ?? OrderStatus.recibido;
if (ORDER_EXPOSURE_STATUSES.includes(initialStatus)) {
  await this.credit.assertCreditLimit(dto.customerId, total);
}
```
  Eliminar la validación con `orderSubtotal` de L101 (el cálculo de `orderSubtotal` en L93-99 queda huérfano: borrarlo si no se usa en otro lado).
- [ ] Correr → VERDE.
- [ ] Commit: `feat(orders): enforce credit on approve/advance/invoice, skip drafts, use total with IVA`.

---

## Task 4 — Front: el disponible refleja pedidos aprobados

El formulario de pedido y la ficha de cliente ya consumen `GET /credit/customers/:id/summary`; como el backend ahora incluye pedidos aprobados en `currentBalance`/`availableCredit`, el disponible mostrado será el real. Solo se **verifica** (no hay cambio de UI).

**Files**
- `apps/web` (componentes que consumen el summary — localizar; en el upload solo están `apps/web/src/lib/*`, el resto vive en el repo real)
- test Playwright existente o nuevo bajo `apps/web/e2e` / `tests`

**Steps**
- [ ] Test Playwright ROJO→VERDE: con un cliente que tiene un pedido aprobado grande, abrir el form de pedido y comprobar que "Disponible" muestra `creditLimit − exposición` (no `creditLimit − facturas`), y que el botón "Crear pedido" se bloquea al exceder.
- [ ] Reabrir el form del mismo cliente tras aprobar otro pedido → "Disponible" baja (ORD-02 visual).
- [ ] Si el número ya cuadra sin tocar código, dejar solo el test como regresión.
- [ ] Correr `cd apps/web && npx playwright test`.
- [ ] Commit: `test(web): assert available credit reflects approved orders`.

---

## Task 5 — Verificación end-to-end (ORD-01 / ORD-02 / doble conteo)

Test e2e de API (`orders.e2e-spec.ts` o similar) que ejerce el flujo completo contra Prisma real.

**Steps**
- [ ] **ORD-01:** cliente `creditLimit $10M`, sin facturas, un pedido previo aprobado (`orden_facturacion`) de $8M. Crear pedido de $4M (nace `recibido`, no bloquea). Aprobarlo → **400** "Crédito excedido. Disponible: $2.000.000".
- [ ] **ORD-02:** `getCreditSummary.availableCredit` baja tras aprobar un pedido (no solo tras facturar).
- [ ] **No doble conteo:** aprobar pedido de $8M (exposición = $8M), facturarlo → la exposición sigue $8M (la factura reemplaza al pedido vía `excludeOrderId` + `invoices: { none }`), no $16M.
- [ ] **Reposición:** rechazar/cancelar un pedido aprobado → deja de contar (exposición baja sola).
- [ ] **Factura anulada:** anular la factura de un pedido → el pedido vuelve a contar.
- [ ] Correr `cd apps/api && npx jest` completo → VERDE.
- [ ] Commit: `test(orders): e2e credit exposure — ORD-01, ORD-02, no double counting`.

---

## Riesgos y decisiones

- **Doble conteo (riesgo principal):** un pedido y su factura activa no deben sumar dos veces. Mitigado en dos capas: (1) `getCustomerExposure` excluye pedidos con factura activa vía `invoices: { none: { status: { not: anulada } } }`; (2) al facturar se pasa `excludeOrderId` por si la lectura del pedido y la creación de la factura conviven en la misma transacción. Ambos deben cubrirse con test (Task 1 y 3c/5).
- **Punto de enforcement:** el bloqueo NO va en `create` cuando nace `recibido` (borrador); va en `approveOrder`, en `updateStatus → orden_facturacion` y en `createInvoiceFromOrder`. Consistencia del monto: siempre `order.total` / `invoice.totalAmount` (CON IVA); eliminar el uso de `orderSubtotal` sin IVA de `create` L101.
- **Concurrencia:** validación dentro de `$transaction` (mitigación básica, igual que el diseño original); no se agrega locking.
- **Fuera de scope:** `getCreditAlerts` (solo facturas), devoluciones con nota crédito, persistir `availableCredit`.

# Crédito/Cupo — Exposición con pedidos pendientes — Design Spec

**Date:** 2026-07-16
**Status:** Draft
**Feature:** P0.3 · Branch `fix/qa-p0-seguridad-dinero`
**Cierra:** ORD-01 (permite pedido excediendo cupo), ORD-02 (no descuenta el crédito tras un pedido)

---

## 1. Overview

La validación de crédito ya existe (`apps/api/src/modules/credit/credit.service.ts` → `assertCreditLimit`) y **sí se invoca** en `OrdersService.create` (línea 101) y en la creación de factura (línea 315). El problema es **qué se cuenta como saldo**:

```ts
// credit.service.ts — getOpenInvoiceTotal()
where: { customerId, status: { notIn: ["pagada","anulada"] } }  // SOLO facturas
```

Es decir, la exposición del cliente = suma de **facturas** abiertas. Un pedido en estado `recibido`/`orden_facturacion` aún **no** genera factura, por lo que:

- **ORD-01:** un cliente con `creditLimit` pero sin facturas abiertas pasa la validación aunque tenga N pedidos pendientes por un monto enorme → `currentTotal = 0` → se permite exceder.
- **ORD-02:** el "crédito disponible" (`creditLimit − facturasAbiertas`) no se mueve al crear un pedido, porque el pedido no es factura todavía.

Objetivo: que la **exposición de crédito** incluya los pedidos que aún no se han facturado, sin doble-contar cuando el pedido pasa a factura.

### Decisiones de diseño

| Decisión | Valor (por defecto) |
|----------|---------------------|
| Definición de exposición | `exposición = facturasAbiertas + pedidosNoFacturados − devolucionesConNotaCrédito` |
| "Pedido no facturado" | Pedido **aprobado**, `status ∈ {orden_facturacion, despachado, en_transito, entregado}`, que **no** tiene una factura activa (`invoice.status ≠ anulada`). Un pedido en `recibido` es borrador y NO consume cupo. |
| Evitar doble conteo | Al facturar, el pedido pasa a estar "cubierto por factura"; se excluye de `pedidosNoFacturados` cualquier pedido con factura activa |
| Monto del pedido usado | `order.total` (con IVA) para comparar contra `creditLimit`, consistente con facturas (`totalAmount`) |
| ¿Desde qué estado cuenta? | **Confirmado (2026-07-16): desde orden aprobada** (`orden_facturacion` en adelante). `recibido` = borrador, no consume cupo. |
| Punto de enforcement | Se valida el crédito **al aprobar/avanzar** el pedido a `orden_facturacion` (y al facturar), no en `recibido`. En creación directa a un estado ya comprometido, también. |
| Reposición de crédito | Al cancelar/rechazar un pedido o registrar devolución con nota crédito, deja de contar automáticamente (es derivado, no un contador persistido) |
| Umbral de bloqueo | Si `exposición + montoPedido > creditLimit` → 400 |

### Fuera de scope

- Persistir un campo `availableCredit` en `Customer` (se mantiene **derivado** para no desincronizar).
- Reserva/bloqueo temporal de cupo por pedidos en borrador.
- Aging de cartera.

---

## 2. Data Model

Sin cambios de schema. Todo es cálculo derivado sobre `Order`, `Invoice`, `Return`.

---

## 3. API Layer

### 3.1 `CreditService` — nueva base de exposición

Reemplazar el uso de `getOpenInvoiceTotal` por `getCustomerExposure`:

```typescript
private async getCustomerExposure(
  customerId: string,
  tx?: Prisma.TransactionClient,
  opts?: { excludeOrderId?: string },
): Promise<Prisma.Decimal> {
  const client = tx ?? this.prisma;

  // 1) Facturas abiertas (como hoy)
  const invoiceAgg = await client.invoice.aggregate({
    where: { customerId, status: { notIn: ["pagada", "anulada"] } },
    _sum: { totalAmount: true },
  });

  // 2) Pedidos APROBADOS no facturados (sin factura activa)
  const orders = await client.order.findMany({
    where: {
      customerId,
      status: { in: ORDER_EXPOSURE_STATUSES },
      invoices: { none: { status: { not: "anulada" } } }, // sin factura activa
      ...(opts?.excludeOrderId ? { id: { not: opts.excludeOrderId } } : {}),
    },
    select: { total: true },
  });
  const ordersTotal = orders.reduce((s, o) => s.plus(o.total), new Prisma.Decimal(0));

  return new Prisma.Decimal(invoiceAgg._sum.totalAmount ?? 0).plus(ordersTotal);
}
```

`ORDER_EXPOSURE_STATUSES = [orden_facturacion, despachado, en_transito, entregado]` — **excluye `recibido`** (borrador, no comprometido) y excluye los pedidos con factura activa vía el `none`.

### 3.2 `assertCreditLimit` — usar exposición

```typescript
async assertCreditLimit(customerId, amount, tx?) {
  const customer = ...; // igual
  if (!customer.creditLimit || customer.creditLimit.lte(0)) return;
  const current = await this.getCustomerExposure(customerId, tx);
  if (current.plus(amount).gt(customer.creditLimit)) {
    const available = customer.creditLimit.minus(current);
    throw new BadRequestException(
      `Crédito excedido. Disponible: $${available.toFixed(0)}, Pedido: $${amount.toFixed(0)}`,
    );
  }
}
```

> **Importante en `createInvoiceFromOrder`:** al facturar un pedido ya contado en la exposición, se debe llamar `assertCreditLimit` **excluyendo ese pedido** (`getCustomerExposure(..., { excludeOrderId })`) para no contar el pedido y su factura a la vez. Ajustar la llamada de la línea 315 de `orders.service.ts`.

### 3.3 `getCreditSummary` — mismo criterio

`currentBalance` pasa a ser `getCustomerExposure(customerId)` (antes solo facturas), de modo que la ficha de cliente, el dashboard de alertas y el formulario de pedido muestren el **disponible real**. Esto además cierra ORD-02: al crear un pedido, `availableCredit` baja de inmediato.

### 3.4 Punto de enforcement: al aprobar/avanzar, no en `recibido`

Como un pedido en `recibido` no consume cupo, el bloqueo por crédito se mueve al momento en que el pedido **se compromete** (pasa a `orden_facturacion`):

- **`approveOrder`** (`orders.service.ts` línea 656): antes de setear `status: orden_facturacion`, llamar `assertCreditLimit(customerId, order.total, tx, { excludeOrderId: order.id })`. Si excede → 400 y no se aprueba.
- **`updateStatus`** hacia `orden_facturacion` (avance manual, línea 425): misma validación.
- **`createInvoiceFromOrder`** (línea 315): mantener la validación, excluyendo el propio pedido (ver §3.2).
- **`create`**: si el pedido se crea directamente en un estado ya comprometido (`orden_facturacion`+), validar en creación con `order.total`. Si nace en `recibido`, **no** se valida aún (es borrador). *(Nota: hoy `create` valida con `orderSubtotal` sin IVA en la línea 101; usar `total` con IVA para consistencia con la exposición.)*

### 3.5 Monto usado

Siempre `order.total` (con IVA), consistente con `invoice.totalAmount`.

---

## 4. Frontend

Reutiliza lo que ya existe del feature de crédito (2026-06-13):

- **Formulario de pedido:** ya consulta `GET /credit/customers/:id/summary` y deshabilita "Crear pedido" si excede. Como ahora el `summary` incluye pedidos pendientes, el disponible mostrado será el real y bloqueará antes → cierra ORD-01 visualmente y ORD-02 (el disponible baja tras cada pedido).
- **Ficha de cliente / dashboard alertas:** sin cambios de UI; el número cambia solo porque el backend ahora cuenta pedidos.

---

## 5. Validation Flow

```
Cliente: creditLimit = $10M, sin facturas, 1 pedido previo APROBADO (orden_facturacion) de $8M

Crear nuevo pedido de $4M (nace en 'recibido'):
  create() → status 'recibido' → NO se valida crédito aún (borrador)  ← "desde orden aprobada"

Aprobar ese pedido de $4M (recibido → orden_facturacion):
  approveOrder():
    assertCreditLimit(customerId, $4M, { excludeOrderId: estePedido }):
      exposure = facturasAbiertas($0) + pedidosAprobadosNoFacturados($8M) = $8M
      $8M + $4M = $12M > $10M → 400 "Crédito excedido. Disponible: $2.000.000, Pedido: $4.000.000"
  (antes: exposure solo miraba facturas = $0 → se aprobaba)  ← ORD-01 corregido

Facturar el pedido de $8M:
  createInvoiceFromOrder():
    assertCreditLimit(customerId, facturaTotal, { excludeOrderId: pedido })
      exposure excluye ese pedido para no doble-contar (pedido + su factura)
```

---

## 6. Edge Cases & Decisiones a confirmar

| Caso | Comportamiento |
|------|----------------|
| Pedido con factura anulada | Vuelve a contar como pedido no facturado (la anulada no cuenta) |
| Pedido y su factura activa | Cuenta **una vez** (la factura); el pedido se excluye por el `invoices: { none: ... }` |
| Cliente sin `creditLimit` o `= 0` | No se valida (igual que hoy) |
| Devolución con nota crédito | Reduce facturas abiertas vía `creditNoteTotal`/status; queda como mejora ligada a P1.4 (RET) |
| Concurrencia 2 pedidos | La validación va dentro de `$transaction`; mitigación básica (igual que el diseño de crédito original) |

**Resuelto (2026-07-16):**
1. La exposición cuenta **desde orden aprobada** (`orden_facturacion`+). `recibido` no compromete cupo. El bloqueo se aplica al aprobar/avanzar el pedido (§3.4).
2. La reposición es **automática** por ser exposición derivada: al cancelar/rechazar un pedido o registrar devolución con nota crédito, deja de sumar sin necesidad de un contador aparte.

---

## 7. Testing Checklist

### API (e2e / unit de `CreditService`)

- [ ] Pedido en `recibido` NO consume cupo (crear no bloquea); al **aprobar** (→ orden_facturacion) sí valida y bloquea al exceder (ORD-01).
- [ ] Pedidos aprobados no facturados suman a la exposición; los `recibido` no.
- [ ] `getCreditSummary.availableCredit` baja tras crear un pedido (ORD-02).
- [ ] Pedido con factura activa cuenta una sola vez (no doble).
- [ ] `createInvoiceFromOrder` excluye su propio pedido de la exposición.
- [ ] Pedido con factura anulada vuelve a contar.
- [ ] Cliente sin creditLimit → nunca bloquea.

### Frontend (Playwright)

- [ ] Form de pedido: disponible refleja pedidos pendientes; botón se bloquea al exceder.
- [ ] Tras crear un pedido, reabrir el form del mismo cliente muestra el disponible reducido.

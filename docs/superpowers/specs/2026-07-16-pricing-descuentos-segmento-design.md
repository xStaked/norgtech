# Descuentos por Segmento — Design Spec

**Date:** 2026-07-16
**Status:** Draft
**Feature:** P0.4 · Branch `fix/qa-p0-seguridad-dinero`
**Cierra:** QUO-01 (no trae descuento a clientes que superaron metas), QUO-02 (`Descuento: NaN%`), QUO-03 (subtotal/total sin descuento en el detalle), ORD-04 (subtotal/IVA/total del form no coinciden con el detalle)

---

## 1. Overview

El descuento por segmento **sí se aplica en el backend** (verificado):

- `quotes.service.ts` (líneas 30-81): `discountPercent = customer.segment.discountPercent`; `unitPrice = basePrice * (1 − d/100)`; guarda `discountPercent`, `originalUnitPrice`, `unitPrice`, `subtotal`; `total = subtotal`.
- `orders.service.ts` (líneas 103-197): igual, aplica el descuento del segmento al `unitPrice` de ítems de catálogo.

Los problemas son **de consistencia y de presentación**, no de que falte el cálculo:

1. **QUO-02 (`Descuento: NaN%`)** y **QUO-01**: el **formulario** de cotización no recibe/previsualiza el `discountPercent` del segmento del cliente, y calcula `Descuento` sobre un valor `undefined` → `NaN`. El descuento existe en el segmento pero el front no lo pide.
2. **QUO-03**: en el detalle, el subtotal/total se muestran sin reflejar el descuento **de forma visible** (no hay línea de descuento; el usuario ve `originalUnitPrice × cant` en su cabeza y no cuadra), o el front recompone con datos crudos.
3. **ORD-04**: el form de pedido muestra el `unitPrice` que **teclea el usuario**, pero el backend lo **recalcula** aplicando el descuento del segmento (líneas 129-134). Resultado: subtotal/IVA/total del formulario ≠ los del detalle guardado.

Root cause transversal: **el descuento del segmento se resuelve en dos lugares distintos (front “a ojo” vs. back real) y no hay un único preview autoritativo.**

### Decisiones de diseño

| Decisión | Valor (por defecto) |
|----------|---------------------|
| Fuente autoritativa del precio con descuento | **Backend**: un endpoint de *quote/order preview* que devuelve líneas ya calculadas (unitPrice con descuento, subtotal, IVA, total, discountPercent) |
| El front nunca calcula el descuento por su cuenta | Solo muestra lo que devuelve el preview / el detalle |
| Mostrar el descuento explícito | Sí: por ítem (`discountPercent`, `originalUnitPrice` tachado → `unitPrice`) y una línea "Descuento aplicado" en el resumen |
| Formato de porcentaje | 2 decimales, sin `NaN` (si no hay descuento → `0%`) — alinea con I18N-02 |
| ¿Descuento condicional a metas? | **Confirmado (2026-07-16): modo condicional (B).** El descuento del segmento aplica **solo cuando el cliente cumple la meta** de su segmento (ventas acumuladas ≥ `segment.minGoalAmount`). Si no la cumple, `discountPercent efectivo = 0`. |
| Ventana de "ventas acumuladas" | **Supuesto:** año en curso (YTD) por `orderDate`, sumando `order.total` de pedidos en estados `facturado…entregado`. *(confirmar la ventana — ver §6)* |

### Fuera de scope

- Descuentos por ítem manuales (override por línea) más allá del de segmento.
- Reasignación automática de segmento según ventas (si se confirma el modo condicional, se especifica en su propio task).

---

## 2. Data Model

Sin cambios. Ya existen: `CustomerSegment.discountPercent/minGoalAmount/maxGoalAmount`, `QuoteItem.discountPercent/originalUnitPrice/unitPrice/subtotal`, `OrderItem.discountPercent/originalUnitPrice/unitPrice/...`. `Quote.subtotal/total`, `Order.subtotal/total`.

> Nota: `Quote.total = subtotal` hoy (sin IVA en cotización). Se mantiene salvo que se pida IVA en cotización (fuera de scope).

---

## 3. API Layer

### 3.1 Endpoint de preview (autoritativo)

`POST /quotes/preview` y `POST /orders/preview` (o un `pricing.service.ts` compartido) que reciben `{ customerId, items:[{productId|custom, quantity, unitPrice?, taxPercent?}] }` y devuelven:

```typescript
interface PricedLine {
  productId: string | null;
  name: string;
  quantity: number;
  originalUnitPrice: number | null;
  discountPercent: number;      // del segmento (o 0)
  unitPrice: number;            // ya con descuento
  taxPercent: number;
  taxAmount: number;
  subtotal: number;
  totalWithTax: number;
}
interface PricingPreview {
  segmentName: string | null;
  discountPercent: number;      // nunca NaN
  lines: PricedLine[];
  subtotal: number;
  taxAmount: number;
  total: number;
  discountAmount: number;       // sum(original − conDescuento) × cant
}
```

La lógica es **la misma** que ya está en `quotes.service.create`/`orders.service.create`, **extraída** a un `PricingService` para que preview y create usen exactamente el mismo cálculo (garantiza que form = detalle → cierra ORD-04, QUO-03).

### 3.1.1 Descuento efectivo condicional a la meta (modo B)

El `PricingService` calcula un `effectiveDiscountPercent` **antes** de valorar las líneas:

```typescript
async resolveSegmentDiscount(customer): Promise<{ discountPercent: Decimal; meetsGoal: boolean }> {
  const seg = customer.segment;
  if (!seg || seg.discountPercent.lte(0)) return { discountPercent: 0, meetsGoal: false };

  // ventas acumuladas del cliente (YTD, estados facturado…entregado)
  const { start, end } = currentYearRange();
  const agg = await prisma.order.aggregate({
    where: { customerId: customer.id, status: { in: PROGRESS_STATUSES }, orderDate: { gte: start, lte: end } },
    _sum: { total: true },
  });
  const salesYTD = new Decimal(agg._sum.total ?? 0);

  const meetsGoal = salesYTD.gte(seg.minGoalAmount);
  return { discountPercent: meetsGoal ? seg.discountPercent : new Decimal(0), meetsGoal };
}
```

`priceLines` usa `effectiveDiscountPercent` (0 si el cliente no cumple la meta) en lugar de `customer.segment.discountPercent` directo. Esto es el cambio central respecto al código actual, que aplica el descuento **incondicionalmente** (`quotes.service.ts` línea 30, `orders.service.ts` línea 103).

El `PricingPreview` incluye `meetsGoal: boolean` y (opcional) `salesYTD` / `goalThreshold` para que el front pueda explicar por qué hay o no descuento ("Faltan $X en compras para el descuento").

### 3.2 Refactor `quotes.service` y `orders.service`

- Extraer el bloque de cálculo de líneas a `PricingService.priceLines(customer, items)`.
- `create` de quotes/orders llama a `priceLines` (misma salida que el preview) → imposible que diverjan.
- El detalle de la cotización/pedido debe devolver también `discountPercent` y `originalUnitPrice` por ítem (ya se guardan) para que el front muestre el descuento.

---

## 4. Frontend

### 4.1 Formulario de cotización (`apps/web/src/app/(app)/quotes/new`)

- Al seleccionar cliente, mostrar `Segmento: X · Descuento: Y%` leyendo del preview (o de `GET /customers/:id` con su segmento). **Nunca** calcular el % en el front → elimina `NaN` (QUO-02).
- Al agregar/editar ítems, llamar `POST /quotes/preview` (debounce) y renderizar líneas + resumen con: subtotal, descuento aplicado, total. → QUO-01, QUO-03.

### 4.2 Formulario de pedido (`orders/new`)

- Igual: usar `POST /orders/preview` para que el subtotal/IVA/total mostrados **sean los que se guardarán**. → ORD-04.
- Mostrar por ítem: precio base tachado → precio con descuento.

### 4.3 Detalle de cotización/pedido

- Renderizar la línea "Descuento (Y%)" y que subtotal/total mostrados salgan del registro guardado (que ya tiene el descuento). → QUO-03.

---

## 5. Validation Flow

```
Cliente segmento "Oro" (discountPercent 10%, minGoalAmount $30M), item basePrice $100 × 5

Caso A — cliente CUMPLE la meta (ventas YTD $45M ≥ $30M):
  resolveSegmentDiscount → { discountPercent: 10, meetsGoal: true }
  POST /quotes/preview → { discountPercent: 10, meetsGoal: true, lines:[{ originalUnitPrice:100, unitPrice:90, subtotal:450 }], subtotal:450, discountAmount:50 }
  Front: Descuento: 10.00% · Subtotal $450 (antes $500)
  create usa el mismo PricingService → detalle muestra $450  ← form == detalle (QUO-03/ORD-04)

Caso B — cliente NO cumple la meta (ventas YTD $12M < $30M):
  resolveSegmentDiscount → { discountPercent: 0, meetsGoal: false }
  preview → { discountPercent: 0, meetsGoal: false, subtotal: 500, discountAmount: 0 }
  Front: Descuento: 0.00% (no NaN) · Subtotal $500   ← QUO-01/QUO-02
```

---

## 6. Decisión — RESUELTA (con una sub-decisión menor)

**Modo del descuento (QUO-01) — Confirmado (2026-07-16): modo B (condicional).** El descuento aplica **solo cuando el cliente cumple la meta** de su segmento: ventas acumuladas ≥ `segment.minGoalAmount`. Si no la cumple → 0%. Implementado en `PricingService.resolveSegmentDiscount` (§3.1.1).

**Sub-decisión pendiente — ventana de "ventas acumuladas":**
- (por defecto) **Año en curso (YTD)** por `orderDate`, estados `facturado…entregado`.
- Alternativas: últimos 12 meses móviles; o el periodo de la `CustomerGoal` del cliente si se quiere atar a la meta individual en vez del umbral del segmento.

Confirmar la ventana; el resto del diseño no cambia, solo el rango de fechas en `resolveSegmentDiscount`.

---

## 7. Testing Checklist

### API

- [ ] `POST /quotes/preview` con cliente con segmento → `discountPercent` correcto, `lines` con descuento, `discountAmount` correcto, **nunca NaN**.
- [ ] Cliente sin segmento/descuento 0 → `discountPercent: 0`, precios sin cambio.
- [ ] `quotes.create` produce exactamente los mismos totales que `preview` (mismo `PricingService`).
- [ ] `orders.create` produce los mismos totales que `orders/preview` (ORD-04).
- [ ] **Modo B:** cliente con ventas YTD < `segment.minGoalAmount` → `discountPercent: 0`, `meetsGoal: false`; cliente con ventas ≥ umbral → descuento del segmento, `meetsGoal: true`.
- [ ] Justo en el umbral (ventas == `minGoalAmount`) → cumple (≥).

### Frontend (Playwright)

- [ ] Form de cotización muestra "Descuento: 10.00%" (no `NaN%`).
- [ ] Resumen del form == detalle guardado (subtotal/total).
- [ ] Form de pedido: subtotal/IVA/total del form coinciden con el detalle tras crear.

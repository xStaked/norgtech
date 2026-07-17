# Descuentos por Segmento — Implementation Plan

**Date:** 2026-07-16
**Spec:** `/tmp/2026-07-16-pricing-descuentos-segmento-design.md`
**Branch:** `fix/qa-p0-seguridad-dinero`
**Merge base:** TBD
**Cierra:** QUO-01, QUO-02, QUO-03, ORD-04

**Tests API:** `cd apps/api && npx jest`
**Tests front:** `cd apps/web && npx playwright test`

---

## Principios (no negociables)

1. **Un único cálculo autoritativo en el backend.** Toda valoración de líneas (descuento efectivo, `unitPrice`, `subtotal`, IVA, totales) vive en `PricingService`. `quotes.service.create`, `orders.service.create` y los endpoints de preview lo consumen. **Ningún** camino recalcula precios por su cuenta.
2. **El front nunca calcula el descuento.** Solo renderiza lo que devuelve `POST /quotes/preview` / `POST /orders/preview` (formularios) o el registro guardado (detalle).
3. **Descuento condicional a la meta (modo B).** El `discountPercent` del segmento aplica solo si `salesYTD ≥ segment.minGoalAmount`; si no, `0`. Nunca `NaN`.
4. **Dinero con `Prisma.Decimal`.** Nada de `number` en el cálculo; redondeo `toDecimalPlaces(2)` en el mismo punto que hoy.
5. **Prosa en español, código en inglés.**

### Realidades del código que condicionan el plan (verificadas)

- `QuoteItem` **no tiene** columnas de impuesto (`unitPrice`, `subtotal`, `originalUnitPrice`, `discountPercent` y nada más). `Quote.total = subtotal` (sin IVA en cotización). El `PricingService`, para el flujo *quote*, produce `taxPercent = 0`, `taxAmount = 0`, `totalWithTax = subtotal`.
- `OrderItem` **sí tiene** `taxPercent` (default 19), `taxAmount`, `totalWithTax`. `Order.total = Σ totalWithTax`.
- `OrderStatus` = `recibido | orden_facturacion | facturado | despachado | en_transito | entregado`. Estados "facturado…entregado" para acumular ventas = `[facturado, despachado, en_transito, entregado]`.
- Hoy el descuento se aplica **incondicional**: `quotes.service.ts:30` y `orders.service.ts:103` toman `customer.segment.discountPercent` directo. El cambio central es sustituir eso por el `effectiveDiscountPercent` condicional.
- `orders.service.create` recalcula `unitPrice` de ítems de catálogo (líneas 129-134) e **ignora** el `item.unitPrice` que teclea el usuario para productos con `productId` → de ahí ORD-04. Los ítems custom (sin `productId`) sí respetan `item.unitPrice`.
- `Customer.segmentId` es **obligatorio** (no nullable). "Sin segmento" en la práctica significa `discountPercent = 0`; aun así el código debe tolerar `segment == null` defensivamente (nunca `NaN`).

---

## Módulo y archivos nuevos / tocados

Se crea un **módulo compartido** `pricing` para no acoplar quotes↔orders:

```
apps/api/src/modules/pricing/
  pricing.module.ts          (nuevo)  exports: [PricingService]
  pricing.service.ts         (nuevo)  usa PrismaService
  pricing.types.ts           (nuevo)  PricedLine, PricingPreview, PriceLineInput
  pricing.service.spec.ts    (nuevo)  unit tests
apps/api/src/modules/quotes/
  quotes.module.ts           (editar) imports: [PricingModule]
  quotes.service.ts          (editar) create() usa PricingService.priceLines
  quotes.controller.ts       (editar) POST /quotes/preview
  dto/preview-quote.dto.ts   (nuevo)
  quotes.preview.spec.ts     (nuevo)  e2e/service test
apps/api/src/modules/orders/
  orders.module.ts           (editar) imports: [PricingModule]
  orders.service.ts          (editar) create() usa PricingService.priceLines
  orders.controller.ts       (editar) POST /orders/preview
  dto/preview-order.dto.ts   (nuevo)
  orders.preview.spec.ts     (nuevo)
apps/web/src/... (quotes/new, orders/new, detalle)  (editar) consumir preview
```

### Interfaces (`pricing.types.ts`)

```typescript
import { Prisma } from "@prisma/client";

export interface PriceLineInput {
  productId?: string | null;
  productName?: string | null;  // solo custom
  quantity: number;
  unitPrice?: number;           // solo custom / ignorado si productId
  taxPercent?: number;          // orders; quotes lo ignora (fuerza 0)
  presentation?: string | null;
  notes?: string | null;
}

export interface PricedLine {
  productId: string | null;
  name: string;
  quantity: number;
  originalUnitPrice: number | null;
  discountPercent: number;      // efectivo (del segmento o 0)
  unitPrice: number;            // ya con descuento
  taxPercent: number;
  taxAmount: number;            // por unidad, como en orders.service hoy
  subtotal: number;
  totalWithTax: number;
}

export interface PricingPreview {
  segmentName: string | null;
  discountPercent: number;      // efectivo, nunca NaN
  meetsGoal: boolean;
  salesYTD: number;
  goalThreshold: number;
  lines: PricedLine[];
  subtotal: number;
  taxAmount: number;
  total: number;
  discountAmount: number;       // Σ (original − conDescuento) × cantidad
}

export type PricingMode = "quote" | "order";
```

> Nota de contrato interno: `priceLines` devuelve la **misma forma de fila** que hoy construye `itemsWithSnapshot` en cada `create` (mismos nombres de campo: `productSnapshotName`, `unit`, etc.), para que el `tx.*.create({ items: { create } })` no cambie. La proyección a `PricedLine` (para el preview y el front) es una vista derivada de esa fila. Se documenta en `pricing.types.ts` como `RawQuoteItem` / `RawOrderItem`.

---

## Task 1 — `PricingService`: descuento condicional + valoración de líneas

**Files:** `pricing.service.ts`, `pricing.types.ts`, `pricing.module.ts`, `pricing.service.spec.ts`
**Interfaces:** `resolveSegmentDiscount(customer)`, `priceLines(customer, items, mode)`, `buildPreview(customer, items, mode)`

- [ ] Escribir test que falla: `pricing.service.spec.ts` cubriendo `resolveSegmentDiscount`:
  - cliente con segmento `discountPercent=10, minGoalAmount=30_000_000` y `salesYTD=45_000_000` → `{ discountPercent: 10, meetsGoal: true }`.
  - mismo cliente con `salesYTD=12_000_000` → `{ discountPercent: 0, meetsGoal: false }`.
  - **umbral exacto** `salesYTD == minGoalAmount` → `meetsGoal: true` (comparación `gte`).
  - `segment == null` → `{ discountPercent: 0, meetsGoal: false }`, y ninguna aserción produce `NaN` (assert `Number.isNaN(...) === false`).
  - `segment.discountPercent <= 0` → `{ discountPercent: 0, meetsGoal: false }` sin consultar ventas.
  - Mock de `prisma.order.aggregate` para `_sum.total`; verificar el `where` (customerId, `status in [facturado,despachado,en_transito,entregado]`, `orderDate` dentro de `[inicio-de-año, ahora]`).
- [ ] Escribir test que falla para `priceLines` (modo `quote`, sin tax):
  - cliente cumple meta, producto `basePrice=100`, `quantity=5` → línea `originalUnitPrice=100, discountPercent=10, unitPrice=90, subtotal=450, taxPercent=0, totalWithTax=450`.
  - cliente NO cumple → `unitPrice=100, subtotal=500, discountPercent=0`.
  - ítem custom (sin `productId`) → respeta `item.unitPrice`, `discountPercent=0` (null en raw), nunca descuenta.
- [ ] Escribir test que falla para `priceLines` (modo `order`, con tax 19): comprueba `taxAmount = round(unitPrice*19/100, 2)` por unidad y `totalWithTax = quantity*(unitPrice+taxAmount)` — **idéntico** a `orders.service.ts:135-139`.
- [ ] Correr: `cd apps/api && npx jest pricing.service` → rojo (servicio no existe).
- [ ] Implementar `pricing.module.ts`:

```typescript
import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { PricingService } from "./pricing.service";

@Module({ imports: [PrismaModule], providers: [PricingService], exports: [PricingService] })
export class PricingModule {}
```

- [ ] Implementar `pricing.service.ts`. Constantes y ventana:

```typescript
import { Injectable } from "@nestjs/common";
import { OrderStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

const PROGRESS_STATUSES: OrderStatus[] = [
  OrderStatus.facturado, OrderStatus.despachado, OrderStatus.en_transito, OrderStatus.entregado,
];

function currentYearRange(now = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0));
  return { start, end: now };
}

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveSegmentDiscount(customer: { id: string; segment: { discountPercent: Prisma.Decimal; minGoalAmount: Prisma.Decimal } | null }) {
    const seg = customer.segment;
    const zero = new Prisma.Decimal(0);
    if (!seg || new Prisma.Decimal(seg.discountPercent).lte(0)) {
      return { discountPercent: zero, meetsGoal: false, salesYTD: zero, goalThreshold: seg ? new Prisma.Decimal(seg.minGoalAmount) : zero };
    }
    const { start, end } = currentYearRange();
    const agg = await this.prisma.order.aggregate({
      where: { customerId: customer.id, status: { in: PROGRESS_STATUSES }, orderDate: { gte: start, lte: end } },
      _sum: { total: true },
    });
    const salesYTD = new Prisma.Decimal(agg._sum.total ?? 0);
    const goalThreshold = new Prisma.Decimal(seg.minGoalAmount);
    const meetsGoal = salesYTD.gte(goalThreshold);
    return { discountPercent: meetsGoal ? new Prisma.Decimal(seg.discountPercent) : zero, meetsGoal, salesYTD, goalThreshold };
  }
}
```

- [ ] Implementar `priceLines(customer, items, mode)` extrayendo **literalmente** la lógica de `orders.service.ts:118-188` (la variante con tax) y de `quotes.service.ts:32-75` (sin tax), pero usando `effectiveDiscount = (await resolveSegmentDiscount(customer)).discountPercent` en lugar del `discountPercent` incondicional. Diferencias por `mode`: en `quote`, `taxPercent=0`, `taxAmount=0`, `totalWithTax=subtotal`; en `order`, `taxPercent = item.taxPercent ?? 19`. Los ítems custom conservan `item.unitPrice` y `discountPercent=null` en la fila raw. Devolver `{ rawItems, effectiveDiscount, meetsGoal, ... }` para que `create` inserte `rawItems` sin transformar.
- [ ] Implementar `buildPreview(customer, items, mode): PricingPreview` que llama `priceLines`, agrega `subtotal/taxAmount/total/discountAmount`, y proyecta cada raw a `PricedLine` (Decimals → `number` con `.toNumber()`), fijando `discountPercent` del preview al efectivo (nunca `NaN`; si no hay, `0`).
- [ ] Correr: `npx jest pricing.service` → verde.
- [ ] Commit: `feat(pricing): PricingService with conditional segment discount and priceLines`

**Riesgo:** este servicio es el punto único de verdad; un error de redondeo o de estados en la ventana YTD se propaga a los cuatro caminos. Mitigado por los tests de umbral (`==`), sin-segmento (`NaN`) y paridad de fórmula con el código actual.

---

## Task 2 — Endpoints de preview `POST /quotes/preview` y `POST /orders/preview`

**Files:** `quotes.controller.ts`, `dto/preview-quote.dto.ts`, `orders.controller.ts`, `dto/preview-order.dto.ts`, `quotes.module.ts`, `orders.module.ts`, `quotes.preview.spec.ts`, `orders.preview.spec.ts`
**Interfaces:** `previewQuote(dto): PricingPreview`, `previewOrder(dto): PricingPreview`

- [ ] Escribir test que falla (`quotes.preview.spec.ts`): `POST /quotes/preview` con `{ customerId, items:[{productId, quantity:5}] }`, cliente que cumple meta → `discountPercent=10`, `meetsGoal=true`, `lines[0].unitPrice=90`, `subtotal=450`, `discountAmount=50`; y assert `Number.isNaN(body.discountPercent) === false`.
- [ ] Escribir test que falla: cliente sin descuento / no cumple → `discountPercent=0`, `subtotal=500`, `discountAmount=0`, `meetsGoal=false`.
- [ ] Escribir test análogo (`orders.preview.spec.ts`) validando IVA: `taxAmount`, `total = Σ totalWithTax` coherentes.
- [ ] Correr: `npx jest preview` → rojo (ruta 404).
- [ ] Implementar DTOs (mismos validadores `class-validator` que `CreateQuoteDto`/`CreateOrderDto` pero solo `customerId` + `items`; sin campos de creación).
- [ ] Implementar handlers en los controllers (mismo guard/auth que `create`), delegando a `pricingService.buildPreview(customer, dto.items, mode)`. Cargar `customer` con `include: { segment: true }` y lanzar `NotFoundException` si no existe (reutilizar el patrón de `create`).
- [ ] Registrar `PricingModule` en `quotes.module.ts` y `orders.module.ts`.
- [ ] Correr: `npx jest preview` → verde.
- [ ] Commit: `feat(quotes,orders): authoritative pricing preview endpoints`

---

## Task 3 — Refactor `quotes.service.create` y `orders.service.create` (cierra ORD-04 / QUO-03)

**Files:** `quotes.service.ts`, `orders.service.ts`, `quotes.service.spec.ts`, `orders.service.spec.ts`
**Interfaces:** `create()` reutiliza `priceLines` (misma salida que `buildPreview`).

- [ ] Escribir test que falla (`orders.service.spec.ts`): dado el mismo `{customerId, items}`, `orders.service.create` produce `subtotal/total` **idénticos** a `POST /orders/preview` (misma fuente). Caso cliente que cumple y caso que no cumple.
- [ ] Escribir test que falla: item con `productId` y `unitPrice` tecleado por el usuario distinto del `basePrice` → el pedido guardado usa `basePrice*(1-d/100)`, no el tecleado (ORD-04: el detalle refleja lo autoritativo, y el preview ya se lo mostró al usuario antes de guardar).
- [ ] Escribir test que falla (`quotes.service.spec.ts`): `quotes.create` totales == `POST /quotes/preview` (QUO-03).
- [ ] Correr: `npx jest quotes.service orders.service` → rojo.
- [ ] Implementar en `quotes.service.ts`: reemplazar el bloque `discountPercent = customer.segment?.discountPercent ...` (línea 30) y el `Promise.all(dto.items.map(...))` (líneas 32-75) por:

```typescript
const priced = await this.pricing.priceLines(customer, dto.items, "quote");
const itemsWithSnapshot = priced.rawItems;
const subtotal = priced.subtotal;   // Prisma.Decimal
const total = subtotal;             // sin IVA en cotización (igual que hoy)
```

  Inyectar `PricingService` en el constructor. Conservar la validación de `product not found` dentro de `priceLines` (se traslada tal cual).
- [ ] Implementar en `orders.service.ts`: reemplazar `discountPercent` (línea 103) y el `Promise.all` (118-188) por `const priced = await this.pricing.priceLines(customer, dto.items, "order")`. Mantener **antes** del pricing la validación de crédito, pero recalcular `orderSubtotal` para el chequeo de crédito con el **subtotal ya descontado** (`priced.subtotal`) — hoy usa `item.unitPrice` crudo (línea 93-99), lo que además es inconsistente; el plan lo alinea al subtotal autoritativo. `subtotal = priced.subtotal`, `total = priced.total`.
- [ ] Correr: `npx jest quotes.service orders.service` → verde. Correr suite completa `npx jest` para regresiones (facturación depende de `order.total`).
- [ ] Commit: `refactor(quotes,orders): create() uses PricingService — form == detalle (ORD-04, QUO-03)`

**Riesgo (el mayor del plan):** `create` es código en producción con transacción, auditoría y (en orders) crédito + numeración + WhatsApp. Extraer el bloque de valoración a un servicio compartido toca el corazón de dos servicios. Mitigación: (1) `priceLines` devuelve la **misma forma** de `rawItems` que hoy, así el `tx.create` no cambia; (2) tests de paridad preview==create como red de seguridad; (3) mover la validación de crédito para usar el subtotal descontado es un cambio de comportamiento intencional — señalarlo en la descripción del PR para revisión explícita.

---

## Task 4 — Frontend: consumir preview (cotización, pedido y detalle)

**Files:** `apps/web/src/app/(app)/quotes/new/*`, `apps/web/src/app/(app)/orders/new/*`, componentes de detalle de quote/order, cliente API.
**Interfaces:** hook `usePricingPreview(mode, customerId, items)` con debounce.

- [ ] Escribir test Playwright que falla (`quotes/new`): al seleccionar cliente que cumple meta y agregar 5×producto, la UI muestra `Descuento: 10.00%` (regex `\d+\.\d{2}%`, nunca `NaN`), precio base tachado → precio con descuento, y resumen `Subtotal 450`.
- [ ] Escribir test Playwright que falla (`orders/new`): subtotal/IVA/total mostrados en el form == los del detalle tras crear (ORD-04).
- [ ] Escribir test Playwright que falla: cliente que NO cumple meta → `Descuento: 0.00%`, subtotal sin descuento, sin `NaN`.
- [ ] Correr: `cd apps/web && npx playwright test` → rojo.
- [ ] Implementar hook que hace `POST /quotes/preview` | `/orders/preview` con **debounce** (~300 ms) ante cambios de `customerId`/`items`; estado `preview: PricingPreview`.
- [ ] Formulario: al elegir cliente mostrar `Segmento: {segmentName} · Descuento: {discountPercent.toFixed(2)}%` **leído del preview** (si aún no hay líneas, preview con `items:[]` o `GET /customers/:id` — pero el `%` siempre del backend, nunca calculado). Renderizar líneas con `originalUnitPrice` tachado → `unitPrice`, y resumen con `subtotal`, línea "Descuento aplicado {discountAmount}", `total`. Formato: `Intl.NumberFormat` es-CO, porcentaje 2 decimales, fallback `0.00%` si `undefined` (defensa extra anti-NaN).
- [ ] Detalle de cotización/pedido: renderizar por ítem `discountPercent`/`originalUnitPrice` (ya guardados) y una línea "Descuento (Y%)"; subtotal/total salen del registro guardado. Opcional: banner "Faltan ${goalThreshold - salesYTD} para el descuento" cuando `meetsGoal=false`.
- [ ] Eliminar cualquier cálculo de `%` o de precio con descuento que exista hoy en el front (raíz de QUO-02): buscar y borrar. El front solo formatea.
- [ ] Correr: `npx playwright test` → verde.
- [ ] Commit: `feat(web): quote/order forms consume authoritative pricing preview (QUO-01,QUO-02)`

---

## Task 5 — Verificación end-to-end (cumple / no cumple)

**Files:** `pricing.e2e.spec.ts` (API) + checklist manual del §7 de la spec.

- [ ] Escribir test integrado que falla: seed cliente segmento "Oro" (`discountPercent=10, minGoalAmount=30_000_000`).
  - **Caso A (cumple):** seed pedidos en estados `facturado…entregado` sumando `total ≥ 30M` YTD → `preview` y `create` de quote y order dan `discountPercent=10`, `meetsGoal=true`, líneas descontadas; totales quote==preview y order==preview.
  - **Caso B (no cumple):** ventas YTD `< 30M` → `discountPercent=0`, `meetsGoal=false`, precios base, `discountAmount=0`, nunca `NaN`.
  - **Umbral:** ventas `== 30M` → cumple.
  - **Ventana:** pedido `entregado` con `orderDate` del año anterior **no** cuenta; pedido en estado `recibido`/`orden_facturacion` **no** cuenta.
- [ ] Correr: `cd apps/api && npx jest pricing.e2e` → verde. Suite completa `npx jest` verde. `cd apps/web && npx playwright test` verde.
- [ ] Recorrer manualmente el Testing Checklist (§7 de la spec): API 6 casos + Frontend 3 casos.
- [ ] Commit: `test(pricing): e2e conditional discount (meets/not-meets goal, threshold, YTD window)`

---

## Decisiones pendientes de confirmar (no bloquean el plan)

- **Ventana de ventas acumuladas:** por defecto **YTD por `orderDate`**, estados `facturado…entregado`. Alternativas (12 meses móviles; periodo de `CustomerGoal`) solo cambian `currentYearRange`/el `where` en `resolveSegmentDiscount` — un único punto. Dejar `currentYearRange` aislada y con test para poder pivotar barato.
- **Validación de crédito con subtotal descontado:** el plan alinea `assertCreditLimit` al subtotal autoritativo (hoy usa `item.unitPrice` crudo). Confirmar en revisión del PR.

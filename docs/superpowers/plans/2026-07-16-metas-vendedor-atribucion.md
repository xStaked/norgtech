# Metas del Vendedor (atribución) — Implementation Plan

**Date:** 2026-07-16
**Spec:** `/tmp/2026-07-16-metas-vendedor-atribucion-design.md`
**Feature:** P0.6 · `metas-vendedor-atribucion`
**Branch:** `fix/qa-p0-seguridad-dinero`
**Merge base:** TBD (fijar `git merge-base main fix/qa-p0-seguridad-dinero` antes de abrir el PR)
**Depende de:** P0.4 (pricing) — el monto de la meta es `order.total` con el descuento de segmento ya aplicado en `orders.service.create` (líneas 129-139).

**Comandos de test**
- API: `cd apps/api && npx jest`
- Front (E2E): `cd apps/web && npx playwright test`

**Regla transversal:** existe **una sola fuente de verdad** para "vendedor del pedido": `Order.sellerUserId`. El detalle del pedido (`order.seller.name`) y la atribución de metas (`seller-goals`) leen exactamente ese campo. El monto que suma a la meta es siempre `order.total`.

**Convención:** prosa en español, identificadores y código en inglés.

> Nota de rutas: el upload staged solo incluye los tres archivos de API citados con números de línea reales. Las rutas de `create-order.dto.ts`, el formulario web y el detalle web se marcan como **(verificar ruta)** — confirmar contra el árbol real del repo al ejecutar la task; las líneas de `orders.service.ts`, `seller-goals.service.ts` y `schema.prisma` sí son reales.

---

## Task 1 — Migración Prisma: `Order.sellerUserId` + relación `OrderSeller`

**Objetivo:** añadir el campo y la relación sin romper el schema existente.

**Files**
- `apps/api/prisma/schema.prisma` (modelos `Order` líneas 653-720, `User` líneas 247-273)
- `apps/api/prisma/migrations/<timestamp>_add_order_seller/migration.sql` (generado)

**Interfaces (schema final)**
```prisma
model Order {
  // ... campos actuales ...
  sellerUserId String?
  seller       User?  @relation("OrderSeller", fields: [sellerUserId], references: [id])
  // índice nuevo junto a los @@index existentes (líneas 718-719)
  @@index([sellerUserId])
}

model User {
  // ... relaciones actuales; `assignedOrders Order[]` está en la línea 258 ...
  soldOrders Order[] @relation("OrderSeller")
}
```

**Steps**
- [ ] Escribir test que falla: `apps/api/test/prisma-seller-order.spec.ts` — instancia `PrismaClient` de test y verifica que `prisma.order.fields.sellerUserId` existe y que `Prisma.OrderScalarFieldEnum.sellerUserId` está definido (compila-falla mientras el campo no exista). Alternativa mínima: un test de tipos que use `select: { sellerUserId: true, seller: { select: { id: true } } }`.
- [ ] `cd apps/api && npx jest prisma-seller-order` → rojo (campo inexistente).
- [ ] Implementar: en `schema.prisma` añadir a `Order` (bajo `assignedLogisticsUser`, línea 709) `sellerUserId String?` y `seller User? @relation("OrderSeller", fields: [sellerUserId], references: [id])`; añadir `@@index([sellerUserId])` en el bloque de índices (líneas 718-719). En `User` (junto a `assignedOrders`, línea 258) añadir `soldOrders Order[] @relation("OrderSeller")`.
- [ ] Generar migración: `cd apps/api && npx prisma migrate dev --name add_order_seller --create-only`, revisar el SQL (debe ser `ALTER TABLE "Order" ADD COLUMN "sellerUserId" TEXT;` + FK a `User(id)` + `CREATE INDEX`), luego `npx prisma migrate dev` y `npx prisma generate`.
- [ ] `cd apps/api && npx jest prisma-seller-order` → verde.
- [ ] Commit: `feat(orders): add Order.sellerUserId + OrderSeller relation (P0.6)`

**Notas**
- `sellerUserId` es opcional (`String?`) → no requiere default; los pedidos existentes quedan `NULL` hasta el backfill (Task 4).
- No usar `onDelete` restrictivo: un vendedor puede desactivarse; mantener la FK nullable sin cascade.

---

## Task 2 — `orders.service.create`: persistir `sellerUserId` con precedencia + helper compartido `isEligibleSeller`

**Objetivo:** al crear un pedido, resolver y guardar `sellerUserId` con la regla `dto.sellerUserId ?? customer.assignedToUserId ?? (creador si es seller elegible)`. Extraer la regla de elegibilidad a un helper reutilizable por `seller-goals`.

**Files**
- `apps/api/src/modules/orders/orders.service.ts` (`create`, líneas 55-272)
- `apps/api/src/modules/orders/dto/create-order.dto.ts` **(verificar ruta)** — añadir `sellerUserId?: string`
- `apps/api/src/modules/sellers/seller-eligibility.ts` (nuevo helper compartido)
- `apps/api/src/modules/seller-goals/seller-goals.service.ts` (refactor de `ensureEligibleSeller`, líneas 223-237)

**Interfaces**
```ts
// seller-eligibility.ts — regla única (roles comercial/director_comercial + active)
export const SELLER_ROLES: UserRole[] = [UserRole.comercial, UserRole.director_comercial];

export function isEligibleSeller(
  user: Pick<User, "active" | "role"> | null | undefined,
): boolean {
  return !!user && user.active && SELLER_ROLES.includes(user.role);
}
```

```ts
// create-order.dto.ts
@IsOptional()
@IsString()
sellerUserId?: string;
```

**Steps**
- [ ] Escribir test que falla: `apps/api/src/modules/orders/orders.service.spec.ts` con 3 casos de precedencia:
  1. `dto.sellerUserId = 'u-explicit'` (seller elegible) → order guardado con `sellerUserId = 'u-explicit'`.
  2. `dto.sellerUserId` ausente, `customer.assignedToUserId = 'u-assigned'` → `sellerUserId = 'u-assigned'`.
  3. `dto.sellerUserId` y `customer.assignedToUserId` ausentes, creador `user.id = 'u-creator'` con rol `comercial` activo → `sellerUserId = 'u-creator'`; y variante creador `administrador` → `sellerUserId = null`.
  (Mock de `prisma.customer.findUnique`, `prisma.user.findUnique`, `prisma.order.create`; aserción sobre el `data.sellerUserId` recibido por `order.create`.)
- [ ] `cd apps/api && npx jest orders.service` → rojo.
- [ ] Implementar:
  - Crear `seller-eligibility.ts` con `SELLER_ROLES` + `isEligibleSeller` (copiar la regla exacta de `ensureEligibleSeller`, líneas 232-234).
  - En `create-order.dto.ts` añadir `sellerUserId?: string` (opcional, validado).
  - En `orders.service.create`, tras la validación de `assignedLogisticsUserId` (líneas 89-91) y antes del `$transaction` (línea 199), resolver:
    ```ts
    let sellerUserId = dto.sellerUserId ?? customer.assignedToUserId ?? null;
    if (dto.sellerUserId) {
      // validar que el vendedor elegido existe y es seller elegible
      const chosen = await this.prisma.user.findUnique({ where: { id: dto.sellerUserId } });
      if (!isEligibleSeller(chosen)) {
        throw new BadRequestException("Selected seller is not an active eligible seller");
      }
    } else if (!sellerUserId) {
      const creator = await this.prisma.user.findUnique({ where: { id: user.id } });
      sellerUserId = isEligibleSeller(creator) ? user.id : null;
    }
    ```
  - Añadir `sellerUserId,` al objeto `data` de `tx.order.create` (junto a `createdBy`/`updatedBy`, líneas 244-245).
  - Añadir `seller: { select: { id: true, name: true } }` al `include` del `create` (líneas 250-256) para que la respuesta ya traiga el vendedor.
- [ ] `cd apps/api && npx jest orders.service` → verde.
- [ ] Commit: `feat(orders): persist sellerUserId with precedence + shared isEligibleSeller (P0.6)`

**Notas**
- Reutilizar la instancia `customer` ya cargada (líneas 56-59) — no re-consultar.
- El caso `dto.sellerUserId` con vendedor no elegible **falla explícito** (evita atribuir a un no-seller); el fallback por creador solo aplica cuando nadie fue elegido.

---

## Task 3 — `seller-goals.service`: agrupar por `order.sellerUserId`

**Objetivo:** que `buildProgress` y `buildDashboardItems` atribuyan por el vendedor real del pedido, no por `customer.assignedToUserId`. Refactorizar `ensureEligibleSeller` para apoyarse en el helper compartido.

**Files**
- `apps/api/src/modules/seller-goals/seller-goals.service.ts` (`buildProgress` líneas 320-365; `buildDashboardItems` líneas 367-438; `ensureEligibleSeller` líneas 223-237; `SELLER_ROLES` líneas 14-17)

**Interfaces (cambios de query)**
```ts
// buildProgress (where actual, líneas 334-339): sustituir el filtro por cliente
where: {
  sellerUserId: goal.userId,
  status: { in: PROGRESS_STATUSES },
  orderDate: { gte: start, lte: end },
  ...(companyId ? { companyId } : {}),
}

// buildDashboardItems (where actual, líneas 387-392): filtrar por sellerUserId in
where: {
  sellerUserId: { in: sellerIds },
  status: { in: PROGRESS_STATUSES },
  orderDate: { gte: start, lte: end },
  ...(companyId ? { companyId } : {}),
}
// y agrupar por order.sellerUserId (líneas 401-408), no por customer.assignedToUserId
```

**Steps**
- [ ] Escribir test que falla: `apps/api/src/modules/seller-goals/seller-goals.service.spec.ts`:
  1. `getProgress`: pedido con `sellerUserId = goal.userId` y `customer.assignedToUserId = null`, status `entregado`, `total = 13_400_000` → `soldAmount = 13_400_000`, `ordersCount = 1` (GOAL-02).
  2. `getProgress`: pedido con `customer.assignedToUserId = goal.userId` pero `sellerUserId` de otro vendedor → **no** suma a `goal.userId` (confirma que la fuente es `sellerUserId`).
  3. `getDashboard`: dos vendedores con metas; pedidos atribuidos por `sellerUserId` → cada `item.soldAmount` corresponde a su vendedor.
- [ ] `cd apps/api && npx jest seller-goals.service` → rojo.
- [ ] Implementar:
  - `buildProgress`: cambiar `where` (líneas 334-339) a `sellerUserId: goal.userId` (quitar `customer: { assignedToUserId }`). El `select` (línea 340) puede mantener `customerId` para `customersCount`.
  - `buildDashboardItems`: cambiar `where` (líneas 387-392) a `sellerUserId: { in: sellerIds }`; en el `select` (líneas 393-398) reemplazar `customer: { select: { assignedToUserId: true } }` por `sellerUserId: true`; en el bucle de agrupación (líneas 401-408) usar `order.sellerUserId` como clave (`if (!order.sellerUserId) continue;`).
  - `ensureEligibleSeller` (líneas 223-237): mantener las excepciones (`NotFoundException` "Seller not found"; `BadRequestException` "User is not an active eligible seller" — **conservar el mensaje**), pero delegar el booleano en `isEligibleSeller(seller)` del helper compartido, e importar `SELLER_ROLES` desde `seller-eligibility.ts` (eliminar la constante local líneas 14-17 y reexportar/usar la compartida).
  - `findOne` del pedido vive en `orders.service.ts` (líneas 409-423): añadir `seller: { select: { id: true, name: true } }` al `include` (esto es soporte para Task 5; se puede hacer aquí o en Task 5, pero dejarlo consistente con el `create`).
- [ ] `cd apps/api && npx jest seller-goals.service` → verde.
- [ ] Commit: `feat(seller-goals): attribute by order.sellerUserId + reuse isEligibleSeller (P0.6)`

**Notas**
- `PROGRESS_STATUSES` (facturado→entregado, líneas 22-27) se mantiene según el supuesto de la spec §6.2. Si se confirma incluir `orden_facturacion`, es un cambio de una línea aquí (no re-planear).
- `customersCount` sigue derivándose de `order.customerId`.

---

## Task 4 — Backfill idempotente de pedidos históricos

**Objetivo:** poblar `sellerUserId` en pedidos existentes con `assignedToUserId ?? createdBy (si es seller elegible)`, sin cap silencioso y logueando el remanente sin vendedor.

**Files**
- `apps/api/prisma/backfill/2026-07-16-order-seller-backfill.ts` (script standalone, idempotente)
- `apps/api/src/modules/sellers/seller-eligibility.ts` (reutiliza `isEligibleSeller`)

**Interfaces**
```ts
// Solo toca pedidos con sellerUserId NULL (idempotencia):
// where: { sellerUserId: null }
// Para cada uno:
//   candidate = customer.assignedToUserId
//     ?? (isEligibleSeller(await user.findUnique(createdBy)) ? createdBy : null)
//   if (candidate) update sellerUserId; else contar en remanente
// Log final: { updated, remainingWithoutSeller, total }
```

**Steps**
- [ ] Escribir test que falla: `apps/api/prisma/backfill/order-seller-backfill.spec.ts`:
  1. Pedido con `customer.assignedToUserId = 'u1'` → queda `sellerUserId = 'u1'`.
  2. Pedido con `assignedToUserId = null`, `createdBy = 'u2'` (comercial activo) → `sellerUserId = 'u2'`.
  3. Pedido con `assignedToUserId = null`, `createdBy = 'u3'` (administrador) → `sellerUserId = null` y contabilizado en `remainingWithoutSeller`.
  4. Idempotencia: correr dos veces no cambia los ya poblados (segundo run `updated = 0`).
- [ ] `cd apps/api && npx jest order-seller-backfill` → rojo.
- [ ] Implementar el script con la lógica anterior; usar la MISMA regla `isEligibleSeller` compartida (consistencia con Task 2); `console.info` del resumen `{ updated, remainingWithoutSeller, total }` sin truncar.
- [ ] `cd apps/api && npx jest order-seller-backfill` → verde.
- [ ] Documentar el comando de ejecución en el commit body: `npx ts-node prisma/backfill/2026-07-16-order-seller-backfill.ts` (correr una vez en cada entorno, después de la migración de Task 1).
- [ ] Commit: `chore(orders): idempotent backfill of Order.sellerUserId (P0.6)`

**Notas**
- Idempotente por construcción (`where: { sellerUserId: null }`) → seguro de re-ejecutar; no reescribe correcciones manuales.
- El remanente sin vendedor es esperado (pedidos de admin sobre clientes sin asignado) y queda visible en el log, no oculto.

---

## Task 5 — Frontend: selector "Vendedor" en el formulario + vendedor en el detalle

**Objetivo:** permitir elegir el vendedor al crear el pedido (precargado) y mostrar `order.seller.name` en el detalle, consistente con las metas.

**Files (verificar rutas reales en el árbol web)**
- Formulario de pedido: `apps/web/src/app/(...)/orders/new/*` o componente `OrderForm.tsx` **(verificar ruta)**
- Detalle de pedido: componente de detalle de order **(verificar ruta)**
- Cliente API: `apps/web/src/lib/api.client.ts` (o `api.server.ts`) — incluir `sellerUserId` en el payload de creación y `seller` en el tipo de order
- Test E2E: `apps/web/tests/orders-seller.spec.ts` (Playwright)

**Interfaces**
```ts
// payload de creación
type CreateOrderPayload = { /* ...campos... */ sellerUserId?: string };
// tipo de order en detalle
type OrderDetail = { /* ... */ seller?: { id: string; name: string } | null };
```

**Steps**
- [ ] Escribir test que falla: `apps/web/tests/orders-seller.spec.ts` (Playwright):
  1. En el form de pedido existe el selector **"Vendedor"** con opciones de rol `comercial`/`director_comercial`, **precargado** con el asignado del cliente (o el usuario actual si es seller).
  2. Tras crear, el detalle muestra "Vendedor: <nombre>" leyendo `order.seller.name`, coincidente con el seleccionado.
- [ ] `cd apps/web && npx playwright test orders-seller` → rojo.
- [ ] Implementar:
  - Selector "Vendedor" (lista de usuarios con rol comercial/director_comercial, activos), valor por defecto = `customer.assignedToUserId ?? (currentUser si es seller)`; opcional.
  - Enviar `sellerUserId` en el payload de creación (Task 2 lo consume).
  - En el detalle, renderizar `order.seller?.name ?? "Sin vendedor"` (el backend ya incluye `seller`, Task 2/3).
- [ ] `cd apps/web && npx playwright test orders-seller` → verde.
- [ ] Commit: `feat(web): seller selector on order form + seller on order detail (P0.6)`

**Notas**
- El dashboard de metas no cambia de UI: los números dejan de salir en 0/"Sin vendedor" porque el backend ya atribuye por `sellerUserId`.
- "Vendedor" del detalle y atribución de metas leen el mismo `sellerUserId` (regla transversal).

---

## Task 6 — Verificación de cierre (GOAL-02, end-to-end)

**Objetivo:** confirmar el escenario de la spec §5 completo y que desaparece "Sin vendedor".

**Files**
- `apps/api/src/modules/seller-goals/seller-goals.e2e-spec.ts` (o test de integración existente)

**Steps**
- [ ] Escribir test que falla (integración): comercial "Ana" (seller activo) crea pedido para un cliente **sin** `assignedToUserId`; el pedido queda `sellerUserId = Ana`; se lleva a estado `entregado` con `total = 13_400_000`; `getDashboard('mensual', <mes>)` → el item de Ana suma `13_400_000` y `ordersCount = 1`. Aserción adicional: ningún pedido con `total > 0` en el periodo queda con `sellerUserId = null` cuando el creador o el cliente resuelven un seller.
- [ ] `cd apps/api && npx jest seller-goals.e2e` → rojo si algo del flujo falla.
- [ ] Ajustar lo necesario (no debería requerir código nuevo si Tasks 1-4 están bien).
- [ ] `cd apps/api && npx jest seller-goals.e2e` → verde.
- [ ] Correr suites completas: `cd apps/api && npx jest` y `cd apps/web && npx playwright test`.
- [ ] Commit: `test(seller-goals): GOAL-02 end-to-end attribution by sellerUserId (P0.6)`

---

## Riesgos y orden

- **Orden estricto:** Task 1 (migración) → Task 2 (create + helper) → Task 3 (metas) → Task 4 (backfill) → Task 5 (front) → Task 6 (verificación). El backfill (Task 4) debe correr **después** de aplicar la migración en cada entorno.
- **Riesgo principal — backfill:** re-escribir atribución histórica. Mitigado por idempotencia (`where: { sellerUserId: null }`), reutilización de la misma regla `isEligibleSeller`, y log explícito del remanente. El remanente sin vendedor (pedidos de admin sobre clientes sin asignado) es esperado y no se oculta. No hay pérdida de datos: el campo es aditivo y nullable.
- **Consistencia:** una única fuente `Order.sellerUserId` para detalle y metas; monto siempre `order.total`.

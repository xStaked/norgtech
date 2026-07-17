# Metas del Vendedor — Atribución de pedidos — Design Spec

**Date:** 2026-07-16
**Status:** Draft
**Feature:** P0.6 · Branch `fix/qa-p0-seguridad-dinero` · **Depende de P0.4** (usa `total` con descuento)
**Cierra:** GOAL-02 (pedidos aparecen como "Sin vendedor" y no cuentan en la meta); contribuye a DASH-06

---

## 1. Overview

Las metas del vendedor atribuyen las ventas por el **usuario asignado al cliente**, no por el vendedor real del pedido (verificado en `seller-goals.service.ts`):

```ts
// buildProgress (línea 335) y buildDashboardItems (línea 388/403)
where: { customer: { assignedToUserId: goal.userId }, status: { in: PROGRESS_STATUSES }, ... }
```

Consecuencias (GOAL-02):

1. **"Sin vendedor":** si el `Customer.assignedToUserId` es `null`, el pedido no se atribuye a nadie y no suma a ninguna meta — aunque el pedido tenga un creador. El detalle del pedido muestra "Vendedor: Comercial" (viene de `createdBy`/preparedBy), pero las metas usan `customer.assignedToUserId` → **dos fuentes distintas de "vendedor"** que no coinciden.
2. **El pedido no guarda su vendedor:** el modelo `Order` no tiene un campo de vendedor (solo `createdBy`, `updatedBy`, `assignedLogisticsUserId`). No hay forma estable de saber quién vendió.
3. `PROGRESS_STATUSES = [facturado, despachado, en_transito, entregado]` → pedidos `recibido`/`orden_facturacion` no cuentan (puede ser correcto, pero hay que confirmarlo).
4. Solo `comercial` y `director_comercial` son "sellers" elegibles (`SELLER_ROLES`). Pedidos creados por `administrador` no tienen meta asociada.

### Decisiones de diseño

| Decisión | Valor (por defecto) |
|----------|---------------------|
| Vendedor del pedido | **Confirmado (2026-07-16): nuevo campo `Order.sellerUserId`**, elegible en el formulario de pedido, que persiste el vendedor al crear |
| Valor por defecto de `sellerUserId` | `customer.assignedToUserId` si existe; si no, el `createdBy` (cuando el creador es un seller elegible); configurable en el formulario |
| Atribución de metas | `seller-goals` pasa a agrupar por `order.sellerUserId` (no por `customer.assignedToUserId`) |
| Consistencia UI | El "Vendedor" del detalle del pedido y el de las metas leen el **mismo** `sellerUserId` |
| Estados que cuentan | **Supuesto:** `PROGRESS_STATUSES` actuales (facturado→entregado). *(confirmar si deben contar recibido/orden_facturacion — ver §6)* |
| Monto | `order.total` (con descuento correcto de P0.4) |
| Pedidos históricos | Migración: `sellerUserId = customer.assignedToUserId` (o `createdBy` si el cliente no tiene asignado y el creador es seller) |

### Fuera de scope

- Comisiones (eso vive en `backend/` FastAPI, otro servicio).
- Split de venta entre varios vendedores.

---

## 2. Data Model

```prisma
model Order {
  // ...
  sellerUserId String?
  seller       User?   @relation("OrderSeller", fields: [sellerUserId], references: [id])
}

model User {
  // ...
  soldOrders   Order[] @relation("OrderSeller")
}
```

Migración Prisma + **data backfill** para pedidos existentes.

---

## 3. API Layer

### 3.1 `orders.service.create` — persistir vendedor

```ts
const sellerUserId =
  dto.sellerUserId ??
  customer.assignedToUserId ??
  (await this.isEligibleSeller(user.id) ? user.id : null);
// guardar sellerUserId en el order.create data
```

`isEligibleSeller`: rol ∈ {comercial, director_comercial} y activo (misma regla que `SellerGoalsService.ensureEligibleSeller`; conviene compartirla).

### 3.2 `seller-goals.service` — agrupar por `sellerUserId`

En `buildProgress` (línea 333-341) y `buildDashboardItems` (línea 386-408) cambiar el filtro/agrupación:

```ts
// antes: customer: { assignedToUserId: goal.userId }
where: { sellerUserId: goal.userId, status: { in: PROGRESS_STATUSES }, orderDate: {...}, ...(companyId?{companyId}:{}) }
// y agrupar por order.sellerUserId en vez de order.customer.assignedToUserId
```

Esto cierra GOAL-02: el pedido cuenta para la meta del vendedor real, y ya no aparece "Sin vendedor" cuando el cliente no tiene asignado (porque el pedido guarda su propio vendedor).

### 3.3 Detalle del pedido

`findOne` incluye `seller: { select: { id, name } }`; el detalle muestra ese nombre como "Vendedor", consistente con las metas.

### 3.4 Backfill

Task de migración de datos: setear `sellerUserId` en pedidos existentes con la regla del §1 (assignedToUserId → createdBy si es seller). Log de cuántos quedaron sin vendedor (los que no puedan resolverse) — sin cap silencioso.

---

## 4. Frontend

### 4.1 Formulario de pedido

- Campo opcional **"Vendedor"** (selector de usuarios con rol comercial/director_comercial), precargado con el asignado del cliente o el usuario actual si es seller. Permite corregir a quién se le atribuye la venta.

### 4.2 Detalle del pedido

- "Vendedor: X" leyendo `order.seller.name`.

### 4.3 Metas por vendedor (dashboard de metas)

- Sin cambios de UI; los números dejan de salir en 0/"Sin vendedor" porque el backend ya atribuye por `sellerUserId`.

---

## 5. Validation Flow

```
Comercial "Ana" crea pedido para cliente sin assignedToUserId
  sellerUserId = null (cliente) → createdBy = Ana (seller) → sellerUserId = Ana
  Pedido "entregado", total $13.4M
  getDashboard(mes) → agrupa por sellerUserId → Ana suma $13.4M a su meta  (GOAL-02 ok)
  (antes: customer.assignedToUserId null → "Sin vendedor", no contaba)
```

---

## 6. Decisiones

1. ✅ **RESUELTO (2026-07-16) — Fuente del vendedor:** campo nuevo `Order.sellerUserId`, elegible en el formulario (precargado con el asignado del cliente o el usuario actual si es seller).

**Aún por confirmar (no bloquean el diseño):**

2. **Estados que cuentan a la meta:** hoy `facturado`→`entregado` (`PROGRESS_STATUSES`). *(Sugerencia: alinear con la regla de crédito "desde orden aprobada" y contar también `orden_facturacion`. Por defecto se mantiene `facturado`+ salvo que confirmes lo contrario.)*
3. **Pedidos de admin:** si un `administrador` crea el pedido y el cliente no tiene vendedor asignado, ¿queda sin vendedor o el formulario obliga a elegir uno? (Por defecto: campo opcional; queda sin vendedor si nadie lo elige.)

---

## 7. Testing Checklist

### API

- [ ] `orders.create` persiste `sellerUserId` según la regla de precedencia.
- [ ] Cliente sin `assignedToUserId`, creado por seller → pedido atribuido al creador (no "Sin vendedor").
- [ ] `seller-goals` dashboard/progress agrupan por `sellerUserId` y suman el pedido entregado.
- [ ] Backfill: pedidos históricos quedan con `sellerUserId` resuelto; se loguea el remanente.
- [ ] Monto usado = `order.total` (con descuento de P0.4).

### Frontend (Playwright)

- [ ] Form de pedido permite elegir vendedor; precarga correcta.
- [ ] Detalle muestra el vendedor consistente con las metas.
- [ ] Dashboard de metas muestra el avance del vendedor (no 0/"Sin vendedor").

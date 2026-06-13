# Gestion de Credito/Cupo — Design Spec

**Date:** 2026-06-13
**Status:** Approved
**Approach:** A — Endpoints dedicados de crédito

---

## 1. Overview

Agregar gestión de crédito y cupo al CRM:

1. UI en customer detail/edit para editar `creditLimit`, `paymentCondition`, `paymentDays`, `purchaseBudget`
2. Validación de cupo al crear pedido (bloquea si se excede)
3. Mostrar crédito disponible en ficha del cliente, lista de clientes y dashboard
4. Dashboard: alertas de clientes con >80% de uso de cupo

### Decisiones de diseño

| Decisión | Valor |
|----------|-------|
| `creditLimit` vs `purchaseBudget` | Separados: `creditLimit` = tope financiero, `purchaseBudget` = meta mensual de compra |
| Periodicidad de purchaseBudget | Mensual |
| Umbral de alerta | Fijo 80% |
| Validación en pedido vs factura | Ambos |
| Comportamiento al exceder cupo | Bloquear (400) |
| Dónde mostrar info de crédito | Ficha cliente + lista clientes + dashboard |

### Fuera de scope (esta iteración)

- Gestión de pagos (registrar pagos desde UI)
- Aging de cartera (facturas por antigüedad)
- Bloqueo automático de clientes morosos
- Notificaciones proactivas (email/WhatsApp)

---

## 2. Data Model

### 2.1 Prisma Schema Changes

Agregar `purchaseBudget` a `Customer`:

```prisma
model Customer {
  // ... campos existentes ...
  creditLimit      Decimal?           @db.Decimal(14, 2)
  purchaseBudget   Decimal?           @db.Decimal(14, 2)  // NUEVO
  paymentCondition PaymentCondition?  @default(contado)
  paymentDays      Int?               @default(0)
}
```

### 2.2 DTO Changes

**CreateCustomerDto / UpdateCustomerDto** — agregar:

```typescript
@IsOptional()
@Type(() => Number)
@IsNumber()
@Min(0)
purchaseBudget?: number
```

Los campos `creditLimit`, `paymentCondition`, `paymentDays` ya existen en ambos DTOs y no requieren cambios.

### 2.3 Response DTOs

```typescript
// CreditSummaryDto
interface CreditSummaryDto {
  creditLimit: number | null
  purchaseBudget: number | null
  currentBalance: number          // suma de facturas no pagadas/no anuladas
  availableCredit: number | null  // creditLimit - currentBalance (null si no hay creditLimit)
  utilizationPercent: number | null // (currentBalance / creditLimit) * 100
  isNearLimit: boolean            // utilizationPercent >= 80
  purchaseProgress: {
    currentMonthSales: number     // ventas del mes calendario actual
    budget: number | null
    percent: number | null
  }
}

// CreditAlertDto
interface CreditAlertDto {
  customerId: string
  displayName: string
  creditLimit: number
  currentBalance: number
  utilizationPercent: number
}
```

---

## 3. API Layer

### 3.1 New Module: `CreditModule`

```
apps/api/src/modules/credit/
  credit.module.ts
  credit.controller.ts
  credit.service.ts
  dto/credit-summary.dto.ts
```

### 3.2 Endpoints

**`GET /credit/customers/:customerId/summary`**

Roles: `administrador`, `director_comercial`, `comercial`, `facturacion`

Devuelve `CreditSummaryDto`.

Lógica:
- `currentBalance`: `SELECT SUM("totalAmount") FROM "Invoice" WHERE "customerId" = X AND status NOT IN ('pagada', 'anulada')`
- `utilizationPercent`: `(currentBalance / creditLimit) * 100` si creditLimit existe y > 0, sino null
- `purchaseProgress.currentMonthSales`: `SELECT SUM("subtotal") FROM "Order" WHERE "customerId" = X AND "createdAt" >= inicio_del_mes`. Se usan orders (no invoices) porque el comercial concreta la venta al crear el pedido.

**`GET /credit/dashboard/alerts`**

Roles: `administrador`, `director_comercial`, `comercial`

Query params: `?companyId=xxx` (opcional)

Devuelve `CreditAlertDto[]`: clientes con `utilizationPercent >= 80` y `creditLimit > 0`, ordenados de mayor a menor `utilizationPercent`.

Si `companyId` va, filtra clientes que tengan facturas de esa empresa.

### 3.3 CreditService (Shared)

Extraer `assertCreditLimit` de `InvoicesService` a `CreditService`:

```typescript
class CreditService {
  async assertCreditLimit(
    customerId: string,
    amount: Prisma.Decimal,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    // 1. Buscar customer.creditLimit
    // 2. Si no tiene creditLimit o creditLimit <= 0, return (sin validar)
    // 3. Aggregate de invoices: SUM(totalAmount) WHERE customerId = X AND status NOT IN ('pagada', 'anulada')
    // 4. Si (currentTotal + amount) > creditLimit → throw BadRequestException
  }

  async getCreditSummary(customerId: string): Promise<CreditSummaryDto> { ... }
  async getCreditAlerts(companyId?: string): Promise<CreditAlertDto[]> { ... }
}
```

### 3.4 Changes to Existing Services

**OrdersService.create:**
- Al inicio, después de validar que el customer existe, llamar `this.credit.assertCreditLimit(customerId, subtotal)`
- Si falla, el pedido no se crea

**InvoicesService.create:**
- Cambiar `this.assertCreditLimit(...)` → `this.credit.assertCreditLimit(...)`
- Misma lógica, solo refactorizado

**CustomersService:**
- `findAll`: extender el select para incluir `creditLimit` (necesario para la columna "Crédito" en la tabla del frontend)

---

## 4. Frontend

### 4.1 Ficha del Cliente (`customers/[id]/page.tsx`)

Nuevo componente **`CreditInfoCard`** (server component):

```
apps/web/src/components/customers/credit-info-card.tsx
```

Contenido:
- 4 tarjetas en grid: **Límite de crédito**, **Saldo pendiente**, **Disponible**, **% utilizado**
- Barra de progreso: verde (<80%), amarillo (80%-99%), rojo (>=100%)
- Sección de **Presupuesto mensual** (solo si `purchaseBudget` existe): ventas del mes vs budget, barra de progreso
- Si `isNearLimit`, badge "Cerca del límite"

Llamada API: `GET /credit/customers/:id/summary` desde el server component.

### 4.2 Lista de Clientes (`customers/page.tsx`)

Nueva columna **"Crédito"** en la tabla:

- Muestra `creditLimit` como monto formateado (ej: "$5.000.000")
- Si el cliente no tiene `creditLimit`, muestra "—"
- El `GET /customers` ya devuelve `creditLimit` al extender el select del servicio
- El % de utilización no se muestra en la lista (requeriría un aggregate por fila). Va en la ficha del cliente y en el dashboard de alertas.

### 4.3 Dashboard (`dashboard/page.tsx`)

Nuevo widget **`CreditAlertsWidget`** (client component con `"use client"`):

```
apps/web/src/components/dashboard/credit-alerts-widget.tsx
```

- Solo se renderiza si hay alertas (clientes ≥80%)
- Muestra top 5 clientes con mayor % de uso
- Cada fila: nombre (link a ficha), barra de progreso, monto pendiente, % usado
- Si 0 alertas → no se renderiza (sin ocupar espacio)

Llamada API: `GET /credit/dashboard/alerts?companyId=xxx`

### 4.4 Formulario de Pedido

Al seleccionar cliente en el formulario de pedido:
- Llamar `GET /credit/customers/:id/summary`
- Mostrar **Crédito disponible** debajo del selector de cliente
- Si `subtotal > availableCredit`, mostrar mensaje de error y deshabilitar "Crear pedido"

---

## 5. Validation Flow

### 5.1 Order Creation

```
POST /orders
  OrdersService.create()
    1. Validate customer exists
    2. credit.assertCreditLimit(customerId, orderSubtotal)
       ├─ creditLimit is null/0? → SKIP (sin validar)
       ├─ SELECT SUM(totalAmount) FROM invoices
       │   WHERE customerId = X AND status NOT IN ('pagada', 'anulada')
       ├─ IF (currentTotal + orderSubtotal) > creditLimit
       │   → throw 400 "Crédito excedido. Disponible: $X, Pedido: $Y"
       └─ ELSE → OK, continúa
    3. Create order normally
```

### 5.2 Invoice Creation

Sin cambios en lógica. Solo refactor a `CreditService`.

---

## 6. Edge Cases & Error Handling

| Caso | Comportamiento |
|------|---------------|
| Cliente sin `creditLimit` o `creditLimit = 0` | No se valida cupo. UI muestra "Sin límite". |
| Cliente sin facturas pendientes | `currentBalance = 0`, disponible = creditLimit completo |
| Factura `anulada` | No cuenta para saldo pendiente |
| Factura `parcialmente_pagada` | Cuenta por `totalAmount` completo (conservador) |
| Multi-empresa | Cupo es del cliente (no por empresa). Aggregate de facturas filtra solo por `customerId`. |
| Pedido con múltiples items | Validación usa `subtotal` total del pedido |
| Concurrencia (2 pedidos simultáneos) | Se usa `prisma.$transaction` con la validación dentro. Mitigación básica. |
| Cliente sin `purchaseBudget` | Sección de presupuesto no se renderiza en la UI |
| `GET /credit/dashboard/alerts` sin companyId | Devuelve alertas de todos los clientes (cross-empresa) |

---

## 7. Testing Checklist

### API Tests (e2e o integration)

- [ ] `GET /credit/customers/:id/summary` — 200 con datos correctos
- [ ] `GET /credit/customers/:id/summary` — cliente sin creditLimit (null/0)
- [ ] `GET /credit/customers/:id/summary` — cliente sin facturas
- [ ] `GET /credit/customers/:id/summary` — facturas anuladas no cuentan
- [ ] `GET /credit/dashboard/alerts` — solo clientes >=80%
- [ ] `GET /credit/dashboard/alerts?companyId=xxx` — filtrado por empresa
- [ ] `POST /orders` — bloquea si excede cupo (400)
- [ ] `POST /orders` — permite si está dentro del cupo
- [ ] `POST /orders` — permite si creditLimit es null/0
- [ ] `POST /invoices` — validación de cupo sigue funcionando (refactor)

### Frontend Tests (manual)

- [ ] Ficha cliente: muestra creditLimit, currentBalance, utilizationPercent
- [ ] Ficha cliente: barra de progreso cambia color según %
- [ ] Ficha cliente: sección purchaseBudget visible solo si existe
- [ ] Lista clientes: columna "Crédito" muestra monto de creditLimit
- [ ] Lista clientes: clientes sin creditLimit muestran "—"
- [ ] Dashboard: widget de alertas aparece si hay clientes >=80%
- [ ] Dashboard: widget NO aparece si no hay alertas
- [ ] Formulario pedido: crédito disponible visible al seleccionar cliente
- [ ] Formulario pedido: botón deshabilitado y error si subtotal > disponible

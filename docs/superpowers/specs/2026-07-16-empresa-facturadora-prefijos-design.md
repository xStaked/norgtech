# Empresa Facturadora y Prefijos — Design Spec

**Date:** 2026-07-16
**Status:** Draft
**Feature:** P0.5 · Branch `fix/qa-p0-seguridad-dinero`
**Cierra:** ORD-03 (empresa facturadora muestra el cliente), ORD-05 (falta prefijo de empresa en el nombre del pedido), BILL-03 (falta prefijo en solicitud de facturación)

---

## 1. Overview

**Bug raíz de ORD-03 (verificado en `orders.service.ts`, líneas 108-109):**

```ts
const billingCompanyNameSnapshot =
  dto.billingCompanyNameSnapshot?.trim() || customerNameSnapshot || null;
```

Cuando el DTO no envía `billingCompanyNameSnapshot`, el snapshot cae al **nombre del cliente** en lugar del **nombre de la empresa facturadora** (`company.name`). El pedido ya tiene `companyId` + relación `company` correctos, pero el campo de texto que se muestra en el detalle ("Empresa facturadora") queda con el cliente. Por eso el QA ve "DT comercial" (cliente) como empresa facturadora.

**ORD-05 / BILL-03 (prefijos):** el pedido ya numera con prefijo (`nextOrderNumber` usa `company.prefix` → `EPP-006`), pero el QA reporta que en el **listado de pedidos** y en la **solicitud de facturación** no aparece el prefijo de la empresa junto al nombre/consecutivo. Es un tema de qué campo se muestra: hay que exhibir `company.prefix` + consecutivo de forma consistente.

### Decisiones de diseño

| Decisión | Valor |
|----------|-------|
| Fuente de la empresa facturadora | Siempre `company.name` (de la relación por `companyId`), nunca el cliente |
| Snapshot | `billingCompanyNameSnapshot = company.name` en create; se corrige el fallback |
| Pedidos existentes | Migración de datos que reescribe `billingCompanyNameSnapshot` con `company.name` donde hoy tiene el nombre del cliente |
| Prefijo visible | El nombre del pedido y de la solicitud de facturación muestran `prefix` + consecutivo (el `orderNumber`/`invoiceNumber` ya lo incluyen; garantizar que el front lo pinte) |
| Detalle del pedido | Mostrar `company.name` (empresa facturadora) y `customer.displayName` (cliente) como campos distintos |

### Fuera de scope

- Cambiar el esquema de numeración de consecutivos.
- Multi-empresa avanzada (selección dinámica de empresa por reglas).

---

## 2. Data Model

Sin cambios de schema. `Order.companyId` + `Order.company` ya existen; `Order.billingCompanyNameSnapshot` ya existe. `Company.prefix` ya existe (`@unique`).

**Migración de datos (data-fix, no schema):** script/migración que, para pedidos donde `billingCompanyNameSnapshot` = `customerNameSnapshot`, lo reemplaza por `company.name`.

---

## 3. API Layer

### 3.1 `orders.service.ts` — corregir el fallback (línea 108-109)

```ts
const billingCompanyNameSnapshot = company.name; // la empresa facturadora es SIEMPRE la company
```

*(Se elimina el fallback al nombre del cliente. El `dto.billingCompanyNameSnapshot` deja de usarse para esto, o solo se acepta si coincide con `company.name`.)*

### 3.2 Serialización del detalle y listado

- `findOne`/`findAll` ya incluyen `company: true`. Garantizar que el DTO de respuesta exponga:
  - `company.name` como **Empresa facturadora**.
  - `company.prefix` para poder mostrar el prefijo.
  - `orderNumber` (ya trae prefijo, p. ej. `EPP-006`).
- **Solicitud de facturación (`BillingRequest`):** el listado del módulo facturación debe mostrar `company.prefix` + un identificador. Si la `BillingRequest` no tiene consecutivo propio con prefijo, exponer `company.prefix` junto al del pedido/cotización origen. → BILL-03.

### 3.3 Migración de datos

Task dedicado: `prisma` migration o script idempotente que corrige `billingCompanyNameSnapshot` histórico. Log de cuántos registros se corrigieron (sin caps silenciosos).

---

## 4. Frontend

### 4.1 Detalle del pedido (`apps/web/src/app/(app)/orders/[id]`)

- Campo **"Empresa facturadora"** = `order.company.name` (no el snapshot si el snapshot está mal; preferir la relación `company`). → ORD-03.
- Mostrar el consecutivo con prefijo (`order.orderNumber`, ej. `EPP-006`).

### 4.2 Listado de pedidos (`orders`)

- La columna "Empresa" ya muestra el prefijo (`EPP`/`NT`); asegurar que el **nombre del pedido** use `orderNumber` con prefijo. → ORD-05.

### 4.3 Módulo facturación

- En el listado de solicitudes de facturación, anteponer `company.prefix` al identificador de la solicitud. → BILL-03.

---

## 5. Validation Flow

```
Crear pedido con companyId = Empresa (EPP), cliente = "DT comercial"
  billingCompanyNameSnapshot = company.name ("Empresa Prueba")  ← ya no el cliente
  Detalle: Empresa facturadora = "Empresa Prueba" · Cliente = "DT comercial"  (ORD-03 ok)
  Nombre del pedido = EPP-006  (ORD-05 ok)
```

---

## 6. Edge Cases

| Caso | Comportamiento |
|------|----------------|
| Pedido histórico con snapshot = cliente | Corregido por la migración de datos |
| Empresa renombrada después del pedido | El detalle muestra `company.name` actual (relación); el snapshot queda como respaldo histórico |
| Pedido sin `companyId` | No debería existir (`companyId` es requerido en el schema); validar en create |
| Cliente que se llama igual que una empresa | Ya no hay ambigüedad: siempre se usa `company.name` |

---

## 7. Testing Checklist

### API

- [ ] `orders.create` guarda `billingCompanyNameSnapshot = company.name` aunque el DTO no lo mande (ORD-03).
- [ ] `findOne` expone empresa facturadora = company.name y cliente por separado.
- [ ] `orderNumber` incluye prefijo de empresa.
- [ ] Migración: pedidos con snapshot = cliente quedan con `company.name`; el conteo se registra.
- [ ] Solicitud de facturación expone `company.prefix` (BILL-03).

### Frontend (Playwright)

- [ ] Detalle de pedido muestra la empresa facturadora correcta (no el cliente).
- [ ] Listado de pedidos muestra el nombre con prefijo.
- [ ] Módulo facturación muestra el prefijo en la solicitud.

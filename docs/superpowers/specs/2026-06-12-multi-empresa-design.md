# Multi-empresa - Soporte para Multiples Companias Facturadoras

**Date:** 2026-06-12
**Status:** Approved for implementation planning
**Scope:** Permitir que pedidos, solicitudes de facturacion y facturas se emitan a nombre de Nortech o Nanonutricion, con consecutivos independientes, compartiendo catalogos y usuarios.

## Summary

El CRM actualmente opera como sistema mono-empresa. Se requiere que las ordenes de pedido, solicitudes de facturacion y facturas puedan emitirse a nombre de dos empresas (Nortech y Nanonutricion) con numeracion independiente por empresa. Productos, segmentos, clientes, usuarios y el resto de entidades son compartidos entre ambas. Las ventas se suman globalmente por vendedor en el dashboard.

## Goals

- Crear ordenes, billing requests e invoices asociados a una empresa especifica.
- Generar consecutivos independientes por empresa con prefijo (`NT-001`, `NN-001`).
- Filtrar listados de ordenes, facturacion y facturas por empresa.
- Dashboard consolidado que sume ambas empresas, con filtro opcional por empresa.
- CRUD de empresas solo para administrador.

## Non Goals

- No segregar catalogos de productos, segmentos o clientes por empresa.
- No implementar tenant isolation ni Row-Level Security.
- No cambiar el flujo de creacion de pedidos mas alla del selector de empresa.
- No modificar el comportamiento de Nora para multi-empresa en esta fase.

## Data Model

### Nuevo modelo `Company`

```prisma
model Company {
  id         String   @id @default(cuid())
  name       String                       // "Norgtech"
  legalName  String                       // Razon social completa
  nit        String                       // NIT
  prefix     String   @unique             // "NT", "NN" para consecutivos
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  orders          Order[]
  billingRequests BillingRequest[]
  invoices        Invoice[]
}
```

### Modificaciones a modelos existentes

Tres modelos reciben `companyId`:

```prisma
model Order {
  // ... campos existentes sin cambios ...
  companyId String
  company   Company @relation(fields: [companyId], references: [id])
}

model BillingRequest {
  // ... campos existentes sin cambios ...
  companyId String
  company   Company @relation(fields: [companyId], references: [id])
}

model Invoice {
  // ... campos existentes sin cambios ...
  companyId String
  company   Company @relation(fields: [companyId], references: [id])
}
```

### NO llevan `companyId`

Customer, Product, User, CustomerSegment, CustomerGoal, CommercialExpense, Visit, FollowUpTask, Opportunity, Quote, QuoteItem, OrderItem, InvoicePayment, WhatsAppConversation, y todos los demas modelos. Son compartidos.

### Consecutivos

Formato: `{prefix}-{numero_secuencial}` por empresa.

Ejemplos:
- Nortech: `NT-001`, `NT-002`, `NT-003`...
- Nanonutricion: `NN-001`, `NN-002`, `NN-003`...

Implementacion: consultar el maximo numero existente para la empresa y entidad dada, e incrementar. Si no hay registros previos para esa empresa, comienza en 1.

## API Design

### Endpoints nuevos

**`GET /companies`**
- Roles: autenticado
- Respuesta: `{ id, name, prefix, nit, isActive }[]`

**`POST /companies`**
- Roles: `administrador`
- Body: `{ name, legalName, nit, prefix }`
- Validacion: `prefix` unico, 2-4 caracteres alfabeticos

**`PATCH /companies/:id`**
- Roles: `administrador`
- Body: parcial de `{ name, legalName, nit, prefix, isActive }`

### Endpoints modificados

| Endpoint | Cambio |
|----------|--------|
| `POST /orders` | Body recibe `companyId` (requerido). Response incluye `company`. |
| `GET /orders` | Query opcional `?companyId=`. Response incluye `company` anidado en cada item. |
| `GET /orders/:id` | Response incluye `company`. |
| `POST /invoices` | Body recibe `companyId` (requerido). Response incluye `company`. |
| `GET /invoices` | Query opcional `?companyId=`. Response incluye `company` en cada item. |
| `GET /invoices/summary` | Query opcional `?companyId=`. |
| `GET /invoices/overdue` | Query opcional `?companyId=`. |
| `GET /billing-requests` | Query opcional `?companyId=`. Response incluye `company`. |
| `GET /dashboard/summary` | Query opcional `?companyId=`. Sin filtro = consolida ambas. |
| `GET /dashboard/commercial-advanced` | Query opcional `?companyId=`. Sin filtro = consolida ambas. |
| `POST /orders/:id/billing-request` | Hereda `companyId` de la orden automaticamente. |

### Validaciones

- `companyId` debe existir en la tabla `Company` y `isActive = true`.
- Error 400 si no se envia `companyId` en POST /orders o POST /invoices.
- Error 404 si `companyId` no existe o esta inactivo.

## Frontend Design

### Paginas nuevas

**`/companies`** — Tabla con columnas: Nombre, Prefijo, NIT, Estado. Solo `administrador`. Boton "Nueva empresa".

**`/companies/new`** — Formulario: name, legalName, nit, prefix (2-4 chars, uppercase automatico).

**`/companies/[id]`** — Formulario de edicion con toggle isActive.

### Componente: `CompanySelect`

Dropdown reutilizable mostrando `{name} ({prefix})`. Usado en:
- `/orders/new` — obligatorio, antes de los items del pedido
- `/invoices/new` — obligatorio
- Filtros de `/orders`, `/invoices`, `/billing-requests`
- Dashboard (opcional, valor por defecto: "Todas")

### Cambios en existentes

**`/orders` / `/invoices` / `/billing-requests`:**
- Columna "Empresa" con el `prefix` en la tabla
- Filtro por empresa en la barra superior

**`/orders/[id]` / `/invoices/[id]`:**
- Mostrar nombre de la empresa en el encabezado/detalle

**`/dashboard`:**
- `CompanySelect` opcional en `CommercialAdvancedDashboard`. Si no se selecciona empresa, las queries no envian `companyId` y el backend consolida.

**Navegacion:**
- Item "Empresas" en sidebar, visible solo para admin.

## Migration Strategy

1. Crear migracion Prisma: tabla `Company`, FK `companyId` en Order, BillingRequest, Invoice.
2. Seed script inserta dos registros:
   - `{ name: "Norgtech", prefix: "NT" }`
   - `{ name: "Nanonutricion", prefix: "NN" }`
3. Script de migracion de datos:
   - Asignar `companyId` de Nortech a todos los registros existentes en Order, BillingRequest, Invoice.
   - Actualizar consecutivos existentes: `"1"` → `"NT-001"`, `"2"` → `"NT-002"`, etc.
4. `companyId` se marca como requerido (NOT NULL) solo despues de ejecutar el script de migracion.

## Security And Privacy

- Solo admin puede crear/editar empresas.
- Cualquier usuario autenticado puede listar empresas y seleccionar al crear pedidos.
- El companyId se valida contra la BD; no se aceptan valores arbitrarios.
- No se exponen datos de empresa a usuarios no autenticados.

## Testing

Backend:
- `GET /companies` devuelve solo empresas activas.
- `POST /companies` rechaza prefix duplicado.
- `POST /companies` solo admin; 403 para otros roles.
- `POST /orders` sin `companyId` → 400.
- `POST /orders` con `companyId` inexistente → 404.
- `GET /orders?companyId=X` solo devuelve ordenes de esa empresa.
- Consecutivos independientes: crear orden en NT → `NT-00X`, crear en NN → `NN-001`.
- `POST /orders/:id/billing-request` hereda el companyId de la orden.
- Dashboard sin companyId suma ambas empresas; con companyId filtra correctamente.

Frontend:
- Selector de empresa visible y funcional en `/orders/new`.
- Filtro por empresa en tabla de ordenes.
- Columna de empresa visible en listados.
- Pagina `/companies` solo accesible para admin.
- Navegacion muestra "Empresas" solo a admin.

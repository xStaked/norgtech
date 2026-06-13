# Zonas como Entidad Formal - Catálogo de Zonas de Despacho

**Date:** 2026-06-13
**Status:** Approved for implementation planning
**Scope:** Reemplazar el campo texto libre zone en Order por un catálogo administrable de zonas con asignación por cliente y vendedor por zona.

## Summary

Actualmente `Order.zone` es un campo de texto libre. El dashboard de analytics agrupa por este texto, lo que genera inconsistencias (misma zona escrita de formas distintas). Esta feature crea un catálogo formal de zonas, permite asignar múltiples zonas por cliente con vendedor independiente por zona, y reemplaza el texto libre en Order por una FK estructurada.

## Goals

- Catálogo de zonas administrable (CRUD por admin).
- Asignar múltiples zonas a un cliente, cada una con vendedor y dirección de despacho propios.
- Reemplazar `Order.zone` (texto libre) por `Order.customerZoneId` (FK a CustomerZone).
- Al crear pedido, el selector de zona solo muestra las zonas del cliente seleccionado.
- Dashboard `byZone` agrupa por nombres del catálogo, eliminando inconsistencias.
- Si un cliente no tiene zonas, el campo es opcional en el pedido.

## Non Goals

- No geolocalizar ni mapear zonas.
- No crear jerarquías de zonas (región > zona > subzona).
- No cambiar la lógica de asignación de vendedor principal del cliente.
- No migrar automáticamente datos históricos de `Order.zone` (texto libre) — se mantienen como están en pedidos viejos pero los nuevos usan FK.

## Data Model

### Nuevo modelo `Zone`

```prisma
model Zone {
  id         String   @id @default(cuid())
  name       String   @unique
  department String?
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  customerZones CustomerZone[]
}
```

### Nuevo modelo `CustomerZone` (join table)

```prisma
model CustomerZone {
  id               String   @id @default(cuid())
  customerId       String
  zoneId           String
  address          String?
  assignedToUserId String?
  isActive         Boolean  @default(true)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  customer   Customer @relation(fields: [customerId], references: [id])
  zone       Zone     @relation(fields: [zoneId], references: [id])
  assignedTo User?    @relation(fields: [assignedToUserId], references: [id])
  orders     Order[]

  @@unique([customerId, zoneId])
}
```

### Cambios en `Order`

```prisma
model Order {
  // ... campos existentes ...
  customerZoneId String?
  customerZone   CustomerZone? @relation(fields: [customerZoneId], references: [id])
  // zone String? ← ELIMINADO
}
```

### Sin cambios en Customer

Customer no recibe campos nuevos. La relación con zonas se maneja vía `CustomerZone`.

## API Design

### Endpoints nuevos — Zonas

**`GET /zones`**
- Roles: `administrador`, `director_comercial`
- Respuesta: `{ id, name, department, isActive }[]`

**`POST /zones`**
- Roles: `administrador`
- Body: `{ name: string, department?: string }`
- Validación: `name` único

**`PATCH /zones/:id`**
- Roles: `administrador`
- Body: parcial de `{ name?, department?, isActive? }`

### Endpoints nuevos — Asignación Cliente-Zona

**`GET /customers/:id/zones`**
- Roles: autenticado
- Devuelve las `CustomerZone` activas del cliente con `zone` y `assignedTo` anidados.

**`POST /customers/:id/zones`**
- Roles: `administrador`, `director_comercial`
- Body: `{ zoneId: string, address?: string, assignedToUserId?: string }`
- Validación: no duplicar `customerId + zoneId`.

**`PATCH /customers/:id/zones/:customerZoneId`**
- Roles: `administrador`, `director_comercial`
- Body: parcial de `{ address?, assignedToUserId?, isActive? }`

**`DELETE /customers/:id/zones/:customerZoneId`**
- Roles: `administrador`, `director_comercial`
- Soft-delete: setea `isActive = false`.

### Endpoints modificados

**`POST /orders`**
- `customerZoneId` opcional en vez de `zone`.
- Validación: si se envía, `CustomerZone.customerId === Order.customerId`. Si no coinciden → 400.
- Response incluye `customerZone` con `zone.name` anidado.

**`GET /orders` y `GET /orders/:id`**
- Response incluye `customerZone { zone { name } }`.
- Campo `zone` texto libre se omite de la respuesta para pedidos nuevos (los viejos aún lo tienen en BD pero se ignora en el response).

**`GET /dashboard/commercial-advanced`**
- `byZone` agrupa por `customerZone.zone.name` en pedidos que tienen `customerZoneId`. Pedidos sin `customerZoneId` se agrupan como "Sin zona".

## Frontend Design

### Páginas nuevas

**`/zones`** — Tabla admin con columnas: Nombre, Departamento, Estado. Botón "Nueva zona".

**`/zones/new`** — Form: name (requerido), department (opcional).

**`/zones/[id]`** — Form de edición con toggle isActive.

### Cambios en Cliente

**`/customers/[id]`** — Nueva sección "Zonas de despacho":
- Lista de `CustomerZone` asignadas: nombre de zona, vendedor, dirección.
- Botón "+ Asignar zona" abre modal/dialog con selector de zona del catálogo + campo dirección + selector de vendedor.
- Cada fila tiene botón para editar dirección/vendedor y botón para quitar (soft-delete).

### Cambios en Order

**`/orders/new`** — El campo `zone` texto libre se elimina. Nuevo selector `customerZoneId`:
- Observa el `customerId` seleccionado.
- Al cambiar `customerId`, hace fetch a `/customers/{id}/zones`.
- Dropdown muestra: `{zone.name} — {vendedor asignado}`.
- Si el cliente no tiene zonas, el campo no se muestra (es opcional).

### Cambios en Dashboard

Sin cambios visuales. `byZone` usa los nombres del catálogo automáticamente.

### Navegación

Item "Zonas" en sidebar:
- Grupo: "Catálogo"
- Roles: `administrador`, `director_comercial`
- shortLabel: "ZN"

## Migration Strategy

1. Crear migración Prisma: tablas `Zone`, `CustomerZone`, FK `customerZoneId` en Order.
2. El campo `Order.zone` se mantiene en BD para datos históricos pero se marca como deprecated.
3. Seed: crear zonas iniciales (Costa, Centro, Santander, Valle, Antioquia, Bogotá, Cundinamarca).
4. No se migran datos históricos de `Order.zone` → `customerZoneId`. Los pedidos viejos conservan su texto en `zone` y `customerZoneId = null`.

## Security And Privacy

- Solo admin gestiona el catálogo de zonas.
- Admin y director_comercial asignan zonas a clientes.
- Cualquier rol autenticado puede ver las zonas de un cliente.

## Testing

Backend:
- CRUD de zonas: crear, listar, editar, nombre duplicado rechazado.
- Asignar zona a cliente: success, duplicado rechazado, soft-delete.
- Crear orden con `customerZoneId` válido (pertenece al cliente) → success.
- Crear orden con `customerZoneId` de otro cliente → 400.
- Dashboard byZone agrupa por nombre de zona del catálogo.
- GET /customers/:id/zones solo devuelve activas.

Frontend:
- Selector de zona en pedido se actualiza al cambiar cliente.
- Cliente sin zonas: campo no visible.
- Página /zones solo admin.
- Sección zonas en detalle de cliente funcional.

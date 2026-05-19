# Plan: Segmentación, Precios Diferenciados y Metas por Cliente

## Contexto
CRM Norgtech v2 — Sector Porcino y Avícola. Los clientes se dividen en segmentos que determinan descuentos en productos. Cada cliente tiene metas comerciales periódicas que los comerciales deben poder revisar.

## Decisiones Clave

1. **Descuentos:** Global por segmento (Opción A). Cada segmento tiene `discountPercent`.
2. **Segmentación automática:** Los clientes cambian de segmento automáticamente según sus compras históricas vs los rangos del segmento.
3. **Metas individuales:** Cada cliente puede tener metas personalizadas con períodos flexibles (mensual, trimestral, anual).
4. **Sector:** Productos porcinos y avícolas — el descuento aplica sobre `basePrice` independientemente de la presentación.

## Modelo de Datos

### CustomerSegment (actualizado)
```prisma
model CustomerSegment {
  id              String   @id @default(cuid())
  name            String   @unique
  description     String?
  discountPercent Decimal  @db.Decimal(5, 2) @default(0)  // ej: 3.00 = 3%
  minGoalAmount   Decimal  @db.Decimal(14, 2)              // mínimo para estar en este segmento
  maxGoalAmount   Decimal? @db.Decimal(14, 2)              // máximo (null = sin límite superior)
  active          Boolean  @default(true)
  createdBy       String
  updatedBy       String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  customers       Customer[]
}
```

### CustomerGoal (nuevo)
```prisma
model CustomerGoal {
  id           String   @id @default(cuid())
  customerId   String
  periodType   String   @default("anual")   // mensual | trimestral | anual
  periodValue  String                        // "2025", "2025-Q1", "2025-03"
  targetAmount Decimal  @db.Decimal(14, 2)   // meta en pesos
  notes        String?
  createdBy    String
  updatedBy    String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  customer     Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
}
```

### Customer (relación)
```prisma
model Customer {
  // ... existentes ...
  goals CustomerGoal[]
}
```

### QuoteItem / OrderItem (trazabilidad)
```prisma
// Agregar a ambos:
originalUnitPrice Decimal? @db.Decimal(14, 2)
discountPercent   Decimal? @db.Decimal(5, 2)
```

---

## Fases

### Fase 1 — Backend: Segmentos con Descuentos y Rangos
- Actualizar `schema.prisma` con campos nuevos en `CustomerSegment`
- Crear migración Prisma
- Actualizar DTOs: `CreateCustomerSegmentDto`, `UpdateCustomerSegmentDto`
- Actualizar `CustomerSegmentsService` (CRUD completo con update/delete)
- Actualizar `CustomerSegmentsController` (POST, GET, PATCH, DELETE)
- Actualizar seed con segmentos: Bronce (3%), Plata (5%), Oro (8%), Platino (12%)
- Tests E2E

### Fase 2 — Backend: Metas por Cliente con Períodos Flexibles
- Crear modelo `CustomerGoal` en schema.prisma
- Crear módulo `customer-goals`: controller, service, DTOs
- Endpoints:
  - POST `/customers/:id/goals` — crear meta
  - GET `/customers/:id/goals` — listar metas del cliente
  - PATCH `/customers/:id/goals/:goalId` — actualizar meta
  - DELETE `/customers/:id/goals/:goalId` — eliminar meta
  - GET `/customers/:id/goal-progress?periodType=&periodValue=` — progreso vs meta
- Lógica de progreso: sumar órdenes `facturado` o `entregado` en el período indicado
- Tests E2E

### Fase 3 — Backend: Precios Automáticos en Cotizaciones
- Actualizar `QuoteItem` con `originalUnitPrice` y `discountPercent`
- Modificar `QuotesService.create()`:
  - Obtener segmento del cliente
  - Calcular precio por item: `basePrice * (1 - discountPercent/100)`
  - Guardar precio original y descuento aplicado
- Endpoint: `GET /products/:id/price-for-customer/:customerId`
- Tests E2E

### Fase 4 — Backend: Precios Automáticos en Órdenes + Segmentación Auto
- Actualizar `OrderItem` con `originalUnitPrice` y `discountPercent`
- Modificar `OrdersService.create()` con mismo cálculo automático
- Crear servicio de segmentación automática:
  - Calcular compras del cliente en el período del segmento
  - Reasignar segmento si corresponde
- Endpoint: `POST /customers/refresh-segments` (solo director_comercial)
- Tests E2E

### Fase 5 — Frontend: UI Segmentos
- Actualizar formulario `/segments/new` — campos: descuento, meta mínima, meta máxima
- Actualizar lista `/segments` — mostrar % descuento y rangos

### Fase 6 — Frontend: UI Metas por Cliente
- En `/customers/[id]` — nueva sección "Metas Comerciales"
- Formulario para crear/editar meta (período, monto)
- Visualización de progreso: barra + stats (vendido/meta/%/faltante)
- Color coding según % cumplido

### Fase 7 — Frontend: Cotizaciones con Descuentos
- En `/quotes/new` — al agregar producto, precio sugerido automático
- Mostrar desglose: precio base → descuento → precio final
- Totales con ahorro por descuento

### Fase 8 — Frontend: Dashboard Comercial
- Vista resumen de clientes con progreso de metas
- Alertas visuales
- Resumen de metas vs ventas del comercial

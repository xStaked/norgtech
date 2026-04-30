# CRM Operativo Comercial MVP - Diseno Inicial

Fecha: 2026-04-29

## Objetivo

Construir la primera version de una plataforma interna para una sola empresa del sector pecuario, enfocada en operacion comercial diaria desde panel web.

El MVP prioriza:

- CRM comercial operativo
- Oportunidades y pipeline
- Agenda comercial y recordatorios
- Catalogo de productos
- Cotizaciones
- Pedidos
- Solicitudes de facturacion
- Dashboard basico
- Auditoria basica

Queda fuera de esta fase:

- Bot o asistente de WhatsApp
- Portal de clientes
- PDF ejecutivo
- Integracion ROI/costos
- BI avanzado
- Ruteo comercial
- Logistica avanzada
- Multiempresa

## Alcance funcional aprobado

### Usuarios iniciales

Roles implementados en MVP:

- `admin`
- `comercial`

Roles futuros previstos, pero fuera de implementacion inicial:

- director comercial
- tecnico
- facturacion
- logistica

### Enfoque de negocio

- El sistema es para una sola empresa.
- La entidad principal es `Customer`.
- El flujo comercial vive en `Opportunity`, no en `Customer`.
- Un cliente puede tener multiples oportunidades.
- Los pedidos deben soportar detalle de items desde el inicio.
- El catalogo de productos es interno.
- Los productos tienen precio base, pero el comercial puede hacer override por caso.
- Los segmentos de cliente son administrables por `admin`.
- La agenda incluye seguimientos y recordatorios internos, sin ruteo.
- La auditoria basica es obligatoria desde el MVP.

## Arquitectura recomendada

### Estructura general

Monolito modular:

- `apps/web` -> Next.js
- `apps/api` -> Nest.js
- `packages/shared` -> tipos compartidos y utilidades pequenas

### Frontend

Next.js como panel web responsive:

- App Router
- vistas para admin y comercial
- formularios operativos simples
- dashboard inicial

La logica critica de negocio no debe vivir en el frontend.

### Backend

Nest.js como API REST principal con modulos por dominio:

- auth
- users
- customers
- customer-segments
- contacts
- opportunities
- visits
- follow-up-tasks
- products
- quotes
- orders
- billing-requests
- dashboard
- audit

### Base de datos

PostgreSQL como fuente de verdad unica.

### Estilo de integracion interna

Sin microservicios.

Se usaran eventos internos simples para reaccionar a cambios relevantes:

- cotizacion aprobada
- pedido creado
- solicitud de facturacion creada
- recordatorio vencido

Esto prepara el terreno para automatizaciones futuras sin sobredisenar el MVP.

## Modelo de dominio

### Entidades principales

#### User

- id
- name
- email
- password hash
- role: `admin | comercial`
- active
- createdAt
- updatedAt

#### CustomerSegment

- id
- name
- description
- active
- createdBy
- updatedBy
- createdAt
- updatedAt

#### Customer

- id
- legalName
- displayName
- taxId
- phone
- email
- address
- city
- department
- notes
- segmentId
- assignedToUserId
- active
- createdBy
- updatedBy
- createdAt
- updatedAt

#### Contact

- id
- customerId
- fullName
- roleTitle
- phone
- email
- isPrimary
- notes
- createdBy
- updatedBy
- createdAt
- updatedAt

#### Opportunity

- id
- customerId
- title
- description
- stage
- estimatedValue
- expectedCloseDate
- assignedToUserId
- lostReason
- closedAt
- createdBy
- updatedBy
- createdAt
- updatedAt

Etapas aprobadas:

- `prospecto`
- `contacto`
- `visita`
- `cotizacion`
- `negociacion`
- `orden_facturacion`
- `venta_cerrada`
- `perdida`

#### Visit

- id
- customerId
- opportunityId nullable
- scheduledAt
- completedAt nullable
- status
- summary
- notes
- nextStep
- assignedToUserId
- createdBy
- updatedBy
- createdAt
- updatedAt

#### FollowUpTask

- id
- customerId
- opportunityId nullable
- type
- title
- dueAt
- status
- notes
- assignedToUserId
- completedAt nullable
- createdBy
- updatedBy
- createdAt
- updatedAt

#### Product

- id
- sku
- name
- description
- unit
- presentation
- basePrice
- active
- createdBy
- updatedBy
- createdAt
- updatedAt

#### Quote

- id
- customerId
- opportunityId nullable
- status
- validUntil
- notes
- subtotal
- total
- createdBy
- updatedBy
- createdAt
- updatedAt

Estados iniciales:

- `abierta`
- `en_negociacion`
- `cerrada`
- `perdida`

#### QuoteItem

- id
- quoteId
- productId nullable
- productSnapshotName
- productSnapshotSku
- unit
- quantity
- unitPrice
- subtotal
- notes

#### Order

- id
- customerId
- opportunityId nullable
- sourceQuoteId nullable
- status
- requestedDeliveryDate nullable
- notes
- subtotal
- total
- createdBy
- updatedBy
- createdAt
- updatedAt

Estados iniciales:

- `recibido`
- `orden_facturacion`
- `facturado`
- `despachado`
- `entregado`

#### OrderItem

- id
- orderId
- productId nullable
- productSnapshotName
- productSnapshotSku
- unit
- quantity
- unitPrice
- subtotal
- notes

#### BillingRequest

- id
- customerId
- opportunityId nullable
- sourceType
- sourceQuoteId nullable
- sourceOrderId nullable
- status
- notes
- requestedByUserId
- createdBy
- updatedBy
- createdAt
- updatedAt

`sourceType` inicial:

- `quote`
- `order`

#### AuditLog

- id
- entityType
- entityId
- action
- previousState jsonb nullable
- nextState jsonb nullable
- actorUserId
- createdAt

### Relaciones clave

- Un `Customer` tiene muchos `Contact`, `Opportunity`, `Visit`, `Quote`, `Order` y `BillingRequest`.
- Un `Opportunity` pertenece a un `Customer`.
- Un `Opportunity` puede originar una `Quote`.
- Una `Quote` aprobada puede originar un `BillingRequest`.
- Un `Order` recurrente puede originar un `BillingRequest` sin pasar por `Quote`.
- `QuoteItem` y `OrderItem` conservan snapshot de producto y precio pactado.

## Flujos operativos

### Flujo comercial principal

1. Crear cliente.
2. Registrar contactos.
3. Crear oportunidad.
4. Avanzar la oportunidad por pipeline.
5. Programar visita o seguimiento.
6. Generar cotizacion si aplica.
7. Si se aprueba, generar solicitud de facturacion.
8. Si es caso recurrente, crear pedido y luego solicitud de facturacion directa.

### Flujo de pedido

1. Crear pedido ligado a cliente y opcionalmente a oportunidad.
2. Agregar items desde catalogo.
3. Permitir ajuste de precio por item.
4. Cambiar estados operativos del pedido.
5. Generar solicitud de facturacion cuando corresponda.

### Flujo de agenda

1. Programar visita.
2. Crear seguimiento o recordatorio.
3. Visualizar pendientes por usuario y semana.
4. Marcar completado y dejar nota de cierre.

## Reglas de negocio

### Permisos

#### Admin

- administrar usuarios
- administrar segmentos
- administrar catalogo
- ver toda la operacion

#### Comercial

- operar clientes y contactos
- crear y actualizar oportunidades
- programar visitas y seguimientos
- crear cotizaciones
- crear pedidos
- crear solicitudes de facturacion

### Trazabilidad

- Toda entidad operativa debe registrar `createdBy`, `updatedBy`, `createdAt`, `updatedAt`.
- Toda transicion importante debe generar `AuditLog`.
- No se debe depender del precio actual del catalogo para reconstruir cotizaciones o pedidos historicos.

### Politica de borrado

- No borrar registros operativos criticos.
- Preferir `active/inactive` o estados de anulacion en lugar de delete fisico.

### Facturacion

- `BillingRequest` representa una solicitud interna.
- No modela la factura fiscal final en esta fase.

## Dashboard inicial

El dashboard MVP debe incluir:

- cotizaciones abiertas
- valor potencial del pipeline
- ventas cerradas
- pedidos activos
- agenda semanal
- seguimientos pendientes

## API y estructura de implementacion

### Contrato inicial

La primera iteracion debe exponer REST.

Rutas agrupadas por recurso:

- `/auth`
- `/users`
- `/customer-segments`
- `/customers`
- `/contacts`
- `/opportunities`
- `/visits`
- `/follow-up-tasks`
- `/products`
- `/quotes`
- `/orders`
- `/billing-requests`
- `/dashboard`
- `/audit`

### Principios de implementacion

- DTOs claros por modulo
- validacion de entrada en backend
- transiciones de estado controladas por servicio
- autorizacion por rol y propiedad
- servicios de dominio pequenos y enfocados

## Testing minimo del MVP

### Backend

- autenticacion
- autorizacion por rol
- CRUD de clientes y contactos
- CRUD de segmentos
- CRUD de productos
- transiciones validas de oportunidad
- creacion de cotizacion con items
- creacion de pedido con items
- generacion de solicitud de facturacion desde cotizacion
- generacion de solicitud de facturacion desde pedido
- auditoria en cambios relevantes

### Frontend

- login
- listados principales
- formularios de cliente
- formularios de oportunidad
- creacion de cotizacion
- creacion de pedido
- agenda y recordatorios
- dashboard basico

## Orden recomendado de implementacion

1. Scaffold monorepo base.
2. Auth y usuarios.
3. Clientes, segmentos y contactos.
4. Oportunidades.
5. Agenda: visitas y seguimientos.
6. Catalogo de productos.
7. Cotizaciones.
8. Pedidos.
9. Solicitudes de facturacion.
10. Dashboard basico.
11. Auditoria visible.

## Riesgos y decisiones explicitas

- Se excluye WhatsApp del MVP inicial para evitar mezclar canal conversacional con logica operacional base.
- Se excluye multitenancy para reducir complejidad estructural.
- Se usa monolito modular para velocidad, pero con fronteras de dominio claras.
- Se deja preparada la base para futuras integraciones mediante eventos internos simples.

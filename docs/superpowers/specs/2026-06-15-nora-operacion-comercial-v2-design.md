# Nora Operacion Comercial v2 - Design Spec

**Date:** 2026-06-15
**Status:** Approved for implementation planning
**Source:** Reunion cliente 2026-05-22, planes Superpowers existentes y estado actual del repo.

## Summary

Nora debe pasar de asistente puntual y router de WhatsApp a capa conversacional operativa del CRM. La fase no reconstruye los modulos existentes de pedidos, WhatsApp, credito/cupo, zonas, multiempresa, gastos, facturas o pagos. Nora los usa como fuente de verdad para consultar contexto, validar reglas, pedir aclaraciones y preparar acciones revisables por humanos.

El objetivo de producto es que clientes, comerciales y equipo administrativo puedan escribirle a una sola Nora, desde el CRM o WhatsApp, y obtener ayuda concreta sobre pedidos, cartera, agenda, gastos, ventas y seguimiento operativo. Internamente, el sistema aplica modos, permisos, validaciones y revision humana segun quien escribe y que accion se solicita.

## Goals

- Convertir Nora en una capa de agente por capacidades, no en un conjunto de reglas sueltas por palabra clave.
- Mantener una sola Nora visible, con modos internos `cliente`, `comercial` y `admin`.
- Permitir consultas directas sobre pedidos, cartera/cupo, agenda, clientes, visitas, gastos y ventas basicas.
- Preparar borradores de pedido desde WhatsApp con cliente, empresa, zona/sede y productos.
- Detectar soportes de pago y guias logisticas como eventos operativos asociados a facturas, pagos, pedidos o conversaciones.
- Dar al operador del unicanal resumen, intencion, datos extraidos y respuesta sugerida.
- Registrar toda decision relevante de Nora en `NoraActionLog`.
- Bloquear o pedir aclaracion cuando falten datos criticos, permisos o reglas de negocio.

## Non Goals

- No automatizar acciones criticas sin revision humana.
- No reemplazar los modulos existentes ni reescribir sus APIs.
- No crear integracion contable externa.
- No hacer OCR avanzado de facturas, pagos o guias en esta fase.
- No construir dashboards grandes nuevos; Nora puede consultar metricas existentes o basicas.
- No depender de credenciales reales de Meta/Kapso para validar la logica local.

## Existing Foundation

La fase se apoya en componentes que ya existen o estan encaminados:

- `apps/api/src/modules/whatsapp`: inbox, conversaciones, mensajes, webhooks Kapso y logs de Nora.
- `agents/nora`: servicio FastAPI/LangGraph de Nora.
- `apps/api/src/modules/orders`: pedidos, `sourceConversationId`, `companyId`, `customerZoneId`.
- `apps/api/src/modules/companies`: empresas facturadoras y consecutivos.
- `apps/api/src/modules/zones`: zonas y asignacion por cliente.
- `apps/api/src/modules/credit`: cupo, presupuesto y alertas.
- `apps/api/src/modules/commercial-expenses`: gastos comerciales.
- `apps/api/src/modules/invoices`: facturas y pagos.

La brecha principal es que `agents/nora/src/whatsapp_router.py` sigue siendo deterministico y el agente principal solo tiene tools para un subconjunto del CRM.

## User Modes

### Cliente

Usa Nora por WhatsApp como punto unico de contacto.

Puede:

- Solicitar un pedido.
- Preguntar por estado de pedido.
- Enviar soporte de pago.
- Enviar informacion faltante de pedido.
- Recibir una respuesta operativa sugerida o confirmacion de recepcion.

No puede:

- Crear pedidos definitivos sin revision humana.
- Ver cartera completa ni informacion interna.
- Cambiar estados logisticos o financieros.

### Comercial

Usa Nora desde CRM o WhatsApp como asistente de campo.

Puede:

- Consultar agenda, visitas y pendientes.
- Consultar clientes asignados, cupo, cartera y presupuesto.
- Consultar pedidos propios o de clientes permitidos.
- Registrar visitas, seguimientos y gastos.
- Preparar pedidos con empresa, zona y productos.
- Preguntar por ventas del periodo, clientes principales y productos mas vendidos.

Las escrituras criticas deben quedar como propuesta editable o usar los flujos existentes de confirmacion.

### Admin / Unicanal

Usa Nora para gestionar conversaciones entrantes.

Puede:

- Ver resumen de conversacion.
- Ver intencion detectada.
- Ver datos extraidos para pedido, pago o logistica.
- Usar respuestas sugeridas.
- Asignar o derivar conversaciones.
- Crear borradores desde conversaciones.

No debe perder control humano sobre pedidos, cartera, pagos o despacho.

## Capability Registry

Nora debe tener un registro explicito de capacidades. Cada capacidad define:

- `domain`: modulo CRM, por ejemplo `orders`, `customers`, `credit`, `invoices`, `payments`, `logistics`, `expenses`, `visits`, `dashboard`.
- `action`: `search`, `detail`, `summarize`, `create_draft`, `propose_update`, `register_event`.
- `mode`: modos que pueden usarla.
- `kind`: `read` o `write`.
- `requiresHumanReview`: booleano.
- `requiredFields`: datos minimos.
- `toolName` o endpoint API usado.
- `riskLevel`: `low`, `medium`, `high`.

Capacidades iniciales:

| Dominio | Accion | Modos | Tipo | Revision |
| --- | --- | --- | --- | --- |
| customers | search/detail | comercial, admin | read | no |
| orders | search/detail/status | cliente, comercial, admin | read | no |
| orders | create_draft | cliente, comercial, admin | write | si |
| credit | summary | comercial, admin | read | no |
| invoices | search/detail/overdue | comercial, admin | read | no |
| payments | register_support_event | cliente, admin | write | si |
| logistics | register_tracking_event | admin | write | si |
| visits | agenda/create_visit | comercial | read/write | create requiere confirmacion |
| expenses | create_expense_draft | comercial | write | si |
| dashboard | sales_summary | comercial, admin | read | no |
| whatsapp | summarize_conversation | admin | read | no |

## Agent Flow

El flujo base debe ser:

`message -> identity/context -> planner -> validator -> read executor or proposal builder -> response -> action log`

### 1. Identity And Context

Nora recibe:

- canal (`crm`, `whatsapp`)
- `conversationId` si aplica
- `senderType`
- `userId`, `customerId`, `contactId` cuando existan
- rol y permisos
- ultimos mensajes
- contexto de pagina CRM cuando aplique

El API debe resolver identidad por telefono para WhatsApp y por sesion para CRM.

### 2. Planner

El planner transforma el mensaje en una estructura estable:

```json
{
  "intent": "read | write | mixed | clarification | unsupported",
  "mode": "cliente | comercial | admin",
  "actions": [
    {
      "domain": "orders",
      "action": "create_draft",
      "fields": {
        "customerRef": "Agro Norte",
        "companyRef": "Nanonutricion",
        "zoneRef": "Costa",
        "items": []
      },
      "confidence": 0.82
    }
  ],
  "missingFields": [],
  "clarificationQuestion": null
}
```

### 3. Validator

El validator revisa:

- capacidad soportada
- permisos por modo y rol
- datos obligatorios
- ambiguedad de cliente, empresa, zona o producto
- cupo disponible cuando se propone pedido
- existencia de productos y precios
- si la accion requiere revision humana

Si algo critico falta, Nora pregunta una sola aclaracion concreta.

### 4. Read Executor

Las lecturas seguras se ejecutan directo y Nora responde en lenguaje natural. Ejemplos:

- "Que pedidos tengo pendientes?"
- "Cuanto cupo disponible tiene Agro Norte?"
- "Que tengo hoy en agenda?"
- "Cuanto llevo vendido este mes?"

### 5. Proposal Builder

Las escrituras construyen propuestas revisables:

- borrador de pedido
- evento de soporte de pago
- evento logistico con guia
- gasto comercial con soporte pendiente
- visita o seguimiento

La propuesta debe ser editable desde el CRM cuando la accion venga de WhatsApp o del chat.

## WhatsApp / Unicanal Behavior

Cuando entra un mensaje de WhatsApp:

1. El webhook guarda mensaje y conversacion.
2. `NoraRoutingService` resuelve identidad.
3. Nora clasifica intencion y modo.
4. Se crea o actualiza `NoraActionLog`.
5. Si la accion es de bajo riesgo, Nora puede sugerir o enviar respuesta automatica.
6. Si requiere humano, el inbox muestra resumen, datos extraidos y propuesta.

Mensajes de bajo riesgo:

- confirmacion de recepcion
- solicitud de dato faltante
- respuesta de estado cuando el dato ya esta disponible y no expone informacion sensible

Mensajes de alto riesgo:

- crear pedido
- registrar pago como efectivo
- marcar pedido despachado
- cambiar cupo o condiciones comerciales
- enviar informacion financiera sensible a un cliente externo

## Data And API Needs

La fase debe preferir endpoints existentes. Solo se agregan endpoints cuando falte una lectura clara para Nora.

Posibles endpoints internos nuevos:

- `GET /nora/context/whatsapp/:conversationId`
- `POST /nora/plan`
- `POST /nora/proposals`
- `POST /nora/proposals/:id/confirm`
- `GET /nora/capabilities`

Si se decide no crear un modulo `nora` en NestJS, estas responsabilidades pueden vivir temporalmente en `whatsapp` y el servicio Python, pero la frontera debe quedar documentada.

## Proposal Types

Propuestas iniciales:

### OrderDraftProposal

Campos:

- `customerId`
- `companyId`
- `customerZoneId`
- `items`
- `requestedDeliveryDate`
- `deliveryInstructions`
- `notes`
- `sourceConversationId`

Validaciones:

- cliente existe
- empresa activa
- zona pertenece al cliente si se envia
- productos existen
- subtotal no excede cupo

### PaymentSupportProposal

Campos:

- `invoiceId` opcional
- `customerId`
- `amount` opcional
- `supportMessageId` o referencia al adjunto
- `notes`

La propuesta no marca factura como pagada automaticamente. Queda para revision administrativa.

### LogisticsEventProposal

Campos:

- `orderId`
- `trackingNumber` opcional
- `carrier` opcional
- `supportMessageId` opcional
- `notes`

La propuesta no cambia estados logisticos sin confirmacion.

### ExpenseDraftProposal

Campos:

- `expenseDate`
- `category`
- `amount`
- `description`
- `customerId` opcional
- `supportMessageId` opcional

Si falta soporte o monto, Nora pide aclaracion.

## Frontend UX

### WhatsApp Inbox

Agregar o fortalecer panel lateral de Nora:

- intencion detectada
- modo interno
- resumen de conversacion
- datos extraidos
- riesgo de accion
- propuesta editable
- boton para confirmar, descartar o pedir dato faltante
- respuesta sugerida

### Nora Chat CRM

Mantener experiencia conversacional, pero mostrar respuestas estructuradas cuando aplique:

- tarjeta de consulta
- tarjeta de propuesta
- alerta de bloqueo
- pregunta de aclaracion

## Safety And Permissions

- Nora no escribe directo en tablas criticas sin pasar por servicios NestJS.
- Las reglas de negocio viven en API, no solo en prompts.
- Los permisos se validan en API antes de ejecutar lecturas o propuestas.
- Los clientes externos solo reciben informacion propia y no sensible.
- Cada decision queda auditada con input, output, modo, accion, estado y error si aplica.

## Error Handling

| Caso | Comportamiento |
| --- | --- |
| Cliente ambiguo | Preguntar cual cliente es |
| Producto no encontrado | Pedir referencia o mostrar coincidencias |
| Zona faltante con cliente multizona | Pedir zona/sede de despacho |
| Empresa faltante | Pedir Nortech o Nanonutricion |
| Cupo excedido | Bloquear propuesta y explicar disponible vs pedido |
| Nora API caida | Guardar error en log y mostrar fallback en inbox |
| Usuario sin permiso | Responder que no puede consultar o ejecutar esa accion |
| Adjuntos no soportados | Registrar mensaje y pedir soporte valido |

## Testing

Backend/API:

- Router identifica modo `cliente`, `comercial`, `admin`.
- Capability registry rechaza acciones no soportadas.
- Validator pide zona cuando cliente tiene varias zonas.
- Validator bloquea pedido que excede cupo.
- Propuesta de pedido incluye `sourceConversationId`, `companyId` y `customerZoneId`.
- Soporte de pago queda como propuesta y no marca factura pagada.
- Guia logistica queda como propuesta y no cambia estado sin confirmacion.
- `NoraActionLog` guarda input, output, status y error.

Agent:

- Mensaje de cliente pidiendo pedido genera `OrderDraftProposal`.
- Mensaje de comercial preguntando cartera ejecuta lectura.
- Mensaje de admin pidiendo resumen de conversacion devuelve resumen.
- Mensaje con intencion ambigua devuelve una aclaracion unica.

Frontend:

- Inbox muestra resumen, intencion y propuesta.
- Propuesta puede confirmarse o descartarse.
- Bloqueo por cupo se muestra como alerta operativa.
- Respuesta sugerida se puede enviar desde el inbox.

## Rollout

1. Mantener el router actual como fallback.
2. Agregar capability registry y planner para escenarios cubiertos.
3. Activar en entorno local/test con fixtures.
4. Activar en CRM chat.
5. Activar en WhatsApp inbox con revision humana.
6. Solo habilitar respuestas automaticas de bajo riesgo cuando los logs sean confiables.

## Open Operational Dependencies

- Credenciales Meta/Kapso para pruebas reales.
- Definicion final de la persona operadora del unicanal.
- Base inicial de clientes, productos, precios, zonas y asignaciones.
- Criterios finales de indicadores comerciales que el cliente prometio enviar.
- Acuerdo de confidencialidad antes de cargar informacion real.

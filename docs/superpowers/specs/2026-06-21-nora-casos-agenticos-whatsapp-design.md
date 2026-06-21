# Nora Casos Agenticos WhatsApp - Design Spec

**Date:** 2026-06-21  
**Status:** Written spec pending user review  
**Scope:** Convertir Nora WhatsApp de router por mensaje aislado a gestor de casos operativos persistentes para pedidos, clientes nuevos y gastos comerciales con imagen.

## Summary

Nora actualmente clasifica cada mensaje de WhatsApp de forma casi aislada. Eso causa fallas operativas como:

- un pedido queda bloqueado porque falta cliente;
- el comercial responde "crea uno nuevo";
- Nora pierde el contexto del pedido y vuelve al saludo general.

La misma limitacion afecta gastos: si el comercial manda una imagen o empieza un registro de gasto por conversacion, Nora no tiene un caso persistente donde acumular adjuntos, datos extraidos, preguntas y propuesta final.

Esta fase introduce un **case manager agentico** para WhatsApp. Cada conversacion puede tener un caso operativo abierto con tipo, estado, datos extraidos, campos faltantes, adjuntos, propuesta y auditoria. Nora conserva continuidad conversacional, pregunta solo lo que falta y deja propuestas revisables sin inventar datos.

## Goals

- Mantener estado operativo por conversacion para que mensajes cortos continuen el flujo correcto.
- Soportar pedidos con cliente existente, cliente ambiguo o cliente nuevo propuesto.
- Permitir que "crea uno nuevo" abra un flujo de cliente nuevo ligado al pedido, sin inventar datos.
- Soportar gastos por dos vias: foto directa y formulario conversacional.
- Analizar soportes de gasto con IA/OCR usando el modulo existente de gastos comerciales.
- Preguntar datos faltantes de forma incremental.
- Dejar clientes nuevos, pedidos y gastos como propuestas o borradores revisables.
- Mostrar en el inbox el caso abierto, campos extraidos, faltantes, adjuntos y acciones.
- Registrar decisiones y transiciones en `NoraActionLog`.

## Non Goals

- No crear clientes definitivos automaticamente.
- No aprobar pedidos, facturas, despachos, pagos ni gastos automaticamente.
- No inventar NIT, razon social, zona, productos, precios, proveedores, valores ni fechas.
- No reemplazar los servicios existentes de pedidos, clientes o gastos.
- No construir un agente libre con memoria no estructurada como fuente de verdad.
- No redisenar todo el inbox de WhatsApp fuera de lo necesario para visualizar casos y propuestas.

## Core Decision

Se implementara un modelo formal de casos/propuestas de Nora, no solo mas historial de mensajes ni logs sueltos.

Alternativas consideradas:

| Enfoque | Ventaja | Problema |
| --- | --- | --- |
| Estado ligero en `NoraActionLog` | Rapido y poco invasivo | Fragil para casos largos, adjuntos y revision |
| Modelo formal de casos | Auditable, extensible y validable | Requiere mas implementacion |
| Memoria libre del LLM | Flexible | Riesgo alto de invencion y baja trazabilidad |

La opcion elegida es el modelo formal porque permite comportamiento agentico sin perder control operativo.

## Data Model

Agregar una entidad persistente, nombre propuesto: `NoraConversationCase`.

Campos principales:

- `id`
- `conversationId`
- `parentCaseId`
- `type`: `order`, `new_customer`, `expense`
- `status`: `collecting_info`, `ready_for_review`, `approved`, `executed`, `cancelled`, `blocked`
- `extractedData`: JSON estructurado por tipo de caso
- `missingFields`: lista de campos requeridos pendientes
- `attachments`: lista de adjuntos de WhatsApp o referencias a storage
- `proposal`: JSON con la propuesta revisable
- `lastQuestion`: ultima pregunta enviada por Nora
- `riskLevel`: `low`, `medium`, `high`
- `createdByUserId`
- `approvedByUserId`
- `executedEntityType`
- `executedEntityId`
- timestamps

Cada transicion relevante tambien se registra en `NoraActionLog` con input, output, decision y error si aplica.

## Agentic Flow

Flujo base para cada mensaje o adjunto entrante:

1. `KapsoWebhookService` normaliza texto, imagen o documento.
2. `NoraRoutingService` resuelve remitente, identidad, conversacion y contexto CRM.
3. El backend busca caso abierto en la conversacion.
4. Nora recibe mensaje, contexto reciente y caso abierto.
5. El planner decide si el mensaje inicia un caso nuevo, continua el caso abierto, lo pausa/cancela o requiere aclaracion.
6. El case manager fusiona datos nuevos con `extractedData`.
7. Validadores de backend calculan `missingFields`, conflictos y acciones permitidas.
8. Nora responde una pregunta concreta o deja el caso en `ready_for_review`.
9. El inbox muestra el caso y la propuesta editable.
10. Acciones definitivas pasan por aprobacion humana o por servicios existentes con estado revisable.

Regla de prioridad: si hay un caso abierto y el mensaje es ambiguo, Nora intenta aplicarlo primero a ese caso antes de clasificarlo como saludo.

## Order Case

Un caso `order` acumula:

- `customerId`
- `customerRef`
- `companyRef` / `companyId`
- `zoneRef` / `customerZoneId`
- items: producto ref, cantidad, presentacion, notas
- instrucciones de despacho
- fecha o urgencia si aparece
- `sourceConversationId`

Validaciones:

- cliente existente o propuesta de cliente nuevo aprobada;
- empresa resuelta por backend;
- zona/sede resuelta cuando aplica;
- productos resueltos contra catalogo real;
- cantidades validas;
- precios y cupo validados por `OrdersService`.

Si el cliente existe y los datos criticos estan resueltos, Nora puede crear el pedido como `approvalStatus = en_revision`. Nunca queda aprobado o facturado automaticamente.

## New Customer Subflow

Cuando un pedido no tiene cliente identificado y el usuario responde "crea uno nuevo":

1. Nora no abandona el pedido.
2. Mantiene abierto el caso `order`.
3. Crea un caso hijo `new_customer`.
4. Pide datos minimos explicitos.
5. Deja una propuesta de cliente para revision humana.
6. El pedido queda bloqueado o en espera hasta que el cliente sea aprobado/creado.

Datos minimos propuestos:

- razon social o nombre comercial;
- NIT si aplica o confirmacion de que no lo tiene a mano;
- ciudad, zona o sede inicial;
- nombre de contacto;
- telefono de contacto, usando el WhatsApp si corresponde y el usuario lo confirma.

Reglas:

- "crea uno nuevo" solo expresa intencion.
- Nora no inventa NIT, razon social, direccion, zona ni contacto.
- Si el comercial no tiene todos los datos, la propuesta queda incompleta y marcada para revision.

## Expense Case

Un caso `expense` soporta dos vias oficiales.

### Via 1: Foto Directa

Si el comercial envia imagen o documento sin contexto:

1. Nora abre un caso `expense`.
2. Guarda el adjunto.
3. Ejecuta extraccion IA/OCR con el modulo existente de gastos comerciales.
4. Llena campos candidatos: fecha, valor, proveedor, NIT, numero de factura, categoria y descripcion.
5. Pregunta solo lo faltante: cliente, visita, metodo de pago, categoria dudosa u observaciones.

### Via 2: Formulario Conversacional

Si el comercial dice que va a registrar un gasto o describe uno:

1. Nora abre un caso `expense`.
2. Extrae monto, categoria, fecha, cliente o descripcion cuando aparezcan.
3. Pregunta campo por campo lo faltante.
4. Si luego llega una foto, se agrega al mismo caso y se usa OCR para completar o validar.

Resultado:

- El gasto queda como propuesta o borrador `pendiente`.
- Nunca queda aprobado automaticamente.
- Si OCR y texto se contradicen, Nora marca conflicto y pide confirmacion.

## Validation Rules

Reglas duras de seguridad:

- No inventar datos.
- No crear clientes definitivos sin aprobacion humana.
- No crear productos libres ni precios manuales por WhatsApp.
- No aprobar gastos automaticamente.
- No exponer informacion financiera sensible a clientes externos.
- Las escrituras usan servicios existentes y permisos de backend.
- Cada accion debe tener actor, origen y log auditable.

Campos faltantes por tipo:

| Caso | Campos criticos |
| --- | --- |
| `order` | cliente o propuesta aprobada, empresa, productos, cantidades |
| `new_customer` | nombre/razon social, datos de contacto minimos, contexto comercial |
| `expense` | valor, fecha, categoria, descripcion, usuario comercial; soporte si la politica lo exige |

## WhatsApp Replies

Nora debe responder de forma breve y orientada a la siguiente accion.

Ejemplos:

- Pedido sin cliente: "No encuentro ese cliente. Puedo dejar una propuesta de cliente nuevo, pero necesito razon social o nombre comercial y NIT si lo tienes."
- Cliente nuevo iniciado: "Listo, voy a preparar la propuesta de cliente. Dime la razon social o nombre comercial."
- Foto de gasto directa: "Recibi el soporte. Estoy extrayendo los datos; si no aparece el cliente en la factura, te lo voy a pedir."
- Gasto con faltantes: "Tengo valor y fecha. Que cliente o visita debo asociar a este gasto?"

No debe responder con saludo general cuando exista un caso abierto aplicable.

## Inbox UX

El inbox de WhatsApp debe mostrar un panel de caso activo con:

- tipo de caso;
- estado;
- datos extraidos;
- campos faltantes;
- ultima pregunta enviada;
- adjuntos;
- conflictos;
- propuesta editable;
- acciones: aprobar propuesta, editar, ejecutar, cancelar, bloquear.

Para pedido con cliente nuevo:

- mostrar el caso `order`;
- mostrar el subcaso `new_customer`;
- indicar que el pedido depende de aprobar/crear cliente.

Para gasto:

- mostrar datos OCR/texto;
- mostrar soporte;
- permitir editar antes de crear el gasto pendiente.

## Components And Boundaries

### Python Nora

Responsabilidades:

- clasificar continuidad vs caso nuevo;
- extraer lenguaje natural a campos candidatos;
- generar preguntas de aclaracion;
- producir respuestas naturales desde decisiones del backend.

No decide:

- crear entidades definitivas;
- resolver productos/precios/cupo;
- aprobar gastos o clientes.

### NestJS

Responsabilidades:

- persistir y consultar casos;
- fusionar datos de manera controlada;
- validar campos faltantes;
- ejecutar OCR/extraccion de soportes de gasto;
- resolver clientes, empresas, zonas y productos;
- crear borradores/propuestas usando servicios existentes;
- registrar auditoria.

### Web Inbox

Responsabilidades:

- visualizar casos y propuestas;
- permitir edicion humana;
- ejecutar aprobaciones o cancelaciones;
- mostrar errores y bloqueos claros.

## Error Handling

| Caso | Comportamiento |
| --- | --- |
| Mensaje ambiguo con caso abierto | Intentar aplicarlo al caso; si no encaja, preguntar si cambia de tema |
| Cliente no encontrado | Preguntar si desea propuesta de cliente nuevo |
| "Crea uno nuevo" sin datos | Abrir `new_customer` y pedir datos minimos |
| OCR sin valor | Pedir valor del gasto |
| OCR con conflicto contra texto | Pedir confirmacion del campo conflictivo |
| Producto ambiguo | Mostrar opciones o pedir SKU/referencia exacta |
| Caso duplicado | Avisar y enlazar al caso existente |
| Usuario cancela | Marcar caso `cancelled` y dejar log |

## Testing Plan

Python:

- planner continua caso de pedido cuando llega "crea uno nuevo";
- planner reconoce imagen/documento como continuidad de gasto;
- planner no devuelve saludo si hay caso abierto;
- extraccion de pedido y gasto conserva campos explicitos.

NestJS:

- crear caso nuevo por mensaje inicial;
- continuar caso abierto;
- crear subcaso `new_customer`;
- validar faltantes sin inventar datos;
- procesar imagen/documento de gasto;
- registrar transiciones en `NoraActionLog`;
- bloquear escrituras no permitidas.

Web:

- inbox muestra caso activo;
- propuesta de cliente nuevo es editable;
- pedido muestra dependencia del cliente;
- gasto muestra soporte, OCR, faltantes y conflictos.

E2E:

- flujo pedido: solicitud -> cliente faltante -> "crea uno nuevo" -> preguntas -> propuesta cliente -> pedido en espera;
- flujo gasto foto directa: imagen -> OCR -> pregunta cliente -> propuesta gasto;
- flujo gasto formulario: texto -> preguntas -> foto -> propuesta gasto.

## Success Criteria

- Nora no vuelve al saludo general cuando existe un caso abierto relevante.
- "Crea uno nuevo" en un pedido inicia propuesta de cliente nuevo, no una conversacion generica.
- Una foto de gasto directa abre o continua un caso de gasto.
- El comercial puede registrar gastos por foto o por preguntas guiadas.
- Ningun dato critico es inventado por Nora.
- Todas las propuestas quedan visibles y editables en el inbox.
- Las acciones quedan auditadas.

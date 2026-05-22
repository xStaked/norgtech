# Nora WhatsApp + Pedidos por Fases - Design Spec

**Date:** 2026-05-22
**Status:** Draft for review
**Decision:** Nora sera la interfaz conversacional unica para clientes y equipo interno por WhatsApp, usando Kapso como capa de integracion con Meta.

## Summary

El proyecto se divide en dos fases para responder a la urgencia real del cliente sin convertir el CRM en un alcance inmanejable.

La primera fase construye el flujo operativo critico: WhatsApp, Nora como fachada conversacional, inbox interno tipo Chatwoot simplificado, y pedidos conectados a conversaciones. La segunda fase deja planeado el resto del ecosistema comercial: cartera, logistica, gastos, reportes avanzados, segmentacion y control financiero.

Esta spec reemplaza la idea de un unicanal generico. El alcance confirmado es WhatsApp-only.

## Locked Decisions

| Decision | Choice |
|----------|--------|
| Canal inicial | Solo WhatsApp |
| Proveedor WhatsApp/Meta | Kapso |
| Interfaz conversacional | Nora como fachada unica |
| Usuarios que escriben a Nora | Clientes, comerciales y administrativos |
| Inbox humano | Propio dentro del CRM, inspirado en Chatwoot |
| IA en Fase 1 | Copiloto con confirmacion humana para acciones criticas |
| Omnicanal | Fuera de alcance |
| Primera prioridad | Pedidos + WhatsApp + Nora |
| Segunda prioridad | Resto del CRM comercial expandido |

## Product Goal

Nora debe sentirse como el punto unico de contacto de la operacion comercial.

Para clientes, Nora debe permitir escribir al WhatsApp de la empresa, consultar o iniciar pedidos, entregar datos faltantes y recibir respuestas operativas. Para comerciales, Nora debe permitir consultar clientes, pedidos, agenda y pendientes. Para el equipo administrativo, Nora debe ayudar a clasificar conversaciones, resumir contexto, extraer datos de pedido y sugerir respuestas.

El usuario ve una sola Nora. Internamente, el sistema usa contexto, roles, permisos y herramientas distintas segun quien escribe y desde donde.

## Phase 1 Scope: WhatsApp + Nora + Pedidos

### In scope

- Integracion WhatsApp usando Kapso.
- Recepcion de eventos por webhook desde Kapso.
- Envio de mensajes de WhatsApp desde el CRM usando Kapso.
- Persistencia propia de conversaciones y mensajes.
- Inbox WhatsApp dentro del CRM.
- Estados de conversacion: nuevo, abierto, pendiente, cerrado.
- Asignacion de conversaciones a usuario interno.
- Notas internas en conversaciones.
- Etiquetas simples: pedido, comercial, cartera, logistica, soporte, otro.
- Identificacion de remitente por telefono.
- Resolucion de remitente como cliente, contacto, comercial, admin o desconocido.
- Nora Gateway para enrutar mensajes al modo correcto.
- Nora Cliente para atender solicitudes externas.
- Nora Comercial para atender vendedores.
- Nora Admin para apoyar el inbox humano.
- Creacion de pedidos desde conversaciones.
- Asociacion de pedido con conversacion, cliente, contacto, vendedor, empresa facturadora y zona/sede.
- Flujo de pedido inicial: borrador, en revision, aprobado, enviado a facturacion, requiere correccion, rechazado.
- Confirmacion humana antes de crear o aprobar pedidos criticos.
- Auditoria basica de acciones de Nora y acciones humanas.

### Out of scope

- Instagram, correo, web chat u otros canales.
- Chatwoot como dependencia obligatoria.
- Respuestas totalmente autonomas para casos sensibles.
- Cartera completa.
- Logistica completa.
- Gastos comerciales.
- Reporteria avanzada.
- Automatizacion de cobros.
- Integracion contable completa.
- WhatsApp Flows, salvo que se decida como mejora puntual despues del primer flujo estable.

## Phase 2 Scope: CRM Comercial Expandido

### In scope later

- Segmentacion avanzada de clientes.
- Tipo de cliente: distribuidor, cliente directo, planta de balanceados, maquila u otros definidos por el cliente.
- Categoria comercial por volumen o potencial.
- Cupo de credito.
- Condiciones y dias de pago.
- Pedido a factura.
- Factura pagada/cancelada.
- Soportes de pago.
- Alertas de cartera vencida.
- Logistica: despacho, guia, en transito, entregado.
- Gastos comerciales con foto de soporte.
- Reportes para contabilidad.
- Dashboard comercial avanzado.
- Indicadores por vendedor, cliente, producto, zona, sede y empresa facturadora.
- Recompra, clientes dormidos, productos de baja rotacion y ranking de clientes.
- Mayor automatizacion de Nora cuando existan datos historicos confiables.

## Architecture

### 1. Kapso Integration Layer

Kapso es la capa de integracion con Meta/WhatsApp Cloud API.

Responsabilidades:

- Conectar el numero de WhatsApp.
- Proveer `phone_number_id`.
- Recibir eventos de WhatsApp desde Meta.
- Entregar webhooks al backend o gateway del CRM.
- Enviar mensajes de texto, medios o templates.
- Gestionar detalles tecnicos de Meta que no deben contaminar la logica del CRM.

El CRM no debe depender de estructuras internas de Meta mas alla de los identificadores y payloads que Kapso entregue.

### 2. WhatsApp Gateway

El gateway recibe eventos desde Kapso y adapta WhatsApp al dominio interno.

Responsabilidades:

- Validar autenticidad del webhook.
- Normalizar mensajes entrantes.
- Resolver o crear conversacion.
- Resolver contacto por telefono.
- Guardar mensaje entrante.
- Enviar evento a Nora Gateway.
- Enviar respuestas por Kapso cuando una accion sea aprobada.
- Registrar errores de entrega.

El gateway no decide reglas comerciales complejas. Solo adapta, persiste y enruta.

### 3. Nora Gateway

Nora Gateway es el cerebro de enrutamiento conversacional.

Responsabilidades:

- Identificar tipo de remitente: cliente, comercial, admin o desconocido.
- Cargar contexto permitido para ese remitente.
- Elegir modo interno de Nora.
- Aplicar permisos.
- Decidir si responde, pregunta, sugiere o escala a humano.
- Convertir intenciones en llamadas a herramientas internas.

Nora Gateway permite que todos hablen con "Nora" sin que exista una unica logica mezclada para todos los casos.

### 4. Nora Modes

#### Nora Cliente

Atiende contactos externos.

Puede:

- Saludar y capturar intencion.
- Identificar si el mensaje parece pedido, consulta comercial, cartera, logistica o soporte.
- Pedir datos faltantes para un pedido.
- Consultar estado de pedidos del cliente autenticado o identificado.
- Preparar un borrador de pedido.
- Escalar a humano cuando falte informacion o haya riesgo.

No puede:

- Ver informacion de otros clientes.
- Aprobar pedidos.
- Cambiar cupos, precios o condiciones.
- Confirmar descuentos no definidos.

#### Nora Comercial

Atiende vendedores y equipo comercial.

Puede:

- Consultar pedidos propios.
- Consultar clientes asignados.
- Consultar agenda, visitas y seguimientos existentes.
- Ayudar a preparar pedidos.
- Consultar pendientes.
- Resumir actividad de cliente.

No puede:

- Ver informacion fuera de sus permisos.
- Aprobar pedidos administrativos si su rol no lo permite.
- Modificar datos financieros sensibles sin confirmacion y permiso.

#### Nora Admin

Apoya a la persona encargada del inbox, inicialmente Magali o quien defina el cliente.

Puede:

- Resumir conversaciones.
- Clasificar intenciones.
- Sugerir etiquetas.
- Sugerir asignacion.
- Extraer datos candidatos para pedido.
- Proponer respuesta.
- Señalar datos faltantes o inconsistentes.

No debe:

- Enviar respuestas sensibles sin revision humana en Fase 1.
- Crear pedidos aprobados automaticamente.

### 5. Tool Layer

Nora no debe escribir directamente en la base de datos.

Debe operar a traves de herramientas internas con permisos y validaciones:

- `identifySenderByPhone`
- `findOrCreateConversation`
- `searchCustomer`
- `searchContact`
- `listProducts`
- `draftOrderFromConversation`
- `submitOrderForReview`
- `getOrderStatus`
- `assignConversation`
- `tagConversation`
- `summarizeConversation`
- `suggestReply`
- `sendWhatsAppMessage`

Cada herramienta debe registrar quien solicito la accion, que datos uso, que resultado genero y si requirio confirmacion humana.

## Data Model Concepts

La implementacion exacta se definira en el plan tecnico, pero el dominio necesita estos conceptos:

- WhatsApp account/number.
- Conversation.
- Conversation participant.
- Message.
- Message delivery status.
- Internal note.
- Conversation assignment.
- Conversation tag.
- Nora action log.
- Nora proposed action.
- Order linked to conversation.
- Sender identity mapping by phone.

La fuente de verdad para clientes, contactos, productos, usuarios, pedidos y roles sigue siendo el CRM.

## Core Flow: Cliente crea pedido por WhatsApp

1. Cliente escribe al WhatsApp de la empresa.
2. Kapso recibe el evento desde Meta.
3. Kapso entrega webhook al gateway.
4. Gateway valida, normaliza y guarda el mensaje.
5. Gateway resuelve conversacion y telefono.
6. Nora Gateway identifica si es cliente/contacto/desconocido.
7. Nora Cliente detecta intencion de pedido.
8. Nora Cliente pide datos faltantes o arma borrador.
9. Inbox muestra conversacion, resumen y borrador sugerido.
10. Humano revisa y confirma.
11. CRM crea pedido en estado `en revision` o `borrador`, segun completitud.
12. Respuesta se envia por WhatsApp via Kapso.

## Core Flow: Comercial consulta a Nora por WhatsApp

1. Comercial escribe a Nora desde su WhatsApp.
2. Gateway recibe y guarda mensaje.
3. Nora Gateway identifica usuario interno por telefono.
4. Nora Comercial carga permisos y contexto.
5. Nora responde consulta o prepara accion.
6. Si la accion escribe datos, Nora presenta propuesta editable.
7. El comercial confirma.
8. CRM ejecuta accion y registra auditoria.

## Core Flow: Admin opera inbox

1. Admin entra al inbox WhatsApp del CRM.
2. Ve conversaciones nuevas, abiertas, pendientes o cerradas.
3. Nora Admin muestra resumen, intencion y datos extraidos.
4. Admin asigna, etiqueta, responde o crea pedido.
5. Nora puede redactar respuesta o completar borrador.
6. Admin confirma antes de enviar o guardar acciones criticas.

## Human Review Policy

En Fase 1, Nora es copiloto.

Requieren confirmacion humana:

- Crear pedido final o enviar a facturacion.
- Aprobar pedido.
- Aplicar precio distinto a lista.
- Cambiar empresa facturadora.
- Cambiar zona/sede si hay ambiguedad.
- Responder reclamos, cartera o temas sensibles.
- Cerrar conversaciones con conflicto.

Nora puede responder automaticamente solo mensajes de bajo riesgo, por ejemplo:

- Confirmar recepcion.
- Pedir datos faltantes.
- Indicar que un humano revisara el caso.
- Responder dentro de un flujo informativo previamente aprobado.

## Success Criteria

La Fase 1 es exitosa si se puede demostrar este flujo completo:

- Un cliente escribe por WhatsApp.
- El mensaje entra por Kapso.
- La conversacion aparece en el inbox.
- Nora identifica intencion y resume.
- Nora propone datos de pedido.
- Un humano confirma.
- El pedido queda creado y ligado a la conversacion.
- El cliente recibe respuesta por WhatsApp.
- Un comercial puede escribirle a Nora y consultar sus pedidos o pendientes.

La Fase 2 es exitosa cuando el CRM convierte esos pedidos en control comercial completo: facturacion, cartera, logistica, gastos e indicadores.

## Risks

- Identidad por telefono puede ser ambigua si un numero lo usa mas de una persona.
- Clientes desconocidos pueden intentar hacer pedidos sin datos completos.
- La IA puede extraer mal productos, cantidades o zonas si no hay confirmacion humana.
- Kapso/webhooks requieren configuracion correcta de entorno publico HTTPS.
- WhatsApp impone reglas de ventana de conversacion y templates para mensajes iniciados por la empresa.
- Si los Excel del cliente llegan incompletos, pedidos y reportes tendran baja calidad.
- Si se promete demasiada autonomia en Fase 1, aumenta el riesgo operativo.

## Open Questions

- Nombre definitivo del responsable inicial del inbox: Magali u otra persona.
- Numero de WhatsApp a conectar: existente o provisionado nuevo por Kapso.
- Empresas facturadoras iniciales y nombres legales exactos.
- Catalogo final de zonas/sedes para pedidos.
- Reglas iniciales de precios: lista unica o listas por segmento.
- Cuales respuestas de Nora pueden enviarse automaticamente en Fase 1.

## Recommended Execution Order

1. Confirmar spec y alcance.
2. Actualizar o reemplazar el plan tecnico anterior de Nora WhatsApp Kapso Gateway.
3. Planificar Fase 1 como implementacion independiente.
4. Ejecutar Fase 1 hasta demo end-to-end.
5. Usar aprendizajes reales del inbox/pedidos para ajustar Fase 2.
6. Planificar Fase 2 por modulos, no como un bloque unico.


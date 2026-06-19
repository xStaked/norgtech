# Nora WhatsApp Pedidos Semi-Automaticos - Design Spec

**Date:** 2026-06-19
**Status:** Approved for implementation planning
**Scope:** Automatizar pedidos por WhatsApp con creacion semi-automatica cuando los datos criticos esten resueltos.

## Summary

Nora ya esta en produccion con Kapso y el CRM desplegado. Esta fase cierra el primer flujo de automatizacion de alto valor: convertir mensajes de pedido por WhatsApp en pedidos del CRM.

El flujo sera semi-automatico. Nora puede pedir aclaraciones, resolver datos y crear el pedido si cliente, empresa, zona y productos quedan identificados con confianza. Si hay ambiguedad, datos faltantes, cupo excedido o riesgo operativo, Nora no crea el pedido automaticamente y deja una propuesta visible para revision humana en el inbox.

La regla central es que el agente no inventa precios ni productos. Python/Nora extrae intencion y datos candidatos; NestJS resuelve contra la base real, valida reglas comerciales y ejecuta la creacion del pedido usando los servicios existentes.

## Goals

- Detectar solicitudes de pedido entrantes por WhatsApp.
- Extraer empresa facturadora, zona/sede, productos, cantidades, notas e instrucciones de despacho cuando aparezcan.
- Resolver productos con coincidencia flexible controlada por SKU, nombre o alias claro.
- Crear pedidos automaticamente solo cuando todos los datos criticos esten resueltos sin ambiguedad.
- Crear pedidos con `sourceConversationId`, `companyId`, `customerZoneId`, items reales y `approvalStatus = en_revision`.
- Responder automaticamente al cliente con resumen del pedido, total estimado y aviso de revision.
- Pedir una sola aclaracion concreta cuando falte un dato bloqueante.
- Dejar propuesta editable para el operador cuando Nora no pueda crear el pedido con seguridad.
- Registrar cada decision en `NoraActionLog`.

## Non Goals

- No automatizar facturacion, despacho ni pagos en esta fase.
- No permitir items personalizados con precio 0 en creacion automatica.
- No inventar descuentos, precios ni productos no existentes.
- No crear pedidos definitivos aprobados automaticamente.
- No mover toda la logica de Nora a NestJS.
- No redisenar el inbox completo de WhatsApp.
- No construir un workflow Kapso paralelo que duplique reglas del CRM.

## Key Decisions

| Topic | Decision |
| --- | --- |
| Autonomia | Semi-automatica |
| Creacion automatica | Permitida solo con datos criticos completos y no ambiguos |
| Estado inicial | `recibido` con `approvalStatus = en_revision` |
| Producto no encontrado | Preguntar o dejar propuesta; no crear item libre automatico |
| Producto ambiguo | Preguntar una aclaracion concreta |
| Precio | Calculado por backend con producto real y segmento |
| Respuesta al cliente | Resumen del pedido + total estimado + aviso de revision |
| Frontera de responsabilidades | Nora extrae; NestJS resuelve, valida y crea |

## Current Foundation

La fase se apoya en lo que ya existe:

- `KapsoWebhookService` recibe eventos y guarda conversaciones/mensajes.
- `NoraRoutingService` llama a `agents/nora` y guarda `NoraActionLog`.
- `agents/nora/src/whatsapp_router.py` produce intencion, respuesta sugerida y propuestas.
- `OrdersService.create` ya valida cliente, empresa, zona, productos, cupo y crea pedidos.
- `WhatsAppService.createOrderDraft` ya permite crear pedidos desde una conversacion.
- El inbox ya muestra propuestas y tiene `OrderDraftPanel`.

Brechas actuales:

- El pedido propuesto puede quedar con items crudos o incompletos.
- La creacion desde inbox no incluye de forma confiable `companyId` y `customerZoneId`.
- Nora no ejecuta una resolucion real de productos antes de proponer o crear.
- No existe una decision formal de `auto_create`, `needs_clarification` o `human_review`.
- Las respuestas al cliente dicen que se revisara, pero no resumen un pedido creado automaticamente.

## Architecture

### 1. Python Nora: Extraction Layer

Nora mantiene la responsabilidad de lenguaje natural:

- clasificar si el mensaje es un pedido;
- extraer candidatos de empresa, zona, productos, cantidades, presentaciones y notas;
- generar una pregunta de aclaracion si NestJS devuelve un bloqueo;
- producir una respuesta natural a partir del resultado del backend.

La salida para pedidos debe ser estructurada:

```json
{
  "intent": "pedido",
  "actions": [
    {
      "domain": "orders",
      "action": "resolve_and_create_from_whatsapp",
      "fields": {
        "companyRef": "Nanonutricion",
        "zoneRef": "Costa",
        "items": [
          {
            "productRef": "NTX Broiler",
            "quantity": 10,
            "presentation": "bulto"
          }
        ],
        "deliveryInstructions": "Despachar esta semana",
        "notes": "Mensaje original"
      },
      "confidence": 0.82
    }
  ]
}
```

### 2. NestJS: Resolution And Execution Layer

NestJS decide el resultado operativo. Debe agregar una funcion interna o endpoint autenticado para procesar el pedido candidato:

`POST /whatsapp/conversations/:id/order-automation`

Responsabilidades:

1. Cargar conversacion, cliente, contacto, empresas activas y zonas del cliente.
2. Validar que la conversacion tenga cliente resuelto.
3. Resolver empresa por id, prefijo, nombre o alias conocido.
4. Resolver zona por id, nombre o alias; autoseleccionar si el cliente tiene una sola zona activa.
5. Resolver productos por SKU exacto, nombre exacto o coincidencia flexible controlada.
6. Rechazar creacion automatica si un producto tiene multiples candidatos similares.
7. Construir `CreateOrderDto` con productos reales.
8. Dejar que `OrdersService.create` calcule precios, descuentos, impuestos, totales y cupo.
9. Crear pedido si todo pasa.
10. Registrar auditoria/log de Nora con decision y resultado.

### 3. Result Contract

El resolver devuelve uno de tres resultados:

```json
{
  "decision": "created",
  "orderId": "ord_123",
  "orderNumber": "NN-001",
  "summary": {
    "company": "Nanonutricion",
    "zone": "Costa",
    "items": [
      { "name": "Producto A", "quantity": 10, "unit": "bulto" }
    ],
    "total": 1250000
  },
  "reply": "Recibimos tu pedido..."
}
```

```json
{
  "decision": "needs_clarification",
  "missingField": "customerZoneId",
  "question": "Para preparar el pedido, dime la zona o sede de despacho."
}
```

```json
{
  "decision": "human_review",
  "reason": "Producto ambiguo",
  "proposal": {
    "type": "order_draft",
    "payload": {}
  }
}
```

## Product Resolution Rules

La resolucion flexible controlada usa este orden:

1. SKU exacto normalizado.
2. Nombre exacto normalizado.
3. Alias definido en codigo o configuracion simple si existe.
4. Coincidencia parcial fuerte cuando solo hay un candidato activo razonable.

Si hay 0 candidatos, Nora pregunta por referencia exacta o deja propuesta.

Si hay 2 o mas candidatos razonables, Nora pregunta:

`Encontre varias opciones para "X": A, B, C. Cual producto necesitas?`

No se crea item automatico con `unitPrice = 0`.

## Company And Zone Rules

Empresa:

- Si hay una sola empresa activa, se autoselecciona.
- Si hay varias, se resuelve por prefijo, razon social, nombre visible o alias.
- Si no se puede resolver, Nora pregunta por empresa.

Zona:

- Si el cliente no tiene zonas activas, el pedido puede continuar sin `customerZoneId`.
- Si tiene una sola zona activa, se autoselecciona.
- Si tiene varias, se resuelve por nombre o alias.
- Si hay ambiguedad, Nora pregunta por zona/sede.

## Automatic Creation Criteria

Nora solo crea automaticamente si:

- La conversacion esta vinculada a un cliente.
- La empresa queda resuelta.
- La zona queda resuelta cuando es obligatoria por multizona.
- Todos los items tienen producto real y cantidad valida.
- No hay productos ambiguos.
- `OrdersService.create` no bloquea por cupo, validacion o permisos.
- El riesgo sigue clasificado como `high` por ser escritura, pero el resultado operativo es `created` porque los datos pasaron validacion.

Si cualquiera de estas condiciones falla, el resultado debe ser `needs_clarification` o `human_review`.

## WhatsApp Reply

Cuando el pedido se crea automaticamente, Nora envia una respuesta con resumen:

```text
Recibimos tu pedido y queda en revision.

Empresa: Nanonutricion
Zona/sede: Costa
Productos:
- Producto A: 10 bultos
- Producto B: 5 kg
Total estimado: $1.250.000

Te confirmamos facturacion y despacho en breve.
```

Si falta un dato, Nora hace una sola pregunta.

Si queda en revision humana, Nora responde que recibio la solicitud y que el equipo confirma en breve.

## Inbox Behavior

El inbox debe mostrar:

- Decision: creado, falta aclaracion o revision humana.
- Resumen de datos extraidos.
- Pedido creado con link si aplica.
- Pregunta enviada al cliente si aplica.
- Propuesta editable si aplica.
- Error claro si el backend bloqueo la creacion.

`OrderDraftPanel` debe dejar de enviar pedidos con items de fallback. Si no hay productos resueltos, debe exigir revision humana.

## Safety And Permissions

- El webhook publico no debe aceptar payloads arbitrarios para crear pedidos sin pasar por la resolucion interna.
- La creacion automatica debe usar un actor de sistema o usuario operativo definido, registrando el origen en auditoria.
- Los clientes externos solo pueden crear pedidos para el cliente vinculado a su conversacion.
- Nora no expone cupo ni datos internos al cliente en la respuesta de pedido.
- El backend mantiene la validacion final de cupo, empresa, zona y productos.

## Error Handling

| Case | Behavior |
| --- | --- |
| Cliente no identificado | Preguntar nombre y empresa; no crear pedido |
| Empresa faltante | Preguntar Nortech/Nanonutricion o alias vigente |
| Zona ambigua | Preguntar zona/sede |
| Producto no encontrado | Preguntar referencia exacta |
| Producto ambiguo | Preguntar cual opcion |
| Cantidad faltante | Preguntar cantidad |
| Cupo excedido | No crear; dejar revision humana con bloqueo visible |
| Error al enviar WhatsApp | Pedido queda creado si ya se creo; log registra fallo de envio |
| Nora API caida | Mensaje queda en inbox con error; no hay creacion automatica |

## Testing

Backend:

- Mensaje con cliente, empresa, zona y producto exactos crea pedido.
- Cliente con una sola zona autoselecciona zona.
- Cliente multizona sin zona devuelve `needs_clarification`.
- Empresa ambigua devuelve `needs_clarification`.
- Producto por SKU exacto crea item correcto.
- Producto por nombre parcial unico crea item correcto.
- Producto ambiguo devuelve `human_review` o `needs_clarification`.
- Producto no encontrado no crea item con precio 0.
- Cupo excedido no crea pedido automatico.
- Pedido creado queda vinculado a `sourceConversationId`.
- `NoraActionLog` guarda decision, payload y resultado.

Agent:

- Mensaje de pedido produce accion estructurada.
- Mensaje con multiples productos conserva items separados.
- Mensaje incompleto produce pregunta de aclaracion.

Frontend:

- Inbox muestra pedido creado con link.
- Inbox muestra pregunta de aclaracion cuando falte zona/empresa/producto.
- `OrderDraftPanel` no permite crear pedido con items fallback.
- Propuesta en revision humana puede confirmarse manualmente.

## Rollout

1. Implementar resolver en NestJS y pruebas backend.
2. Ajustar planner de Nora para entregar candidatos estructurados.
3. Conectar `NoraRoutingService` al resolver para mensajes `pedido`.
4. Mantener auto-envio solo para resultados `created` o `needs_clarification`.
5. Activar con logs en produccion y monitorear conversaciones reales.
6. Ajustar alias de productos/empresas/zonas con base en mensajes reales.

## Acceptance Criteria

- Un cliente identificado puede pedir por WhatsApp usando texto natural.
- Si los datos son claros, Nora crea el pedido automaticamente en revision.
- El cliente recibe resumen del pedido y total estimado.
- Si falta un dato, Nora pregunta solo por ese dato.
- Si un producto es ambiguo, Nora no crea el pedido.
- El operador ve en el inbox que paso y puede abrir el pedido o revisar la propuesta.
- No se crean pedidos automaticos con productos inventados, precio 0 o empresa/zona equivocada.

# Nora WhatsApp Phase 1 Demo

## Objetivo

Demostrar Fase 1 completa: WhatsApp-only con Kapso, Nora como fachada de conversacion, inbox operativo, sugerencia IA, creacion de pedido y respuesta outbound.

## Preparacion

- API CRM corriendo y migrada.
- Web app disponible en `/whatsapp`.
- Nora disponible en `NORA_API_URL`.
- Kapso webhook apuntando a `/whatsapp/webhooks/kapso`.
- Usuario admin/comercial con acceso al inbox.
- Cliente/contacto de demo vinculado a un telefono WhatsApp.

## Guion

1. Cliente escribe por WhatsApp: "Hola Nora, necesito 10 bultos de Producto A para la sede Costa."
2. Kapso entrega el webhook a `/whatsapp/webhooks/kapso`.
3. El inbox muestra una conversacion nueva o actualizada.
4. Nora clasifica el mensaje como `pedido`.
5. Nora sugiere una respuesta y un borrador de pedido.
6. Admin revisa el borrador en el panel derecho del inbox.
7. Admin crea el pedido desde la conversacion.
8. CRM muestra el pedido vinculado a la conversacion.
9. Admin responde: "Recibido, tu pedido quedo en revision."
10. Kapso envia el mensaje outbound por WhatsApp.
11. Comercial escribe: "Nora, que pedidos tengo pendientes?"
12. Nora enruta como `comercial` y devuelve contexto de pedidos limitado a ese rol.

## Checklist UAT

- [ ] El mensaje aparece en el inbox en menos de 5 segundos.
- [ ] La conversacion incluye tipo de remitente (`cliente`, `comercial`, `admin` o `desconocido`).
- [ ] La sugerencia de Nora es visible.
- [ ] El borrador de pedido se puede revisar antes de crear el pedido.
- [ ] El pedido creado incluye `sourceConversationId`.
- [ ] El pedido queda visible desde el detalle de la conversacion.
- [ ] La respuesta queda persistida como mensaje outbound.
- [ ] El resultado de envio de Kapso queda guardado o el error queda visible/trazable.
- [ ] Una consulta de comercial se enruta como `comercial`, no como cliente.

## Evidencia Esperada

- Captura de `/whatsapp` con conversacion, sugerencia Nora y panel de pedido.
- Registro API del webhook con `201 Created`.
- Respuesta de `GET /whatsapp/conversations/:id` con `messages`, `noraActions` y `orders`.
- Detalle de pedido con `sourceConversationId`.
- Mensaje outbound con `deliveryStatus` `sent` o `failed` y payload de Kapso.

## Notas de Riesgo

- El mapeo productivo telefono -> usuario comercial debe resolverse antes de activar comerciales reales por WhatsApp.
- La validacion de firma del webhook queda pendiente hasta confirmar el formato final de Kapso.
- Si Nora no esta disponible, el webhook no debe fallar; debe quedar un `NoraActionLog` con estado `failed`.

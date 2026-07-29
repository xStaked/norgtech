# Plantillas de WhatsApp (Meta)

Los avisos que inicia el sistema (no una respuesta del comercial) salen fuera de
la ventana de 24h, asi que Meta obliga a plantilla aprobada. Sin la aprobacion,
Kapso rechaza el envio y el cron solo deja un warning en el log — la campana de
la app sigue funcionando.

Quien las empuja: `WhatsAppNotificationsCron` (`PUSH_TEMPLATES`), cada 5 minutos,
leyendo `Notification.pushedAt IS NULL`.

## Categoria: por que rechazan con `INCORRECT_CATEGORY`

Meta no revisa solo el texto, tambien decide la categoria. UTILITY es "novedad
de una cuenta que ya existe"; cualquier invitacion a entrar, ver, descubrir o
aprovechar algo la reclasifica a MARKETING y rechaza el envio como UTILITY.

Reglas para estas plantillas:

- Nada de CTA ("Entra a Norgtech", "Míralo aquí", "No te lo pierdas").
- Redactar como actualizacion de cuenta o recordatorio de algo ya agendado.
- Cuanto mas corto, menos superficie para que el clasificador se confunda.

Si aun asi rechazan, la salida es mandarla como MARKETING — pero cuesta mas por
mensaje y el comercial puede tener el opt-out de marketing puesto y no recibir
nada. Preferir siempre reescribir.

## `cliente_asignado`

Primera version rechazada por `INCORRECT_CATEGORY`: el "Entra a Norgtech para
ver su ficha" la volvia MARKETING. Esta es la que queda:

```json
{
  "name": "cliente_asignado",
  "language": "es",
  "category": "UTILITY",
  "parameter_format": "NAMED",
  "components": [
    {
      "type": "BODY",
      "text": "Hola {{nombre}}, actualización de tu cuenta Norgtech: {{detalle}}.",
      "example": {
        "body_text_named_params": [
          { "param_name": "nombre", "example": "Carlos" },
          { "param_name": "detalle", "example": "Te asignaron el cliente Agro Norte" }
        ]
      }
    }
  ]
}
```

## `visita_proxima`

```json
{
  "name": "visita_proxima",
  "language": "es",
  "category": "UTILITY",
  "parameter_format": "NAMED",
  "components": [
    {
      "type": "BODY",
      "text": "Hola {{nombre}}, recordatorio de tu agenda Norgtech: {{detalle}} Registra el resultado al terminar.",
      "example": {
        "body_text_named_params": [
          { "param_name": "nombre", "example": "Carlos" },
          {
            "param_name": "detalle",
            "example": "Visita pronto: Agro Norte — Empieza a las 11:00 a. m."
          }
        ]
      }
    }
  ]
}
```

## Alta y verificacion

Mismo procedimiento que `correccion_gasto`
(`docs/superpowers/plans/2026-06-23-correccion-gastos-whatsapp.md`):

```
node scripts/create-template.mjs  --business-account-id <WABA_ID> --file cliente-asignado.json
node scripts/template-status.mjs  --business-account-id <WABA_ID> --name cliente_asignado
```

La aprobacion tarda de minutos a 1–2 dias. Repetir con `visita_proxima`.

`{{detalle}}` sale del `title` + `body` de la notificacion, normalizado a una
linea: cambiar la redaccion de un emisor cambia el texto del WhatsApp sin tocar
la plantilla, pero el sentido de la frase que la envuelve tiene que seguir
cuadrando.

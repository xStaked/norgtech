# Plantillas de WhatsApp (Meta)

Los avisos que inicia el sistema (no una respuesta del comercial) salen fuera de
la ventana de 24h, asi que Meta obliga a plantilla aprobada. Sin la aprobacion,
Kapso rechaza el envio y el cron solo deja un warning en el log — la campana de
la app sigue funcionando.

Quien las empuja: `WhatsAppNotificationsCron` (`PUSH_TEMPLATES`), cada 5 minutos,
leyendo `Notification.pushedAt IS NULL`.

## `cliente_asignado`

```json
{
  "name": "cliente_asignado",
  "language": "es",
  "category": "UTILITY",
  "parameter_format": "NAMED",
  "components": [
    {
      "type": "BODY",
      "text": "Hola {{nombre}}, {{detalle}}. Entra a Norgtech para ver su ficha.",
      "example": {
        "body_text_named_params": [
          { "param_name": "nombre", "example": "Carlos" },
          { "param_name": "detalle", "example": "te asignaron el cliente Agro Norte" }
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
      "text": "Hola {{nombre}}, recordatorio: {{detalle}} No olvides registrarla en Norgtech al terminar.",
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

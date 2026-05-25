# Kapso WhatsApp Setup Runbook

## Alcance

Este runbook deja lista la integracion WhatsApp-only de Fase 1: Kapso recibe eventos de Meta, los entrega a la API CRM en `/whatsapp/webhooks/kapso`, Nora genera sugerencias por `NORA_API_URL`, y el equipo responde desde el inbox `/whatsapp`.

## Variables

Configurar `apps/api/.env` a partir de `apps/api/.env.example`:

```bash
DATABASE_URL=postgresql://norgtech:norgtech_dev@localhost:5432/norgtech
JWT_SECRET=dev-secret
FRONTEND_URL=http://localhost:3000
PORT=3001
NORA_API_URL=http://localhost:8000
KAPSO_API_BASE_URL=https://api.kapso.ai/meta/whatsapp
KAPSO_API_KEY=replace-me
KAPSO_PHONE_NUMBER_ID=replace-me
KAPSO_WEBHOOK_SECRET=replace-me
WHATSAPP_TEST_USER_PHONE_MAP=
```

`KAPSO_WEBHOOK_SECRET` queda reservado para validacion de firma cuando Kapso entregue el formato final de firma. En el estado actual, el endpoint acepta payloads validos de Kapso y los valida por estructura.

## Prerrequisitos

1. API CRM corriendo en `http://localhost:3001`.
2. Nora corriendo en `http://localhost:8000`.
3. Web app corriendo en `http://localhost:3000`.
4. Un numero WhatsApp activo en Kapso/Meta.
5. `KAPSO_API_KEY` y `KAPSO_PHONE_NUMBER_ID` configurados.

## Kapso CLI

Validar sesion y numero:

```bash
kapso status
kapso whatsapp numbers list --output json
kapso whatsapp numbers resolve --phone-number "<display-number>" --output json
```

Enviar una prueba outbound por Kapso:

```bash
kapso whatsapp messages send --phone-number-id <PHONE_NUMBER_ID> --to <WA_ID> --text "Prueba Nora"
```

Registrar webhook hacia un host publico de la API:

```bash
kapso webhooks create --phone-number-id <PHONE_NUMBER_ID> --url https://<public-api-host>/whatsapp/webhooks/kapso --events whatsapp.message.received,whatsapp.message.status --payload-version v2
```

Si el CLI instalado usa nombres distintos, usar el comando equivalente del proyecto Kapso y dejar anotado el comando final en esta seccion antes de pasar a produccion.

## Smoke Local

Compilar API y web:

```bash
pnpm --filter @norgtech/api build
cd apps/web && npm run build
```

Validar specs principales:

```bash
pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts
pnpm --filter @norgtech/api test -- orders.e2e-spec.ts
cd apps/web && npx playwright test tests/e2e/whatsapp.spec.ts
```

Validar Nora:

```bash
cd agents/nora && uv run --with pytest pytest tests/test_whatsapp_router.py -q
```

## Smoke Webhook

Con la API local corriendo, enviar un payload minimo equivalente a Kapso:

```bash
curl -X POST http://localhost:3001/whatsapp/webhooks/kapso \
  -H "Content-Type: application/json" \
  -d '{
    "event": "whatsapp.message.received",
    "phoneNumberId": "local-phone-number-id",
    "businessAccountId": "local-business-id",
    "message": {
      "id": "local-message-1",
      "from": "573001112233",
      "type": "text",
      "text": { "body": "Necesito hacer un pedido" },
      "timestamp": "2026-05-22T15:00:00.000Z",
      "profile": { "name": "Cliente Demo" }
    }
  }'
```

Resultado esperado:

- `201 Created`.
- Conversacion visible en `/whatsapp`.
- Mensaje inbound guardado.
- `NoraActionLog` creado con sugerencia o con error trazable si Nora no esta disponible.

## Checklist Produccion

- `KAPSO_API_KEY` configurado como secreto, no en repositorio.
- `NORA_API_URL` apunta al servicio Nora privado o protegido.
- URL publica HTTPS de API apunta a `/whatsapp/webhooks/kapso`.
- Numero de Kapso coincide con `KAPSO_PHONE_NUMBER_ID`.
- Revisar que `KAPSO_API_BASE_URL` coincida con el tenant/region real de Kapso.
- Definir mapeo productivo telefono -> usuario comercial antes de activar comerciales por WhatsApp. El helper `WHATSAPP_TEST_USER_PHONE_MAP` es solo local.
- Activar validacion de firma cuando Kapso confirme el formato de `KAPSO_WEBHOOK_SECRET`.

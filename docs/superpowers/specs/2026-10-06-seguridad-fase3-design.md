# Fase 3 Seguridad Hardening — Design

**Fecha:** 2026-10-06
**Origen:** pedido del cliente post-cierre Fase 2.
**Estado:** propuesto; ejecución con subagentes (worktree `security-fase3`).

## Goal

Cerrar las brechas de seguridad expuestas del API sin romper operación: autenticar
el webhook de WhatsApp, headers/proxy, comparaciones timing-safe, tipos MIME en
soportes y throttling fino en endpoints caros.

## Lo que ya está bien (no se toca)

- SQL injection: cero `queryRawUnsafe`; Prisma parametrizado; `$queryRaw` tagged
  templates con interpolación = variables con bind.
- Throttler global 100 req/min + login/refresh 5/min.
- Cookies refresh: httpOnly, sameSite lax, secure en producción.
- CORS por allowlist de FRONTEND_URL.
- bcrypt (10 rounds) para passwords; Multer file-size en soportes.

## Frente 1 — Webhook Kapso autenticado (crítico)

`POST /whatsapp/webhooks/kapso` es público y acepta cualquier body. Un atacante
puede forjar conversaciones y pedidos "del cliente".

- Se pide firma HMAC-SHA256 con `KAPSO_WEBHOOK_SECRET`: si llega header
  `X-Kapso-Signature` (formato `sha256=<hex>`) se valida con `crypto.timingSafeEqual`
  sobre el rawBody.
- Fallback token compartido: header `X-Webhook-Token` con el mismo secreto,
  igual timing-safe (Kapso soporta headers custom en la configuración del webhook).
- Modo transición `WEBHOOK_SECURITY=warn`: si no hay firma ni token pero el secreto
  está configurado, se loguea warning y continúa; así el prod se despliega primero
  en warn, se configura Kapso, y se aprieta (default `strict`).
- Sin `KAPSO_WEBHOOK_SECRET` configurado: warning al boot y comportamiento warn
  (visibilidad, no silencio). Nunca 500 a Kapso por headers: 401 con body { error }.

## Frente 2 — Headers + proxy + timing-safe

- `helmet` en bootstrap (deps nueva, candado de versión).
- `app.set("trust proxy", 1)` para que el Throttler vea la IP real detrás de nginx.
- Refresh cookie: mantener flags; no prefijos `__Host-` (rompería host configurado).
- `ServiceTokenGuard`: comparar con `crypto.timingSafeEqual` (hoy es `!==`).

## Frente 3 — Throttle fino en endpoints caros

Decoradores `@Throttle` con constantes nombradas en:
- `POST /whatsapp/agent/expenses` y `POST /nora/agent` (LLM): 10/min.
- OCR de facturas (upload gastos con IA): 10/min (ya cubierto por el mismo route).
- `GET /analytics/csv` (export): 10/min.
- `GET /reports/:id/pdf`: 20/min.
Los números van en un mapa de constantes (`rate-limits.constants.ts`) con comentario
del porqué; el global 100/min queda igual.

## Frente 4 — Tipos de de contenido en soportes

- `invoices.service.ts` payment support: aplicar MIME allowlist (image/jpeg,
  image/png, application/pdf capado por los mismos constantes de gastos) + file
  filter en el Multer del controller. Paridad con commercial-expenses.
- `pnpm audit --prod`: gate de high/critical con salida al reporte; fixes de
  versión menores si son seguros.

## Preguntas abiertas

- Confirmar el mecanismo de firma real de Kapso al configurarlo (header exacto).
  El guard acepta ambos y el modo warn cubre la transición.

## Fuera de alcance

- Nora (FastAPI) CORS/rate-limit interno — Fase B si el prod lo expone directo.
- CSP por página en el web (Next), SRI de assets, WAF externo.

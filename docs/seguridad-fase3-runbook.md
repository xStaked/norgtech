# Runbook seguridad fase 3 — operación y transición

Referencia operativa para despliegues de la API (`apps/api`). Todo lo descrito
está anclado en código real (rutas citadas). Fuentes de verdad de la fase 3:
`apps/api/src/modules/whatsapp/kapso-webhook.guard.ts`,
`apps/api/src/app-security.ts`,
`apps/api/src/modules/whatsapp/rate-limits.constants.ts`,
`apps/api/src/shared/support-file.constants.ts`,
`apps/api/src/main.ts`.

## 1. Webhook Kapso: firma o token

Endpoint: `POST /whatsapp/webhooks/kapso` (`whatsapp.controller.ts:34-46`),
protegido por `KapsoWebhookGuard`. La guardia acepta **una** de dos
credenciales; la recomendada es la firma del cuerpo crudo:

1. **Firma HMAC:** header `X-Kapso-Signature: sha256=<hex>` con
   `hex = HMAC-SHA256(KAPSO_WEBHOOK_SECRET, body crudo)`. El body crudo solo
   existe si el bootstrap usa `NestFactory.create(AppModule, { rawBody: true })`
   (`main.ts`); si falta `rawBody`, la firma siempre falla y el log de warn
   muestra la razón `request.rawBody is missing (enable rawBody: true)`.
2. **Token compartido:** header `X-Webhook-Token` con el mismo valor del
   secreto. La comparación va en tiempo constante
   (hash a digests de longitud fija + `timingSafeEqual`).

Costo de memoria de `rawBody: true`: cada request JSON/URL-encoded retiene
además el cuerpo crudo en memoria (una copia extra en `req.rawBody`); los
uploads multipart no pasan por ahí (los maneja Multer), pero no suba el
límite de payload de los webhooks sin considerar ese costo.

Variable de entorno de la API (`apps/api/.env`):

```
KAPSO_WEBHOOK_SECRET=<secreto compartido, >=32 bytes aleatorios>
```

En la configuración del webhook de Kapso (dashboard): apuntar el callback a
este endpoint y registrar ese mismo secreto como webhook secret del canal. El
secreto nunca viaja en la URL/query; el header solo lleva el HMAC del cuerpo.
Si la conexión de Kapso no permite firma, usar el header custom
`X-Webhook-Token` con el mismo valor.

Detalle de tolerancia de la guardia: el prefijo `sha256=` es opcional
(case-insensitive) y se aceptan listas separadas por coma (solo entradas
hexadecimales se prueban; lo demás cuenta como firma malformada). Nunca se
loguea el secreto ni los valores exactos de los headers.

Verificación manual (simular un webhook con firma válida):

```bash
SECRET=$(grep '^KAPSO_WEBHOOK_SECRET=' apps/api/.env | cut -d= -f2-)
BODY='{"entry":[],"object":"whatsapp_business_account"}'
SIG=$(node -e "const c=require('node:crypto');process.stdout.write(c.createHmac('sha256',process.argv[1]).update(process.argv[2]).digest('hex'))" "$SECRET" "$BODY")
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Content-Type: application/json' \
  -H "X-Kapso-Signature: sha256=$SIG" \
  -d "$BODY" https://<api-host>/whatsapp/webhooks/kapso
# Con firma válida --> 201 (POST creado; supertest y Nest responden 201)
# Sin credenciales en modo strict --> 401 "Kapso webhook authentication failed"
```

## 2. Transición WEBHOOK_SECURITY warn → strict

`WEBHOOK_SECURITY` controla el modo de la guardia
(`kapso-webhook.guard.ts:91-97`), case-insensitive y con trim. Por defecto es
**`strict`** (401 sin credenciales válidas); `warn` deja pasar las peticiones
sin credencial válida y solo las marca en el log.

Procedimiento recomendado para activar la autenticación en producción por
primera vez:

1. Configurar `KAPSO_WEBHOOK_SECRET` (sección 1) y arrancar con
   `WEBHOOK_SECURITY=warn`.
2. En la config de Kapso fijar el mismo secreto (firma o token).
3. Vigilar 24–48 h los logs buscando entradas
   `Kapso webhook request accepted in warn mode without valid credentials (...)`.
   La razón exacta indica qué ocurrió: `no credentials` (Kapso no está
   mandando credencial), `invalid X-Webhook-Token`, `X-Kapso-Signature is
   malformed` o `rawBody is missing` (revisar que el despliegue use
   `rawBody: true`).
4. Si los webhooks legítimos de Kapso ya entran con credencial válida y solo
   quedan ruido de bots/scanners en los warn, cambiar a
   `WEBHOOK_SECURITY=strict` (o simplemente quitar la variable: el default es
   strict) y reiniciar.
5. Después del corte: monitorear los webhooks reales de Kapso (respuestas
   401 `Kapso webhook authentication failed` = alguna credencial quedó mal
   configurada) antes de dar por cerrada la transición.

Ojo con el mensaje de arranque: si el despliegue sube **sin**
`KAPSO_WEBHOOK_SECRET`, la guardia queda **fail-open** en ambos modos y en
boot loguea `KAPSO_WEBHOOK_SECRET no está configurado...`. Ver ese warning
en boot significa que el webhook sigue sin autenticación.

## 3. Trust proxy: 1 salto

`app-security.ts:18-19` fija `expressApp.set("trust proxy", 1)`: se asume
exactamente **un** proxy confiable frente a la API (hoy: nginx). Con ese
valor Express resuelve `req.ip` desde `X-Forwarded-For` (la IP real del
cliente que reporta el proxy), y de ahí dependen:

- El throttle global y por endpoint de `@nestjs/throttler`: si la API solo
  viera la IP del proxy, todos los usuarios compartirían cuota y un burst
  castigaría a todos como si fueran una sola persona.
- Los logs de la guardia del webhook (razón legible, no identidad por IP).

Si la infraestructura cambia (Cloudflare, túnel o un segundo nginx por
delante): contar los saltos confiables reales y ajustar el valor (`2`, `3`,
...) en `app-security.ts`. Nunca poner más confianza de la debida:
`X-Forwarded-For` es controlado por el cliente y con más saltos de confianza
que los reales un atacante puede suplantar IPs frente al throttler.

Ojo si algún día se dan **subredes** como valor de trust proxy (en vez de un
número): la CVE crítica de `proxy-addr` (GHSA-jqcg-44mw-7w3h, patch en
2.0.8 — el lockfile ya quedó corregido en esta fase) hacía que subredes
IPv4-mapped IPv6 mal escritas, p. ej. `::ffff:10.0.0.0/8` (lo correcto es
`::ffff:10.0.0.0/104`), compilaran silenciosamente y confiaran en todos los
clientes como proxy: `req.ip` respondía luego al valor que el cliente mandara
en `X-Forwarded-For`. Con el valor numérico `1` ese caso no aplica hoy; la
regla es evitar que un cambio futuro lo vuelva a introducir.

## 4. Límites de tasa — tabla de valores

Global para toda la API (`ThrottlerGuard` como `APP_GUARD`,
`app.module.ts:43,79`): **100 req/min por IP**, ttl 60.000 ms
(`@nestjs/throttler` ≥5 mide ttl en milisegundos). El webhook de Kapso
también cae bajo el global: con un volumen de callbacks real cercano a
100/min, revisar primero el burst de Kapso antes de subir límites, y en ese
caso preferir un ajuste fino por endpoint antes que tocar el global.

Mapa fino `RATE_LIMITS` (`rate-limits.constants.ts:10-19`), aplicado vía
`@Throttle` en los controllers:

| Clave                    | Ventana | límite | Endpoint(s)                                        |
|--------------------------|---------|--------|-----------------------------------------------------|
| global (`forRoot`)       | 60 s    | 100    | toda la API                                         |
| `noraAgent`              | 60 s    | 30     | turnos del agente Magali (`nora-agent`) vía LLM     |
| `expenseOcr`             | 60 s    | 12     | extracción OCR de gastos (`commercial-expenses`)    |
| `analyticsCsv`           | 60 s    | 10     | exportaciones CSV de analítica (guardia dedicada)   |
| `reportsPdf`             | 60 s    | 10     | reportes PDF (`reports`)                            |

Valores generosos por diseño: cortar un flujo real sería peor que tolerar un
burst razonable. Para ajustar uno: cambiar solo el objeto en
`rate-limits.constants.ts` (cada controller lo toma por spread) y correr las
suites e2e correspondientes. Un 429 en producción se identifica por
endpoint + IP (la IP del cliente; ver trust proxy en sección 3).

## 5. Allowlist de soportes de pago (uploads)

Valores en `apps/api/src/shared/support-file.constants.ts:7-14`:

- Tipos aceptados: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
- Tamaño máximo: `SUPPORT_FILE_MAX_BYTES = 10 MB`.

Doble enforcement: el mimetype lo declara el cliente, así que se valida dos
veces, no solo del lado del input:

1. `fileFilter` de Multer en el upload (`invoices.controller.ts:138-144`,
   `assertPaymentSupportMimeType`), con `memoryStorage()` y
   `limits.fileSize`: rechaza antes de guardar con
   `Unsupported payment support content type` (400).
2. Re-verificación en las capas de servicio antes de subir a R2
   (`invoices.service.ts`, `commercial-expenses.service.ts` y
   `assertSupportFile` en `commercial-expense-extraction.service.ts`, que
   además valida tamaño): rechazo con 400. Los PDF no van a OCR; la extracción
   con modelo de visión solo procesa los 3 tipos de imagen
   (`isImageMimeType` en `commercial-expense-extraction.provider.ts:202-208`).

Si algún día se necesita un tipo nuevo (p. ej. `heic` desde WhatsApp):
agregarlo primero en `shared/support-file.constants.ts` y en los puntos de
verificación de las capas (el modelo de visión solo procesa jpeg/png/webp:
un tipo nuevo de imagen requiere ampliar ahí también, y los PDF siguen sin
pasar por OCR). Probar que todo lo demás sigue rechazado con 400.

## 6. Helmet sobre el JSON de la API

`app-security.ts:23-24` monta `helmet()` (defaults) para **toda** respuesta,
incluidos los errores JSON. Es una API JSON: las cabeceras `CSP`,
`X-Frame-Options`, `Cross-Origin-*` y `X-Content-Type-Options` vienen de
fábrica y no molestan a clientes que consumen `application/json` (no hay
documentos que el browser cargue desde la API). Puntos a vigilar en ops:

- Si algún día la API sirve HTML o entregas de archivos inline ("ver en el
  browser"), revisar la CSP de helmet antes de ese cambio, porque la CSP
  default de helmet es restrictiva (inline scripts bloqueado, por ejemplo).
- HSTS viene activo por defecto (180 días, incluye subdominios): la ruta
  del dominio que atienda la API debe tener TLS real (nginx/Cloudflare);
  con la API sirviendo por HTTP simple, un browser que la visitara una vez
  quedaría forzado a HTTPS.
- CORS se habilita en el mismo hook con `origin=FRONTEND_URL` (admite varios
  separados por coma), `credentials: true`, métodos y headers permitidos
  listados en `app-security.ts:31-42`. El auth va por header `Authorization`
  (JWT); `cookie-parser` queda montado para la web. Los webhooks y los
  clientes server-side no tienen restricciones de CORS.

## 7. Audit de dependencias (contexto de esta fase)

Resultado del gate `pnpm audit --prod` tras las correcciones aplicadas en
esta fase (bumps minor/patch con suites en 677/679, 2 stale pre-fase3):
**0 critical, 0 low; queda
1 high + 1 moderate, documentados aquí porque el fix requiere bump mayor y
el plan de la fase prohíbe majors:**

| Hallazgo | Ruta | Estado / mitigación |
|---|---|---|
| `deepmerge-ts@7.1.5` high (GHSA-ggr8-5vv4-36mx) | `@prisma/client` → prisma (peer) → `@prisma/config` → `deepmerge-ts` | El fix requiere `@prisma/config` que use `deepmerge-ts` ≥8 (bump mayor). El módulo solo corre en el CLI de prisma (`prisma generate` / validación de config), fuera del runtime de peticiones de la API. Mitigación: mantener la regla de no-major; en el próximo update de prisma 6.x revisar si `@prisma/config` ya la trae ≥8 y re-ejecutar el audit. |
| `uuid@8.3.2` moderate (GHSA-w5hq-g745-h8pq) | `exceljs` → `uuid` | El fix requiere `uuid` ≥11 (major); exceljs declara `^8`. La CVE es de integridad cuando se llaman `v3/v5/v6` con buffers externos, uso que no está en las rutas de negocio aquí. Sin acción en fase 3. |

Correcciones de versión aplicadas (ver el `pnpm-lock.yaml` de este commit):

| Paquete | Antes → después | Motivo (advisories resueltos) |
|---|---|---|
| `multer` | 2.1.1 → 2.4.0 | 5 highs: DoS por anidación en nombre de campos multipart (2 en ≥2.2.0) y crash del proceso con una request de texto especial + race en fileFilter (3 en ≥2.3.0) |
| `@nestjs/platform-express` | 11.1.19 → 11.2.7 | su `multer` interno pasaba de la 2.1.1 vulnerable a la 2.4.0 (mismo major 11, peer-compatible) |
| `proxy-addr` | 2.0.7 → 2.0.8 | 1 **critical**: subredes trust IPv4-mapped IPv6 mal escritas se aceptaban sin error → spoof de `X-Forwarded-For` (ver sección 3) |
| `qs` | 6.15.1 → 6.16.0 | 3 moderates: bypass de `arrayLimit` con `comma: true` y crash de `qs.stringify` con `null` en arrays |
| `body-parser` | 2.2.2 → 2.3.0 | 1 low: un `limit` inválido deshabilitaba silenciosamente el corte de tamaño |
| `brace-expansion` | 1.1.14/2.1.1/5.0.5 → 1.1.21/2.1.7/5.0.12 | highs: expansión exponencial de `{}` que bloquea el thread (~90 bytes) |
| `shadcn` (apps/web) | dependencies → devDependencies | es la CLI que genera componentes; su árbol entero (hono, fast-uri, nanoid, browserslist, postcss…) sale del audit de prod |

Ojo en el build de web: shadcn ahora es devDependency, así que un
`pnpm install --prod` + `next build` fallaría por el `@import` CSS
(`globals.css` importa `shadcn/tailwind.css`, que se resuelve en build time,
no en runtime): instalar apps/web con devDependencies incluidas.

Re-ejecute `pnpm audit --prod --json` en cada corte, y para aceptar el gate
exija 0 critical y solo los highs documentados de esta sección.

# Fase 3 Seguridad Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Autenticar el webhook de Kapso, añadir headers/trust-proxy, timing-safe compare, MIME allowlists y throttle fino — todo con TDD e2e RED→GREEN.

**Architecture:** Guard dedicado `KapsoWebhookGuard` (HMAC con fallback token, modo warn/strict por env) sobre el controller del webhook; `helmet` + `trust proxy` en `main.ts`; `@Throttle` con constantes nombradas; MIME allowlist reutilizando las constantes de expenses.

**Tech Stack:** NestJS 11 + `@nestjs/throttler` (ya instalado) + `helmet` (nueva), `crypto.timingSafeEqual`, jest e2e con stubs.

**Spec:** `docs/superpowers/specs/2026-10-06-seguridad-fase3-design.md`

## Global Constraints

- Node 22, pnpm 10.32.1, TS estricto (`npx tsc --noEmit` limpio).
- API tests: `npx jest --config test/jest-e2e.json <archivo>` desde apps/api (patrón stubs de la rama).
- Lint: `eslint . --max-warnings=0`.
- TDD: RED → GREEN, cada fix con test.
- Nunca romper el flujo legítimo del webhook: cambia fail-open → fail-closed solo con modo `strict`; transición vía `WEBHOOK_SECURITY=warn`.
- Cero romper validación actual del body; `whitelist:false` del webhook se mantiene (binario firma primero).
- UI/API copy en español es-CO donde aplique.

## Review Focus

- Firmas feas por doble hash/secret leak en errores (nunca loggear el secreto).
- Timing-unsafe compare residual (`!==` sobre secrets).
- Guard que rompe webhook real (Kapso reenvía con firma distinta → validar tolerancia: exact bytes rawBody).
- `trust proxy` 1 en front nginx directo (si proxy cadena >1, ajustar; documentar).
- Throttle que rompería power users reales: los límites son generosos y por-route; global no cambia.

---
### Task 1: KapsoWebhookGuard (HMAC + token, warn/strict)

**Files:**
- Create: `apps/api/src/modules/whatsapp/kapso-webhook.guard.ts`, `apps/api/src/modules/whatsapp/rate-limits.constants.ts`
- Modify: `apps/api/src/modules/whatsapp/whatsapp.controller.ts` (`@UseGuards(KapsoWebhookGuard)` en el webhook; mantener ValidationPipe), `apps/api/src/app.module.ts` (export config si falta), `apps/api/.env.example`
- Test: `apps/api/test/kapso-webhook-guard.e2e-spec.ts`

**Interfaces:**
- Consumes: `KAPSO_WEBHOOK_SECRET` (env), `WEBHOOK_SECURITY` (`strict|warn`), rawBody del request (Nest `rawBody: true` en `NestFactory.create` si no está — enable en `main.ts`).
- Produces: guard reutilizable; sin firma+sin token → 401 en `strict`, pasa+warn en `warn`; firma válida → siempre pasa (independiente del modo).

- [ ] **Step 1: RED** — e2e: (a) sin headers y modo strict con secret → 401; (b) con `X-Webhook-Token: <secret>` → 200; (c) con `X-Kapso-Signature: sha256=<hmac del rawBody>` → 200; (d) firma inválida → 401; (e) modo warn sin headers → 200 y log warning. Stub controller real del módulo WhatsApp (patrón de la rama).
- [ ] **Step 2: Run test to verify it fails** (`npx jest --config test/jest-e2e.json kapso-webhook-guard.e2e-spec.ts`) Expected: FAIL
- [ ] **Step 3: GREEN** — guard + wiring + rawBody enable. Nunca loguear el secreto.
- [ ] **Step 4: Run tests** Expected: PASS + suite whatsapp.e2e-spec.ts sigue verde (el webhook ahora exige guard: actualizar los fixtures de kapso webhook si los e2e existentes lo llaman sin firma — añadir token header en los tests, señalando con comentario).
- [ ] **Step 5: Commit** `feat(api): autenticar webhook kapso (hmac + token, warn/strict)`

### Task 2: Helmet + trust proxy + timing-safe token

**Files:**
- Modify: `apps/api/package.json` (Dep: `helmet@^8`), `apps/api/src/main.ts` (helmet + `app.set("trust proxy", 1)`), `apps/api/src/modules/auth/service-token.guard.ts` (timingSafeEqual), `apps/api/src/app.module.ts` (si el guard requiere HttpAdapter se deja standalone).
- Test: e2e mini en `apps/api/test/security-headers.e2e-spec.ts` (headers básicos de helmet en cualquier respuesta) + test existente del ServiceTokenGuard si hay (buscar spec; si no, crear uno unit del guard con mocks mínimos).

**Interfaces:**
- Produces: respuestas con helmet; guard timing-safe; Throttler con IP real.

- [ ] **Step 1: RED** — test que pide headers (e.g. `x-content-type-options`, `x-frame-options`) y test del guard con token válido/inválido (comprobar compare segura no observable, solo funcional).
- [ ] **Step 2: RED run** Expected: FAIL
- [ ] **Step 3: GREEN** — helm + trust proxy + timingSafeEqual (comparar longitudes primero; si difieren, llamarlo "invalid" sin excepción de lengths).
- [ ] **Step 4: PASS** suite nueva + smoke de whatsapp/kapso e2e no rota.
- [ ] **Step 5: Commit** `feat(api): helmet, trust proxy y token timing-safe`

### Task 3: Throttle fino endpoints caros

**Files:**
- Modify: controllers citados (whatsapp agent, expenses upload OCR, analytics csv, reports pdf) con `@Throttle(...)` importando constantes de `rate-limits.constants.ts`.
- Test: e2e `apps/api/test/rate-limits.e2e-spec.pdf-csv.spec.ts` — no probamos límites exactos pegando requests (requiere contadores por IP); en su lugar unidad del mapa de constantes + revisión de wiring; smoke una ruta >25 req que responda 429 (Throttler real en la app de test).

**Interfaces:**
- Produce: constantes `RATE_LIMITS = { noraAgent: {ttl,limit}, expenseOcr, analyticsCsv, reportsPdf }`.

- [ ] **Step 1: RED** — e2e pegando 30 requests a `GET /reports/:id/pdf` con stubs de DB (pueden fallar 404/500, pero el esperado es 429 en un momento dado UNDER route throttle 20/min → la prueba es que después de N.occur gets llegue 429).
- [ ] **Step 2: FAIL run** Expected: FAIL (no hay límite fino aún; va el global 100)
- [ ] **Step 3: GREEN** — decoradores + constantes.
- [ ] **Step 4: PASS** + verificar que los límites no rompen el flujo normal de un comercial (documentación en constants).
- [ ] **Step 5: Commit** `feat(api): throttle fino en endpoints caros`

### Task 4: MIME allowlist payment supports

**Files:**
- Modify: `apps/api/src/modules/invoices/invoices.controller.ts` (fileFilter de Multer usando constantes de `commercial-expenses.service.ts` exportadas o moverlas a shared), `apps/api/src/modules/invoices/invoices.service.ts` (mismas validaciones antes del upload)
- Test: e2e `invoices.e2e-spec.ts` extension: upload soporte `text/plain` → 400; `image/png` → pasa.

- [ ] **Step 1: RED** — tests de upload con MIME no permitido → hoy pasa (sube sin filtro).
- [ ] **Step 2: FAIL run**
- [ ] **Step 3: GREEN** — allowlist + fileFilter; también validar en servicio (defense in depth).
- [ ] **Step 4: PASS** suite invoices completa.
- [ ] **Step 5: Commit** `feat(api): mime allowlist en soportes de pago`

### Task 5: Cierre — audit dependencias + runbook

**Files:**
- Create: `docs/seguridad-fase3-runbook.md` (config Kapso firma/token, WEBHOOK_SECURITY=warn→strict, trust proxy según infra, lista de límites).
- Modify: ninguno (o exact-secs pin si `pnpm audit` reveals CVE fix trivial).
- Test: `pnpm audit --prod` salida al reporte; gate: cero high/critical en prod deps (si existen, fix de versión con test suite verde).

- [ ] **Step 1: Run `pnpm audit --prod --json` y analizar.
- [ ] **Step 2: Fix o documenta cada high/critical (versión o mitigación); re-run suites afectadas.
- [ ] **Step 3: Escribir runbook.**
- [ ] **Step 4: Commit** `docs: runbook seguridad fase 3 (+audit fixes)`

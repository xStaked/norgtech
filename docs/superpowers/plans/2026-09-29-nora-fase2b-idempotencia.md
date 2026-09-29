# Nora Fase 2b — Idempotencia end-to-end Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ningún reintento, doble-click o webhook duplicado crea dos veces el mismo pedido, visita, gasto o cliente.

**Architecture:** Llave de idempotencia por turno generada en Nora (o UUID del cliente si llega) que viaja en cada payload de creación; NestJS la persiste UNIQUE y ante repetida devuelve el registro existente con `alreadyExisted`; dedup de webhooks Kapso por `message-id`.

**Tech Stack:** Python 3.12 (Nora), NestJS + Prisma + Postgres (API)

**Spec:** `docs/superpowers/specs/2026-09-29-nora-fase2-escala-design.md` (sección P2-b)

## Global Constraints
- Sin servicios nuevos.
- Sin cambios a prompts, planner regex ni UX salvo el contrato 409 y el centinela de contexto aquí definidos.
- Ventana de retención de llaves: 7 días; dedup webhooks: 24h.
- Suite Nora en verde en cada tarea; suite API (`pnpm test` o equivalente) en verde en Task 2.
- Commits pequeños, uno por tarea.

## Review Focus
- Mismo mensaje repetido minutos después (turno nuevo intencional) → SÍ crea otro registro (test en Task 1).
- Doble-click / retry mismo minuto → un solo registro, segunda respuesta con `alreadyExisted` (test en Task 2).
- Webhook Kapso entregado 2 veces → un solo turno procesado (test en Task 2).
- Front manda su propio UUID → se prefiere sobre la generada (test en Task 1).
- 409 lleva body `retryAfter` Y header `Retry-After`; `contextType: "none"` limpia el contexto (tests en Task 3).

---

### Task 1: Keygen en Nora + threading en payloads de creación

**Files:**
- Create: `agents/nora/src/idempotency.py`
- Modify: `agents/nora/src/tools/orders.py`, `visits.py`, `expenses.py`, `customers.py`, `quotes.py` (aceptan y envían `idempotencyKey`)
- Test: `agents/nora/tests/test_idempotency_keys.py`

**Interfaces:**
- Consumes: nada (puro)
- Produces: `turn_key(session_id: str, message: str, now: datetime) -> str` (`sha256(session_id|message|minuto)`), `resolve_key(client_key: str | None, session_id, message, now) -> str` (prefiere la del cliente si llega no vacía)

- [ ] **Step 1: Write the failing test**

```python
def test_same_minute_same_key():
    assert turn_key("s", "hola", t(12, 0, 10)) == turn_key("s", "hola", t(12, 0, 50))

def test_next_minute_new_key():
    assert turn_key("s", "hola", t(12, 0, 59)) != turn_key("s", "hola", t(12, 1, 1))

def test_client_key_wins():
    assert resolve_key("uuid-1", "s", "hola", t(...)) == "uuid-1"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run --with pytest pytest agents/nora/tests/test_idempotency_keys.py -v`
Expected: FAIL with "turn_key not defined"

- [ ] **Step 3: Implement `idempotency.py` + añadir `idempotencyKey` al payload de cada tool de creación (sin cambiar su lógica)**

La llave se genera por turno en `main.py`/`whatsapp_*_agent.py` y se pasa a la tool; las tools la incluyen tal cual en el POST a NestJS.

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run --with pytest pytest agents/nora/tests/test_idempotency_keys.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agents/nora/src/idempotency.py agents/nora/src/tools/ agents/nora/tests/test_idempotency_keys.py
git commit -m "feat(nora): llave de idempotencia por turno"
```

### Task 2: NestJS persiste la llave + dedup de webhooks

**Files:**
- Modify: `apps/api/prisma/schema.prisma` + migración (`idempotencyKey UNIQUE` en Order/Visit/Expense/Customer/Quote o tabla `NoraIdempotencyKey`)
- Modify: servicios de creación correspondientes (ante llave repetida devuelven el existente + `alreadyExisted: true`)
- Modify: ingesta de webhook WhatsApp (dedup por `message-id` Kapso, ventana 24h)
- Test: `apps/api/...` e2e (doble POST misma llave → un registro; doble webhook mismo `message-id` → un turno)

**Interfaces:**
- Consumes: `idempotencyKey` en el body que Nora envía (Task 1)
- Produces: respuesta existente `{..., alreadyExisted: true}` ante llave repetida

- [ ] **Step 1: Write the failing test**

```ts
// e2e: POST /orders dos veces con misma idempotencyKey → mismo id, 1 fila en DB
// e2e: webhook con mismo message-id dos veces → un solo turno a Nora
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter api test <archivo-e2e>`
Expected: FAIL (2 filas creadas / 2 turnos)

- [ ] **Step 3: Implement columna/tabla UNIQUE + rama `alreadyExisted` en cada servicio + dedup de webhooks**

Retención: llaves 7 días (job o `DELETE` oportunista), webhooks 24h.

- [ ] **Step 4: Run test to verify it passes + suite API verde**

Run: `pnpm --filter api test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma apps/api/src
git commit -m "feat(api): idempotencia de creaciones del agente"
```

### Task 3: Contrato 409 exacto + centinela de contexto

**Files:**
- Modify: `agents/nora/src/main.py` (409 con body `{"detail":"turn_in_progress","retryAfter":2}` + header `Retry-After: 2`)
- Modify: `agents/nora/src/sessions.py` (`contextType: "none"` limpia `context_type/entity_id`)
- Test: `agents/nora/tests/test_409_scope.py` (extender), `agents/nora/tests/test_session_ttl.py` (extender)

**Interfaces:**
- Consumes: `locked_session`/pg locks y `SessionStore` existentes
- Produces: contrato 409 final (documentar en el spec si difiere), centinela `"none"`

- [ ] **Step 1: Write the failing test**

```python
def test_409_body_and_header():
    # POST con lock ocupado → 409, body["retryAfter"] == 2 y header Retry-After == "2"

def test_none_clears_context():
    # get_or_create(..., context_type="none") → context_type None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run --with pytest pytest agents/nora/tests/test_409_scope.py agents/nora/tests/test_session_ttl.py -v`
Expected: FAIL (body sin `retryAfter` / `"none"` guardado literal)

- [ ] **Step 3: Implement body+header en ambos endpoints y rama `"none"` en `sessions.py` (memoria y backend PG)**

- [ ] **Step 4: Run test to verify it passes + suite Nora verde**

Run: `uv run --with pytest pytest agents/nora/tests -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agents/nora/src/main.py agents/nora/src/sessions.py agents/nora/tests/
git commit -m "feat(nora): contrato 409 exacto y salida de contexto"
```

# Nora Fase 2a — Persistencia + locks distribuidos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turnos y sesiones sobreviven a restarts y funcionan con N workers, con el mismo contrato 409 de Fase 1.

**Architecture:** `AsyncPostgresSaver` construido en el `lifespan` (schema `nora_langgraph`, migraciones propias); serialización por sesión con `pg_advisory_xact_lock` sobre una conexión retenida del pool durante el turno; `nora_sessions` reemplaza `SessionStore` con la misma API pública.

**Tech Stack:** Python 3.12, LangGraph 1.2.7, `langgraph-checkpoint-postgres`, `asyncpg`, Postgres existente del API

**Spec:** `docs/superpowers/specs/2026-09-29-nora-fase2-escala-design.md` (sección P2-a)

## Global Constraints
- Sin servicios nuevos: solo el Postgres existente.
- Sin cambios a prompts, planner regex ni UX de respuestas.
- Suite Fase 1 (291 tests) en verde en cada tarea.
- Commits pequeños, uno por tarea.
- Tests P2-a requieren Postgres local: `TEST_DATABASE_URL` (documentado en el paso 1 de cada test que lo usa).

## Review Focus
- Restart a mitad de turno → el hilo continúa donde quedó con una instancia nueva del saver (test en Task 3).
- Dos workers (2 instancias de app) mismo `sessionId` → turnos serializados, cero overlap (test en Task 3).
- Postgres caído → 503 coherente, nunca 409 ni cuelgue (test en Task 1).
- Disconnect de stream a mitad → lock liberado, siguiente turno 200 (test en Task 2).
- Sesión expirada (>24h) visible cross-instancia → recreable sin 403 fantasma (test en Task 2).

---

### Task 1: Saver compartido en lifespan + health con chequeo DB

**Files:**
- Create: `agents/nora/src/persistence.py`
- Modify: `agents/nora/src/main.py` (lifespan: `create_saver` + `setup`, `/health`)
- Test: `agents/nora/tests/test_postgres_saver.py`

**Interfaces:**
- Consumes: `DATABASE_URL` (env, mismo del API o dedicado con permiso al schema `nora_*`)
- Produces: `create_saver(dsn: str) -> AsyncPostgresSaver`, `setup_saver(saver) -> None` (crea schema `nora_langgraph` + tablas), `nora_graph` construido contra el saver en lifespan (ya no singleton de módulo)

- [ ] **Step 1: Write the failing test**

```python
async def test_saver_roundtrips_thread_state():
    saver = await create_saver(os.environ["TEST_DATABASE_URL"])
    await setup_saver(saver)
    # escribe checkpoint de un thread y léelo con OTRA instancia del saver
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TEST_DATABASE_URL=postgresql://nora:nora@localhost:5433/nora_test uv run --with pytest pytest agents/nora/tests/test_postgres_saver.py -v`
Expected: FAIL with "create_saver not defined" (o ModuleNotFound si falta `langgraph-checkpoint-postgres`)

- [ ] **Step 3: Implement `create_saver` + `setup_saver` en `agents/nora/src/persistence.py`, añadir dep `langgraph-checkpoint-postgres` a `pyproject.toml`, cablear en `lifespan`**

`setup_saver` usa el `setup()` del saver contra el schema `nora_langgraph`.

- [ ] **Step 4: Run test to verify it passes + 503 cuando Postgres está caído**

Run: `TEST_DATABASE_URL=... uv run --with pytest pytest agents/nora/tests/test_postgres_saver.py agents/nora/tests/test_session_ownership.py -q`
Expected: PASS; además `GET /health` con DSN inválido → `{"db":"down"}` y `POST /messages` → 503 (no 409)

- [ ] **Step 5: Commit**

```bash
git add agents/nora/pyproject.toml agents/nora/src/persistence.py agents/nora/src/main.py agents/nora/tests/test_postgres_saver.py
git commit -m "feat(nora): saver postgres compartido"
```

### Task 2: Advisory locks + sesiones en Postgres (misma API)

**Files:**
- Create: `agents/nora/src/pg_locks.py`
- Modify: `agents/nora/src/sessions.py` (backend Postgres, misma clase `SessionStore` y firma `get_or_create`)
- Modify: `agents/nora/src/main.py` (usa pg locks; `NORA_LOCAL_LOCKS=1` conserva `src/locks.py` en dev)
- Test: `agents/nora/tests/test_pg_locks.py`

**Interfaces:**
- Consumes: `create_saver`/`setup_saver` de Task 1 (pool de conexiones compartido)
- Produces: `acquire_session_lock(session_id: str, timeout: float = 60.0)` (context manager async; retiene una conexión, `BEGIN` + `pg_advisory_xact_lock(hashtext(session_id))`, `COMMIT` al salir libera), `SessionStore` con idéntica API pública respaldada por `nora_sessions`

- [ ] **Step 1: Write the failing test**

```python
async def test_two_instances_serialize_same_session():
    # dos acquire_session_lock concurrentes mismo session_id, con sleep: sin overlap
async def test_session_visible_cross_instance():
    # store A crea, store B (otra conexión) exige ownership del intruso → SessionOwnershipError
async def test_expired_session_recreatable():
    # last_seen_at vieja → get_or_create con otro dueño no da 403
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TEST_DATABASE_URL=... uv run --with pytest pytest agents/nora/tests/test_pg_locks.py -v`
Expected: FAIL with "acquire_session_lock not defined"

- [ ] **Step 3: Implement `pg_locks.py` + backend Postgres en `sessions.py` (tabla `nora_sessions`, TTL 24h, LRU por `last_seen_at`), swap en `main.py` con fallback `NORA_LOCAL_LOCKS=1`**

Timeout del lock → `TimeoutError("turn_in_progress:...")` para que `main.py` siga mapeando a 409 sin cambios.

- [ ] **Step 4: Run test to verify it passes**

Run: `TEST_DATABASE_URL=... uv run --with pytest pytest agents/nora/tests/test_pg_locks.py agents/nora/tests/test_409_scope.py agents/nora/tests/test_session_ownership.py -q`
Expected: PASS (contrato 409 intacto, ownership intacto)

- [ ] **Step 5: Commit**

```bash
git add agents/nora/src/pg_locks.py agents/nora/src/sessions.py agents/nora/src/main.py agents/nora/tests/test_pg_locks.py
git commit -m "feat(nora): locks y sesiones en postgres"
```

### Task 3: Workers N + verificación multi-instancia y restart

**Files:**
- Modify: `agents/nora/Dockerfile` (`--workers ${WEB_CONCURRENCY:-2}` + `ENV WEB_CONCURRENCY=2`)
- Modify: `agents/nora/src/main.py` (`assert_single_worker` → permite N solo con backend PG; con locks locales sigue exigiendo 1)
- Test: `agents/nora/tests/test_multiworker.py`

**Interfaces:**
- Consumes: saver + pg locks + sesiones PG de Tasks 1–2
- Produces: guard actualizado, Dockerfile multi-worker

- [ ] **Step 1: Write the failing test**

```python
async def test_thread_survives_saver_restart():
    # escribe turno con saver A, crea saver B nuevo contra misma DB, lee el hilo
async def test_two_app_instances_serialize():
    # dos instancias (dos pools) mismo sessionId, turnos concurrentes: sin overlap
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TEST_DATABASE_URL=... uv run --with pytest pytest agents/nora/tests/test_multiworker.py -v`
Expected: FAIL (hilo no visible cross-instancia con MemorySaver)

- [ ] **Step 3: Implement guard actualizado + Dockerfile `--workers ${WEB_CONCURRENCY:-2}`**

Con backend PG el guard acepta N; con `NORA_LOCAL_LOCKS=1` mantiene la exigencia de 1.

- [ ] **Step 4: Run test to verify it passes + suite completa**

Run: `TEST_DATABASE_URL=... uv run --with pytest pytest agents/nora/tests -q`
Expected: PASS 291 + nuevos

- [ ] **Step 5: Commit**

```bash
git add agents/nora/Dockerfile agents/nora/src/main.py agents/nora/tests/test_multiworker.py agents/nora/tests/test_single_worker_guard.py
git commit -m "feat(nora): workers N con backend postgres"
```

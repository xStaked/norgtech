# Nora Hardening Seguro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar a Nora 100% funcional para la reunión final sin regresiones, eliminando el split-brain y los duplicados por concurrencia.

**Architecture:** Un worker + lock asyncio por `session_id` que serializa turnos del mismo hilo; TTL/LRU en sesiones; fixes quirúrgicos sin tocar prompts/tools.

**Tech Stack:** Python 3.12, FastAPI, LangGraph 1.2.7 (MemorySaver), httpx 0.28.1, pytest

**Spec:** `docs/superpowers/specs/2026-09-29-nora-hardening-design.md`

## Global Constraints
- No añadir Postgres/Redis ni cambiar persistencia en esta fase.
- No cambiar prompts del sistema, planner regex, ni firmas de tools.
- `Dockerfile CMD` queda en `--workers 1` hasta Fase 2.
- Cada cambio debe dejar la suite existente en verde.
- Commits pequeños, uno por tarea.

## Review Focus
- Doble-submit mismo `sessionId` al mismo tiempo → segundo espera, no duplica `create_order/visit/expense`.
- `sessionId` viejo (>24h) → expira y se puede recrear sin 403 fantasma.
- Reuso de sesión con nuevo `contextType` → se actualiza, no se ignora.
- Cliente desconecta stream a mitad → no deja checkpoint corrupto ni lock colgado.
- `llm_provider=openai` sigue creando el LLM igual que hoy (sin rama muerta).

---

### Task 1: Single worker + guard anti-split-brain

**Files:**
- Modify: `agents/nora/Dockerfile:11`
- Modify: `agents/nora/src/main.py:35` (startup guard)
- Test: `agents/nora/tests/test_single_worker_guard.py`

**Interfaces:**
- Consumes: nada
- Produces: `assert_single_worker()` usado por startup; `Dockerfile` con 1 worker

- [ ] **Step 1: Write the failing test**

```python
def test_dockerfile_runs_single_worker():
    text = open("agents/nora/Dockerfile").read()
    assert "--workers 1" in text

def test_guard_rejects_multi_worker(monkeypatch):
    import src.main as m
    monkeypatch.setenv("WEB_CONCURRENCY", "2")
    try:
        m.assert_single_worker()
        assert False, "debió lanzar"
    except RuntimeError:
        pass
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run --with pytest pytest agents/nora/tests/test_single_worker_guard.py -v`
Expected: FAIL (Dockerfile tiene `--workers 2`, no existe `assert_single_worker`)

- [ ] **Step 3: Implement `assert_single_worker() -> None` in `agents/nora/src/main.py` + cambiar Dockerfile a `--workers 1`**

En `main.py`: lee `WEB_CONCURRENCY`, si >1 lanza `RuntimeError("Nora exige 1 worker hasta Fase 2")`. Llamarla en `@app.on_event("startup")` o lifespan.

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run --with pytest pytest agents/nora/tests/test_single_worker_guard.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agents/nora/Dockerfile agents/nora/src/main.py agents/nora/tests/test_single_worker_guard.py
git commit -m "fix(nora): single worker hasta fase 2"
```

### Task 2: Lock por sesión en /messages y /messages/stream

**Files:**
- Modify: `agents/nora/src/main.py:207-223,251-304,372-468`
- Modify: `agents/nora/src/sessions.py:21-53` (añadir `get_lock()` o nuevo `agents/nora/src/locks.py`)
- Test: `agents/nora/tests/test_session_locks.py`

**Interfaces:**
- Consumes: `session_for_user()` existente
- Produces: `get_session_lock(session_id: str) -> asyncio.Lock`, `LOCK_WAIT_TIMEOUT = 60`

- [ ] **Step 1: Write the failing test**

```python
async def test_concurrent_same_session_serializes():
    # 2 ainvoke concurrentes al mismo thread_id con MemorySaver real:
    # ambos deben terminar y el historial final debe tener 2 HumanMessages
    pass

async def test_lock_timeout_returns_409():
    # lock ocupado >60s → HTTP 409 con retryAfter, no cuelga
    pass
```

Concretar con `nora_graph` mockeado con `asyncio.sleep(0.2)` para forzar overlap.

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run --with pytest pytest agents/nora/tests/test_session_locks.py -v`
Expected: FAIL (no existe `get_session_lock`, turnos se pisan)

- [ ] **Step 3: Implement `get_session_lock` + `async with` en `send_message` y `stream_message`**

`locks.py`: `dict[str, asyncio.Lock]` + `last_seen`; `get_session_lock()` crea si falta. En `main.py`: `lock = get_session_lock(session_id)`; `try: await asyncio.wait_for(lock.acquire(), 60) except TimeoutError: raise HTTPException(409)`; `try/finally: lock.release()`. En stream, además chequea `await request.is_disconnected()` en el loop y rompe.

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run --with pytest pytest agents/nora/tests/test_session_locks.py agents/nora/tests/test_session_ownership.py -v`
Expected: PASS (locks + ownership 3 tests siguen verdes)

- [ ] **Step 5: Commit**

```bash
git add agents/nora/src/main.py agents/nora/src/locks.py agents/nora/src/sessions.py agents/nora/tests/test_session_locks.py
git commit -m "fix(nora): serializa turnos por sesion"
```

### Task 3: TTL + cota + context update en SessionStore

**Files:**
- Modify: `agents/nora/src/sessions.py:14-50`
- Test: `agents/nora/tests/test_session_ownership.py` (extender, no romper)

**Interfaces:**
- Consumes: `SessionContext` existente
- Produces: `SessionStore(ttl_hours=24, max_sessions=5000)`, `get_or_create()` actualiza contexto del dueño

- [ ] **Step 1: Write the failing test**

```python
def test_context_updates_on_reuse():
    s = SessionStore(ttl_hours=24, max_sessions=10)
    s.get_or_create("s1", owner_user_id="u1", context_type=None, context_entity_id=None)
    ctx = s.get_or_create("s1", owner_user_id="u1", context_type="customer", context_entity_id="c9")
    assert ctx.context_type == "customer"

def test_ttl_evicts_old_session():
    s = SessionStore(ttl_hours=0, max_sessions=10)
    # sesión vieja debe poder recrearse sin 403
    pass
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run --with pytest pytest agents/nora/tests/test_session_ttl.py -v`
Expected: FAIL (contexto se ignora, no hay TTL)

- [ ] **Step 3: Implement TTL/LRU + update en `sessions.py`**

Añadir `created_at/last_seen: float`, `purge_expired()` al inicio de `get_or_create`/`get`, evicción LRU al superar `max_sessions`. Si `existing.owner == owner`, actualizar `context_type/entity_id` solo cuando el request trae no-None.

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run --with pytest pytest agents/nora/tests/test_session_ttl.py agents/nora/tests/test_session_ownership.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agents/nora/src/sessions.py agents/nora/tests/test_session_ttl.py
git commit -m "fix(nora): ttl y contexto en sesiones"
```

### Task 4: Limpieza quirúrgica (rama muerta + excepts)

**Files:**
- Modify: `agents/nora/src/agent.py:169-185`
- Modify: `agents/nora/src/main.py:77,344`
- Test: `agents/nora/tests/test_llm_factory.py`

**Interfaces:**
- Consumes: `settings` existente
- Produces: `create_llm()` sin rama duplicada

- [ ] **Step 1: Write the failing test**

```python
def test_create_llm_openai_uses_openai_model(monkeypatch):
    monkeypatch.setenv("NORA_LLM_PROVIDER", "openai")
    # debe construir sin tocar settings.llm_model inexistente
    pass
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run --with pytest pytest agents/nora/tests/test_llm_factory.py -v`
Expected: FAIL (rama duplicada referencia `llm_model`)

- [ ] **Step 3: Implement borrado del segundo `elif openai` + `except Exception as e: logger` en `main.py`**

Solo borrar código muerto y cambiar `except:` por `except Exception:`. No tocar lógica.

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run --with pytest pytest agents/nora/tests/test_llm_factory.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agents/nora/src/agent.py agents/nora/src/main.py agents/nora/tests/test_llm_factory.py
git commit -m "fix(nora): elimina rama openai duplicada"
```

### Task 5: Verificación final Todo-funcional

**Files:**
- Test: suite existente, sin cambios

- [ ] **Step 1: Corre suite completa**

Run: `uv run --with pytest pytest agents/nora/tests -q`
Expected: 0 failures. Si falla algo no tocado, se revierte la tarea culpable, no se parchea el test.

- [ ] **Step 2: Doble-submit manual**

Con `TestClient`, 2 POST `/messages` mismo `sessionId` en `asyncio.gather` → ambos 200, un solo hilo con 2 turnos.

- [ ] **Step 3: Commit vacío de verificación o tag**

```bash
git log --oneline -5
```

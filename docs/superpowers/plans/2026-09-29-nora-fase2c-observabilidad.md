# Nora Fase 2c — Observabilidad, deploy y pruebas de escala Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operar N réplicas con visibilidad (métricas/logs/health) y evidencia de carga de que la escala funciona.

**Architecture:** `/metrics` Prometheus + logs estructurados con `session_id`; readiness/liveness con chequeo a Postgres; deploy con `WEB_CONCURRENCY` como única fuente, pool httpx acotado y graceful shutdown; script de carga y chaos que produce el reporte de aceptación.

**Tech Stack:** Python 3.12, FastAPI, httpx 0.28.1, Postgres existente

**Spec:** `docs/superpowers/specs/2026-09-29-nora-fase2-escala-design.md` (sección P2-c)

## Global Constraints
- Sin servicios nuevos (métricas vía `/metrics` o logs según lo que ya opere el equipo; no montar stack de monitoreo).
- Sin cambios a prompts, planner regex ni lógica de negocio.
- Suite Nora en verde en cada tarea.
- Commits pequeños, uno por tarea.

## Review Focus
- `/metrics` bajo carga no degrada turnos (test: overhead <5% latencia p50 en Task 1).
- Restart con streams abiertos → drain limpio, cero locks colgados (test en Task 2).
- Pool httpx saturado → el turno falla con 503+log, nunca cuelga el worker (test en Task 2).
- Carga 50 turnos mixtos 2 workers → cero overlaps mismo sessionId, 409 solo ante contención real (reporte Task 3).
- LLM colgado (timeout) bajo carga → 500 con log, nunca 409 (reporte Task 3).

---

### Task 1: Métricas + logs estructurados + health DB

**Files:**
- Modify: `agents/nora/src/main.py` (`/metrics`, `/health` con `SELECT 1`, readiness vs liveness)
- Create: `agents/nora/src/observability.py` (contadores/histogramas: turnos, latencia LLM, latencia por tool, 409/429/503, duración de locks)
- Test: `agents/nora/tests/test_observability.py`

**Interfaces:**
- Consumes: saver/locks/sesiones de P2-a (solo lectura de eventos)
- Produces: `GET /metrics` (formato Prometheus), logs con `session_id` + `idempotency_key`, `GET /health` (`{"db":"up|down"}`)

- [ ] **Step 1: Write the failing test**

```python
def test_metrics_endpoint_exposes_turn_counters():
    # 1 turno mockeado → /metrics contiene nora_turns_total 1

def test_health_down_when_db_down():
    # DSN inválido → /health db down y POST /messages → 503
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run --with pytest pytest agents/nora/tests/test_observability.py -v`
Expected: FAIL with "404 /metrics" (o import error)

- [ ] **Step 3: Implement `observability.py` + endpoints (instrumentación mínima: contadores por resultado de turno e histogramas de latencia)**

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run --with pytest pytest agents/nora/tests/test_observability.py agents/nora/tests/test_session_ownership.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agents/nora/src/observability.py agents/nora/src/main.py agents/nora/tests/test_observability.py
git commit -m "feat(nora): metricas y health con db"
```

### Task 2: Deploy multi-worker (pool, shutdown, fuente única)

**Files:**
- Modify: `agents/nora/Dockerfile` (`--workers ${WEB_CONCURRENCY:-2}`, `ENV WEB_CONCURRENCY=2`)
- Modify: `agents/nora/src/tools/nestjs_client.py` (`max_connections` explícito en `_shared_client`)
- Modify: `agents/nora/src/main.py` (graceful shutdown: lifespan cierra pool httpx y saver; `WEB_CONCURRENCY` única fuente del guard)
- Test: `agents/nora/tests/test_deploy_config.py`

**Interfaces:**
- Consumes: guard de Fase 1 (se unifica a env como única fuente)
- Produces: config de deploy verificada por tests

- [ ] **Step 1: Write the failing test**

```python
def test_dockerfile_workers_from_env():
    # Dockerfile contiene "--workers ${WEB_CONCURRENCY" y ENV WEB_CONCURRENCY

def test_shared_client_has_bounded_pool():
    # _shared_client() usa límites explícitos (p.ej. max_connections <= 100)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run --with pytest pytest agents/nora/tests/test_deploy_config.py -v`
Expected: FAIL

- [ ] **Step 3: Implement Dockerfile + pool acotado + cierre en lifespan + guard solo-env**

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run --with pytest pytest agents/nora/tests/test_deploy_config.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agents/nora/Dockerfile agents/nora/src/tools/nestjs_client.py agents/nora/src/main.py agents/nora/tests/test_deploy_config.py
git commit -m "feat(nora): deploy multi-worker"
```

### Task 3: Script de carga + chaos y reporte de aceptación

**Files:**
- Create: `agents/nora/scripts/load_test.py` (parámetros: `--workers 2 --turns 50 --same-session-ratio 0.3`)
- Create: `agents/nora/docs/FASE2-REPORTE.md` (plantilla: overlaps, duplicados CRM, 409s legítimos, p50/p95, restart-mid-turn, LLM-timeout)
- Test: el script es el test (criterios de aceptación del spec como asserts finales)

**Interfaces:**
- Consumes: todo lo anterior (P2-a + P2-b + Tasks 1–2)
- Produces: reporte de aceptación con números

- [ ] **Step 1: Write the failing acceptance script (asserts que hoy fallarían sin P2-a)**

```python
# asserts: cero overlaps mismo sessionId; duplicados CRM == 0;
# 409 solo con contención; hilo sobrevive a restart; LLM-timeout → 500
```

- [ ] **Step 2: Run script to verify it fails on Fase 1 code**

Run: `python agents/nora/scripts/load_test.py --workers 2 --turns 50`
Expected: FAIL (overlaps y/o pérdida de hilos en restart)

- [ ] **Step 3: Confirm it passes on Fase 2 code (sin cambiar el script salvo bugs del propio script)**

Run: `python agents/nora/scripts/load_test.py --workers 2 --turns 50`
Expected: PASS + `FASE2-REPORTE.md` con los números

- [ ] **Step 4: Commit**

```bash
git add agents/nora/scripts/load_test.py agents/nora/docs/FASE2-REPORTE.md
git commit -m "test(nora): carga y chaos fase 2 en verde"
```

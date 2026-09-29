# Nora Fase 2 — Escala lista (spec de diseño)

**Fecha:** 2026-09-29
**Estado:** propuesto, pendiente de revisión del usuario
**Fase 1 (hecha, en `main`):** 1 worker, locks asyncio por sesión, SessionStore TTL+LRU, limpieza rama `openai` muerta. Suite 291 passed.
**Objetivo Fase 2:** N réplicas sin split-brain, sin duplicados y sin perder hilos en deploys. Escala objetivo: ~10 usuarios/día hoy, arquitectura lista para subir workers sin cambios de código.
**No-objetivos:** Redis u otros servicios nuevos; cambiar prompts, planner regex o UX de respuestas; sharding multi-región.

## Decisión de arquitectura

Reusar el Postgres existente del API (Prisma, 42 modelos) en schema propio `nora_*` con migraciones propias. Cero infra nueva: mismo backup, misma latencia, mismo secreto `DATABASE_URL` (usuario/credencial con permiso limitado al schema `nora_*` si el despliegue lo permite).

Sub-proyectos (cada uno con su propio ciclo spec → plan → implementación):
- **P2-a Persistencia + locks distribuidos** (solo Nora).
- **P2-b Idempotencia end-to-end** (Nora + NestJS).
- **P2-c Observabilidad + deploy + pruebas de escala** (Nora + deploy).

## P2-a — Persistencia + locks distribuidos

### Componentes
1. **Checkpointer compartido.** `AsyncPostgresSaver` (`langgraph-checkpoint-postgres`) construido una vez en el `lifespan` de FastAPI; `nora_graph` deja de ser singleton de módulo y se construye contra el saver (igual que el comentario en `agent.py:228-235` ya anticipaba). Tablas en schema `nora_langgraph`, migraciones SQL propias versionadas junto al repo de Nora. `thread_id = session_id` sin cambios.
2. **Locks distribuidos.** `pg_advisory_xact_lock(hashtext(session_id))` adquirido con timeout 60s antes de `ainvoke`/`astream_events`. Mismo contrato que Fase 1: espera hasta 60s, luego `409 turn_in_progress` + header `Retry-After: 2`, uniforme en `/messages` y `/messages/stream` (el stream adquiere antes de enviar headers). Si Postgres está caído, el turno falla con 503 (el checkpointer tampoco funcionaría: fail coherente, no silencioso).
3. **Sesiones persistidas.** Tabla `nora_sessions(session_id PK, owner_user_id, context_type, context_entity_id, created_at, last_seen_at)` con TTL 24h (job o `DELETE` oportunista) y la misma regla de Fase 1: el dueño actualiza contexto solo con valores no-`None`. El 403 cross-replica queda correcto de verdad (cierra el bypass documentado en Fase 1).
4. **Locks en memoria de Fase 1** (`src/locks.py`) se retiran cuando P2-a aterriza; quedan como fallback solo si un flag `NORA_LOCAL_LOCKS=1` está activo (útil en dev/tests sin DB).

### Data flow
Request → ownership contra `nora_sessions` → advisory lock Postgres (60s → 409) → `ainvoke/astream(thread_id=session_id)` contra saver compartido → unlock al commit/rollback de la transacción → respuesta. WhatsApp stateless no cambia (sin checkpointer), pero P2-b le da idempotencia.

### Errores
- Lock timeout → 409 + `Retry-After` (el front reintenta; mismo comportamiento Fase 1).
- `TimeoutError` interno del grafo/LLM → 500 con log (nunca 409; invariante ya testeado en `test_409_scope.py`).
- Caída de Postgres → 503 + log con `session_id`; readiness probe falla y el orquestador deja de mandar tráfico.
- Stream disconnect → cancela el turno y libera el lock en `finally` (invariante Fase 1).

## P2-b — Idempotencia end-to-end

El lock ordena turnos; la idempotencia garantiza no-duplicados aunque el lock falle, haya reintento de red o webhook duplicado de WhatsApp/Kapso.

1. **Llave por turno.** `idempotency_key = sha256(session_id | mensaje | timestamp_minuto)` generada en Nora (o UUID del front/NestJS cuando exista; el contrato acepta ambas y prefiere la del cliente si llega). Viaja en el payload de `create_order/create_visit/create_expense/create_customer/create_quote`. Semántica de la ventana: el mismo mensaje dentro del mismo minuto es el mismo turno (dedup); repetido minutos después es un turno nuevo e intencional.
2. **Backend NestJS.** Columna `idempotencyKey UNIQUE` (o tabla `nora_idempotency_keys`) en las entidades creadas por el agente; ante llave repetida devuelve el registro existente con flag `alreadyExisted` (el patrón ya existe en gastos: `src/tools/expenses.py:113`). Ventana de retención 7 días.
3. **Dedup de webhooks.** NestJS dedup por `message-id` de Kapso antes de llamar a Nora (ventana 24h); doble entrega ya no crea doble turno.
4. **Alineación 409.** Se adopta el contrato exacto: body `{"detail":"turn_in_progress","retryAfter":2}` + header `Retry-After: 2` (resuelve el minor deferred de Fase 1). El front implementa una sola rama de retry.
5. **Limpieza de contexto.** Valor centinela (p. ej. `contextType: "none"`) para salir del contexto del cliente (resuelve el minor deferred de Fase 1).

## P2-c — Observabilidad, deploy y pruebas de escala

1. **Métricas.** Turnos totales, latencia p50/p95 por LLM y por tool, conteo de 409/429/503, duración de locks, tamaño de hilos. Endpoint `/metrics` (Prometheus) o logs estructurados según lo que ya opere el equipo.
2. **Logs.** Todo log de turno incluye `session_id`, `owner_user_id` (hash si PII preocupa), `intent`/tools usadas y `idempotency_key`.
3. **Health.** `/health` chequea Postgres (saver + `SELECT 1`); readiness/liveness diferenciados para el orquestador.
4. **Deploy.** `--workers N` (2 para empezar), `WEB_CONCURRENCY` como única fuente (el guard de Fase 1 ya lee ambas; se unifica a env), pool httpx acotado (`max_connections` explícito + timeout 30s ya existente), semáforo global opcional de turnos concurrentes, graceful shutdown con drain de streams.
5. **Pruebas de escala.** 2 workers reales + script de carga: decenas de turnos concurrentes sobre el mismo y distintos `sessionId` (cero overlap verificado por intervalos, como `test_double_submit_*`), restart a mitad de turno (el hilo sobrevive vía saver), timeout de LLM simulado (500, nunca 409), y chaos de webhook duplicado (una sola creación vía idempotencia).

## Criterios de éxito

- 2+ réplicas concurrentes, 50 turnos concurrentes mixtos: cero checkpoints pisados, cero duplicados CRM, 409 solo ante contención real.
- Restart/deploy a mitad de turno: el hilo continúa donde quedó.
- Suite Fase 1 sigue verde (291 tests) + nuevos tests de P2-a/P2-b/P2-c.
- Sin servicios nuevos operando: solo Postgres existente.

## Estimación gruesa

3–5 días de dev: P2-a ~1–2 días, P2-b ~1–2 días (incluye NestJS), P2-c ~1 día. Cada sub-proyecto mergeable y desplegable por separado en ese orden.

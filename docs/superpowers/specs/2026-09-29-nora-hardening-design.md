# Nora Concurrency Hardening — Design (A: seguro para mañana)

**Fecha:** 2026-09-29
**Objetivo:** dejar Todo funcional para la reunión final sin regresiones, sin migrar persistencia.
**No-objetivo:** multi-replica real (Postgres/Redis). Eso es Fase 2 post-firma.

## Contexto verificado
- `agents/nora/src/agent.py:228-235` MemorySaver en proceso (docs LangGraph: solo debug/test).
- `agents/nora/Dockerfile:11` corre `--workers 2` → 2 memorias distintas hoy.
- `agents/nora/src/sessions.py:21-53` SessionStore dict sin TTL, sin update de contexto.
- `agents/nora/src/main.py:272,392` mismo `thread_id=session_id` en `/messages` y `/messages/stream` sin lock.
- `agents/nora/src/agent.py:169-183` `elif openai` duplicado inalcanzable.
- Tests actuales pasan en 1 proceso (`test_session_ownership.py` 3 passed), no cubren multi-worker.

## Diseño
### Arquitectura
Un solo worker + serialización por sesión. Sin servicios nuevos. Todo reversible con 1 variable.

### Componentes
1. **Single-worker enforce:** `Dockerfile CMD --workers 1`. Añadir `assert` en startup si `WEB_CONCURRENCY>1`.
2. **Per-session lock:** `asyncio.Lock` por `session_id` en `main.py` (`_locks: dict[str, asyncio.Lock]` + `get_lock()`). `/messages` y `/messages/stream` hacen `async with lock`. Segundo turno concurrente espera, no pisa checkpoint. Timeout de espera 60s → 409 con `retryAfter` si expira.
3. **TTL + cota:** `SessionStore` con `createdAt/lastSeen`, TTL 24h + `max_sessions=5000` con evicción LRU. Misma cota para locks (evitar leak de locks).
4. **Fixes quirúrgicos sin cambio de conducta:** borrar `elif` duplicado, `except Exception` con log, no tocar prompts ni tools. `get_or_create` ahora sí actualiza `context_type/context_entity_id` si el dueño manda nuevos (antes los ignoraba).
5. **Smoke:** suite existente + script de doble-submit misma sesión.

### Data flow
Request → `session_for_user` (ownership) → `get_lock(session_id)` → `ainvoke/astream(thread_id=session_id)` → unlock. WhatsApp stateless no cambia (sin checkpointer, sin lock global).

### Error handling
- Lock timeout → 409 `{"detail":"turn_in_progress","retryAfter":2}`, el front reintenta, no duplica.
- Stream disconnect → cancela `astream_events` (try/finally + `await request.is_disconnected()`), no deja checkpoint a medias.
- Cualquier otro error → mismo fallback actual, más `error` en log para CRM.

### Testing
- `test_double_submit_same_session_serialized`: 2 `ainvoke` concurrentes misma `thread_id` → 2 respuestas, 1 tras otra, historial contiene ambos HumanMessages.
- `test_session_ttl_evicts` + `test_context_updates_on_reuse`.
- Full suite existente debe seguir verde. Sin tocar tests de prompts.

## Riesgos controlados
- Workers=1 baja throughput pico, pero elimina split-brain de mañana. Reversible.
- Lock por sesión puede encolar turnos del mismo usuario si spamea: timeout 60s lo convierte en 409, no cuelga workers.
- Sin Postgres: restart pierde hilos (ya pasa hoy, front no persiste `sessionId` tras F5). No empeora.

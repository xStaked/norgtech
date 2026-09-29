"""Locks de sesión distribuidos con Postgres (Fase 2a).

Reemplazan a `src/locks.py` cuando hay pool (multi-worker): cada turno retiene
una conexión del pool compartido (`src/persistence.py` — NO crear otro pool) y
toma `pg_advisory_xact_lock(hashtext(session_id))` dentro de una transacción
explícita. Al salir (`COMMIT`/`ROLLBACK`) Postgres libera el lock aunque el
holder muera: no hay locks pegados tras un disconnect del stream.

Timeout del lock → `TimeoutError("turn_in_progress:...")` para que `main.py`
siga mapeando a 409 sin cambios. `NORA_LOCAL_LOCKS=1` conserva `src/locks.py`
en dev sin DB.
"""
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from . import persistence

LOCK_TIMEOUT_SQLSTATE = "55P03"


def pg_locks_available() -> bool:
    """Hay pool compartido abierto: se puede usar el lock distribuido."""
    pool = persistence._pool
    return pool is not None and not pool.closed


def _require_pool():
    pool = persistence._pool
    if pool is None or pool.closed:
        raise RuntimeError(
            "pg_locks sin pool: llamar a create_saver() primero "
            "(o NORA_LOCAL_LOCKS=1 para locks en memoria)"
        )
    return pool


@asynccontextmanager
async def acquire_session_lock(
    session_id: str, timeout: float = 60.0
) -> AsyncIterator[None]:
    """Toma el advisory lock transaccional de la sesión, con timeout.

    Retiene una conexión del pool durante todo el turno (`BEGIN` ... `COMMIT`
    al salir). Si el lock no se obtiene en `timeout` segundos, levanta
    `TimeoutError("turn_in_progress:<session_id>")` (→ 409 en main.py).
    """
    pool = _require_pool()
    async with pool.connection() as conn:
        await conn.execute("BEGIN")
        try:
            # lock_timeout acota la espera en el servidor: al expirar aborta el
            # SELECT con SQLSTATE 55P03, que mapeamos a TimeoutError/409.
            ms = max(1, int(timeout * 1000))
            await conn.execute(f"SET LOCAL lock_timeout = '{ms}ms'")
            try:
                await conn.execute(
                    "SELECT pg_advisory_xact_lock(hashtext(%s))", (session_id,)
                )
            except Exception as exc:
                if getattr(exc, "sqlstate", None) == LOCK_TIMEOUT_SQLSTATE:
                    raise TimeoutError(f"turn_in_progress:{session_id}") from exc
                raise
            yield
            await conn.execute("COMMIT")
        except BaseException:
            try:
                await conn.execute("ROLLBACK")
            except Exception:
                pass
            raise

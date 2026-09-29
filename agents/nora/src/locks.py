"""Locks por sesión: serializan turnos del mismo thread_id.

Sin esto dos POST /messages con el mismo sessionId leen el mismo checkpoint
de MemorySaver y el último en escribir pisa al otro (además de duplicar
create_order/create_visit/create_expense). El lock hace que el segundo espere.
"""
import asyncio
import time
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

LOCK_WAIT_TIMEOUT = 60.0
_MAX_LOCKS = 5000

_locks: dict[str, asyncio.Lock] = {}
_seen: dict[str, float] = {}


def get_session_lock(session_id: str) -> asyncio.Lock:
    """Devuelve el lock de la sesión, creándolo si falta (con evicción LRU)."""
    lock = _locks.get(session_id)
    if lock is None:
        if len(_locks) >= _MAX_LOCKS:
            oldest = min(_seen, key=_seen.get)
            _locks.pop(oldest, None)
            _seen.pop(oldest, None)
        lock = asyncio.Lock()
        _locks[session_id] = lock
    _seen[session_id] = time.monotonic()
    return lock


@asynccontextmanager
async def locked_session(
    session_id: str, timeout: float = LOCK_WAIT_TIMEOUT
) -> AsyncIterator[None]:
    """Adquiere el lock de la sesión con timeout. Lanza TimeoutError si expira."""
    lock = get_session_lock(session_id)
    try:
        await asyncio.wait_for(lock.acquire(), timeout)
    except asyncio.TimeoutError as e:
        raise TimeoutError(f"turn_in_progress:{session_id}") from e
    try:
        yield
    finally:
        lock.release()

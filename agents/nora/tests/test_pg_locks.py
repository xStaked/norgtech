"""Locks PG + sesiones PG (Fase 2a): serialización cross-instancia y ownership real.

Dos instancias (dos conexiones/pools) sobre el mismo session_id serializan
turnos sin overlap; la sesión es visible entre instancias y el ownership se
exige de verdad; una sesión expirada se puede recrear sin 403 fantasma.

Requiere Postgres local:
TEST_DATABASE_URL=postgresql://nora:nora@localhost:5432/nora_test
"""
import asyncio
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from psycopg import AsyncConnection

from src.persistence import SCHEMA, close_pool, create_saver
from src.pg_locks import acquire_session_lock
from src.sessions import SessionStore, SessionOwnershipError, setup_sessions

TEST_DSN = os.environ.get("TEST_DATABASE_URL", "")


async def _open() -> None:
    assert TEST_DSN, "TEST_DATABASE_URL no definido"
    await create_saver(TEST_DSN)
    await setup_sessions()


def test_two_instances_serialize_same_session():
    async def _run():
        await _open()
        try:
            sid = f"lock-{uuid.uuid4().hex}"
            intervals: list[tuple[float, float]] = []

            async def _turn():
                async with acquire_session_lock(sid, timeout=10):
                    start = time.monotonic()
                    await asyncio.sleep(0.3)
                    intervals.append((start, time.monotonic()))

            await asyncio.gather(_turn(), _turn())
            assert len(intervals) == 2
            (s1, e1), (s2, e2) = sorted(intervals)
            assert s2 >= e1, f"los turnos se solaparon: {intervals}"
        finally:
            await close_pool()

    asyncio.run(_run())


def test_pg_lock_timeout_raises_turn_in_progress():
    async def _run():
        await _open()
        try:
            sid = f"lock-{uuid.uuid4().hex}"
            async with acquire_session_lock(sid, timeout=10):
                with pytest.raises(TimeoutError, match="turn_in_progress"):
                    async with acquire_session_lock(sid, timeout=0.2):
                        pass  # pragma: no cover
        finally:
            await close_pool()

    asyncio.run(_run())


def test_pg_lock_released_on_cancel():
    """Cancelar el turno a mitad (disconnect del stream) libera el lock."""
    async def _run():
        await _open()
        try:
            sid = f"lock-{uuid.uuid4().hex}"
            acquired = asyncio.Event()

            async def _holder():
                async with acquire_session_lock(sid, timeout=10):
                    acquired.set()
                    await asyncio.sleep(60)

            task = asyncio.create_task(_holder())
            assert await asyncio.wait_for(acquired.wait(), 10)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            # Si el lock quedó pegado, esto levanta TimeoutError turn_in_progress.
            async with acquire_session_lock(sid, timeout=5):
                pass
        finally:
            await close_pool()

    asyncio.run(_run())


def test_session_visible_cross_instance():
    async def _run():
        await _open()
        try:
            store_a = SessionStore()
            store_b = SessionStore()
            sid = f"sess-{uuid.uuid4().hex}"
            ctx = await store_a.get_or_create(sid, owner_user_id="owner-a")
            assert ctx.owner_user_id == "owner-a"
            # store B (otra instancia) ve la sesión: el dueño sigue pasando...
            ctx2 = await store_b.get_or_create(sid, owner_user_id="owner-a")
            assert ctx2.owner_user_id == "owner-a"
            # ...y el intruso recibe ownership error de verdad.
            with pytest.raises(SessionOwnershipError):
                await store_b.get_or_create(sid, owner_user_id="intruder")
        finally:
            await close_pool()

    asyncio.run(_run())


def test_expired_session_recreatable():
    async def _run():
        await _open()
        try:
            store = SessionStore()
            sid = f"sess-{uuid.uuid4().hex}"
            await store.get_or_create(sid, owner_user_id="owner-a")
            old = datetime.now(timezone.utc) - timedelta(hours=25)
            conn = await AsyncConnection.connect(TEST_DSN, autocommit=True)
            try:
                await conn.execute(
                    f"UPDATE {SCHEMA}.nora_sessions "
                    "SET last_seen_at = %s WHERE session_id = %s",
                    (old, sid),
                )
            finally:
                await conn.close()
            # Expirada: otro dueño la recrea sin 403 fantasma.
            ctx = await store.get_or_create(sid, owner_user_id="owner-b")
            assert ctx.owner_user_id == "owner-b"
        finally:
            await close_pool()

    asyncio.run(_run())

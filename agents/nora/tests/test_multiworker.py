"""Workers N (Fase 2a): el hilo sobrevive a restarts y dos instancias serializan.

Con backend Postgres dos workers (dos pools/savers contra el mismo DSN) ven
el mismo thread y los advisory locks serializan turnos del mismo sessionId
sin overlap. Con MemorySaver esto falla: el hilo muere con el proceso.

Requiere Postgres local:
TEST_DATABASE_URL=postgresql://nora:nora@localhost:5432/nora_test
"""
import asyncio
import os
import time
import uuid
from typing import TypedDict

from langgraph.graph import END, StateGraph
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from src.persistence import _configure_conn, close_pool, create_saver, setup_saver
from src.pg_locks import acquire_session_lock
import src.persistence as persistence

TEST_DSN = os.environ.get("TEST_DATABASE_URL", "")


class _CountState(TypedDict):
    count: int


def _tiny_graph(saver):
    g = StateGraph(_CountState)
    g.add_node("inc", lambda s: {"count": s["count"] + 1})
    g.set_entry_point("inc")
    g.add_edge("inc", END)
    return g.compile(checkpointer=saver)


def test_thread_survives_saver_restart():
    """Escribe un turno con el saver A, reinicia (pool nuevo) y el hilo sigue."""
    assert TEST_DSN, "TEST_DATABASE_URL no definido"

    async def _run():
        try:
            saver_a = await create_saver(TEST_DSN)
            await setup_saver(saver_a)
            thread_id = f"restart-{uuid.uuid4().hex}"
            config = {"configurable": {"thread_id": thread_id}}
            await _tiny_graph(saver_a).ainvoke({"count": 0}, config=config)

            # Restart: se cierra el pool (muere el "proceso") y se abre otro.
            await close_pool()
            saver_b = await create_saver(TEST_DSN)
            await setup_saver(saver_b)

            # La instancia nueva ve el hilo donde quedó y lo continúa.
            tup = await saver_b.aget_tuple(config)
            assert tup is not None, "el checkpoint no sobrevivió al restart"
            assert tup.checkpoint["channel_values"]["count"] == 1
            # Sin input nuevo el turno continúa el hilo (no lo reinicia).
            await _tiny_graph(saver_b).ainvoke({}, config=config)
            tup2 = await saver_b.aget_tuple(config)
            assert tup2.checkpoint["channel_values"]["count"] == 2
        finally:
            await close_pool()

    asyncio.run(_run())


def test_two_app_instances_serialize():
    """Dos instancias (dos pools) mismo sessionId: turnos sin overlap."""
    assert TEST_DSN, "TEST_DATABASE_URL no definido"

    async def _run():
        await create_saver(TEST_DSN)  # instancia 1: pool compartido
        pool_a = persistence._pool
        # Instancia 2: pool propio contra el mismo DSN (otro worker/proceso).
        pool_b = AsyncConnectionPool(
            TEST_DSN,
            open=False,
            timeout=10,
            kwargs={
                "autocommit": True,
                "prepare_threshold": 0,
                "row_factory": dict_row,
            },
            configure=_configure_conn,
        )
        await pool_b.open()
        try:
            sid = f"worker-{uuid.uuid4().hex}"
            intervals: list[tuple[float, float]] = []

            async def _turn_on(pool):
                # Cada "instancia" opera con su propio pool global, igual que
                # dos workers en procesos distintos. La asignación y la
                # lectura del pool (_require_pool) ocurren sin awaits entre
                # medias, así que cada turno retiene su conexión propia.
                persistence._pool = pool
                async with acquire_session_lock(sid, timeout=10):
                    start = time.monotonic()
                    await asyncio.sleep(0.3)
                    intervals.append((start, time.monotonic()))

            await asyncio.gather(_turn_on(pool_a), _turn_on(pool_b))
            assert len(intervals) == 2
            (s1, e1), (s2, e2) = sorted(intervals)
            assert s2 >= e1, f"los turnos se solaparon entre instancias: {intervals}"
        finally:
            persistence._pool = pool_a
            await pool_b.close()
            await close_pool()

    asyncio.run(_run())

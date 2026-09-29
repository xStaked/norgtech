"""Saver Postgres compartido (Fase 2a): el checkpointer sobrevive al proceso.

El grafo de Nora se construye contra este saver en el lifespan; dos
instancias del saver contra el mismo DSN ven el mismo estado del thread.
"""
import asyncio
import os
import uuid
from typing import TypedDict

from langgraph.graph import END, StateGraph

TEST_DSN = os.environ.get("TEST_DATABASE_URL", "")


class _CountState(TypedDict):
    count: int


def _tiny_graph(saver):
    g = StateGraph(_CountState)
    g.add_node("inc", lambda s: {"count": s["count"] + 1})
    g.set_entry_point("inc")
    g.add_edge("inc", END)
    return g.compile(checkpointer=saver)


async def _roundtrip(dsn: str) -> None:
    from psycopg import AsyncConnection

    from src.persistence import close_pool, create_saver, setup_saver

    try:
        saver = await create_saver(dsn)
        await setup_saver(saver)

        thread_id = f"test-thread-{uuid.uuid4().hex}"
        config = {"configurable": {"thread_id": thread_id}}
        await _tiny_graph(saver).ainvoke({"count": 0}, config=config)

        # OTRA instancia del saver ve el estado escrito por la primera.
        saver2 = await create_saver(dsn)
        tup = await saver2.aget_tuple(config)
        assert tup is not None, "el checkpoint no es visible entre savers"
        assert tup.checkpoint["channel_values"]["count"] == 1

        # Las tablas viven en el schema nora_langgraph, no en public.
        conn = await AsyncConnection.connect(dsn, autocommit=True)
        try:
            cur = await conn.execute(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'nora_langgraph'"
            )
            tables = {row[0] for row in await cur.fetchall()}
        finally:
            await conn.close()
        assert "checkpoints" in tables
        assert "checkpoint_migrations" in tables
    finally:
        await close_pool()


def test_saver_roundtrips_thread_state():
    assert TEST_DSN, "TEST_DATABASE_URL no definido"
    asyncio.run(_roundtrip(TEST_DSN))


def test_health_reports_db_down_and_messages_503(monkeypatch):
    """Con DSN inválido: /health dice db down y POST /messages es 503."""
    import base64
    import json

    from fastapi.testclient import TestClient

    import src.main as main_mod

    monkeypatch.setenv("DATABASE_URL", "postgresql://bad:bad@127.0.0.1:1/nora_test")
    payload = base64.urlsafe_b64encode(
        json.dumps({"sub": "u", "role": "comercial"}).encode()
    ).decode().rstrip("=")
    headers = {"Authorization": f"Bearer h.{payload}.s"}

    old_graph, old_status = main_mod.nora_graph, main_mod.db_status
    try:
        with TestClient(main_mod.app) as client:
            health = client.get("/health")
            assert health.status_code == 200
            assert health.json()["db"] == "down"
            resp = client.post(
                "/messages", json={"content": "hola"}, headers=headers
            )
            assert resp.status_code == 503
    finally:
        main_mod.nora_graph, main_mod.db_status = old_graph, old_status

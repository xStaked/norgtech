"""409 solo cuando el lock expira; un TimeoutError interno del grafo no es 409."""
import base64
import json
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from src.main import app


def _bearer() -> str:
    payload = base64.urlsafe_b64encode(
        json.dumps({"sub": "u1", "role": "comercial"}).encode()
    ).decode().rstrip("=")
    return f"Bearer h.{payload}.s"


def test_graph_timeout_is_not_409():
    client = TestClient(app, raise_server_exceptions=False)
    graph = AsyncMock()
    graph.ainvoke.side_effect = TimeoutError("llm colgado")
    with patch("src.main.nora_graph", graph):
        r = client.post(
            "/messages",
            json={"content": "hola", "sessionId": "sess-409-scope"},
            headers={"Authorization": _bearer()},
        )
    assert r.status_code != 409, f"un timeout del grafo no debe ser 409: {r.text}"


def test_lock_timeout_is_409():
    from src import locks as locks_mod

    client = TestClient(app, raise_server_exceptions=False)
    # Ocupar el lock de la sesión para forzar timeout del segundo turno
    import asyncio

    async def _hold():
        lock = locks_mod.get_session_lock("sess-409-lock")
        await lock.acquire()
        return lock

    lock = asyncio.run(_hold())
    try:
        with patch("src.main.LOCK_WAIT_TIMEOUT", 0.05):
            r = client.post(
                "/messages",
                json={"content": "hola", "sessionId": "sess-409-lock"},
                headers={"Authorization": _bearer()},
            )
    finally:
        lock.release()
    assert r.status_code == 409
    assert r.json()["detail"] == "turn_in_progress"


def test_double_submit_same_session_serializes():
    """Dos turnos concurrentes al mismo sessionId: ambos 200 y sin overlap."""
    import asyncio as _aio
    import time

    from langchain_core.messages import AIMessage, HumanMessage

    from src.main import send_message
    from src.models.api_models import CreateMessageRequest

    intervals: list[tuple[float, float]] = []

    async def _fake_ainvoke(state, config=None):
        start = time.monotonic()
        await _aio.sleep(0.2)
        end = time.monotonic()
        intervals.append((start, end))
        return {"messages": [HumanMessage(content="h"), AIMessage(content="ok")]}

    graph = AsyncMock()
    graph.ainvoke.side_effect = _fake_ainvoke
    body = CreateMessageRequest(content="hola", sessionId="sess-double-submit")
    auth = _bearer()

    async def _run():
        return await _aio.gather(
            send_message(body, auth), send_message(body, auth)
        )

    with patch("src.main.nora_graph", graph):
        out = _aio.run(_run())

    assert len(out) == 2
    assert len(intervals) == 2
    (s1, e1), (s2, e2) = sorted(intervals)
    assert s2 >= e1, f"los turnos se solaparon: {intervals}"

"""Cada sesión de Nora pertenece al usuario del JWT que la creó.

El `sessionId` lo manda el cliente y se usa tal cual como `thread_id` del
checkpointer: sin esta validación, quien adivine el sessionId de otro lee su
hilo (y con roles distintos eso es fuga entre niveles).
"""
import base64
import json
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, HumanMessage

from src.main import app
from src.sessions import session_store


def _bearer(claims: dict) -> str:
    """JWT de mentira: solo importa el payload, la firma no se verifica aquí."""
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return f"Bearer header.{payload}.signature"


OWNER = _bearer({"sub": "user-owner", "role": "comercial", "email": "a@b.c"})
INTRUDER = _bearer({"sub": "user-intruder", "role": "director_comercial", "email": "d@b.c"})
NO_USER = _bearer({"role": "administrador", "email": "x@b.c"})

SECRET = "Mi cartera vale 500 millones"


def _fake_graph():
    graph = AsyncMock()
    graph.ainvoke.return_value = {
        "messages": [HumanMessage(content=SECRET), AIMessage(content="Listo.")]
    }
    return graph


def test_owner_can_continue_own_session():
    client = TestClient(app)
    with patch("src.main.nora_graph", _fake_graph()):
        first = client.post(
            "/messages",
            json={"content": SECRET, "sessionId": "sess-owner"},
            headers={"Authorization": OWNER},
        )
        second = client.post(
            "/messages",
            json={"content": "¿y mañana?", "sessionId": "sess-owner"},
            headers={"Authorization": OWNER},
        )

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["sessionId"] == "sess-owner"
    assert session_store.get("sess-owner").owner_user_id == "user-owner"


def test_other_user_gets_403_and_no_history():
    client = TestClient(app)
    with patch("src.main.nora_graph", _fake_graph()):
        client.post(
            "/messages",
            json={"content": SECRET, "sessionId": "sess-shared"},
            headers={"Authorization": OWNER},
        )
        posted = client.post(
            "/messages",
            json={"content": "sigue", "sessionId": "sess-shared"},
            headers={"Authorization": INTRUDER},
        )
        streamed = client.get(
            "/messages/stream",
            params={"content": "sigue", "sessionId": "sess-shared"},
            headers={"Authorization": INTRUDER},
        )
        fetched = client.get(
            "/sessions/sess-shared", headers={"Authorization": INTRUDER}
        )

    assert posted.status_code == 403
    assert streamed.status_code == 403
    assert fetched.status_code == 403
    for response in (posted, streamed, fetched):
        assert SECRET not in response.text
        assert "messages" not in response.json()
    # El dueño original sigue siendo el dueño.
    assert session_store.get("sess-shared").owner_user_id == "user-owner"


def test_token_without_user_cannot_hijack_session():
    client = TestClient(app)
    with patch("src.main.nora_graph", _fake_graph()):
        client.post(
            "/messages",
            json={"content": SECRET, "sessionId": "sess-anon"},
            headers={"Authorization": OWNER},
        )
        posted = client.post(
            "/messages",
            json={"content": "sigue", "sessionId": "sess-anon"},
            headers={"Authorization": NO_USER},
        )
        fetched = client.get(
            "/sessions/sess-anon", headers={"Authorization": NO_USER}
        )

    assert posted.status_code == 403
    assert fetched.status_code == 403
    assert SECRET not in posted.text
    assert SECRET not in fetched.text

from unittest.mock import patch

from fastapi.testclient import TestClient

from src.main import app
from src.models.whatsapp_models import WhatsAppAgentResponse


def test_whatsapp_general_endpoint_returns_reply():
    client = TestClient(app)

    async def fake_run(request):
        return WhatsAppAgentResponse(reply_text="Hoy tienes 2 visitas.", case_update=None, executed_entity=None)

    with patch("src.main.run_whatsapp_general_agent", side_effect=fake_run):
        response = client.post(
            "/whatsapp/agent/general",
            json={
                "current_message": "¿qué tengo hoy?",
                "history": [],
                "auth": "Bearer scoped",
                "conversation_id": "conv_1",
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["reply_text"] == "Hoy tienes 2 visitas."

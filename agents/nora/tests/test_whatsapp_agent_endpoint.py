from unittest.mock import patch

from fastapi.testclient import TestClient

from src.main import app
from src.models.whatsapp_models import WhatsAppAgentResponse


def test_whatsapp_agent_endpoint_returns_reply():
    client = TestClient(app)

    async def fake_run(request):
        return WhatsAppAgentResponse(
            reply_text="Listo, registré el gasto.",
            case_update=None,
            executed_entity={"type": "CommercialExpense", "id": "exp_1"},
        )

    with patch("src.main.run_whatsapp_agent", side_effect=fake_run):
        response = client.post(
            "/whatsapp/agent",
            json={
                "current_message": "lo veo bien",
                "history": [],
                "auth": "Bearer scoped",
                "conversation_id": "conv_1",
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["reply_text"] == "Listo, registré el gasto."
    assert body["executed_entity"]["id"] == "exp_1"

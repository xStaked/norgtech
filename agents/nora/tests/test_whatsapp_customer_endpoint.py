from unittest.mock import patch

from fastapi.testclient import TestClient

from src.main import app
from src.models.whatsapp_models import NoraHandoff, WhatsAppAgentResponse


def test_whatsapp_customer_endpoint_returns_reply_and_handoff():
    client = TestClient(app)

    async def fake_run(request):
        return WhatsAppAgentResponse(
            reply_text="Ya un asesor te contacta.",
            case_update=None,
            executed_entity=None,
            handoff=NoraHandoff(needed=True, intent="pedido", reason="quiere pedir"),
        )

    with patch("src.main.run_whatsapp_customer_agent", side_effect=fake_run):
        response = client.post(
            "/whatsapp/agent/customer",
            json={"current_message": "quiero hacer un pedido", "history": [], "auth": "", "conversation_id": "conv_1"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["reply_text"] == "Ya un asesor te contacta."
    assert body["handoff"]["needed"] is True
    assert body["handoff"]["intent"] == "pedido"

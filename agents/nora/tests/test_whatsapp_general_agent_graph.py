import asyncio
from unittest.mock import patch

from langchain_core.messages import AIMessage

from src import whatsapp_general_agent as general
from src.models.whatsapp_models import WhatsAppAgentRequest


class _FakeLLM:
    """LLM async minimo: el grafo debe usar ainvoke, no invoke."""

    def __init__(self, reply=None, error=None):
        self.reply = reply
        self.error = error

    def bind_tools(self, tools):
        return self

    async def ainvoke(self, messages):
        if self.error:
            raise self.error
        return AIMessage(content=self.reply)


def _run(llm):
    with patch("src.whatsapp_general_agent.create_llm", return_value=llm):
        graph = general._build_general_graph()
    request = WhatsAppAgentRequest(
        current_message="si",
        history=[],
        auth="Bearer scoped",
        conversation_id="conv_1",
    )
    with patch.object(general, "_general_graph", graph):
        return asyncio.run(general.run_whatsapp_general_agent(request))


def test_general_agent_replies_through_async_llm():
    response = _run(_FakeLLM(reply="Listo, pedido creado."))

    assert response.reply_text == "Listo, pedido creado."
    assert response.error is None


def test_general_agent_answers_instead_of_dying_when_the_turn_blows_up():
    response = _run(_FakeLLM(error=RuntimeError("boom")))

    # Sin esto el CRM caia al planner y el comercial veia silencio.
    assert "repites" in response.reply_text
    assert response.error == "RuntimeError: boom"

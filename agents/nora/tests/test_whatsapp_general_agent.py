"""Deterministic tests for whatsapp_general_agent (no LLM, no network)."""
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from src.models.whatsapp_models import NoraMessageContext, WhatsAppAgentRequest
from src.whatsapp_general_agent import _to_messages


def _req(**kwargs) -> WhatsAppAgentRequest:
    defaults = dict(current_message="¿qué tengo hoy?", history=[], auth="Bearer scoped", conversation_id="conv_1")
    defaults.update(kwargs)
    return WhatsAppAgentRequest(**defaults)


def test_first_message_is_system_prompt_with_whatsapp_addendum():
    msgs = _to_messages(_req())
    assert isinstance(msgs[0], SystemMessage)
    assert "Nora" in msgs[0].content          # NORA_SYSTEM_PROMPT marker
    assert "WhatsApp" in msgs[0].content       # addendum marker


def test_history_converted_in_order_and_roles():
    req = _req(
        history=[
            NoraMessageContext(role="assistant", body="Hola"),
            NoraMessageContext(role="user", body="Chao"),
        ],
        current_message="Chao",  # equals last history item -> no duplicate
    )
    msgs = _to_messages(req)
    assert isinstance(msgs[1], AIMessage) and msgs[1].content == "Hola"
    assert isinstance(msgs[2], HumanMessage) and msgs[2].content == "Chao"
    human = [m for m in msgs if isinstance(m, HumanMessage)]
    assert sum(1 for m in human if m.content == "Chao") == 1


def test_current_message_appended_when_not_last_history():
    req = _req(history=[NoraMessageContext(role="assistant", body="¿algo más?")], current_message="sí")
    msgs = _to_messages(req)
    assert isinstance(msgs[-1], HumanMessage) and msgs[-1].content == "sí"

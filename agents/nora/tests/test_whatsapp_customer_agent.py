"""Deterministic tests for whatsapp_customer_agent (no LLM, no network)."""
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from src.models.whatsapp_models import (
    NoraCustomerSnapshot,
    NoraMessageContext,
    WhatsAppAgentRequest,
)
from src.whatsapp_customer_agent import _extract_handoff, _snapshot_block, _to_messages


def _snapshot() -> NoraCustomerSnapshot:
    return NoraCustomerSnapshot(
        customerName="Avicola del Valle",
        recentOrders=[{"orderNumber": "NT-100", "status": "despachado", "orderDate": "2026-06-20", "total": 1500000}],
        cartera={"saldo": 800000, "vencidasCount": 1},
    )


def _req(**kwargs) -> WhatsAppAgentRequest:
    defaults = dict(current_message="¿cómo va mi pedido?", history=[], auth="", conversation_id="conv_1",
                    customer_snapshot=_snapshot())
    defaults.update(kwargs)
    return WhatsAppAgentRequest(**defaults)


def test_snapshot_block_includes_orders_and_cartera():
    block = _snapshot_block(_req())
    assert "Avicola del Valle" in block
    assert "NT-100" in block
    assert "despachado" in block
    assert "800000" in block


def test_snapshot_block_handles_no_snapshot():
    block = _snapshot_block(_req(customer_snapshot=None))
    assert "sin datos" in block.lower() or "no hay" in block.lower()


def test_first_two_messages_are_prompt_and_snapshot():
    msgs = _to_messages(_req())
    assert isinstance(msgs[0], SystemMessage) and "Nora" in msgs[0].content
    assert isinstance(msgs[1], SystemMessage) and "DATOS DEL CLIENTE" in msgs[1].content


def test_current_message_not_duplicated_when_last_history():
    req = _req(
        history=[NoraMessageContext(role="user", body="hola")],
        current_message="hola",
    )
    msgs = _to_messages(req)
    assert sum(1 for m in msgs if isinstance(m, HumanMessage) and m.content == "hola") == 1


def test_extract_handoff_detects_derivation():
    msgs = [ToolMessage(content="DERIVADO|pedido|quiere hacer un pedido", tool_call_id="tc_1", name="derivar_a_unicanal")]
    h = _extract_handoff(msgs)
    assert h.needed is True
    assert h.intent == "pedido"
    assert h.reason == "quiere hacer un pedido"


def test_extract_handoff_returns_not_needed_without_tool():
    msgs = [AIMessage(content="Tu pedido NT-100 va despachado.")]
    h = _extract_handoff(msgs)
    assert h.needed is False

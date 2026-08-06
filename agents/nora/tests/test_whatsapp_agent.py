"""
Tests for agents/nora/src/whatsapp_agent.py

Deterministic helper tests (no LLM, no network) run always.
Live-LLM tests are skipped when OPENAI_API_KEY is absent or clearly invalid.
Run: cd agents/nora && .venv/bin/python -m pytest tests/test_whatsapp_agent.py -v
"""
import asyncio
import os
from unittest.mock import AsyncMock, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from src.models.whatsapp_models import (
    NoraMessageContext,
    NoraOpenCaseContext,
    WhatsAppAgentRequest,
)
from src.whatsapp_agent import (
    _case_context_block,
    _extract_executed_entity,
    _to_messages,
    run_whatsapp_agent,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _expense_case() -> NoraOpenCaseContext:
    return NoraOpenCaseContext(
        id="case_1",
        type="expense",
        status="ready_for_review",
        extractedData={
            "amount": 25000,
            "expenseDate": "2026-04-24",
            "category": "alimentacion",
            "description": "Almuerzo",
            "supplierName": "INVERSIONES ARIAS SERNA S.A.S.",
            "extractionConfidence": 0.9,
            "extractionModel": "gpt-4.1-mini",
        },
        missingFields=[],
        attachments=[{"providerMediaId": "media_1", "kind": "image"}],
    )


def _base_request(**kwargs) -> WhatsAppAgentRequest:
    defaults = dict(
        current_message="lo veo bien",
        history=[
            NoraMessageContext(role="assistant", body="Leí el soporte: valor $25.000... ¿lo registro?"),
            NoraMessageContext(role="user", body="lo veo bien"),
        ],
        open_case=_expense_case(),
        conversation_id="conv_1",
        auth="Bearer scoped",
    )
    defaults.update(kwargs)
    return WhatsAppAgentRequest(**defaults)


# ---------------------------------------------------------------------------
# Deterministic: _case_context_block
# ---------------------------------------------------------------------------

class TestCaseContextBlock:
    def test_no_open_case_returns_fallback(self):
        req = _base_request(open_case=None)
        block = _case_context_block(req)
        assert "No hay caso abierto" in block

    def test_includes_status(self):
        req = _base_request()
        block = _case_context_block(req)
        assert "ready_for_review" in block

    def test_includes_extracted_data(self):
        req = _base_request()
        block = _case_context_block(req)
        assert "25000" in block
        assert "alimentacion" in block

    def test_includes_missing_fields(self):
        case = _expense_case()
        case.missingFields = ["amount", "category"]
        req = _base_request(open_case=case)
        block = _case_context_block(req)
        assert "amount" in block
        assert "category" in block

    def test_support_attached_true_when_case_has_attachments(self):
        req = _base_request()  # case has 1 attachment
        block = _case_context_block(req)
        assert "si" in block.lower()

    def test_support_attached_true_when_request_has_attachments(self):
        case = _expense_case()
        case.attachments = []  # no attachments on case
        from src.models.whatsapp_models import NoraAgentAttachment
        req = _base_request(
            open_case=case,
            attachments=[NoraAgentAttachment(kind="image", providerMediaId="mid_1")],
        )
        block = _case_context_block(req)
        assert "si" in block.lower()

    def test_support_attached_false_when_no_attachments(self):
        case = _expense_case()
        case.attachments = []
        req = _base_request(open_case=case, attachments=[])
        block = _case_context_block(req)
        assert "no" in block.lower()


# ---------------------------------------------------------------------------
# Deterministic: _to_messages
# ---------------------------------------------------------------------------

class TestToMessages:
    def test_first_message_is_system_prompt(self):
        req = _base_request()
        msgs = _to_messages(req)
        assert isinstance(msgs[0], SystemMessage)
        # EXPENSE_AGENT_PROMPT has distinctive content
        assert "Magali" in msgs[0].content

    def test_second_message_is_case_context_block(self):
        req = _base_request()
        msgs = _to_messages(req)
        assert isinstance(msgs[1], SystemMessage)
        assert "CASO DE GASTO" in msgs[1].content

    def test_history_is_converted_in_order(self):
        req = _base_request(
            history=[
                NoraMessageContext(role="assistant", body="Hola"),
                NoraMessageContext(role="user", body="Chao"),
            ],
            current_message="Chao",  # matches last history item -> no duplicate
        )
        msgs = _to_messages(req)
        # First two are SystemMessages, then history
        assert isinstance(msgs[2], AIMessage)
        assert msgs[2].content == "Hola"
        assert isinstance(msgs[3], HumanMessage)
        assert msgs[3].content == "Chao"

    def test_assistant_role_becomes_ai_message(self):
        req = _base_request(
            history=[NoraMessageContext(role="assistant", body="Hola")],
            current_message="nuevo",
        )
        msgs = _to_messages(req)
        ai_msgs = [m for m in msgs if isinstance(m, AIMessage)]
        assert len(ai_msgs) == 1
        assert ai_msgs[0].content == "Hola"

    def test_current_message_appended_when_not_last_history(self):
        req = _base_request(
            history=[NoraMessageContext(role="assistant", body="¿Confirmas?")],
            current_message="sí",
        )
        msgs = _to_messages(req)
        last = msgs[-1]
        assert isinstance(last, HumanMessage)
        assert last.content == "sí"

    def test_current_message_not_duplicated_when_already_last(self):
        # When last history item matches current_message, no duplicate
        req = _base_request(
            history=[
                NoraMessageContext(role="assistant", body="¿Confirmas?"),
                NoraMessageContext(role="user", body="lo veo bien"),
            ],
            current_message="lo veo bien",
        )
        msgs = _to_messages(req)
        human_msgs = [m for m in msgs if isinstance(m, HumanMessage)]
        # Only one "lo veo bien"
        assert sum(1 for m in human_msgs if m.content == "lo veo bien") == 1


# ---------------------------------------------------------------------------
# Deterministic: _extract_executed_entity
# ---------------------------------------------------------------------------

class TestExtractExecutedEntity:
    def _make_tool_msg(self, content: str, name: str = "create_expense") -> ToolMessage:
        return ToolMessage(content=content, tool_call_id="tc_1", name=name)

    def test_returns_entity_on_valid_create_expense_result(self):
        import json
        content = (
            "Gasto registrado exitosamente. ID: exp_1, estado: pendiente. "
            f"Queda en revision. Detalle: {json.dumps({'id': 'exp_1', 'status': 'pendiente', 'alreadyExisted': False})}"
        )
        msgs = [self._make_tool_msg(content)]
        entity = _extract_executed_entity(msgs)
        assert entity == {"type": "CommercialExpense", "id": "exp_1"}

    def test_returns_none_when_already_existed(self):
        import json
        content = (
            "Ese gasto ya estaba registrado. "
            f"Detalle: {json.dumps({'id': 'exp_99', 'alreadyExisted': True})}"
        )
        msgs = [self._make_tool_msg(content)]
        entity = _extract_executed_entity(msgs)
        assert entity is None

    def test_returns_none_when_no_create_expense_message(self):
        msgs = [
            HumanMessage(content="hola"),
            AIMessage(content="¿cuánto fue el gasto?"),
        ]
        entity = _extract_executed_entity(msgs)
        assert entity is None

    def test_returns_none_for_other_tool_names(self):
        import json
        content = f"Detalle: {json.dumps({'id': 'exp_1', 'alreadyExisted': False})}"
        msgs = [self._make_tool_msg(content, name="lookup_customer")]
        entity = _extract_executed_entity(msgs)
        assert entity is None

    def test_uses_most_recent_create_expense(self):
        import json
        old = (
            f"Detalle: {json.dumps({'id': 'exp_old', 'alreadyExisted': False})}"
        )
        new = (
            f"Detalle: {json.dumps({'id': 'exp_new', 'alreadyExisted': False})}"
        )
        msgs = [self._make_tool_msg(old), self._make_tool_msg(new)]
        entity = _extract_executed_entity(msgs)
        assert entity == {"type": "CommercialExpense", "id": "exp_new"}


# ---------------------------------------------------------------------------
# Live-LLM tests (skipped when OPENAI_API_KEY is absent)
# ---------------------------------------------------------------------------

_has_api_key = bool(os.environ.get("OPENAI_API_KEY", "").strip())

def test_case_block_includes_correction_mode():
    request = WhatsAppAgentRequest(
        current_message="el NIT es 900123456",
        history=[],
        open_case={
            "id": "case_1",
            "type": "expense",
            "status": "collecting_info",
            "extractedData": {
                "mode": "correction",
                "expenseId": "exp_1",
                "reviewNote": "Falta el NIT del proveedor",
            },
            "missingFields": [],
            "attachments": [],
            "lastQuestion": None,
        },
        conversation_id="conv_1",
        auth="Bearer x",
    )
    block = _case_context_block(request)
    assert "correccion" in block.lower()
    assert "exp_1" in block
    assert "Falta el NIT" in block


@pytest.mark.skipif(
    not _has_api_key,
    reason="OPENAI_API_KEY not set — skipping live-LLM tests",
)
def test_confirmation_phrase_triggers_expense_creation():
    """
    'lo veo bien' with all required fields present → create_expense is called,
    executed_entity is returned.
    """
    request = _base_request()

    create_calls: dict = {}

    async def fake_post(path, payload):
        create_calls["path"] = path
        create_calls["payload"] = payload
        return {"id": "exp_1", "status": "pendiente", "alreadyExisted": False}

    fake_client = AsyncMock()
    fake_client.post = fake_post

    with patch("src.tools.expenses.NestJSClient", return_value=fake_client):
        response = asyncio.run(run_whatsapp_agent(request))

    assert create_calls.get("path") == "/whatsapp/agent/expenses"
    assert create_calls["payload"]["amount"] == 25000
    assert response.executed_entity == {"type": "CommercialExpense", "id": "exp_1"}
    assert "25" in response.reply_text or "registr" in response.reply_text.lower()


@pytest.mark.skipif(
    not _has_api_key,
    reason="OPENAI_API_KEY not set — skipping live-LLM tests",
)
def test_missing_amount_asks_instead_of_creating():
    """
    When amount is missing, Nora should ask for it, NOT call create_expense.
    """
    case = _expense_case()
    case.extractedData.pop("amount")
    case.missingFields = ["amount"]
    request = _base_request(
        current_message="hola",
        history=[NoraMessageContext(role="user", body="hola")],
        open_case=case,
    )

    fake_client = AsyncMock()
    fake_client.post = AsyncMock()

    with patch("src.tools.expenses.NestJSClient", return_value=fake_client):
        response = asyncio.run(run_whatsapp_agent(request))

    fake_client.post.assert_not_called()
    assert response.executed_entity is None
    assert len(response.reply_text) > 0

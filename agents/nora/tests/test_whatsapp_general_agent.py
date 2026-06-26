"""Deterministic tests for whatsapp_general_agent (no LLM, no network)."""
import json

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from src.models.whatsapp_models import NoraMessageContext, WhatsAppAgentRequest
from src.whatsapp_general_agent import _extract_customer_entity, _extract_executed_entity, _to_messages


def _req(**kwargs) -> WhatsAppAgentRequest:
    defaults = dict(current_message="¿qué tengo hoy?", history=[], auth="Bearer scoped", conversation_id="conv_1")
    defaults.update(kwargs)
    return WhatsAppAgentRequest(**defaults)


def test_first_message_is_system_prompt_with_whatsapp_addendum():
    msgs = _to_messages(_req())
    assert isinstance(msgs[0], SystemMessage)
    assert "Nora" in msgs[0].content          # NORA_SYSTEM_PROMPT marker
    assert "WhatsApp" in msgs[0].content       # addendum marker
    assert "Una solicitud de visita no es un gasto" in msgs[0].content


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


def test_new_customer_open_case_injects_case_context_block():
    req = _req(
        current_message="ciudad: Monteria\ntelefono: 329768969",
        open_case={
            "id": "case-customer-1",
            "type": "new_customer",
            "status": "collecting_info",
            "extractedData": {
                "legalName": "Porcicultura Caribe SAS",
                "displayName": "Porcicultura Caribe SAS",
                "taxId": "3948192-0",
            },
            "missingFields": ["city", "phone"],
            "lastQuestion": "Perfecto. Ahora envíame la ciudad y el teléfono de contacto.",
        },
    )

    msgs = _to_messages(req)

    assert isinstance(msgs[0], SystemMessage)
    assert "Caso abierto: cliente nuevo" in msgs[0].content
    assert isinstance(msgs[1], SystemMessage)
    assert "CASO DE CLIENTE NUEVO" in msgs[1].content
    assert "Porcicultura Caribe SAS" in msgs[1].content
    assert "datos detectados" in msgs[1].content
    assert isinstance(msgs[-1], HumanMessage)


def test_new_customer_case_context_detects_unlabeled_city_phone_from_current_message():
    req = _req(
        history=[
            NoraMessageContext(role="user", body="Nombre: Porcicultura Caribe SAS\nNIT: 3948192-0"),
            NoraMessageContext(role="assistant", body="Perfecto. Ahora envíame la ciudad y el teléfono de contacto."),
        ],
        current_message="Monteria y 329768969",
        open_case={
            "id": "case-customer-1",
            "type": "new_customer",
            "status": "collecting_info",
            "extractedData": {},
            "missingFields": ["city", "phone"],
        },
    )

    msgs = _to_messages(req)

    assert "Porcicultura Caribe SAS" in msgs[1].content
    assert "3948192-0" in msgs[1].content
    assert "Monteria" in msgs[1].content
    assert "329768969" in msgs[1].content


def test_extract_customer_entity_from_create_customer_tool_message():
    payload = {"id": "customer-1", "displayName": "Porcicultura Caribe SAS"}
    msg = ToolMessage(
        content=f"Cliente creado exitosamente: {json.dumps(payload)}",
        tool_call_id="tc_1",
        name="create_customer",
    )

    assert _extract_customer_entity([msg]) == {"type": "Customer", "id": "customer-1"}


def test_visit_pending_context_is_injected_for_short_confirmation_turn():
    req = _req(
        history=[
            NoraMessageContext(
                role="assistant",
                body='El cliente "Porcicultura Caribe SAS" ha sido creado exitosamente.',
            ),
            NoraMessageContext(
                role="user",
                body="listo necesito crear una visita para ese cliente",
            ),
            NoraMessageContext(
                role="assistant",
                body='Para crear una visita para "Porcicultura Caribe SAS", necesito fecha y descripción.',
            ),
            NoraMessageContext(
                role="user",
                body=(
                    "los voy a visitar el 29 de junio a las 12:00 PM, "
                    "es una visita de seguimiento con el producto no mas algo breve"
                ),
            ),
            NoraMessageContext(
                role="assistant",
                body=(
                    "Procederé a crear la visita para \"Porcicultura Caribe SAS\" "
                    "el 29 de junio a las 12:00 PM."
                ),
            ),
        ],
        current_message="ok",
    )

    msgs = _to_messages(req)
    visit_blocks = [
        msg.content
        for msg in msgs
        if isinstance(msg, SystemMessage) and msg.content.startswith("[VISITA PENDIENTE]")
    ]

    assert len(visit_blocks) == 1
    assert "Porcicultura Caribe SAS" in visit_blocks[0]
    assert "-06-29T12:00:00" in visit_blocks[0]
    assert "seguimiento con el producto no mas algo breve" in visit_blocks[0]
    assert '"currentMessageConfirms": true' in visit_blocks[0]


def test_extract_executed_entity_from_create_visit_tool_message():
    payload = {"id": "visit-1", "summary": "Visita seguimiento"}
    msg = ToolMessage(
        content=f"Visita registrada exitosamente: {json.dumps(payload)}",
        tool_call_id="tc_1",
        name="create_visit",
    )

    assert _extract_executed_entity([msg]) == {"type": "Visit", "id": "visit-1"}

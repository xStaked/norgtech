"""
Stateless WhatsApp general agent runner (comercial/admin).

Runs Nora's full toolset (ALL_TOOLS) over WhatsApp in agentic mode, mirroring
whatsapp_agent.py but with every CRM tool instead of only the expense tools.
NestJS passes the full conversation history on every turn (no checkpointer).
"""
from datetime import date
from .visit_parsing import resolve_visit_datetime
from typing import Annotated, TypedDict

import json
import logging
import re

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from .agent import ALL_TOOLS, create_llm
from .models.whatsapp_models import WhatsAppAgentRequest, WhatsAppAgentResponse
from .prompts.system import NORA_SYSTEM_PROMPT, current_date_note
from .roles import role_from_token, role_prompt, tools_for_role

logger = logging.getLogger(__name__)

WHATSAPP_ADDENDUM = (
    "\n\n## Canal: WhatsApp\n"
    "Estás hablando con un comercial del equipo por WhatsApp. Responde en texto "
    "plano, breve y claro: sin tablas ni markdown pesado, frases cortas. Si una "
    "respuesta es larga, resúmela. Confirma de forma natural antes de crear o "
    "modificar algo (pedido, visita, cliente, seguimiento)."
)

NEW_CUSTOMER_CASE_PROMPT = (
    "\n\n## Caso abierto: cliente nuevo\n"
    "Si recibes un bloque [CASO DE CLIENTE NUEVO], usa esos datos como contexto "
    "prioritario. No cambies a gastos, pedidos u otra tarea aunque el historial "
    "contenga conversaciones anteriores. Para crear el cliente necesitas nombre "
    "o razón social; usa el mismo valor como display_name si no hay nombre "
    "comercial distinto. NIT, ciudad y teléfono son datos deseables: si faltan, "
    "pregúntalos de forma breve. Pregunta también, de forma breve, por el correo, "
    "la dirección, el departamento y las notas del cliente, PERO estos cuatro son "
    "OPCIONALES: si el usuario dice que no los tiene o no los da, NO bloquees la "
    "creación; crea el cliente igual con lo que tengas. Cuando ya tengas al menos "
    "nombre, NIT, ciudad y teléfono, llama create_customer directamente (el "
    "segmento se asigna solo, no pases segment_id; pasa email, address, department "
    "y notes solo si los tienes) y confirma el resultado.\n"
    "Antes de crear, busca con search_customers por el NIT y por el nombre: si "
    "el cliente ya existe (aunque salga con \"activo\": false) NO lo crees de "
    "nuevo; dilo y ofrece reactivarlo con update_customer(active=True). Si el "
    "API responde que ya existe un cliente con ese NIT, tampoco vuelvas a "
    "ofrecer crearlo: el error trae el nombre del cliente existente."
)

CUSTOMER_EDIT_PROMPT = (
    "\n\n## Consultar y editar clientes por WhatsApp\n"
    "Puedes consultar y actualizar los datos de un cliente existente con "
    "update_customer, incluyendo teléfono (phone), NIT (tax_id), correo (email), "
    "dirección (address), ciudad (city) y departamento (department). Si el "
    "comercial pide ver o cambiar el teléfono (u otro dato) de un cliente, hazlo: "
    "búscalo primero con search_customers para obtener su customer_id y luego "
    "llama update_customer solo con el campo que cambia. Nunca digas que no puedes "
    "ver o modificar el teléfono de un cliente."
)

VISIT_EDIT_FIELD_PROMPT = (
    "\n\n## Editar una visita: descripción = summary\n"
    "Cuando el usuario edite una visita y hable de su 'descripción' o 'detalle', "
    "eso corresponde al campo summary (resumen) de update_visit: pásalo en summary "
    "para que el cambio quede guardado."
)

VISIT_FLOW_PROMPT = (
    "\n\n## Flujo de visitas por WhatsApp\n"
    "Sí tienes capacidad para crear visitas usando la herramienta create_visit. "
    "Nunca digas que no puedes crear visitas si estás hablando con un comercial. "
    "Cuando el usuario pida crear una visita para 'ese cliente', toma como "
    "referencia el cliente creado o mencionado más recientemente en el historial. "
    "Si recibes un bloque [VISITA PENDIENTE] y el mensaje actual es una "
    "confirmación como 'ok', 'listo', 'dale' o 'sí', busca primero el cliente "
    "con search_customers y luego llama create_visit con el customer_id correcto. "
    "Si ya tienes cliente, fecha/hora y resumen, crea la visita; no vuelvas a "
    "pedir confirmación. Una solicitud de visita no es un gasto y no debe "
    "activar el flujo de gastos."
)

VISIT_DELETE_PROMPT = (
    "\n\n## Eliminar una visita (operación destructiva)\n"
    "Eliminar una visita borra un registro y no se puede deshacer. NUNCA "
    "infieras cuál visita eliminar a partir de una descripción o texto "
    "mencionado en un mensaje anterior. Para eliminar: (1) identifica el "
    "cliente (búscalo con search_customers si hace falta), (2) llama "
    "get_customer_visits para listar sus visitas, (3) muéstralas y pide que "
    "confirmen CUÁL por fecha, y (4) solo entonces llama delete_visit con ese "
    "id. Si no hay una visita claramente identificada y confirmada, pregunta; "
    "no borres nada."
)


class _GeneralState(TypedDict):
    messages: Annotated[list, add_messages]
    auth_token: str
    session_id: str | None


def _build_general_graph():
    llm = create_llm()
    tool_node = ToolNode(ALL_TOOLS)

    # ainvoke y no invoke: el sync bloquea el event loop de FastAPI y los
    # turnos concurrentes se serializan hasta reventar por timeout.
    async def call_model(state: _GeneralState) -> dict:
        # Mismo criterio que el agente web: el token trae el rol y el rol
        # decide que herramientas se le ofrecen al LLM.
        role = role_from_token(state.get("auth_token"))
        llm_with_tools = llm.bind_tools(tools_for_role(role, ALL_TOOLS))
        return {"messages": [await llm_with_tools.ainvoke(state["messages"])]}

    def should_continue(state: _GeneralState):
        last = state["messages"][-1]
        if getattr(last, "tool_calls", None):
            return "tools"
        return "__end__"

    workflow = StateGraph(_GeneralState)
    workflow.add_node("agent", call_model)
    workflow.add_node("tools", tool_node)
    workflow.set_entry_point("agent")
    workflow.add_conditional_edges("agent", should_continue, {"tools": "tools", "__end__": END})
    workflow.add_edge("tools", "agent")
    # No checkpointer: full history passed in on every call (stateless).
    return workflow.compile()


_general_graph = _build_general_graph()


def _case_context_block(request: WhatsAppAgentRequest) -> str:
    case = request.open_case
    if not case or case.type != "new_customer":
        return ""
    detected = _detected_new_customer_fields(request)
    return (
        "[CASO DE CLIENTE NUEVO]\n"
        f"- estado: {case.status}\n"
        f"- datos capturados: {json.dumps(case.extractedData or {}, ensure_ascii=False)}\n"
        f"- datos detectados en la conversacion: {json.dumps(detected, ensure_ascii=False)}\n"
        f"- campos faltantes: {json.dumps(case.missingFields or [], ensure_ascii=False)}\n"
        f"- ultima pregunta: {case.lastQuestion or ''}"
    )


def _visit_context_block(request: WhatsAppAgentRequest) -> str:
    pending = _detected_pending_visit(request)
    if not pending:
        return ""
    return (
        "[VISITA PENDIENTE]\n"
        f"- datos detectados: {json.dumps(pending, ensure_ascii=False)}\n"
        "- accion requerida: si el mensaje actual confirma, usa search_customers "
        "con customerRef y luego create_visit."
    )


def _detected_new_customer_fields(request: WhatsAppAgentRequest) -> dict:
    combined = "\n".join([item.body for item in request.history] + [request.current_message])
    fields: dict[str, str] = {}
    name = _field_value(combined, ("nombre", "razon social", "razón social", "cliente"))
    tax_id = _field_value(combined, ("nit", "tax id"))
    city = _field_value(combined, ("ciudad",))
    phone = _field_value(combined, ("telefono", "teléfono", "celular"))

    if not phone and not re.search(r"(?im)^\s*(?:nit|tax id)\s*:", request.current_message):
        phone_match = re.search(r"\b(?:\+?\d[\d\s().-]{6,}\d)\b", request.current_message)
        if phone_match:
            phone = re.sub(r"\D+", "", phone_match.group(0))
    if not city and phone:
        without_phone = re.sub(re.escape(phone), " ", request.current_message)
        without_phone = re.sub(
            r"\b(?:telefono|teléfono|celular|ciudad)\b\s*:?",
            " ",
            without_phone,
            flags=re.IGNORECASE,
        )
        without_phone = re.sub(r"\b(?:y|e)\b", " ", without_phone, flags=re.IGNORECASE)
        candidate = re.sub(r"[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s.-]", " ", without_phone)
        candidate = re.sub(r"\s+", " ", candidate).strip(" .-")
        if candidate and not re.search(
            r"\b(?:nombre|nit|crear|cliente)\b", candidate, flags=re.IGNORECASE
        ):
            city = candidate

    # Optional (prompt-but-optional) fields, labeled forms only (AI-05).
    email = _field_value(combined, ("correo", "email", "e-mail", "e mail"))
    address = _field_value(combined, ("direccion", "dirección"))
    department = _field_value(combined, ("departamento",))
    notes = _field_value(combined, ("notas", "nota", "observaciones", "observacion", "observación"))

    if name:
        fields["legalName"] = name
        fields["displayName"] = name
    if tax_id:
        fields["taxId"] = tax_id
    if city:
        fields["city"] = city
    if phone:
        fields["phone"] = phone
    if email:
        fields["email"] = email
    if address:
        fields["address"] = address
    if department:
        fields["department"] = department
    if notes:
        fields["notes"] = notes
    return fields


def _detected_pending_visit(request: WhatsAppAgentRequest) -> dict | None:
    history_text = "\n".join(item.body for item in request.history)
    combined = "\n".join([history_text, request.current_message])
    if "visita" not in combined.lower():
        return None

    customer_ref = _latest_customer_ref(combined)
    scheduled_at = _latest_visit_datetime(combined)
    summary = _latest_visit_summary(combined)
    current_is_confirmation = _is_confirmation(request.current_message)

    if not customer_ref or not scheduled_at or not summary:
        return None

    # ponytail: this stateless agent needs an explicit bridge for the short
    # "ok" turn, otherwise the LLM can lose the visit it proposed one turn ago.
    return {
        "customerRef": customer_ref,
        "scheduledAt": scheduled_at,
        "summary": summary,
        "currentMessageConfirms": current_is_confirmation,
    }


def _latest_customer_ref(text: str) -> str | None:
    patterns = (
        r'cliente\s+"([^"]+)"',
        r'para\s+"([^"]+)"',
        r'cliente\s+([A-ZÁÉÍÓÚÜÑ][\wÁÉÍÓÚÜÑáéíóúüñ .&-]+?)(?:,|\n|$)',
        r'para\s+([A-ZÁÉÍÓÚÜÑ][\wÁÉÍÓÚÜÑáéíóúüñ .&-]+?)(?:,|\n|$)',
    )
    matches: list[str] = []
    for pattern in patterns:
        matches.extend(match.strip() for match in re.findall(pattern, text, flags=re.IGNORECASE))
    matches = [
        match
        for match in matches
        if _normalize_text(match) not in {"ese cliente", "este cliente", "el cliente"}
    ]
    return matches[-1] if matches else None


def _latest_visit_datetime(text: str) -> str | None:
    # AI-07: parser compartido (src/visit_parsing.py) — misma regla que el
    # planner. Entiende fechas absolutas y relativas (hoy/manana/dia-de-semana)
    # + horas sueltas, en hora de Colombia.
    return resolve_visit_datetime(text)


def _latest_visit_summary(text: str) -> str | None:
    matches = re.findall(
        r"(?:es una|ser[aá] una|visita de)\s+(.+?)(?:\n|$)",
        text,
        flags=re.IGNORECASE,
    )
    if matches:
        summary = re.sub(r"\s+", " ", matches[-1]).strip(" .")
        if summary.lower().startswith("visita "):
            return summary
        return f"Visita {summary}"
    if "visita" in text.lower():
        return "Visita comercial"
    return None


def _is_confirmation(message: str) -> bool:
    normalized = _normalize_text(message)
    return normalized in {
        "ok",
        "okay",
        "okey",
        "listo",
        "dale",
        "si",
        "sí",
        "confirmo",
        "perfecto",
        "de acuerdo",
    }


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def _field_value(text: str, labels: tuple[str, ...]) -> str | None:
    for label in labels:
        match = re.search(rf"(?im)^\s*{label}\s*:\s*(.+?)\s*$", text)
        if match:
            return match.group(1).strip()
    return None


def _to_messages(request: WhatsAppAgentRequest) -> list:
    """System prompt (+WhatsApp addendum) + history + current message (no dup)."""
    system_prompt = (
        NORA_SYSTEM_PROMPT
        + WHATSAPP_ADDENDUM
        + VISIT_FLOW_PROMPT
        + VISIT_DELETE_PROMPT
        + CUSTOMER_EDIT_PROMPT
        + VISIT_EDIT_FIELD_PROMPT
    )
    if request.open_case and request.open_case.type == "new_customer":
        system_prompt += NEW_CUSTOMER_CASE_PROMPT
    system_prompt += role_prompt(role_from_token(request.auth)) + current_date_note()

    messages: list = [SystemMessage(content=system_prompt)]
    case_context = _case_context_block(request)
    if case_context:
        messages.append(SystemMessage(content=case_context))
    visit_context = _visit_context_block(request)
    if visit_context:
        messages.append(SystemMessage(content=visit_context))
    for item in request.history:
        if item.role == "assistant":
            messages.append(AIMessage(content=item.body))
        else:
            messages.append(HumanMessage(content=item.body))
    if not request.history or request.history[-1].body != request.current_message:
        messages.append(HumanMessage(content=request.current_message))
    return messages


def _extract_executed_entity(messages: list) -> dict | None:
    for msg in reversed(messages):
        if not isinstance(msg, ToolMessage):
            continue
        data = _json_payload_from_tool_message(msg)
        if not data or not data.get("id"):
            continue
        if msg.name == "create_customer":
            return {"type": "Customer", "id": data["id"]}
        if msg.name == "create_visit":
            return {"type": "Visit", "id": data["id"]}
    return None


def _extract_customer_entity(messages: list) -> dict | None:
    entity = _extract_executed_entity(messages)
    return entity if entity and entity["type"] == "Customer" else None


def _json_payload_from_tool_message(msg: ToolMessage) -> dict | None:
    content = msg.content or ""
    try:
        start = content.index("{")
        return json.loads(content[start:])
    except (ValueError, json.JSONDecodeError):
        return None


async def run_whatsapp_general_agent(request: WhatsAppAgentRequest) -> WhatsAppAgentResponse:
    """Run one stateless turn of the general agent and return the reply."""
    state: _GeneralState = {
        "messages": _to_messages(request),
        "auth_token": request.auth,
        "session_id": request.conversation_id,
    }
    try:
        result = await _general_graph.ainvoke(state)
    except Exception as exc:
        # Un 500 aquí dejaba al CRM cayendo al planner, que respondía el saludo
        # genérico (o nada): el comercial veía silencio justo al confirmar.
        logger.exception("El agente general falló procesando el turno")
        return WhatsAppAgentResponse(
            reply_text=(
                "Se me cruzaron los cables procesando eso. ¿Me lo repites? "
                "Si era un pedido, dime el cliente y los productos otra vez."
            ),
            error=f"{type(exc).__name__}: {exc}",
        )

    reply_text = ""
    for msg in reversed(result["messages"]):
        if isinstance(msg, AIMessage) and msg.content and not getattr(msg, "tool_calls", None):
            reply_text = msg.content
            break
    if not reply_text:
        reply_text = "¿En qué más te ayudo?"

    executed_entity = _extract_executed_entity(result["messages"])
    case_update = (
        {
            "status": "executed",
            "missingFields": [],
            "executedEntityType": executed_entity["type"],
            "executedEntityId": executed_entity["id"],
        }
        if executed_entity and request.open_case and request.open_case.type == "new_customer"
        else None
    )

    return WhatsAppAgentResponse(
        reply_text=reply_text,
        case_update=case_update,
        executed_entity=executed_entity,
    )

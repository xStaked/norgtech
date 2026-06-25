"""
Stateless WhatsApp customer agent (external clients).

Answers a client's questions about their OWN orders/cartera from a snapshot
passed in by NestJS (scoped server-side to the resolved customerId). It cannot
read the CRM; anything needing a human is handed off to the unicanal via the
single `derivar_a_unicanal` tool. Stateless: full history passed per turn.
"""
import json
from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from .agent import create_llm
from .models.whatsapp_models import NoraHandoff, WhatsAppAgentRequest, WhatsAppAgentResponse

CUSTOMER_AGENT_PROMPT = """Eres Nora, la asistente de Norgtech, atendiendo a un CLIENTE externo por WhatsApp.

Tono: amable, claro y breve. Texto plano (sin markdown ni tablas).

Qué puedes hacer:
- Responder sobre los pedidos y la cartera del cliente USANDO SOLO los datos del
  bloque [DATOS DEL CLIENTE]. Nunca inventes números, estados ni fechas.

Cuándo derivar a un asesor humano (usa la tool derivar_a_unicanal):
- El cliente quiere hacer, cambiar o cancelar un pedido.
- Tiene un reclamo, una queja o un problema.
- Pide información que NO está en [DATOS DEL CLIENTE].
- Pide hablar con un área (cartera, contabilidad, logística, comercial) o con una persona.
En esos casos llama a derivar_a_unicanal con un 'intent' corto (ej: "pedido",
"cartera", "logistica", "reclamo", "comercial") y un 'motivo' de una frase, y luego
dile al cliente en tono cálido que ya un asesor lo va a contactar.

Si puedes resolver con los datos disponibles, responde directo y no derives.
"""


@tool
def derivar_a_unicanal(motivo: str, intent: str) -> str:
    """Deriva la conversación a un asesor humano (buzón único) cuando el cliente
    necesita algo que no puedes resolver con los datos disponibles: hacer/cambiar
    un pedido, reclamos, info faltante, o hablar con un área/persona.

    Args:
        motivo: Frase corta con el motivo de la derivación.
        intent: Etiqueta corta del tema (pedido, cartera, logistica, reclamo, comercial).
    """
    return f"DERIVADO|{intent}|{motivo}"


CUSTOMER_TOOLS = [derivar_a_unicanal]


class _CustomerState(TypedDict):
    messages: Annotated[list, add_messages]


def _build_customer_graph():
    llm = create_llm().bind_tools(CUSTOMER_TOOLS)
    tool_node = ToolNode(CUSTOMER_TOOLS)

    def call_model(state: _CustomerState) -> dict:
        return {"messages": [llm.invoke(state["messages"])]}

    def should_continue(state: _CustomerState):
        last = state["messages"][-1]
        if getattr(last, "tool_calls", None):
            return "tools"
        return "__end__"

    workflow = StateGraph(_CustomerState)
    workflow.add_node("agent", call_model)
    workflow.add_node("tools", tool_node)
    workflow.set_entry_point("agent")
    workflow.add_conditional_edges("agent", should_continue, {"tools": "tools", "__end__": END})
    workflow.add_edge("tools", "agent")
    return workflow.compile()


_customer_graph = _build_customer_graph()


def _snapshot_block(request: WhatsAppAgentRequest) -> str:
    snap = request.customer_snapshot
    if not snap:
        return "[DATOS DEL CLIENTE] Sin datos disponibles."
    return (
        "[DATOS DEL CLIENTE]\n"
        f"- cliente: {snap.customerName or 'desconocido'}\n"
        f"- pedidos recientes: {json.dumps(snap.recentOrders, ensure_ascii=False)}\n"
        f"- cartera: {json.dumps(snap.cartera, ensure_ascii=False)}"
    )


def _to_messages(request: WhatsAppAgentRequest) -> list:
    messages: list = [
        SystemMessage(content=CUSTOMER_AGENT_PROMPT),
        SystemMessage(content=_snapshot_block(request)),
    ]
    for item in request.history:
        if item.role == "assistant":
            messages.append(AIMessage(content=item.body))
        else:
            messages.append(HumanMessage(content=item.body))
    if not request.history or request.history[-1].body != request.current_message:
        messages.append(HumanMessage(content=request.current_message))
    return messages


def _extract_handoff(messages: list) -> NoraHandoff:
    """Scan in reverse for a derivar_a_unicanal ToolMessage ('DERIVADO|intent|motivo')."""
    for msg in reversed(messages):
        if isinstance(msg, ToolMessage) and msg.name == "derivar_a_unicanal":
            parts = (msg.content or "").split("|", 2)
            if len(parts) == 3 and parts[0] == "DERIVADO":
                return NoraHandoff(needed=True, intent=parts[1] or None, reason=parts[2] or None)
            return NoraHandoff(needed=True)
    return NoraHandoff(needed=False)


async def run_whatsapp_customer_agent(request: WhatsAppAgentRequest) -> WhatsAppAgentResponse:
    """Run one stateless turn of the customer agent and return reply + handoff."""
    state: _CustomerState = {"messages": _to_messages(request)}
    result = await _customer_graph.ainvoke(state)

    reply_text = ""
    for msg in reversed(result["messages"]):
        if isinstance(msg, AIMessage) and msg.content and not getattr(msg, "tool_calls", None):
            reply_text = msg.content
            break
    if not reply_text:
        reply_text = "Gracias por escribir. Ya un asesor te va a contactar."

    return WhatsAppAgentResponse(
        reply_text=reply_text,
        case_update=None,
        executed_entity=None,
        handoff=_extract_handoff(result["messages"]),
    )

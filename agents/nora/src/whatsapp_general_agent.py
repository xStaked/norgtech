"""
Stateless WhatsApp general agent runner (comercial/admin).

Runs Nora's full toolset (ALL_TOOLS) over WhatsApp in agentic mode, mirroring
whatsapp_agent.py but with every CRM tool instead of only the expense tools.
NestJS passes the full conversation history on every turn (no checkpointer).
"""
from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from .agent import ALL_TOOLS, create_llm
from .models.whatsapp_models import WhatsAppAgentRequest, WhatsAppAgentResponse
from .prompts.system import NORA_SYSTEM_PROMPT

WHATSAPP_ADDENDUM = (
    "\n\n## Canal: WhatsApp\n"
    "Estás hablando con un comercial del equipo por WhatsApp. Responde en texto "
    "plano, breve y claro: sin tablas ni markdown pesado, frases cortas. Si una "
    "respuesta es larga, resúmela. Confirma de forma natural antes de crear o "
    "modificar algo (pedido, visita, cliente, seguimiento)."
)


class _GeneralState(TypedDict):
    messages: Annotated[list, add_messages]
    auth_token: str
    session_id: str | None


def _build_general_graph():
    llm = create_llm().bind_tools(ALL_TOOLS)
    tool_node = ToolNode(ALL_TOOLS)

    def call_model(state: _GeneralState) -> dict:
        return {"messages": [llm.invoke(state["messages"])]}

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


def _to_messages(request: WhatsAppAgentRequest) -> list:
    """System prompt (+WhatsApp addendum) + history + current message (no dup)."""
    messages: list = [SystemMessage(content=NORA_SYSTEM_PROMPT + WHATSAPP_ADDENDUM)]
    for item in request.history:
        if item.role == "assistant":
            messages.append(AIMessage(content=item.body))
        else:
            messages.append(HumanMessage(content=item.body))
    if not request.history or request.history[-1].body != request.current_message:
        messages.append(HumanMessage(content=request.current_message))
    return messages


async def run_whatsapp_general_agent(request: WhatsAppAgentRequest) -> WhatsAppAgentResponse:
    """Run one stateless turn of the general agent and return the reply."""
    state: _GeneralState = {
        "messages": _to_messages(request),
        "auth_token": request.auth,
        "session_id": request.conversation_id,
    }
    result = await _general_graph.ainvoke(state)

    reply_text = ""
    for msg in reversed(result["messages"]):
        if isinstance(msg, AIMessage) and msg.content and not getattr(msg, "tool_calls", None):
            reply_text = msg.content
            break
    if not reply_text:
        reply_text = "¿En qué más te ayudo?"

    return WhatsAppAgentResponse(reply_text=reply_text, case_update=None, executed_entity=None)

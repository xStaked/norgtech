"""
Stateless WhatsApp expense agent runner.

NestJS passes the full conversation state on every turn (no checkpointer).
The graph runs one cycle: agent → (tools →) agent → end.
"""
import json
from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from .agent import create_llm
from .models.whatsapp_models import WhatsAppAgentRequest, WhatsAppAgentResponse
from .prompts.expense_agent import EXPENSE_AGENT_PROMPT
from .tools.expenses import create_expense, lookup_customer, update_expense

EXPENSE_TOOLS = [lookup_customer, create_expense, update_expense]


class _AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    auth_token: str
    conversation_id: str | None


def _build_expense_graph():
    llm = create_llm().bind_tools(EXPENSE_TOOLS)
    tool_node = ToolNode(EXPENSE_TOOLS)

    # ainvoke y no invoke: el sync bloquea el event loop de FastAPI y los
    # turnos concurrentes se serializan hasta reventar por timeout.
    async def call_model(state: _AgentState) -> dict:
        response = await llm.ainvoke(state["messages"])
        return {"messages": [response]}

    def should_continue(state: _AgentState):
        last = state["messages"][-1]
        if getattr(last, "tool_calls", None):
            return "tools"
        return "__end__"

    workflow = StateGraph(_AgentState)
    workflow.add_node("agent", call_model)
    workflow.add_node("tools", tool_node)
    workflow.set_entry_point("agent")
    workflow.add_conditional_edges(
        "agent", should_continue, {"tools": "tools", "__end__": END}
    )
    workflow.add_edge("tools", "agent")
    # No checkpointer: full history is passed in on every call (stateless).
    return workflow.compile()


_expense_graph = _build_expense_graph()


def _case_context_block(request: WhatsAppAgentRequest) -> str:
    """Build the [CASO DE GASTO] system block injected before the conversation history."""
    case = request.open_case
    if not case:
        return "[CASO DE GASTO] No hay caso abierto."
    has_support = bool(case.attachments) or bool(request.attachments)
    data = case.extractedData or {}
    base = (
        "[CASO DE GASTO]\n"
        f"- estado: {case.status}\n"
        f"- datos leidos: {json.dumps(data, ensure_ascii=False)}\n"
        f"- campos faltantes: {json.dumps(case.missingFields, ensure_ascii=False)}\n"
        f"- soporte adjunto: {'si' if has_support else 'no'}"
    )
    if data.get("mode") == "correction":
        base += (
            "\n- MODO: correccion de un gasto YA registrado\n"
            f"- expense_id: {data.get('expenseId')}\n"
            f"- motivo de correccion: {data.get('reviewNote')}"
        )
    return base


def _to_messages(request: WhatsAppAgentRequest) -> list:
    """Convert request into the message list the graph receives."""
    messages: list = [
        SystemMessage(content=EXPENSE_AGENT_PROMPT),
        SystemMessage(content=_case_context_block(request)),
    ]
    for item in request.history:
        if item.role == "assistant":
            messages.append(AIMessage(content=item.body))
        else:
            messages.append(HumanMessage(content=item.body))
    # Ensure current_message is the last human turn (avoid duplication).
    if not request.history or request.history[-1].body != request.current_message:
        messages.append(HumanMessage(content=request.current_message))
    return messages


def _extract_executed_entity(messages: list) -> dict | None:
    """
    Scan messages in reverse for the most recent `create_expense` ToolMessage.
    Returns {"type": "CommercialExpense", "id": <id>} when the expense was newly
    created (alreadyExisted falsy); returns None otherwise.
    """
    for msg in reversed(messages):
        if isinstance(msg, ToolMessage) and msg.name == "create_expense":
            content = msg.content or ""
            try:
                start = content.index("{")
                data = json.loads(content[start:])
            except (ValueError, json.JSONDecodeError):
                continue
            if data.get("id") and not data.get("alreadyExisted"):
                return {"type": "CommercialExpense", "id": data["id"]}
    return None


async def run_whatsapp_agent(request: WhatsAppAgentRequest) -> WhatsAppAgentResponse:
    """Run one stateless turn of the expense agent and return the reply."""
    state: _AgentState = {
        "messages": _to_messages(request),
        "auth_token": request.auth,
        "conversation_id": request.conversation_id,
    }
    result = await _expense_graph.ainvoke(state)

    reply_text = ""
    for msg in reversed(result["messages"]):
        if isinstance(msg, AIMessage) and msg.content and not getattr(msg, "tool_calls", None):
            reply_text = msg.content
            break
    if not reply_text:
        reply_text = "¿Algo más con el gasto?"

    return WhatsAppAgentResponse(
        reply_text=reply_text,
        case_update=None,
        executed_entity=_extract_executed_entity(result["messages"]),
    )

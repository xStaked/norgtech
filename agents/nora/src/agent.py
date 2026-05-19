from typing import Annotated, TypedDict, Literal, Any
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from langgraph.checkpoint.memory import MemorySaver

from .config import settings
from .prompts.system import NORA_SYSTEM_PROMPT
from .tools.customers import search_customers, create_customer
from .tools.segments import get_customer_segments
from .tools.agenda import get_agenda
from .tools.visits import create_visit
from .tools.opportunities import get_customer_opportunities, create_opportunity, update_opportunity_stage
from .tools.follow_ups import create_follow_up
from .tools.orders import search_products, get_customer_quotes, create_order
from .tools.nestjs_client import NestJSClient

# ── Tools ──────────────────────────────────────────────
ALL_TOOLS = [
    search_customers,
    create_customer,
    get_customer_segments,
    get_agenda,
    create_visit,
    get_customer_opportunities,
    create_opportunity,
    update_opportunity_stage,
    create_follow_up,
    search_products,
    get_customer_quotes,
    create_order,
]

# ── State ──────────────────────────────────────────────
class NoraState(TypedDict):
    messages: Annotated[list, add_messages]
    auth_token: str
    session_id: str | None

# ── LLM ────────────────────────────────────────────────
def create_llm() -> ChatOpenAI:
    """Crea el LLM configurado según settings."""
    if settings.llm_provider == "openai":
        return ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key,
            temperature=settings.llm_temperature,
            streaming=True,
        )
    elif settings.llm_provider == "deepseek":
        return ChatOpenAI(
            model=settings.deepseek_model,
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
            temperature=settings.llm_temperature,
            streaming=True,
        )
    elif settings.llm_provider == "qwen":
        return ChatOpenAI(
            model=settings.qwen_model,
            api_key=settings.qwen_api_key,
            base_url=settings.qwen_base_url,
            temperature=settings.llm_temperature,
            streaming=True,
        )
    elif settings.llm_provider == "openai":
        return ChatOpenAI(
            model=settings.llm_model or "gpt-4o-mini",
            api_key=settings.openai_api_key,
            temperature=settings.llm_temperature,
            streaming=True,
        )
    else:
        raise ValueError(f"Unknown LLM provider: {settings.llm_provider}")

# ── Graph ───────────────────────────────────────────────
def build_nora_graph():
    """Construye el state graph de Nora."""
    llm = create_llm()
    llm_with_tools = llm.bind_tools(ALL_TOOLS)
    
    tool_node = ToolNode(ALL_TOOLS)
    
    def call_model(state: NoraState) -> dict:
        """Nodo principal: llama al LLM con el historial."""
        system_msg = SystemMessage(content=NORA_SYSTEM_PROMPT)
        messages = [system_msg] + state["messages"]
        response = llm_with_tools.invoke(messages)
        return {"messages": [response]}

    def should_continue(state: NoraState) -> Literal["tools", "__end__"]:
        """Decide si ejecutar tools o terminar."""
        last_message = state["messages"][-1]
        if hasattr(last_message, "tool_calls") and last_message.tool_calls:
            return "tools"
        return "__end__"

    # Construir grafo
    workflow = StateGraph(NoraState)
    
    workflow.add_node("agent", call_model)
    workflow.add_node("tools", tool_node)
    
    workflow.set_entry_point("agent")
    
    workflow.add_conditional_edges(
        "agent",
        should_continue,
        {"tools": "tools", "__end__": END},
    )
    workflow.add_edge("tools", "agent")
    
    # Checkpointer para memoria entre turnos
    memory = MemorySaver()
    return workflow.compile(checkpointer=memory)

# Singleton del grafo
nora_graph = build_nora_graph()

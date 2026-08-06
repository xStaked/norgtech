from typing import Annotated, TypedDict, Literal, Any
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from langgraph.checkpoint.memory import MemorySaver

from .config import settings
from .prompts.system import NORA_SYSTEM_PROMPT, current_date_note
from .roles import role_from_token, role_prompt, tools_for_role
from .tools.customers import (
    search_customers,
    list_my_customers,
    create_customer,
    update_customer,
    get_customer_summary,
)
from .tools.segments import get_customer_segments
from .tools.agenda import get_agenda
from .tools.visits import create_visit, delete_visit, get_customer_visits, update_visit
from .tools.expenses import create_expense, get_expenses, update_expense
from .tools.opportunities import get_customer_opportunities, create_opportunity, update_opportunity_stage
from .tools.follow_ups import create_follow_up
from .tools.orders import search_products, get_customer_quotes, preview_order, create_order, get_companies, get_customer_zones
from .tools.analytics import (
    get_sales_summary,
    get_cartera,
    get_goal_progress,
    get_analytics,
    compare_analytics,
)
from .tools.reports import list_reports, generate_report_from_visit
from .tools.tasks import list_follow_ups, complete_follow_up, list_visits, complete_visit
from .tools.credit import get_customer_credit, get_credit_alerts, get_price_for_customer
from .tools.goals import get_team_goals, get_seller_goal_progress
from .tools.quotes import (
    preview_quote,
    create_quote,
    list_quotes,
    get_quote,
    update_quote_status,
    request_billing_for_quote,
)
from .tools.invoices import list_invoices, get_invoice, list_overdue_invoices, get_invoice_payments
from .tools.returns import list_returns, get_return, create_return
from .tools.search import global_search
from .tools.nestjs_client import NestJSClient

# ── Tools ──────────────────────────────────────────────
ALL_TOOLS = [
    search_customers,
    list_my_customers,
    create_customer,
    update_customer,
    get_customer_summary,
    get_customer_segments,
    get_agenda,
    create_visit,
    get_customer_visits,
    update_visit,
    delete_visit,
    create_expense,
    get_expenses,
    update_expense,
    get_customer_opportunities,
    create_opportunity,
    update_opportunity_stage,
    create_follow_up,
    search_products,
    get_customer_quotes,
    preview_order,
    create_order,
    get_companies,
    get_customer_zones,
    get_sales_summary,
    get_cartera,
    get_goal_progress,
    get_analytics,
    compare_analytics,
    list_reports,
    generate_report_from_visit,
    list_follow_ups,
    complete_follow_up,
    list_visits,
    complete_visit,
    get_customer_credit,
    get_credit_alerts,
    get_price_for_customer,
    get_team_goals,
    get_seller_goal_progress,
    preview_quote,
    create_quote,
    list_quotes,
    get_quote,
    update_quote_status,
    request_billing_for_quote,
    list_invoices,
    get_invoice,
    list_overdue_invoices,
    get_invoice_payments,
    list_returns,
    get_return,
    create_return,
    global_search,
]

# ── State ──────────────────────────────────────────────
class NoraState(TypedDict):
    messages: Annotated[list, add_messages]
    auth_token: str
    session_id: str | None
    # Mismo motivo que en _GeneralState: create_expense/update_expense la piden
    # por InjectedState y sin la clave el turno muere con KeyError. En el chat
    # web no hay conversacion de WhatsApp, asi que va en None y la tool lo
    # traduce a "el gasto se registra con la foto del soporte".
    conversation_id: str | None

# ── LLM ────────────────────────────────────────────────
def create_llm() -> ChatOpenAI:
    """Crea el LLM configurado según settings."""
    if settings.llm_provider == "openai":
        return ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key,
            temperature=settings.llm_temperature,
            streaming=True,
            # Los 429 por TPM son transitorios ("try again in 558ms"): sin
            # reintentos suficientes el turno se cae y el usuario ve el fallback.
            max_retries=settings.llm_max_retries,
            # Sin esto el SDK espera 600s por llamada y con los reintentos el
            # peor caso es de horas: una llamada que no vuelve en 60s esta
            # colgada, mejor cortarla y reintentar.
            request_timeout=settings.llm_request_timeout,
            max_tokens=settings.llm_max_tokens,
        )
    elif settings.llm_provider == "deepseek":
        return ChatOpenAI(
            model=settings.deepseek_model,
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
            temperature=settings.llm_temperature,
            streaming=True,
            # Los 429 por TPM son transitorios ("try again in 558ms"): sin
            # reintentos suficientes el turno se cae y el usuario ve el fallback.
            max_retries=settings.llm_max_retries,
            # Sin esto el SDK espera 600s por llamada y con los reintentos el
            # peor caso es de horas: una llamada que no vuelve en 60s esta
            # colgada, mejor cortarla y reintentar.
            request_timeout=settings.llm_request_timeout,
            max_tokens=settings.llm_max_tokens,
        )
    elif settings.llm_provider == "qwen":
        return ChatOpenAI(
            model=settings.qwen_model,
            api_key=settings.qwen_api_key,
            base_url=settings.qwen_base_url,
            temperature=settings.llm_temperature,
            streaming=True,
            # Los 429 por TPM son transitorios ("try again in 558ms"): sin
            # reintentos suficientes el turno se cae y el usuario ve el fallback.
            max_retries=settings.llm_max_retries,
            # Sin esto el SDK espera 600s por llamada y con los reintentos el
            # peor caso es de horas: una llamada que no vuelve en 60s esta
            # colgada, mejor cortarla y reintentar.
            request_timeout=settings.llm_request_timeout,
            max_tokens=settings.llm_max_tokens,
        )
    elif settings.llm_provider == "openai":
        return ChatOpenAI(
            model=settings.llm_model or "gpt-4o-mini",
            api_key=settings.openai_api_key,
            temperature=settings.llm_temperature,
            streaming=True,
            # Los 429 por TPM son transitorios ("try again in 558ms"): sin
            # reintentos suficientes el turno se cae y el usuario ve el fallback.
            max_retries=settings.llm_max_retries,
            # Sin esto el SDK espera 600s por llamada y con los reintentos el
            # peor caso es de horas: una llamada que no vuelve en 60s esta
            # colgada, mejor cortarla y reintentar.
            request_timeout=settings.llm_request_timeout,
            max_tokens=settings.llm_max_tokens,
        )
    else:
        raise ValueError(f"Unknown LLM provider: {settings.llm_provider}")

# ── Graph ───────────────────────────────────────────────
def build_nora_graph():
    """Construye el state graph de Nora."""
    llm = create_llm()

    # ToolNode se queda con TODAS: solo ejecuta lo que el LLM llamo, y el LLM
    # solo puede llamar lo que se le bindeo para su rol.
    tool_node = ToolNode(ALL_TOOLS)

    def call_model(state: NoraState) -> dict:
        """Nodo principal: llama al LLM con el historial, acotado al rol."""
        role = role_from_token(state.get("auth_token"))
        system_msg = SystemMessage(
            content=NORA_SYSTEM_PROMPT + role_prompt(role) + current_date_note()
        )
        messages = [system_msg] + state["messages"]
        response = llm.bind_tools(tools_for_role(role, ALL_TOOLS)).invoke(messages)
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
    
    # ponytail: memoria en proceso. Aguanta porque el front no persiste el
    # sessionId (se pierde con un F5 igual) y hoy corre una sola replica. Techo:
    # con mas de una replica, el turno siguiente puede caer en otro proceso y
    # perder el hilo. Upgrade: AsyncPostgresSaver construido en el lifespan de
    # FastAPI (el grafo ya no podria ser un singleton de modulo).
    # Checkpointer para memoria entre turnos
    memory = MemorySaver()
    return workflow.compile(checkpointer=memory)

# Singleton del grafo
nora_graph = build_nora_graph()

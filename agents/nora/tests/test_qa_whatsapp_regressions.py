"""Regresiones del QA de Nora por WhatsApp (6 de agosto 2026).

Los tres fallos de la matriz: crear cotizacion entraba en bucle, registrar un
gasto respondia "se me cruzaron los cables", y "mis clientes" contestaba que no
tenia acceso.
"""
import asyncio
import base64
import json
from unittest.mock import AsyncMock, patch

from langchain_core.messages import AIMessage

from src import whatsapp_general_agent as general
from src.agent import ALL_TOOLS
from src.models.whatsapp_models import WhatsAppAgentRequest
from src.tools.customers import list_my_customers
from src.tools.orders import preview_order
from src.tools.quotes import preview_quote


def _token(role: str = "comercial", sub: str = "u1") -> str:
    """JWT falso (sin firma valida), igual que en test_roles.py."""

    def seg(obj: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")

    return f"Bearer {seg({'alg': 'HS256'})}.{seg({'sub': sub, 'role': role})}.firma"


# ── Gasto: el turno moria con KeyError('conversation_id') ──────────────


class _ToolCallingLLM:
    """Llama una tool en el primer turno y responde texto en el segundo."""

    def __init__(self, name: str, args: dict):
        self.name = name
        self.args = args
        self.turns = 0

    def bind_tools(self, tools):
        return self

    async def ainvoke(self, messages):
        self.turns += 1
        if self.turns == 1:
            return AIMessage(
                content="",
                tool_calls=[{"name": self.name, "args": self.args, "id": "call_1"}],
            )
        return AIMessage(content="Listo.")


def _run_general(llm, current_message="registra un gasto"):
    with patch("src.whatsapp_general_agent.create_llm", return_value=llm):
        graph = general._build_general_graph()
    request = WhatsAppAgentRequest(
        current_message=current_message,
        history=[],
        auth=_token(),
        conversation_id="conv_1",
    )
    with patch.object(general, "_general_graph", graph):
        return asyncio.run(general.run_whatsapp_general_agent(request))


def test_create_expense_from_general_agent_does_not_blow_up_the_turn():
    """El agente general no llevaba `conversation_id` en su estado: LangGraph
    lanzaba KeyError al inyectarlo y el comercial veia el fallback generico."""
    llm = _ToolCallingLLM(
        "create_expense",
        {
            "expense_date": "2026-08-06",
            "category": "alimentacion",
            "amount": 25000,
            "description": "Almuerzo",
        },
    )
    fake_client = AsyncMock()
    fake_client.post = AsyncMock(return_value={"id": "exp_1", "status": "pendiente"})

    with patch("src.tools.expenses.NestJSClient", return_value=fake_client):
        response = _run_general(llm)

    assert response.error is None
    assert "cruzaron los cables" not in response.reply_text
    _, payload = fake_client.post.await_args.args
    assert payload["conversationId"] == "conv_1"


def test_expense_without_support_asks_for_the_photo():
    """Un gasto sin foto es imposible en el CRM (el soporte es obligatorio):
    Nora tiene que pedir la foto, no volcar un error HTTP."""
    from src.tools.expenses import create_expense
    from src.tools.nestjs_client import NestJSAPIError

    fake_client = AsyncMock()
    fake_client.post = AsyncMock(
        side_effect=NestJSAPIError(status_code=404, detail="No open case for conversation")
    )

    with patch("src.tools.expenses.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            create_expense.ainvoke(
                {
                    "expense_date": "2026-08-06",
                    "category": "alimentacion",
                    "amount": 25000,
                    "description": "Almuerzo",
                    "conversation_id": "conv_1",
                    "auth_token": "Bearer scoped",
                }
            )
        )

    assert "foto" in result.lower()
    assert "404" not in result


def test_expense_without_a_whatsapp_conversation_does_not_call_the_api():
    """El chat web no tiene conversacion: el endpoint la exige y responder un
    400 de validacion no le sirve de nada al modelo."""
    from src.tools.expenses import create_expense

    fake_client = AsyncMock()
    with patch("src.tools.expenses.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            create_expense.ainvoke(
                {
                    "expense_date": "2026-08-06",
                    "category": "otros",
                    "amount": 1000,
                    "description": "x",
                    "conversation_id": None,
                    "auth_token": "Bearer scoped",
                }
            )
        )

    fake_client.post.assert_not_awaited()
    assert "foto" in result.lower()


def test_a_validation_error_still_reaches_the_model_with_its_detail():
    """Solo los errores de soporte se traducen: un 'amount must not be less
    than 1' el modelo si lo puede corregir."""
    from src.tools.expenses import create_expense
    from src.tools.nestjs_client import NestJSAPIError

    fake_client = AsyncMock()
    fake_client.base_url = "http://api:3001"
    fake_client.post = AsyncMock(
        side_effect=NestJSAPIError(status_code=400, detail="amount must not be less than 1")
    )

    with patch("src.tools.expenses.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            create_expense.ainvoke(
                {
                    "expense_date": "2026-08-06",
                    "category": "otros",
                    "amount": 0,
                    "description": "x",
                    "conversation_id": "conv_1",
                    "auth_token": "Bearer scoped",
                }
            )
        )

    assert "must not be less than 1" in result


# ── Cotizacion: el preview ordenaba volver a pedir confirmacion ────────


def _run_preview(tool, module):
    fake_client = AsyncMock()
    fake_client.post = AsyncMock(
        return_value={"lines": [], "subtotal": 100, "taxAmount": 19, "total": 119}
    )
    with patch(f"src.tools.{module}.NestJSClient", return_value=fake_client):
        return asyncio.run(
            tool.ainvoke(
                {
                    "customer_id": "cust_1",
                    "items": [{"product_id": "p1", "quantity": 2, "unit_price": 50}],
                    "auth_token": "Bearer scoped",
                }
            )
        )


def test_preview_quote_lets_an_already_confirmed_turn_create():
    """El historial de WhatsApp no conserva tool calls: al confirmar, el modelo
    repite el preview. Si el preview solo sabe decir "pide confirmacion", el
    turno nunca crea nada y se cicla."""
    result = _run_preview(preview_quote, "quotes")
    assert "ya confirm" in result.lower()
    assert "create_quote" in result


def test_preview_order_lets_an_already_confirmed_turn_create():
    result = _run_preview(preview_order, "orders")
    assert "ya confirm" in result.lower()
    assert "create_order" in result


# ── "Mis clientes": no existia ninguna tool que listara sin buscar ─────


def test_list_my_customers_scopes_to_the_user_in_the_token():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(
        return_value=[{"id": "c1", "displayName": "AGRIFEED", "taxId": "900", "city": "Bogota"}]
    )

    with patch("src.tools.customers.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            list_my_customers.ainvoke({"auth_token": _token(sub="user-42")})
        )

    path = fake_client.get.await_args.args[0]
    params = fake_client.get.await_args.kwargs["params"]
    assert path == "/customers"
    assert params["assignedToUserId"] == "user-42"
    assert "AGRIFEED" in result


def test_list_my_customers_is_registered_for_the_agent():
    assert "list_my_customers" in {t.name for t in ALL_TOOLS}


def test_direccion_lists_the_whole_book_without_a_seller_filter():
    """Un administrador no tiene cartera propia: filtrar por su id da vacio."""
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=[])

    with patch("src.tools.customers.NestJSClient", return_value=fake_client):
        asyncio.run(list_my_customers.ainvoke({"auth_token": _token(role="administrador")}))

    params = fake_client.get.await_args.kwargs["params"]
    assert "assignedToUserId" not in params

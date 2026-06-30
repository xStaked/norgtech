import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from src.tools.expenses import create_expense, get_expenses, update_expense
from src.tools.nestjs_client import NestJSAPIError, NestJSClient


def test_create_expense_posts_to_agent_endpoint():
    fake_client = AsyncMock()
    fake_client.post = AsyncMock(return_value={"id": "exp_1", "status": "pendiente", "alreadyExisted": False})

    with patch("src.tools.expenses.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            create_expense.ainvoke(
                {
                    "expense_date": "2026-04-24",
                    "category": "alimentacion",
                    "amount": 25000,
                    "description": "Almuerzo",
                    "conversation_id": "conv_1",
                    "auth_token": "Bearer scoped",
                }
            )
        )

    fake_client.post.assert_awaited_once()
    path, payload = fake_client.post.await_args.args
    assert path == "/whatsapp/agent/expenses"
    assert payload["amount"] == 25000
    assert payload["conversationId"] == "conv_1"
    assert payload["category"] == "alimentacion"
    assert "exp_1" in result


def test_create_expense_reports_already_existed():
    fake_client = AsyncMock()
    fake_client.post = AsyncMock(return_value={"id": "exp_9", "status": "pendiente", "alreadyExisted": True})

    with patch("src.tools.expenses.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            create_expense.ainvoke(
                {
                    "expense_date": "2026-04-24",
                    "category": "alimentacion",
                    "amount": 1000,
                    "description": "x",
                    "conversation_id": "conv_1",
                    "auth_token": "Bearer scoped",
                }
            )
        )

    assert "ya estaba registrado" in result.lower()


def test_create_expense_surfaces_api_error_detail():
    fake_client = AsyncMock()
    fake_client.base_url = "http://api:3001"
    fake_client.post = AsyncMock(side_effect=NestJSAPIError(400, "amount must not be less than 1"))

    with patch("src.tools.expenses.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            create_expense.ainvoke(
                {
                    "expense_date": "2026-04-24",
                    "category": "alimentacion",
                    "amount": 0,
                    "description": "x",
                    "conversation_id": "conv_1",
                    "auth_token": "Bearer scoped",
                }
            )
        )

    # The specific status + detail must reach the reply, not a vague paraphrase.
    assert result.startswith("Error")
    assert "400" in result
    assert "amount must not be less than 1" in result


def test_create_expense_surfaces_connection_target():
    fake_client = AsyncMock()
    fake_client.base_url = "http://localhost:3001"
    fake_client.post = AsyncMock(side_effect=ConnectionError("All connection attempts failed"))

    with patch("src.tools.expenses.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            create_expense.ainvoke(
                {
                    "expense_date": "2026-04-24",
                    "category": "alimentacion",
                    "amount": 25000,
                    "description": "x",
                    "conversation_id": "conv_1",
                    "auth_token": "Bearer scoped",
                }
            )
        )

    # The connection target must be visible so a wrong NESTJS_API_URL is obvious.
    assert "http://localhost:3001" in result
    assert "ConnectionError" in result


def test_nestjs_client_empty_body_404_yields_nonempty_detail():
    """A 404 with an empty body must never produce a blank detail string."""
    fake_response = MagicMock()
    fake_response.is_error = True
    fake_response.status_code = 404
    fake_response.text = ""
    fake_response.json.side_effect = Exception("no json")

    async def _run():
        client = NestJSClient.__new__(NestJSClient)
        client.base_url = "http://api:3001"
        client.headers = {}
        fake_http = AsyncMock()
        fake_http.__aenter__ = AsyncMock(return_value=fake_http)
        fake_http.__aexit__ = AsyncMock(return_value=False)
        fake_http.request = AsyncMock(return_value=fake_response)
        with patch("src.tools.nestjs_client.httpx.AsyncClient", return_value=fake_http):
            try:
                await client._request("POST", "/whatsapp/agent/expenses", json={})
            except NestJSAPIError as e:
                return e.detail
        return ""

    detail = asyncio.run(_run())
    assert detail and detail.strip(), f"detail must not be blank, got {detail!r}"
    assert "(empty body)" in detail
    assert "/whatsapp/agent/expenses" in detail
    assert "http://api:3001" in detail


def test_update_expense_patches_agent_endpoint():
    fake_client = AsyncMock()
    fake_client.patch = AsyncMock(return_value={"id": "exp_1", "status": "pendiente"})

    with patch("src.tools.expenses.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            update_expense.ainvoke(
                {
                    "expense_id": "exp_1",
                    "supplier_nit": "900123456",
                    "conversation_id": "conv_1",
                    "auth_token": "Bearer scoped",
                }
            )
        )

    fake_client.patch.assert_awaited_once()
    path, payload = fake_client.patch.await_args.args
    assert path == "/whatsapp/agent/expenses/exp_1"
    assert payload["supplierNit"] == "900123456"
    assert payload["conversationId"] == "conv_1"
    assert "pendiente" in result


def test_get_expenses_lists_user_expenses():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(
        return_value=[
            {
                "id": "exp_1",
                "expenseDate": "2026-04-24",
                "amount": "25000.00",
                "category": "alimentacion",
                "description": "Almuerzo",
                "status": "pendiente",
            }
        ]
    )

    with patch("src.tools.expenses.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_expenses.ainvoke(
                {
                    "status": "pendiente",
                    "auth_token": "Bearer scoped",
                }
            )
        )

    fake_client.get.assert_awaited_once()
    path = fake_client.get.await_args.args[0]
    params = fake_client.get.await_args.kwargs["params"]
    assert path == "/commercial-expenses"
    assert params["status"] == "pendiente"
    assert "exp_1" in result
    assert "alimentacion" in result


def test_get_expenses_handles_empty_list():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=[])

    with patch("src.tools.expenses.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_expenses.ainvoke({"auth_token": "Bearer scoped"})
        )

    assert "No tienes gastos" in result


def test_update_expense_standalone_edit_by_id():
    """update_expense must be callable directly with just an expense_id."""
    fake_client = AsyncMock()
    fake_client.patch = AsyncMock(return_value={"id": "exp_7", "status": "pendiente"})

    with patch("src.tools.expenses.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            update_expense.ainvoke(
                {
                    "expense_id": "exp_7",
                    "amount": 30000,
                    "description": "Cena corregida",
                    "conversation_id": "conv_1",
                    "auth_token": "Bearer scoped",
                }
            )
        )

    fake_client.patch.assert_awaited_once()
    path, payload = fake_client.patch.await_args.args
    assert path == "/whatsapp/agent/expenses/exp_7"
    assert payload["amount"] == 30000
    assert payload["description"] == "Cena corregida"
    assert "pendiente" in result


def test_update_expense_surfaces_api_error_detail():
    fake_client = AsyncMock()
    fake_client.base_url = "http://api:3001"
    fake_client.patch = AsyncMock(side_effect=NestJSAPIError(400, "amount must not be less than 1"))

    with patch("src.tools.expenses.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            update_expense.ainvoke(
                {
                    "expense_id": "exp_1",
                    "amount": 0,
                    "conversation_id": "conv_1",
                    "auth_token": "Bearer scoped",
                }
            )
        )

    assert result.startswith("Error")
    assert "400" in result
    assert "amount must not be less than 1" in result

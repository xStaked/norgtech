import asyncio
from unittest.mock import AsyncMock, patch

from src.tools.expenses import create_expense
from src.tools.nestjs_client import NestJSAPIError


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

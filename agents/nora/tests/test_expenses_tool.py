import asyncio
from unittest.mock import AsyncMock, patch

from src.tools.expenses import create_expense


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

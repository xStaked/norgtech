import asyncio
from unittest.mock import AsyncMock, patch

from src.tools.visits import delete_visit
from src.tools.nestjs_client import NestJSAPIError


def test_delete_visit_calls_delete_endpoint():
    fake_client = AsyncMock()
    fake_client.delete = AsyncMock(return_value={"id": "visit-1", "deleted": True})

    with patch("src.tools.visits.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            delete_visit.ainvoke({"visit_id": "visit-1", "auth_token": "Bearer scoped"})
        )

    fake_client.delete.assert_awaited_once_with("/visits/visit-1")
    assert "eliminada" in result.lower()


def test_delete_visit_reports_api_error():
    fake_client = AsyncMock()
    fake_client.delete = AsyncMock(
        side_effect=NestJSAPIError(409, "No se puede eliminar la visita porque tiene reportes o gastos asociados.")
    )

    with patch("src.tools.visits.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            delete_visit.ainvoke({"visit_id": "visit-1", "auth_token": "Bearer scoped"})
        )

    assert "reportes o gastos" in result.lower()

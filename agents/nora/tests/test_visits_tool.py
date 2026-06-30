import asyncio
from unittest.mock import AsyncMock, patch

from src.tools.visits import delete_visit, get_customer_visits, update_visit
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


def test_get_customer_visits_lists_with_ids():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(
        return_value=[
            {"id": "visit-9", "scheduledAt": "2026-06-29T12:00:00", "summary": "Seguimiento", "status": "programada"},
        ]
    )

    with patch("src.tools.visits.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_customer_visits.ainvoke({"customer_id": "cust-1", "auth_token": "Bearer scoped"})
        )

    fake_client.get.assert_awaited_once_with("/visits", params={"customerId": "cust-1"})
    assert "visit-9" in result


def test_get_customer_visits_handles_empty():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=[])
    with patch("src.tools.visits.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_customer_visits.ainvoke({"customer_id": "cust-1", "auth_token": "Bearer scoped"})
        )
    assert "no tiene visitas" in result.lower()


def test_update_visit_patches_with_payload():
    fake_client = AsyncMock()
    fake_client.patch = AsyncMock(return_value={"id": "visit-1", "summary": "Nuevo"})

    with patch("src.tools.visits.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            update_visit.ainvoke(
                {
                    "visit_id": "visit-1",
                    "auth_token": "Bearer scoped",
                    "scheduled_at": "2026-06-01T15:00:00.000Z",
                    "summary": "Nuevo",
                }
            )
        )

    fake_client.patch.assert_awaited_once_with(
        "/visits/visit-1",
        {"scheduledAt": "2026-06-01T15:00:00.000Z", "summary": "Nuevo"},
    )
    assert "actualizada" in result.lower()


def test_update_visit_only_sends_provided_fields():
    fake_client = AsyncMock()
    fake_client.patch = AsyncMock(return_value={"id": "visit-1"})

    with patch("src.tools.visits.NestJSClient", return_value=fake_client):
        asyncio.run(
            update_visit.ainvoke(
                {
                    "visit_id": "visit-1",
                    "auth_token": "Bearer scoped",
                    "next_step": "Llamar el lunes",
                }
            )
        )

    fake_client.patch.assert_awaited_once_with(
        "/visits/visit-1", {"nextStep": "Llamar el lunes"}
    )


def test_update_visit_reports_api_error():
    fake_client = AsyncMock()
    fake_client.patch = AsyncMock(
        side_effect=NestJSAPIError(404, "Visit not found")
    )

    with patch("src.tools.visits.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            update_visit.ainvoke(
                {"visit_id": "missing", "auth_token": "Bearer scoped", "summary": "X"}
            )
        )

    assert "error al actualizar" in result.lower()


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

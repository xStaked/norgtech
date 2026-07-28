import asyncio
from unittest.mock import AsyncMock, patch

import json
from urllib.parse import parse_qs, urlparse

from src.tools.visits import (
    create_visit,
    delete_visit,
    get_customer_visits,
    google_calendar_link,
    update_visit,
)
from src.tools.nestjs_client import NestJSAPIError


def test_google_calendar_link_convierte_hora_bogota_a_utc():
    # "el 28 de julio a las 8" es hora de Bogota (UTC-5) -> 13:00 UTC.
    link = google_calendar_link("2026-07-28T08:00:00", "Visita: Porcicultura Caribe")
    params = parse_qs(urlparse(link).query)

    assert params["dates"] == ["20260728T130000Z/20260728T140000Z"]  # +1h por defecto
    assert params["action"] == ["TEMPLATE"]
    assert params["text"] == ["Visita: Porcicultura Caribe"]
    # Los espacios y los ":" viajan codificados; solo el "/" de dates queda crudo.
    assert " " not in link and "%3A" in link
    assert "dates=20260728T130000Z/20260728T140000Z" in link


def test_google_calendar_link_respeta_offset_explicito_y_fecha_invalida():
    assert "20260728T130000Z" in google_calendar_link("2026-07-28T13:00:00Z", "X")
    assert "20260728T130000Z" in google_calendar_link("2026-07-28T08:00:00-05:00", "X")
    assert google_calendar_link("manana a las 8", "X") is None


def test_create_visit_devuelve_link_de_calendar_y_json_al_final():
    fake_client = AsyncMock()
    fake_client.post = AsyncMock(return_value={"id": "visit-1"})

    with patch("src.tools.visits.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            create_visit.ainvoke(
                {
                    "customer_id": "cust-1",
                    "scheduled_at": "2026-07-28T08:00:00",
                    "summary": "Seguimiento",
                    "auth_token": "Bearer scoped",
                }
            )
        )

    assert "calendar.google.com" in result
    assert "20260728T130000Z" in result
    # El JSON queda al final y parseable (whatsapp_general_agent saca el id de ahi).
    assert json.loads(result[result.index("{"):]) == {"id": "visit-1"}


def test_update_visit_solo_manda_link_al_reagendar():
    fake_client = AsyncMock()
    fake_client.patch = AsyncMock(
        return_value={"id": "visit-1", "scheduledAt": "2026-07-28T13:00:00.000Z", "summary": "Seguimiento"}
    )

    with patch("src.tools.visits.NestJSClient", return_value=fake_client):
        reagenda = asyncio.run(
            update_visit.ainvoke(
                {
                    "visit_id": "visit-1",
                    "scheduled_at": "2026-07-28T08:00:00",
                    "auth_token": "Bearer scoped",
                }
            )
        )
        # Cambiar solo las notas no es reagendar: ahi el link seria ruido.
        solo_notas = asyncio.run(
            update_visit.ainvoke(
                {"visit_id": "visit-1", "notes": "llego tarde", "auth_token": "Bearer scoped"}
            )
        )

    # La fecha sale de la respuesta del API (ya en UTC), no del texto del usuario.
    assert "20260728T130000Z" in reagenda
    assert "calendar.google.com" not in solo_notas
    # El JSON queda al final en ambos casos.
    assert json.loads(reagenda[reagenda.index("{"):])["id"] == "visit-1"


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

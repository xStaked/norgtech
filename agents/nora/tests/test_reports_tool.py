"""Reportes ejecutivos: listar y generar desde una visita completada."""

import asyncio
import json
from unittest.mock import AsyncMock, patch

from src.tools.nestjs_client import NestJSAPIError
from src.tools.reports import generate_report_from_visit, list_reports

REPORTS = [
    {
        "id": f"r-{i}",
        "title": f"Reporte {i}",
        "customer": {"id": "c-1", "displayName": "Acme"},
        "createdAt": "2026-07-20T10:00:00.000Z",
        "creator": {"id": "u-1", "name": "Ana"},
    }
    for i in range(3)
]


def test_list_reports_devuelve_enlaces_del_portal():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=REPORTS)
    with patch("src.tools.reports.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            list_reports.ainvoke({"auth_token": "Bearer x", "customer_id": "c-1"})
        )

    assert fake_client.get.await_args.args[0] == "/reports"
    assert fake_client.get.await_args.kwargs["params"] == {"customerId": "c-1"}
    payload = json.loads(result)
    assert payload["reportes"][0]["enlace"].endswith("/reports/r-0")
    assert payload["reportes"][0]["pdf"].endswith("/reports/r-0/pdf")
    assert payload["reportes"][0]["cliente"] == "Acme"


def test_list_reports_vacio_lo_dice_sin_json():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=[])
    with patch("src.tools.reports.NestJSClient", return_value=fake_client):
        result = asyncio.run(list_reports.ainvoke({"auth_token": "Bearer x"}))
    assert "No hay reportes" in result


def test_generar_reporte_devuelve_enlace():
    fake_client = AsyncMock()
    fake_client.post = AsyncMock(return_value={"id": "r-9", "title": "Reporte Acme"})
    with patch("src.tools.reports.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            generate_report_from_visit.ainvoke({"visit_id": "v-1", "auth_token": "Bearer x"})
        )

    assert fake_client.post.await_args.args[0] == "/reports/from-visit/v-1"
    payload = json.loads(result)
    assert payload["enlace"].endswith("/reports/r-9")


def test_visita_sin_completar_explica_el_motivo():
    fake_client = AsyncMock()
    fake_client.post = AsyncMock(
        side_effect=NestJSAPIError(400, "Report can only be generated from completed visits")
    )
    with patch("src.tools.reports.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            generate_report_from_visit.ainvoke({"visit_id": "v-1", "auth_token": "Bearer x"})
        )
    assert "completada" in result
    assert "resumen" in result

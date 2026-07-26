"""Pendientes: listar/completar tareas de seguimiento y visitas."""

import asyncio
import json
from unittest.mock import AsyncMock, patch

from src.tools.nestjs_client import NestJSAPIError
from src.tools.tasks import (
    MAX_ROWS,
    complete_follow_up,
    complete_visit,
    list_follow_ups,
    list_visits,
)

TASKS = [
    {
        "id": f"t-{i}",
        "title": f"Llamar {i}",
        "type": "llamada",
        "customer": {"id": "c-1", "displayName": "Acme"},
        "dueAt": "2026-07-20T10:00:00.000Z",
        "status": "pendiente",
        "isOverdue": True,
        "notes": "ruido que no debe llegar al LLM",
    }
    for i in range(MAX_ROWS + 5)
]

VISITS = [
    {
        "id": "v-1",
        "customer": {"id": "c-1", "displayName": "Acme"},
        "scheduledAt": "2026-07-26T14:00:00.000Z",
        "status": "programada",
        "isOverdue": False,
        "notes": "ruido",
    }
]


def test_list_follow_ups_manda_los_query_params_del_api():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=TASKS)
    with patch("src.tools.tasks.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            list_follow_ups.ainvoke(
                {
                    "auth_token": "Bearer x",
                    "status": "pendiente",
                    "overdue": True,
                    "due_today": True,
                    "this_week": False,
                    "assigned_to_me": True,
                }
            )
        )

    assert fake_client.get.await_args.args[0] == "/follow-up-tasks"
    assert fake_client.get.await_args.kwargs["params"] == {
        "status": "pendiente",
        "overdue": "true",
        "dueToday": "true",
        "assignedToMe": "true",
    }
    payload = json.loads(result)
    assert len(payload["tareas"]) == MAX_ROWS
    assert payload["total"] == len(TASKS)
    assert payload["tareas"][0] == {
        "id": "t-0",
        "titulo": "Llamar 0",
        "tipo": "llamada",
        "cliente": "Acme",
        "vence": "2026-07-20T10:00:00.000Z",
        "estado": "pendiente",
        "vencida": True,
    }


def test_list_follow_ups_vacio_lo_dice_sin_json():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=[])
    with patch("src.tools.tasks.NestJSClient", return_value=fake_client):
        result = asyncio.run(list_follow_ups.ainvoke({"auth_token": "Bearer x"}))
    assert "No hay tareas" in result


def test_completar_tarea_sin_body():
    fake_client = AsyncMock()
    fake_client.patch = AsyncMock(
        return_value={
            "id": "t-1",
            "title": "Llamar",
            "status": "completada",
            "completedAt": "2026-07-26T09:00:00.000Z",
        }
    )
    with patch("src.tools.tasks.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            complete_follow_up.ainvoke({"task_id": "t-1", "auth_token": "Bearer x"})
        )

    assert fake_client.patch.await_args.args[0] == "/follow-up-tasks/t-1/complete"
    assert fake_client.patch.await_args.args[1] == {}
    assert json.loads(result)["estado"] == "completada"


def test_completar_tarea_inexistente_da_404_en_español():
    fake_client = AsyncMock()
    fake_client.patch = AsyncMock(side_effect=NestJSAPIError(404, "Follow-up task not found"))
    with patch("src.tools.tasks.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            complete_follow_up.ainvoke({"task_id": "nope", "auth_token": "Bearer x"})
        )
    assert "No encontré esa tarea" in result


def test_list_visits_manda_los_query_params_del_api():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=VISITS)
    with patch("src.tools.tasks.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            list_visits.ainvoke(
                {
                    "auth_token": "Bearer x",
                    "status": "programada",
                    "today": True,
                    "this_week": True,
                    "customer_id": "c-1",
                }
            )
        )

    assert fake_client.get.await_args.args[0] == "/visits"
    assert fake_client.get.await_args.kwargs["params"] == {
        "status": "programada",
        "today": "true",
        "thisWeek": "true",
        "customerId": "c-1",
    }
    payload = json.loads(result)
    assert payload["visitas"][0] == {
        "id": "v-1",
        "cliente": "Acme",
        "fecha": "2026-07-26T14:00:00.000Z",
        "estado": "programada",
        "atrasada": False,
    }


def test_completar_visita_manda_el_body_del_dto():
    fake_client = AsyncMock()
    fake_client.patch = AsyncMock(
        return_value={
            "id": "v-1",
            "customer": {"displayName": "Acme"},
            "status": "completada",
            "completedAt": "2026-07-26T18:00:00.000Z",
        }
    )
    with patch("src.tools.tasks.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            complete_visit.ainvoke(
                {
                    "visit_id": "v-1",
                    "auth_token": "Bearer x",
                    "summary": "Todo ok",
                    "proposed_solution": "Cambiar filtro",
                    "next_step": "Cotizar",
                }
            )
        )

    assert fake_client.patch.await_args.args[0] == "/visits/v-1/complete"
    assert fake_client.patch.await_args.args[1] == {
        "summary": "Todo ok",
        "proposedSolution": "Cambiar filtro",
        "nextStep": "Cotizar",
    }
    assert json.loads(result)["cliente"] == "Acme"


def test_completar_visita_inexistente_da_404_en_español():
    fake_client = AsyncMock()
    fake_client.patch = AsyncMock(side_effect=NestJSAPIError(404, "Visit not found"))
    with patch("src.tools.tasks.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            complete_visit.ainvoke({"visit_id": "nope", "auth_token": "Bearer x"})
        )
    assert "No encontré esa visita" in result

"""Metas vistas desde dirección: equipo completo y vendedor concreto."""

import asyncio
import json
from unittest.mock import AsyncMock, patch

from src.tools.goals import get_seller_goal_progress, get_team_goals
from src.tools.nestjs_client import NestJSAPIError


def _item(i: int, pct: float) -> dict:
    return {
        "userId": f"u-{i}",
        "sellerName": f"Vendedor {i}",
        "targetAmount": 1000,
        "soldAmount": 10 * pct,
        "remainingAmount": 1000 - 10 * pct,
        "percentage": pct,
        "ordersCount": 3,
        "customersCount": 2,
    }


DASHBOARD = {
    "periodType": "mensual",
    "periodValue": "2026-07",
    "availablePeriods": ["2026-07", "2026-06"],
    "totals": {
        "targetAmount": 20000,
        "soldAmount": 9000,
        "remainingAmount": 11000,
        "percentage": 45,
        "sellers": 20,
    },
    # Desordenado a proposito: la tool no debe confiar en el orden del API.
    "items": [_item(i, float(i)) for i in range(20)],
}


def test_team_goals_ordena_y_recorta_a_15():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=DASHBOARD)
    with patch("src.tools.goals.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_team_goals.ainvoke(
                {
                    "auth_token": "Bearer x",
                    "period_type": "mensual",
                    "period_value": "2026-07",
                }
            )
        )

    assert fake_client.get.await_args.args[0] == "/dashboard/seller-goals"
    assert fake_client.get.await_args.kwargs["params"] == {
        "periodType": "mensual",
        "periodValue": "2026-07",
    }
    payload = json.loads(result)
    rows = payload["vendedores"]
    assert len(rows) == 15
    assert payload["truncado"] is True
    assert [r["porcentaje"] for r in rows] == sorted(
        [r["porcentaje"] for r in rows], reverse=True
    )
    assert rows[0]["vendedor"] == "Vendedor 19"
    # El id debe viajar: es como el LLM resuelve "¿cómo va Juan?".
    assert rows[0]["id"] == "u-19"
    assert set(rows[0]) == {"id", "vendedor", "meta", "vendido", "falta", "porcentaje"}
    assert payload["totales"]["falta"] == 11000


def test_team_goals_sin_metas_lo_dice_sin_json():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value={**DASHBOARD, "items": []})
    with patch("src.tools.goals.NestJSClient", return_value=fake_client):
        result = asyncio.run(get_team_goals.ainvoke({"auth_token": "Bearer x"}))
    assert "No hay metas cargadas" in result
    assert "2026-06" in result


def test_team_goals_403_explica_que_son_cifras_de_direccion():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(side_effect=NestJSAPIError(403, "Insufficient permissions"))
    with patch("src.tools.goals.NestJSClient", return_value=fake_client):
        result = asyncio.run(get_team_goals.ainvoke({"auth_token": "Bearer x"}))
    assert "dirección comercial" in result


def test_seller_progress_usa_la_ruta_del_vendedor():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(
        return_value={**_item(7, 62.5), "periodType": "mensual", "periodValue": "2026-07"}
    )
    with patch("src.tools.goals.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_seller_goal_progress.ainvoke(
                {"seller_user_id": "u-7", "auth_token": "Bearer x"}
            )
        )

    assert fake_client.get.await_args.args[0] == "/users/u-7/seller-goals/progress"
    assert fake_client.get.await_args.kwargs["params"] is None
    payload = json.loads(result)
    assert payload["vendedor"] == "Vendedor 7"
    assert payload["periodo"] == "mensual 2026-07"
    assert payload["porcentaje"] == 62.5


def test_seller_progress_404_dice_que_no_tiene_meta():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(side_effect=NestJSAPIError(404, "No seller goals found"))
    with patch("src.tools.goals.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_seller_goal_progress.ainvoke(
                {"seller_user_id": "u-7", "auth_token": "Bearer x"}
            )
        )
    assert result == "Ese vendedor no tiene meta asignada en el periodo."

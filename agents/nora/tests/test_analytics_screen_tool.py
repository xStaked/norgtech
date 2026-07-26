"""get_analytics: compactar la respuesta de /analytics/* sin conocer su forma.

Las 4 pantallas devuelven estructuras distintas y el API las cambia; por eso el
descubrimiento de secciones es generico. Si esto se rompe, Nora manda 30 filas
de breakdown al contexto o se inventa nombres de seccion.
"""

import asyncio
import json
from unittest.mock import AsyncMock, patch

from src.tools.analytics import get_analytics
from src.tools.nestjs_client import NestJSAPIError

SALES_PAYLOAD = {
    "range": {"from": "2026-04-01", "to": "2026-06-30", "granularity": "month"},
    "currency": "COP",
    "filters": {"companyId": None, "sellerUserId": None, "zoneId": None, "segmentId": None},
    "totals": {"netRevenue": 480000000, "orderCount": 120},
    "previous": {"label": "mismo periodo del año anterior", "netRevenue": 300000000},
    "series": [{"bucket": f"2026-0{i}", "netRevenue": i} for i in range(1, 4)],
    "breakdowns": {
        "bySeller": [{"sellerName": f"Vendedor {i}", "revenue": 100 - i} for i in range(25)],
        "byZone": [{"zoneName": "Norte", "revenue": 10}],
        "byCustomerTotal": 300,
    },
}


def _run(args):
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=SALES_PAYLOAD)
    with patch("src.tools.analytics.NestJSClient", return_value=fake_client):
        result = asyncio.run(get_analytics.ainvoke({"auth_token": "Bearer x", **args}))
    return result, fake_client


def test_sin_seccion_devuelve_totales_y_el_menu_de_secciones():
    result, client = _run({"screen": "sales"})
    payload = json.loads(result)

    assert client.get.await_args.args[0] == "/analytics/sales"
    assert payload["totales"]["netRevenue"] == 480000000
    assert payload["periodo_anterior"]["netRevenue"] == 300000000
    # descubre listas anidadas y de primer nivel, con su tamaño
    assert payload["secciones_disponibles"]["breakdowns.bySeller"] == 25
    assert payload["secciones_disponibles"]["series"] == 3
    # los contadores sueltos no son secciones
    assert "breakdowns.byCustomerTotal" not in payload["secciones_disponibles"]
    # sin seccion no viaja ni una fila de breakdown
    assert "filas" not in payload


def test_con_seccion_recorta_filas_pero_conserva_el_total():
    result, _ = _run({"screen": "sales", "section": "breakdowns.bySeller"})
    payload = json.loads(result)

    assert len(payload["filas"]) == 10
    assert payload["filas_totales"] == 25
    assert payload["truncado"] is True


def test_seccion_inexistente_sugiere_las_validas():
    result, _ = _run({"screen": "sales", "section": "breakdowns.byPlaneta"})
    assert "no existe" in result
    assert "breakdowns.bySeller" in result


def test_filtros_viajan_con_el_nombre_que_espera_el_api():
    _, client = _run(
        {
            "screen": "sales",
            "date_from": "2026-04-01",
            "date_to": "2026-06-30",
            "seller_user_id": "u-1",
            "granularity": "month",
        }
    )
    assert client.get.await_args.kwargs["params"] == {
        "from": "2026-04-01",
        "to": "2026-06-30",
        "sellerUserId": "u-1",
        "granularity": "month",
    }


def test_pantalla_invalida_no_llama_al_api():
    fake_client = AsyncMock()
    with patch("src.tools.analytics.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_analytics.ainvoke({"screen": "ventas", "auth_token": "Bearer x"})
        )
    assert "inválida" in result
    fake_client.get.assert_not_awaited()


def test_403_se_explica_en_vez_de_filtrarse_como_error_crudo():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(side_effect=NestJSAPIError(403, "Forbidden resource"))
    with patch("src.tools.analytics.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_analytics.ainvoke({"screen": "sales", "auth_token": "Bearer x"})
        )
    assert "dirección comercial" in result

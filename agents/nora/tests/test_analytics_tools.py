import asyncio
from unittest.mock import AsyncMock, patch

import json
from src.tools.analytics import get_sales_summary
from src.tools.nestjs_client import NestJSAPIError


SALES_PAYLOAD = {
    "window": {"days": 30, "from": "x", "to": "y"},
    "totals": {"orders": 12, "revenue": 5000000, "returns": 200000,
               "netRevenue": 4800000, "units": 340, "customers": 7, "products": 9},
    "byCustomer": [
        {"customerName": f"Cliente {i}", "netRevenue": 1000 - i, "orders": i}
        for i in range(8)
    ],
    "byProduct": [
        {"name": f"Prod {i}", "sku": f"SKU{i}", "quantity": i, "revenue": 100 - i}
        for i in range(8)
    ],
    "repurchase": {"repurchaseRate": 42.5, "repeatCount": 3, "noRepurchaseCount": 4},
    "dormantCustomers": [{"customerName": f"Dorm {i}", "daysSinceLastOrder": i} for i in range(8)],
    "lowRotationProducts": [{"name": f"Low {i}", "quantity": i} for i in range(8)],
}


def test_get_sales_summary_compacts_and_limits_top5():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=SALES_PAYLOAD)

    with patch("src.tools.analytics.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_sales_summary.ainvoke({"days": 30, "auth_token": "Bearer scoped"})
        )

    # llamó al endpoint correcto con days
    path = fake_client.get.await_args.args[0]
    assert path == "/dashboard/commercial-advanced"
    assert fake_client.get.await_args.kwargs["params"] == {"days": 30}

    # el JSON embebido trae totales y recorta a 5
    payload = json.loads(result[result.index("{"):])
    assert payload["totales"]["ventas"] == 5000000
    assert payload["totales"]["neto"] == 4800000
    assert payload["recompra"]["tasa_pct"] == 42.5
    assert len(payload["top_clientes"]) == 5
    assert len(payload["top_productos"]) == 5
    assert len(payload["clientes_dormidos"]) == 5
    assert len(payload["productos_baja_rotacion"]) == 5


def test_get_sales_summary_surfaces_api_error_detail():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(side_effect=NestJSAPIError(403, "Insufficient permissions"))

    with patch("src.tools.analytics.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_sales_summary.ainvoke({"auth_token": "Bearer scoped"})
        )

    assert result.startswith("Error")
    assert "Insufficient permissions" in result

import asyncio
from unittest.mock import AsyncMock, patch

import json
from src.tools.analytics import get_sales_summary, get_cartera
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


SUMMARY_PAYLOAD = {
    "totalInvoices": 10, "totalAmount": 9000000, "totalPaid": 4000000,
    "totalCreditNotes": 100000, "totalBalance": 5000000,
    "byStatus": {"emitida": 5000000},
    "byCustomer": [
        {"name": f"Cli {i}", "total": 1000 * i, "paid": 100 * i} for i in range(8)
    ],
    "aging": {"current": 1000000, "days1to30": 2000000, "days31to60": 1000000,
              "days61to90": 500000, "over90": 500000},
}

OVERDUE_PAYLOAD = [
    {"invoiceNumber": "F-1", "dueDate": "2026-06-01", "totalAmount": 300000,
     "totalPaid": 100000, "customer": {"id": "cus_1"}},
    {"invoiceNumber": "F-2", "dueDate": "2026-06-02", "totalAmount": 200000,
     "totalPaid": 0, "customer": {"id": "cus_OTHER"}},
]


def test_get_cartera_global_aging_and_top_deudores():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=SUMMARY_PAYLOAD)

    with patch("src.tools.analytics.NestJSClient", return_value=fake_client):
        result = asyncio.run(get_cartera.ainvoke({"auth_token": "Bearer scoped"}))

    assert fake_client.get.await_args.args[0] == "/invoices/summary"
    payload = json.loads(result[result.index("{"):])
    assert payload["saldo_total"] == 5000000
    assert payload["aging"]["mas_90"] == 500000
    # top deudores ordenados por saldo (total - paid) desc, máx 5
    assert len(payload["top_deudores"]) == 5
    assert payload["top_deudores"][0]["saldo"] >= payload["top_deudores"][1]["saldo"]
    assert "facturas_vencidas" not in payload


def test_get_cartera_with_customer_includes_overdue_filtered():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(side_effect=[SUMMARY_PAYLOAD, OVERDUE_PAYLOAD])

    with patch("src.tools.analytics.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_cartera.ainvoke({"customer_id": "cus_1", "auth_token": "Bearer scoped"})
        )

    # summary pedido con el filtro de cliente
    first_call = fake_client.get.await_args_list[0]
    assert first_call.args[0] == "/invoices/summary"
    assert first_call.kwargs["params"] == {"customerId": "cus_1"}
    # segunda llamada a overdue
    assert fake_client.get.await_args_list[1].args[0] == "/invoices/overdue"

    payload = json.loads(result[result.index("{"):])
    vencidas = payload["facturas_vencidas"]
    assert len(vencidas) == 1
    assert vencidas[0]["factura"] == "F-1"
    assert vencidas[0]["saldo"] == 200000


def test_get_cartera_caps_overdue_to_top_5_by_saldo():
    # create 7 overdue invoices for cus_1 with varying saldos
    overdue_with_7_invoices = [
        {"invoiceNumber": f"F-{i}", "dueDate": f"2026-05-{i+1:02d}", "totalAmount": 1000 * (i+1),
         "totalPaid": 100 * (i+1), "customer": {"id": "cus_1"}}
        for i in range(7)
    ]
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(side_effect=[SUMMARY_PAYLOAD, overdue_with_7_invoices])

    with patch("src.tools.analytics.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_cartera.ainvoke({"customer_id": "cus_1", "auth_token": "Bearer scoped"})
        )

    payload = json.loads(result[result.index("{"):])
    vencidas = payload["facturas_vencidas"]
    # must cap to top 5
    assert len(vencidas) == 5
    # must be sorted by saldo descending
    saldos = [v["saldo"] for v in vencidas]
    assert saldos == sorted(saldos, reverse=True)
    assert vencidas[0]["saldo"] >= vencidas[1]["saldo"]

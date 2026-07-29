import asyncio
from unittest.mock import AsyncMock, patch

import json
from src.tools.analytics import (
    get_sales_summary,
    get_cartera,
    get_goal_progress,
    compare_analytics,
)
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


def test_get_sales_summary_forwards_explicit_date_range():
    """`date_from`/`date_to` viajan como `from`/`to` (los nombres del API)."""
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=SALES_PAYLOAD)

    with patch("src.tools.analytics.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_sales_summary.ainvoke(
                {
                    "date_from": "2026-06-01",
                    "date_to": "2026-06-30",
                    "auth_token": "Bearer scoped",
                }
            )
        )

    assert fake_client.get.await_args.args[0] == "/dashboard/commercial-advanced"
    params = fake_client.get.await_args.kwargs["params"]
    assert params["from"] == "2026-06-01"
    assert params["to"] == "2026-06-30"
    # el rango se anuncia en el texto, no "últimos N días"
    assert "2026-06-01" in result and "2026-06-30" in result
    assert "últimos" not in result


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


def test_get_goal_progress_happy_path():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(side_effect=[
        {"id": "user_1", "email": "a@b.co", "role": "comercial"},
        {"periodType": "mensual", "periodValue": "2026-06", "targetAmount": 300000000,
         "soldAmount": 100000000, "remainingAmount": 200000000, "percentage": 33.33,
         "ordersCount": 5},
    ])

    with patch("src.tools.analytics.NestJSClient", return_value=fake_client):
        result = asyncio.run(get_goal_progress.ainvoke({"auth_token": "Bearer scoped"}))

    assert fake_client.get.await_args_list[0].args[0] == "/auth/me"
    assert fake_client.get.await_args_list[1].args[0] == "/users/user_1/seller-goals/progress"
    payload = json.loads(result[result.index("{"):])
    assert payload["meta"] == 300000000
    assert payload["vendido"] == 100000000
    assert payload["porcentaje"] == 33.33


def test_get_goal_progress_no_goal_returns_friendly_message():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(side_effect=[
        {"id": "user_1"},
        NestJSAPIError(404, "No seller goals found"),
    ])

    with patch("src.tools.analytics.NestJSClient", return_value=fake_client):
        result = asyncio.run(get_goal_progress.ainvoke({"auth_token": "Bearer scoped"}))

    assert "meta" in result.lower()
    assert "{" not in result  # mensaje plano, sin JSON


def test_analytics_tools_registered_in_web_agent():
    from src.agent import ALL_TOOLS

    names = {t.name for t in ALL_TOOLS}
    assert {
        "get_sales_summary",
        "get_cartera",
        "get_goal_progress",
        "compare_analytics",
    } <= names


def test_get_cartera_por_cliente_no_revienta_con_decimales_string():
    """El API manda los Decimal de /invoices/overdue como string; restarlos
    directo tiraba TypeError y el usuario solo veia 'Error inesperado'."""
    fake_client = AsyncMock()

    async def _get(path, params=None):
        if path == "/invoices/summary":
            return {"totalBalance": 500, "aging": {}, "byCustomer": []}
        return [
            {
                "invoiceNumber": "F-1",
                "dueDate": "2026-05-01",
                "totalAmount": "1000.00",
                "totalPaid": "250.00",
                "creditNoteTotal": "50.00",
                "customer": {"id": "c-1"},
            }
        ]

    fake_client.get = AsyncMock(side_effect=_get)
    with patch("src.tools.analytics.NestJSClient", return_value=fake_client):
        result = asyncio.run(get_cartera.ainvoke({"customer_id": "c-1", "auth_token": "Bearer x"}))

    payload = json.loads(result[result.index("{"):])
    # 1000 - 250 - 50: el saldo real descuenta pagos Y notas credito.
    assert payload["facturas_vencidas"][0]["saldo"] == 700


# ── compare_analytics ──────────────────────────────────────────────────
# La resta se hace aqui en Python a proposito: cuando el LLM tenia que llamar
# get_analytics dos veces y restar a mano, se inventaba las cifras.

COMPARE_A = {
    "range": {"from": "2026-05-01", "to": "2026-05-31"},
    "totals": {"netRevenue": "1000.00", "orderCount": 10, "customerCount": 0},
    "breakdowns": {
        "bySeller": [
            {"sellerName": "Ana", "revenue": 600},
            {"sellerName": "Beto", "revenue": 400},
        ]
    },
}

COMPARE_B = {
    "range": {"from": "2026-06-01", "to": "2026-06-30"},
    "totals": {"netRevenue": "1500.00", "orderCount": 12, "customerCount": 5},
    "breakdowns": {
        "bySeller": [
            {"sellerName": "Ana", "revenue": 500},
            {"sellerName": "Carlos", "revenue": 1000},
        ]
    },
}


def _run_compare(args=None):
    """Devuelve el payload y el cliente; cada rango recibe su propio payload."""
    fake_client = AsyncMock()

    async def _get(path, params=None):
        return COMPARE_A if (params or {}).get("from") == "2026-05-01" else COMPARE_B

    fake_client.get = AsyncMock(side_effect=_get)
    with patch("src.tools.analytics.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            compare_analytics.ainvoke(
                {
                    "screen": "sales",
                    "date_from_a": "2026-05-01",
                    "date_to_a": "2026-05-31",
                    "date_from_b": "2026-06-01",
                    "date_to_b": "2026-06-30",
                    "auth_token": "Bearer x",
                    **(args or {}),
                }
            )
        )
    return json.loads(result), fake_client


def test_compare_analytics_consulta_los_dos_rangos():
    _, client = _run_compare()

    assert client.get.await_count == 2
    llamadas = {
        (c.kwargs["params"]["from"], c.kwargs["params"]["to"])
        for c in client.get.await_args_list
    }
    assert llamadas == {("2026-05-01", "2026-05-31"), ("2026-06-01", "2026-06-30")}
    for c in client.get.await_args_list:
        assert c.args[0] == "/analytics/sales"


def test_compare_analytics_calcula_delta_y_porcentaje():
    payload, _ = _run_compare()

    # los Decimal llegan como string: hay que convertirlos antes de restar
    neto = payload["variacion"]["netRevenue"]
    assert neto == {"a": 1000.0, "b": 1500.0, "delta": 500.0, "delta_pct": 50.0}
    assert payload["variacion"]["orderCount"]["delta"] == 2
    assert payload["periodo_a"]["rango"]["from"] == "2026-05-01"
    assert payload["periodo_b"]["rango"]["to"] == "2026-06-30"


def test_compare_analytics_sin_base_no_emite_infinito():
    payload, _ = _run_compare()

    clientes = payload["variacion"]["customerCount"]
    assert clientes["a"] == 0 and clientes["delta"] == 5
    # dividir por 0 daria inf, que json.dumps escribe como `Infinity` (JSON
    # invalido) y el LLM narra como si fuera una cifra.
    assert clientes["delta_pct"] is None


def test_compare_analytics_cruza_las_filas_de_la_seccion():
    payload, _ = _run_compare({"section": "breakdowns.bySeller"})

    assert payload["metrica"] == "revenue"
    filas = {f["clave"]: f for f in payload["filas"]}
    # Carlos solo existe en el periodo B: cuenta con 0 del lado A
    assert filas["Carlos"]["a"] == 0
    assert filas["Carlos"]["b"] == 1000
    assert filas["Carlos"]["delta_pct"] is None
    # Beto dejo de vender: aparece igual, con 0 del lado B
    assert filas["Beto"] == {
        "clave": "Beto",
        "a": 400.0,
        "b": 0.0,
        "delta": -400.0,
        "delta_pct": -100.0,
    }
    # ordenadas por |delta| desc
    assert [f["clave"] for f in payload["filas"]] == ["Carlos", "Beto", "Ana"]
    assert payload["filas_totales"] == 3
    assert payload["truncado"] is False

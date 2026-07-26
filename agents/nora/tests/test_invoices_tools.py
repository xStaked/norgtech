"""Detalle de cartera: facturas concretas, vencidas y pagos (solo lectura)."""

import asyncio
import json
from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

from src.tools.invoices import (
    INVOICE_STATUSES,
    get_invoice,
    get_invoice_payments,
    list_invoices,
    list_overdue_invoices,
)
from src.tools.nestjs_client import NestJSAPIError

VENCE_AYER = (date.today() - timedelta(days=10)).isoformat() + "T00:00:00.000Z"


def _invoice(i: int, **over) -> dict:
    # Prisma serializa Decimal como string: los montos llegan asi del API.
    return {
        "id": f"inv-{i}",
        "invoiceNumber": f"NN-{i:03d}",
        "customer": {"id": "c-1", "displayName": "Acme"},
        "issueDate": "2026-06-01T00:00:00.000Z",
        "dueDate": VENCE_AYER,
        "totalAmount": "1000.00",
        "totalPaid": "250.00",
        "creditNoteTotal": "50.00",
        "status": "enviada",
        **over,
    }


def test_list_invoices_manda_los_filtros_con_el_nombre_del_dto():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=[_invoice(1)])
    with patch("src.tools.invoices.NestJSClient", return_value=fake_client):
        asyncio.run(
            list_invoices.ainvoke(
                {
                    "auth_token": "Bearer x",
                    "customer_id": "c-1",
                    "status": "enviada",
                    "company_id": "co-1",
                    "order_id": "o-1",
                    "date_from": "2026-06-01",
                    "date_to": "2026-06-30",
                    "only_overdue": True,
                }
            )
        )

    assert fake_client.get.await_args.args[0] == "/invoices"
    assert fake_client.get.await_args.kwargs["params"] == {
        "customerId": "c-1",
        "status": "enviada",
        "companyId": "co-1",
        "orderId": "o-1",
        "from": "2026-06-01",
        "to": "2026-06-30",
        "overdue": "true",
    }


def test_list_invoices_sin_filtros_no_manda_params():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=[_invoice(1)])
    with patch("src.tools.invoices.NestJSClient", return_value=fake_client):
        asyncio.run(list_invoices.ainvoke({"auth_token": "Bearer x"}))
    assert fake_client.get.await_args.kwargs["params"] is None


def test_list_invoices_estado_invalido_no_toca_el_api():
    fake_client = AsyncMock()
    with patch("src.tools.invoices.NestJSClient", return_value=fake_client):
        out = asyncio.run(
            list_invoices.ainvoke({"auth_token": "Bearer x", "status": "pendiente"})
        )
    assert "inválido" in out
    assert "parcialmente_pagada" in out
    fake_client.get.assert_not_awaited()


def test_estados_coinciden_con_el_enum_del_api():
    assert set(INVOICE_STATUSES) == {
        "emitida",
        "enviada",
        "parcialmente_pagada",
        "pagada",
        "vencida",
        "anulada",
    }


def test_list_invoices_saldo_descuenta_pagos_y_notas_credito():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=[_invoice(1)])
    with patch("src.tools.invoices.NestJSClient", return_value=fake_client):
        payload = json.loads(
            asyncio.run(list_invoices.ainvoke({"auth_token": "Bearer x"}))
        )

    fila = payload["facturas"][0]
    assert fila["total"] == 1000.0
    assert fila["pagado"] == 250.0
    assert fila["saldo"] == 700.0  # 1000 - 250 - 50 (nota credito)
    assert fila["dias_mora"] == 10
    assert payload["saldo_total"] == 700.0


def test_factura_pagada_no_reporta_mora():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(
        return_value=[_invoice(1, status="pagada", totalPaid="1000.00", creditNoteTotal="0")]
    )
    with patch("src.tools.invoices.NestJSClient", return_value=fake_client):
        payload = json.loads(
            asyncio.run(list_invoices.ainvoke({"auth_token": "Bearer x"}))
        )
    assert "dias_mora" not in payload["facturas"][0]
    assert payload["facturas"][0]["saldo"] == 0.0


def test_list_invoices_compacta_a_15_filas_con_el_total_aparte():
    facturas = [_invoice(i) for i in range(30)]
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=facturas)
    with patch("src.tools.invoices.NestJSClient", return_value=fake_client):
        payload = json.loads(
            asyncio.run(list_invoices.ainvoke({"auth_token": "Bearer x"}))
        )

    assert len(payload["facturas"]) == 15
    assert payload["total_facturas"] == 30
    assert payload["truncado"] is True
    assert payload["saldo_total"] == 21000.0  # 30 x 700


def test_list_invoices_vacio_lo_dice_sin_json():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=[])
    with patch("src.tools.invoices.NestJSClient", return_value=fake_client):
        out = asyncio.run(list_invoices.ainvoke({"auth_token": "Bearer x"}))
    assert "No hay facturas" in out


def test_get_invoice_trae_detalle_y_pagos():
    detalle = _invoice(7)
    detalle["order"] = {"orderNumber": "PED-9"}
    detalle["company"] = {"name": "Norgtech"}
    detalle["payments"] = [
        {"paymentDate": "2026-06-10", "amount": "250.00", "method": "transferencia", "reference": "TRX-1"}
    ]
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=detalle)
    with patch("src.tools.invoices.NestJSClient", return_value=fake_client):
        payload = json.loads(
            asyncio.run(get_invoice.ainvoke({"invoice_id": "inv-7", "auth_token": "Bearer x"}))
        )

    assert fake_client.get.await_args.args[0] == "/invoices/inv-7"
    assert payload["factura"] == "NN-007"
    assert payload["saldo"] == 700.0
    assert payload["notas_credito"] == 50.0
    assert payload["pedido"] == "PED-9"
    assert payload["pagos"][0]["monto"] == 250.0


def test_get_invoice_404_manda_a_list_invoices():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(side_effect=NestJSAPIError(404, "Invoice not found"))
    with patch("src.tools.invoices.NestJSClient", return_value=fake_client):
        out = asyncio.run(
            get_invoice.ainvoke({"invoice_id": "nope", "auth_token": "Bearer x"})
        )
    assert "No encontré esa factura" in out
    assert "list_invoices" in out


def test_overdue_filtra_por_cliente_en_la_propia_tool():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(
        return_value=[
            _invoice(1),
            _invoice(2, customer={"id": "c-2", "displayName": "Otro"}),
        ]
    )
    with patch("src.tools.invoices.NestJSClient", return_value=fake_client):
        payload = json.loads(
            asyncio.run(
                list_overdue_invoices.ainvoke(
                    {"auth_token": "Bearer x", "customer_id": "c-1"}
                )
            )
        )

    assert fake_client.get.await_args.args[0] == "/invoices/overdue"
    assert len(payload["vencidas"]) == 1
    assert payload["vencidas"][0]["cliente"] == "Acme"
    assert payload["saldo_total"] == 700.0


def test_overdue_sin_resultados_para_el_cliente():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(
        return_value=[_invoice(2, customer={"id": "c-2", "displayName": "Otro"})]
    )
    with patch("src.tools.invoices.NestJSClient", return_value=fake_client):
        out = asyncio.run(
            list_overdue_invoices.ainvoke({"auth_token": "Bearer x", "customer_id": "c-1"})
        )
    assert "no tiene facturas vencidas" in out


def test_get_invoice_payments_suma_y_cuenta_soportes():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(
        return_value=[
            {"paymentDate": "2026-06-10", "amount": "250.00", "method": "transferencia", "reference": "TRX-1", "supports": [{"id": "s-1"}]},
            {"paymentDate": "2026-06-20", "amount": "100.50", "method": "efectivo", "reference": None, "supports": []},
        ]
    )
    with patch("src.tools.invoices.NestJSClient", return_value=fake_client):
        payload = json.loads(
            asyncio.run(
                get_invoice_payments.ainvoke({"invoice_id": "inv-7", "auth_token": "Bearer x"})
            )
        )

    assert fake_client.get.await_args.args[0] == "/invoices/inv-7/payments"
    assert payload["total_pagado"] == 350.5
    assert payload["pagos"][0]["soportes"] == 1
    assert payload["total_pagos"] == 2


def test_get_invoice_payments_404():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(side_effect=NestJSAPIError(404, "Invoice not found"))
    with patch("src.tools.invoices.NestJSClient", return_value=fake_client):
        out = asyncio.run(
            get_invoice_payments.ainvoke({"invoice_id": "nope", "auth_token": "Bearer x"})
        )
    assert "No encontré esa factura" in out


def test_403_se_explica_en_espanol():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(side_effect=NestJSAPIError(403, "Forbidden"))
    with patch("src.tools.invoices.NestJSClient", return_value=fake_client):
        out = asyncio.run(list_invoices.ainvoke({"auth_token": "Bearer x"}))
    assert "no tiene permiso" in out

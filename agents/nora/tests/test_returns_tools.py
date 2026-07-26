"""Devoluciones: listar, ver detalle y registrar (mueve inventario y plata).

El API NO modela items ni enums de motivo: una devolucion es customerId +
amount + reason libre, opcionalmente atada a orderId / invoiceId. Estos tests
fijan el body exacto y los rechazos que Nora hace ANTES de tocar el API.
"""

import asyncio
import json
from unittest.mock import AsyncMock, patch

from src.tools.nestjs_client import NestJSAPIError
from src.tools.returns import create_return, get_return, list_returns

RETURN = {
    "id": "ret-1",
    "customerId": "c-1",
    "returnDate": "2026-07-20T00:00:00.000Z",
    "amount": "150000.00",
    "reason": "3 bultos averiados",
    "notes": "Recogidos por el transportador",
    "createdAt": "2026-07-20T10:00:00.000Z",
    "customer": {"id": "c-1", "displayName": "Acme"},
    "order": {"id": "o-1", "orderNumber": "PED-0001"},
    "invoice": {"id": "i-1", "invoiceNumber": "FV-0001", "status": "parcial"},
}


def test_list_returns_manda_los_filtros_reales_y_compacta():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=[RETURN] * 20)
    with patch("src.tools.returns.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            list_returns.ainvoke(
                {
                    "auth_token": "Bearer x",
                    "customer_id": "c-1",
                    "date_from": "2026-07-01",
                    "date_to": "2026-07-31",
                }
            )
        )

    assert fake_client.get.await_args.args[0] == "/returns"
    assert fake_client.get.await_args.kwargs["params"] == {
        "customerId": "c-1",
        "from": "2026-07-01",
        "to": "2026-07-31",
    }
    payload = json.loads(result)
    assert payload["total"] == 20
    assert len(payload["devoluciones"]) == 15  # recortada
    fila = payload["devoluciones"][0]
    assert fila["cliente"] == "Acme"
    assert fila["monto"] == "150000.00"  # monto crudo
    assert fila["factura"] == "FV-0001"


def test_list_returns_vacio_lo_dice_sin_json():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=[])
    with patch("src.tools.returns.NestJSClient", return_value=fake_client):
        result = asyncio.run(list_returns.ainvoke({"auth_token": "Bearer x"}))
    assert "No hay devoluciones" in result


def test_get_return_trae_detalle_y_origen():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=RETURN)
    with patch("src.tools.returns.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_return.ainvoke({"return_id": "ret-1", "auth_token": "Bearer x"})
        )

    assert fake_client.get.await_args.args[0] == "/returns/ret-1"
    payload = json.loads(result)
    assert payload["pedido"] == "PED-0001"
    assert payload["notas"] == "Recogidos por el transportador"
    assert payload["factura_estado"] == "parcial"


def test_get_return_404_en_espanol():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(side_effect=NestJSAPIError(404, "Return not found"))
    with patch("src.tools.returns.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_return.ainvoke({"return_id": "nope", "auth_token": "Bearer x"})
        )
    assert "No encontré esa devolución" in result


def test_create_return_manda_el_body_exacto():
    fake_client = AsyncMock()
    fake_client.post = AsyncMock(return_value=RETURN)
    with patch("src.tools.returns.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            create_return.ainvoke(
                {
                    "customer_id": "c-1",
                    "amount": 150000,
                    "reason": "3 bultos averiados",
                    "invoice_id": "i-1",
                    "notes": "Recogidos por el transportador",
                    "auth_token": "Bearer x",
                }
            )
        )

    assert fake_client.post.await_args.args[0] == "/returns"
    body = fake_client.post.await_args.args[1]
    # forbidNonWhitelisted: true en el controller -> ni una llave de mas.
    assert body == {
        "customerId": "c-1",
        "amount": 150000,
        "reason": "3 bultos averiados",
        "invoiceId": "i-1",
        "notes": "Recogidos por el transportador",
    }
    payload = json.loads(result)
    assert payload["registrada"] is True
    assert payload["id"] == "ret-1"


def test_create_return_omite_los_opcionales_vacios():
    fake_client = AsyncMock()
    fake_client.post = AsyncMock(return_value=RETURN)
    with patch("src.tools.returns.NestJSClient", return_value=fake_client):
        asyncio.run(
            create_return.ainvoke(
                {
                    "customer_id": "c-1",
                    "amount": 1,
                    "reason": "producto vencido",
                    "auth_token": "Bearer x",
                }
            )
        )
    assert set(fake_client.post.await_args.args[1]) == {"customerId", "amount", "reason"}


def test_create_return_rechaza_monto_invalido_sin_llamar_al_api():
    # @Min(0.01) en el DTO: frenarlo aca evita un 400.
    fake_client = AsyncMock()
    with patch("src.tools.returns.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            create_return.ainvoke(
                {
                    "customer_id": "c-1",
                    "amount": 0,
                    "reason": "3 bultos averiados",
                    "auth_token": "Bearer x",
                }
            )
        )
    assert "inválido" in result.lower()
    fake_client.post.assert_not_awaited()


def test_create_return_rechaza_motivo_vacio_sin_llamar_al_api():
    fake_client = AsyncMock()
    with patch("src.tools.returns.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            create_return.ainvoke(
                {
                    "customer_id": "c-1",
                    "amount": 5000,
                    "reason": "   ",
                    "auth_token": "Bearer x",
                }
            )
        )
    assert "motivo" in result.lower()
    fake_client.post.assert_not_awaited()


def test_create_return_monto_mayor_al_saldo_se_explica_en_espanol():
    fake_client = AsyncMock()
    fake_client.post = AsyncMock(
        side_effect=NestJSAPIError(
            400, "Return amount exceeds invoice outstanding balance"
        )
    )
    with patch("src.tools.returns.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            create_return.ainvoke(
                {
                    "customer_id": "c-1",
                    "amount": 999999,
                    "reason": "3 bultos averiados",
                    "invoice_id": "i-1",
                    "auth_token": "Bearer x",
                }
            )
        )
    assert "supera el saldo pendiente" in result
    assert "no reintentes" in result.lower()


def test_create_return_pedido_de_otro_cliente_se_explica():
    fake_client = AsyncMock()
    fake_client.post = AsyncMock(
        side_effect=NestJSAPIError(400, "Order does not belong to customer")
    )
    with patch("src.tools.returns.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            create_return.ainvoke(
                {
                    "customer_id": "c-1",
                    "amount": 5000,
                    "reason": "averiado",
                    "order_id": "o-9",
                    "auth_token": "Bearer x",
                }
            )
        )
    assert "no es de ese cliente" in result


def test_create_return_403_en_espanol():
    fake_client = AsyncMock()
    fake_client.post = AsyncMock(side_effect=NestJSAPIError(403, "Forbidden"))
    with patch("src.tools.returns.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            create_return.ainvoke(
                {
                    "customer_id": "c-1",
                    "amount": 5000,
                    "reason": "averiado",
                    "auth_token": "Bearer x",
                }
            )
        )
    assert "no tiene permiso" in result


def test_create_return_exige_confirmacion_en_la_docstring():
    doc = create_return.description
    assert "confirmación" in doc
    assert "resum" in doc.lower()

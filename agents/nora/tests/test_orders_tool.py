import asyncio
import json
from unittest.mock import AsyncMock, patch

from src.tools.orders import get_companies, get_customer_zones, create_order
from src.tools.nestjs_client import NestJSAPIError


def test_get_companies_lists_active_with_id_name_prefix():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=[
        {"id": "co_1", "name": "Nortech", "prefix": "NT", "isActive": True},
        {"id": "co_2", "name": "Nanonutricion", "prefix": "NN", "isActive": True},
        {"id": "co_3", "name": "Vieja", "prefix": "VJ", "isActive": False},
    ])

    with patch("src.tools.orders.NestJSClient", return_value=fake_client):
        result = asyncio.run(get_companies.ainvoke({"auth_token": "Bearer scoped"}))

    assert fake_client.get.await_args.args[0] == "/companies"
    payload = json.loads(result[result.index("["):])
    assert {c["nombre"] for c in payload} == {"Nortech", "Nanonutricion"}
    assert payload[0]["id"] == "co_1"
    assert payload[0]["prefix"] == "NT"


def test_get_companies_surfaces_api_error_detail():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(side_effect=NestJSAPIError(401, "Unauthorized"))

    with patch("src.tools.orders.NestJSClient", return_value=fake_client):
        result = asyncio.run(get_companies.ainvoke({"auth_token": "Bearer scoped"}))

    assert result.startswith("Error")
    assert "Unauthorized" in result


def test_get_customer_zones_maps_customer_zone_id_and_flattens_zone():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=[
        {"id": "cz_1", "address": "Calle 1", "zone": {"id": "z_1", "name": "Costa", "department": "Atlantico"}},
        {"id": "cz_2", "address": None, "zone": {"id": "z_2", "name": "Centro", "department": "Cundinamarca"}},
    ])

    with patch("src.tools.orders.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_customer_zones.ainvoke({"customer_id": "cus_1", "auth_token": "Bearer scoped"})
        )

    assert fake_client.get.await_args.args[0] == "/customers/cus_1/zones"
    payload = json.loads(result[result.index("["):])
    assert payload[0]["customerZoneId"] == "cz_1"
    assert payload[0]["zona"] == "Costa"
    assert payload[0]["departamento"] == "Atlantico"
    assert payload[0]["direccion"] == "Calle 1"


def test_get_customer_zones_handles_no_zones():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=[])

    with patch("src.tools.orders.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_customer_zones.ainvoke({"customer_id": "cus_1", "auth_token": "Bearer scoped"})
        )

    assert "no tiene zonas" in result.lower()
    assert "[" not in result


def _order_items():
    return [{"product_id": "p_1", "quantity": 2, "unit_price": 1000}]


def test_create_order_sends_company_and_en_revision():
    fake_client = AsyncMock()
    fake_client.post = AsyncMock(return_value={"id": "ord_1", "status": "recibido", "total": 2000})

    with patch("src.tools.orders.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            create_order.ainvoke({
                "customer_id": "cus_1",
                "items": _order_items(),
                "company_id": "co_1",
                "auth_token": "Bearer scoped",
            })
        )

    path, payload = fake_client.post.await_args.args
    assert path == "/orders"
    assert payload["companyId"] == "co_1"
    assert payload["approvalStatus"] == "en_revision"
    assert "customerZoneId" not in payload  # no se pasó zona
    assert payload["items"][0] == {"productId": "p_1", "quantity": 2.0, "unitPrice": 1000.0}
    assert "ord_1" in result


def test_create_order_includes_zone_when_provided():
    fake_client = AsyncMock()
    fake_client.post = AsyncMock(return_value={"id": "ord_2", "status": "recibido", "total": 2000})

    with patch("src.tools.orders.NestJSClient", return_value=fake_client):
        asyncio.run(
            create_order.ainvoke({
                "customer_id": "cus_1",
                "items": _order_items(),
                "company_id": "co_1",
                "customer_zone_id": "cz_1",
                "auth_token": "Bearer scoped",
            })
        )

    _, payload = fake_client.post.await_args.args
    assert payload["customerZoneId"] == "cz_1"


def test_create_order_requires_company_id():
    fake_client = AsyncMock()
    fake_client.post = AsyncMock()

    with patch("src.tools.orders.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            create_order.ainvoke({
                "customer_id": "cus_1",
                "items": _order_items(),
                "company_id": "",
                "auth_token": "Bearer scoped",
            })
        )

    assert result.startswith("Error")
    assert "empresa" in result.lower()
    fake_client.post.assert_not_awaited()


def test_order_tools_registered_in_web_agent():
    from src.agent import ALL_TOOLS

    names = {t.name for t in ALL_TOOLS}
    assert {"get_companies", "get_customer_zones"} <= names


def test_create_order_accepts_zero_unit_price():
    fake_client = AsyncMock()
    fake_client.post = AsyncMock(return_value={"id": "ord_z", "status": "recibido", "total": 0})

    with patch("src.tools.orders.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            create_order.ainvoke({
                "customer_id": "cus_1",
                "items": [{"product_id": "p_free", "quantity": 5, "unit_price": 0}],
                "company_id": "co_1",
                "auth_token": "Bearer scoped",
            })
        )

    path, payload = fake_client.post.await_args.args
    assert path == "/orders"
    assert payload["items"][0]["unitPrice"] == 0.0
    assert "ord_z" in result

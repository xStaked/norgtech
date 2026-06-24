import asyncio
import json
from unittest.mock import AsyncMock, patch

from src.tools.orders import get_companies, get_customer_zones
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

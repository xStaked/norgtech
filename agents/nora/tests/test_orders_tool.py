import asyncio
import json
from unittest.mock import AsyncMock, patch

from src.tools.orders import get_companies
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

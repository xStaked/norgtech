"""Cupo de credito, alertas y precio por cliente."""

import asyncio
import json
from unittest.mock import AsyncMock, patch

from src.tools.nestjs_client import NestJSAPIError
from src.tools.credit import (
    get_credit_alerts,
    get_customer_credit,
    get_price_for_customer,
)

SUMMARY = {
    "creditLimit": 10_000_000,
    "purchaseBudget": 5_000_000,
    "currentBalance": 12_000_000,
    "availableCredit": -2_000_000,
    "utilizationPercent": 120,
    "isNearLimit": True,
    "purchaseProgress": {
        "currentMonthSales": 1_500_000,
        "budget": 5_000_000,
        "percent": 30,
    },
}

ALERTS = [
    {
        "customerId": f"c-{i}",
        "displayName": f"Cliente {i}",
        "creditLimit": 1_000_000,
        "currentBalance": 900_000,
        "utilizationPercent": 90,
    }
    for i in range(14)
]


def test_credit_summary_marca_sobre_el_limite():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=SUMMARY)
    with patch("src.tools.credit.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_customer_credit.ainvoke({"customer_id": "c-1", "auth_token": "Bearer x"})
        )

    assert fake_client.get.await_args.args[0] == "/credit/customers/c-1/summary"
    payload = json.loads(result)
    assert payload["sobre_el_limite"] is True
    assert payload["disponible"] == -2_000_000
    assert payload["compras_del_mes"] == 1_500_000


def test_credit_summary_404_manda_a_search_customers():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(side_effect=NestJSAPIError(404, "Cliente no encontrado"))
    with patch("src.tools.credit.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_customer_credit.ainvoke({"customer_id": "nope", "auth_token": "Bearer x"})
        )
    assert "search_customers" in result


def test_alertas_se_recortan_a_10_dejando_el_total():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=ALERTS)
    with patch("src.tools.credit.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_credit_alerts.ainvoke({"auth_token": "Bearer x", "company_id": "e-1"})
        )

    assert fake_client.get.await_args.args[0] == "/credit/dashboard/alerts"
    assert fake_client.get.await_args.kwargs["params"] == {"companyId": "e-1"}
    payload = json.loads(result)
    assert len(payload["alertas"]) == 10
    assert payload["total"] == 14


def test_alertas_vacias_lo_dice_sin_json():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=[])
    with patch("src.tools.credit.NestJSClient", return_value=fake_client):
        result = asyncio.run(get_credit_alerts.ainvoke({"auth_token": "Bearer x"}))
    assert "Ningún cliente" in result


def test_precio_de_lista_compacta_los_campos():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(
        return_value={
            "productId": "p-1",
            "customerId": "c-1",
            "source": "price_list",
            "priceListId": "pl-1",
            "priceListName": "Lista A",
            "currency": "COP",
            "presentationId": "pr-1",
            "empaque": "Bolsa 25kg",
            "basePrice": "100000",
            "priceSinIva": "90000",
            "priceConIva": "107100",
            "taxPercent": "19",
            "discountPercent": "0",
            "finalPrice": "90000",
        }
    )
    with patch("src.tools.credit.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_price_for_customer.ainvoke(
                {"product_id": "p-1", "customer_id": "c-1", "auth_token": "Bearer x"}
            )
        )

    assert fake_client.get.await_args.args[0] == "/products/p-1/price-for-customer/c-1"
    payload = json.loads(result)
    assert payload["origen"] == "lista_de_precios"
    assert payload["precio"] == "90000"
    assert payload["empaque"] == "Bolsa 25kg"
    assert payload["lista"] == "Lista A"


def test_precio_ambiguo_devuelve_las_opciones():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(
        return_value={
            "source": "ambiguous",
            "priceListName": "Lista A",
            "currency": "COP",
            "options": [
                {
                    "presentationId": "pr-1",
                    "empaque": "Bolsa 25kg",
                    "form": "solido",
                    "priceSinIva": "90000",
                    "priceConIva": "107100",
                },
                {
                    "presentationId": "pr-2",
                    "empaque": "Bulto 50kg",
                    "form": "solido",
                    "priceSinIva": "170000",
                    "priceConIva": "202300",
                },
            ],
        }
    )
    with patch("src.tools.credit.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_price_for_customer.ainvoke(
                {"product_id": "p-1", "customer_id": "c-1", "auth_token": "Bearer x"}
            )
        )
    payload = json.loads(result)
    assert payload["origen"] == "ambiguo"
    assert [o["presentation_id"] for o in payload["opciones"]] == ["pr-1", "pr-2"]


def test_precio_404_manda_a_los_buscadores():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(side_effect=NestJSAPIError(404, "Product not found"))
    with patch("src.tools.credit.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_price_for_customer.ainvoke(
                {"product_id": "nope", "customer_id": "c-1", "auth_token": "Bearer x"}
            )
        )
    assert "search_products" in result

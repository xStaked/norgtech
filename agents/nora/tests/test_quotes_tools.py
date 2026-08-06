"""Cotizaciones: preview -> confirmacion -> create, estados y errores del API.

Lo que fijan estos tests: el body EXACTO que se manda a /quotes/preview y
/quotes (los DTO son whitelist + forbidNonWhitelisted, cualquier campo de mas
es un 400), que un estado fuera del enum QuoteStatus se frena sin gastar la
llamada, y que un 404 se explica en vez de propagarse crudo.
"""

import asyncio
import json
from unittest.mock import AsyncMock, patch

from src.tools.nestjs_client import NestJSAPIError
from src.tools.quotes import (
    QUOTE_STATUSES,
    create_quote,
    get_quote,
    list_quotes,
    preview_quote,
    request_billing_for_quote,
    update_quote_status,
)

# Copiado a mano del enum QuoteStatus real (apps/api/prisma/schema.prisma).
API_QUOTE_STATUS = {"abierta", "en_negociacion", "cerrada", "perdida"}

PREVIEW = {
    "segmentName": "Mayorista",
    "discountPercent": 5,
    "discountAmount": 5000,
    "meetsGoal": True,
    "lines": [
        {
            "productId": "p-1",
            "priceListName": "Lista 2026",
            "presentation": "Bolsa x 500 g",
            "quantity": 10,
            "originalUnitPrice": 10000,
            "unitPrice": 9500,
            "subtotal": 95000,
            "taxPercent": 19,
            "totalWithTax": 113050,
        }
    ],
    "subtotal": 95000,
    "taxAmount": 18050,
    "total": 113050,
}

QUOTE = {
    "id": "q-1",
    "customerId": "c-1",
    "customer": {"id": "c-1", "displayName": "Acme"},
    "status": "abierta",
    "subtotal": 95000,
    "total": 113050,
    "validUntil": "2026-08-31T00:00:00.000Z",
    "createdAt": "2026-07-26T10:00:00.000Z",
    "items": [
        {
            "productId": "p-1",
            "productSnapshotName": "Producto 1",
            "productSnapshotSku": "SKU-1",
            "presentationSnapshot": "Bolsa x 500 g",
            "quantity": 10,
            "unitPrice": 9500,
            "discountPercent": 5,
            "subtotal": 95000,
        }
    ],
}


def test_statuses_match_api_enum():
    assert set(QUOTE_STATUSES) == API_QUOTE_STATUS


def test_preview_manda_el_body_del_dto_y_no_crea_nada():
    fake_client = AsyncMock()
    fake_client.post = AsyncMock(return_value=PREVIEW)
    with patch("src.tools.quotes.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            preview_quote.ainvoke(
                {
                    "customer_id": "c-1",
                    "items": [
                        {
                            "product_id": "p-1",
                            "quantity": 10,
                            "unit_price": 9500,
                            "presentation_id": "pr-1",
                            "notes": "urgente",
                        }
                    ],
                    "auth_token": "Bearer x",
                }
            )
        )

    path, body = fake_client.post.await_args.args
    assert path == "/quotes/preview"
    assert body == {
        "customerId": "c-1",
        "items": [
            {
                "productId": "p-1",
                "quantity": 10.0,
                "unitPrice": 9500.0,
                "presentationId": "pr-1",
                "notes": "urgente",
            }
        ],
    }
    # El preview no crea: la respuesta lo dice y pide confirmacion (o crea de
    # una si el usuario ya confirmo — ver test_qa_whatsapp_regressions).
    assert "NO existe" in result
    assert "no ha confirmado" in result
    assert "113050" in result


def test_preview_rechaza_item_sin_precio_sin_llamar_al_api():
    fake_client = AsyncMock()
    with patch("src.tools.quotes.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            preview_quote.ainvoke(
                {
                    "customer_id": "c-1",
                    "items": [{"product_id": "p-1", "quantity": 2}],
                    "auth_token": "Bearer x",
                }
            )
        )
    assert "precio unitario" in result
    fake_client.post.assert_not_awaited()


def test_create_manda_el_body_del_dto_con_opcionales():
    fake_client = AsyncMock()
    fake_client.post = AsyncMock(return_value=QUOTE)
    with patch("src.tools.quotes.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            create_quote.ainvoke(
                {
                    "customer_id": "c-1",
                    "items": [{"product_id": "p-1", "quantity": 10, "unit_price": 9500}],
                    "opportunity_id": "o-1",
                    "notes": "cotizacion de prueba",
                    "valid_until": "2026-08-31",
                    "auth_token": "Bearer x",
                }
            )
        )

    path, body = fake_client.post.await_args.args
    assert path == "/quotes"
    assert body == {
        "customerId": "c-1",
        "items": [{"productId": "p-1", "quantity": 10.0, "unitPrice": 9500.0}],
        "opportunityId": "o-1",
        "notes": "cotizacion de prueba",
        "validUntil": "2026-08-31",
    }
    assert "q-1" in result
    assert "abierta" in result


def test_create_sin_items_no_llama_al_api():
    fake_client = AsyncMock()
    with patch("src.tools.quotes.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            create_quote.ainvoke({"customer_id": "c-1", "items": [], "auth_token": "Bearer x"})
        )
    assert "al menos un item" in result
    fake_client.post.assert_not_awaited()


def test_update_status_rechaza_estado_invalido_sin_llamar_al_api():
    fake_client = AsyncMock()
    with patch("src.tools.quotes.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            update_quote_status.ainvoke(
                {"quote_id": "q-1", "status": "aprobada", "auth_token": "Bearer x"}
            )
        )
    assert "inválido" in result.lower()
    assert "en_negociacion" in result
    fake_client.patch.assert_not_awaited()


def test_update_status_valido_hace_patch():
    fake_client = AsyncMock()
    fake_client.patch = AsyncMock(return_value={**QUOTE, "status": "cerrada"})
    with patch("src.tools.quotes.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            update_quote_status.ainvoke(
                {"quote_id": "q-1", "status": "cerrada", "auth_token": "Bearer x"}
            )
        )
    path, body = fake_client.patch.await_args.args
    assert path == "/quotes/q-1/status"
    assert body == {"status": "cerrada"}
    assert "cerrada" in result


def test_list_quotes_filtra_por_cliente_y_estado_del_lado_de_nora():
    otra = {**QUOTE, "id": "q-2", "customerId": "c-2", "status": "perdida"}
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=[QUOTE, otra])
    with patch("src.tools.quotes.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            list_quotes.ainvoke(
                {"auth_token": "Bearer x", "customer_id": "c-1", "status": "abierta"}
            )
        )
    # GET /quotes no acepta query params.
    assert fake_client.get.await_args.args[0] == "/quotes"
    payload = json.loads(result)
    assert payload["total"] == 1
    assert payload["cotizaciones"][0]["id"] == "q-1"
    assert payload["cotizaciones"][0]["cliente"] == "Acme"


def test_list_quotes_estado_invalido_no_llama_al_api():
    fake_client = AsyncMock()
    with patch("src.tools.quotes.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            list_quotes.ainvoke({"auth_token": "Bearer x", "status": "enviada"})
        )
    assert "inválido" in result.lower()
    fake_client.get.assert_not_awaited()


def test_get_quote_404_explica_y_sugiere_list_quotes():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(side_effect=NestJSAPIError(404, "Quote not found"))
    with patch("src.tools.quotes.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_quote.ainvoke({"quote_id": "q-x", "auth_token": "Bearer x"})
        )
    assert "No encontré esa cotización" in result
    assert "list_quotes" in result


def test_get_quote_respuesta_vacia_se_trata_como_no_encontrada():
    # findOne devuelve null (200 con body vacio) cuando el id no existe.
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=None)
    with patch("src.tools.quotes.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_quote.ainvoke({"quote_id": "q-x", "auth_token": "Bearer x"})
        )
    assert "No encontré esa cotización" in result


def test_billing_request_400_explica_que_debe_estar_cerrada():
    fake_client = AsyncMock()
    fake_client.post = AsyncMock(
        side_effect=NestJSAPIError(400, "Billing request can only be created from closed quotes")
    )
    with patch("src.tools.quotes.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            request_billing_for_quote.ainvoke({"quote_id": "q-1", "auth_token": "Bearer x"})
        )
    assert "cerrada" in result
    assert "Billing request can only be created" in result


def test_billing_request_ok_devuelve_la_solicitud():
    fake_client = AsyncMock()
    fake_client.post = AsyncMock(
        return_value={
            "id": "br-1",
            "status": "pendiente",
            "customer": {"displayName": "Acme"},
        }
    )
    with patch("src.tools.quotes.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            request_billing_for_quote.ainvoke({"quote_id": "q-1", "auth_token": "Bearer x"})
        )
    path, body = fake_client.post.await_args.args
    assert path == "/quotes/q-1/billing-request"
    assert body == {}
    assert "br-1" in result
    assert "pendiente" in result

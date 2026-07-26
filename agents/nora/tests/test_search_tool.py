"""Buscador global: agrupa clientes, pedidos y productos en una sola llamada."""

import asyncio
import json
from unittest.mock import AsyncMock, patch

from src.tools.search import global_search

HITS = [
    {"type": "customer", "id": "c-1", "title": "Acme S.A.", "subtitle": "900123 · Bogotá"},
    {"type": "order", "id": "o-1", "title": "PED-0007", "subtitle": "Acme S.A. · pendiente"},
    {"type": "product", "id": "p-1", "title": "Norgrasa 100", "subtitle": "NG-100 · Caneca"},
]


def test_agrupa_por_tipo_y_manda_el_query():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=HITS)
    with patch("src.tools.search.NestJSClient", return_value=fake_client):
        result = asyncio.run(global_search.ainvoke({"query": " Acme ", "auth_token": "Bearer x"}))

    assert fake_client.get.await_args.args[0] == "/search"
    assert fake_client.get.await_args.kwargs["params"] == {"q": "Acme"}
    payload = json.loads(result)
    assert payload["clientes"]["total"] == 1
    assert payload["clientes"]["resultados"][0]["titulo"] == "Acme S.A."
    assert payload["pedidos"]["resultados"][0]["id"] == "o-1"
    assert payload["productos"]["resultados"][0]["detalle"] == "NG-100 · Caneca"


def test_sin_resultados_lo_dice_sin_json():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=[])
    with patch("src.tools.search.NestJSClient", return_value=fake_client):
        result = asyncio.run(global_search.ainvoke({"query": "zzzz", "auth_token": "Bearer x"}))
    assert "No encontré" in result


def test_query_corta_no_llama_al_api():
    fake_client = AsyncMock()
    with patch("src.tools.search.NestJSClient", return_value=fake_client) as ctor:
        result = asyncio.run(global_search.ainvoke({"query": "a", "auth_token": "Bearer x"}))
    ctor.assert_not_called()
    assert "2 caracteres" in result

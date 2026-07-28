"""El AsyncClient de httpx se comparte para reusar el pool de conexiones, pero
el Authorization del usuario NO puede compartirse: va por request."""
import asyncio

import httpx

from src.tools import nestjs_client as mod
from src.tools.nestjs_client import NestJSClient


def test_shared_client_is_reused_within_the_same_loop():
    async def _run():
        return mod._shared_client(), mod._shared_client()

    a, b = asyncio.run(_run())
    assert a is b


def test_shared_client_carries_no_auth_header():
    """Si el token viviera en el cliente compartido, se filtraria al request de
    otro usuario."""
    client = asyncio.run(_first_client_after_requests())
    assert "authorization" not in {k.lower() for k in client.headers}


async def _first_client_after_requests():
    seen = []

    async def _fake_request(self, method, url, **kwargs):
        seen.append(kwargs.get("headers"))
        return httpx.Response(200, json={"ok": True}, request=httpx.Request(method, url))

    original = httpx.AsyncClient.request
    httpx.AsyncClient.request = _fake_request
    try:
        await NestJSClient("Bearer token-de-ana").get("/customers")
        await NestJSClient("Bearer token-de-beto").get("/customers")
    finally:
        httpx.AsyncClient.request = original

    # Cada request lleva su propio token, aunque el transporte sea el mismo.
    assert seen[0]["Authorization"] == "Bearer token-de-ana"
    assert seen[1]["Authorization"] == "Bearer token-de-beto"
    return mod._shared_client()

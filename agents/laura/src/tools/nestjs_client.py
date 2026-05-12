import httpx
from ..config import settings
from typing import Optional

class NestJSClient:
    """Cliente HTTP para la API NestJS. Forwardea el JWT del usuario."""

    def __init__(self, auth_token: str):
        self.base_url = settings.nestjs_api_url.rstrip("/")
        self.headers = {
            "Authorization": auth_token,  # "Bearer <jwt>" que viene del frontend
            "Content-Type": "application/json",
        }

    async def get(self, path: str, params: Optional[dict] = None) -> dict:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(f"{self.base_url}{path}", headers=self.headers, params=params)
            r.raise_for_status()
            return r.json()

    async def post(self, path: str, json: dict) -> dict:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(f"{self.base_url}{path}", headers=self.headers, json=json)
            r.raise_for_status()
            return r.json()

    async def patch(self, path: str, json: dict) -> dict:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.patch(f"{self.base_url}{path}", headers=self.headers, json=json)
            r.raise_for_status()
            return r.json()

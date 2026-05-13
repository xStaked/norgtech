import httpx
from ..config import settings
from typing import Optional


class NestJSAPIError(Exception):
    """Error de la API NestJS con detalles de validación."""

    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"[{status_code}] {detail}")


class NestJSClient:
    """Cliente HTTP para la API NestJS. Forwardea el JWT del usuario."""

    def __init__(self, auth_token: str):
        self.base_url = settings.nestjs_api_url.rstrip("/")
        self.headers = {
            "Authorization": auth_token,  # "Bearer <jwt>" que viene del frontend
            "Content-Type": "application/json",
        }

    async def _request(self, method: str, path: str, **kwargs) -> dict:
        """Realiza una petición HTTP con manejo de errores detallado."""
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.request(
                method, f"{self.base_url}{path}", headers=self.headers, **kwargs
            )
            if r.is_error:
                # Intentar extraer el mensaje de validación de NestJS
                try:
                    body = r.json()
                except Exception:
                    body = r.text
                # NestJS validation pipe devuelve { message: [...], error: "Bad Request", statusCode: 400 }
                if isinstance(body, dict):
                    if "message" in body:
                        if isinstance(body["message"], list):
                            detail = "; ".join(str(m) for m in body["message"])
                        else:
                            detail = str(body["message"])
                    else:
                        detail = str(body)
                else:
                    detail = str(body)
                raise NestJSAPIError(r.status_code, detail)
            return r.json()

    async def get(self, path: str, params: Optional[dict] = None) -> dict:
        return await self._request("GET", path, params=params)

    async def post(self, path: str, json: dict) -> dict:
        return await self._request("POST", path, json=json)

    async def patch(self, path: str, json: dict) -> dict:
        return await self._request("PATCH", path, json=json)

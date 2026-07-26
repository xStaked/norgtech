import json
from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from .nestjs_client import NestJSClient, NestJSAPIError
from typing import Annotated


@tool
async def get_customer_segments(
    auth_token: Annotated[str, InjectedState("auth_token")],
) -> str:
    """
    Obtiene la lista de segmentos de cliente disponibles en el CRM.
    Útil para saber qué segmentos existen antes de crear un cliente.

    Returns:
        Lista de segmentos en formato JSON con id y name.
    """
    try:
        nestjs_client = NestJSClient(auth_token)
        result = await nestjs_client.get("/customer-segments")
        segments = result if isinstance(result, list) else result.get("data", [])

        simplified = [
            {"id": s["id"], "nombre": s["name"]}
            for s in segments
        ]
        return f"Segmentos disponibles: {json.dumps(simplified, ensure_ascii=False)}"
    except NestJSAPIError as e:
        return f"Error al obtener segmentos: {e.detail}"
    except Exception as e:
        return f"Error inesperado al obtener segmentos: {str(e)}"

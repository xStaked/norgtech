"""Buscador global (modulo /search del API), el mismo del ⌘K del portal.

Mismo @Roles que SearchController: administrador, director_comercial,
comercial, tecnico, facturacion, logistica (el servicio ya filtra que tipos
ve cada rol: productos solo para administrador/director_comercial/comercial).
"""

import json
from typing import Annotated

from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState

from .nestjs_client import NestJSClient, NestJSAPIError

MAX_POR_TIPO = 5

GRUPOS = {"customer": "clientes", "order": "pedidos", "product": "productos"}


@tool
async def global_search(
    query: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
) -> str:
    """
    Busca clientes, pedidos y productos a la vez, en UNA sola llamada.

    Úsala cuando el usuario menciona algo ambiguo y no sabes de qué entidad
    habla: "¿qué sabes de Acme?", "búscame lo de Martínez", "qué hay de NG-100".
    Evita tener que adivinar e ir probando search_customers y search_products
    por separado: esta te dice de qué está hablando.

    Es para DESAMBIGUAR, no para reemplazar a las otras. Si ya sabes que buscas
    solo clientes usa search_customers, y si buscas solo productos usa
    search_products: traen bastante más detalle que esta. El flujo normal es
    global_search primero y luego la tool específica del tipo que resultó.

    Args:
        query: Texto a buscar (nombre, NIT, número de pedido, SKU). Mínimo 2
            caracteres.
    """
    q = (query or "").strip()
    if len(q) < 2:
        return "Necesito al menos 2 caracteres para buscar. ¿Qué nombre, NIT, número de pedido o SKU busco?"

    try:
        client = NestJSClient(auth_token)
        hits = await client.get("/search", params={"q": q})
        if not isinstance(hits, list):
            hits = hits.get("data", [])

        payload = {}
        for tipo, nombre in GRUPOS.items():
            del_tipo = [h for h in hits if h.get("type") == tipo]
            if del_tipo:
                payload[nombre] = {
                    "total": len(del_tipo),
                    "resultados": [
                        {"id": h.get("id"), "titulo": h.get("title"), "detalle": h.get("subtitle")}
                        for h in del_tipo[:MAX_POR_TIPO]
                    ],
                }

        if not payload:
            return f"No encontré ningún cliente, pedido ni producto que coincida con «{q}»."
        return json.dumps(payload, ensure_ascii=False)
    except NestJSAPIError as e:
        if e.status_code == 403:
            return "Este usuario no tiene permiso para usar el buscador global."
        return f"Error al buscar: {e.detail}"
    except Exception as e:
        return f"Error inesperado al buscar: {str(e)}"

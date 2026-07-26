"""Reportes ejecutivos (modulo /reports del API).

El portal ya los genera desde una visita completada; Nora no tenia forma de
hacerlo ni de encontrarlos. Solo administrador, director_comercial y tecnico
(mismo @Roles que ReportsController).
"""

import json
from typing import Annotated, Optional

from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState

from ..config import settings
from .nestjs_client import NestJSClient, NestJSAPIError

MAX_ROWS = 15


def _links(report_id: str) -> dict:
    base = settings.frontend_url
    return {"enlace": f"{base}/reports/{report_id}", "pdf": f"{base}/reports/{report_id}/pdf"}


@tool
async def list_reports(
    auth_token: Annotated[str, InjectedState("auth_token")],
    customer_id: Optional[str] = None,
    visit_id: Optional[str] = None,
) -> str:
    """
    Lista los reportes ejecutivos ya generados. Úsala para "¿qué reportes hay
    de X?", "muéstrame los reportes", "el reporte de la visita a Y".
    Devuelve el enlace del portal para abrir o descargar cada uno.

    Args:
        customer_id: Filtra por cliente (resuélvelo antes con search_customers).
        visit_id: Filtra por visita.
    """
    try:
        client = NestJSClient(auth_token)
        params = {}
        if customer_id:
            params["customerId"] = customer_id
        if visit_id:
            params["visitId"] = visit_id
        data = await client.get("/reports", params=params or None)
        items = data if isinstance(data, list) else data.get("data", [])
        rows = [
            {
                "id": r.get("id"),
                "titulo": r.get("title"),
                "cliente": (r.get("customer") or {}).get("displayName"),
                "creado": r.get("createdAt"),
                "autor": (r.get("creator") or {}).get("name"),
                **_links(r.get("id")),
            }
            for r in items[:MAX_ROWS]
        ]
        if not rows:
            return "No hay reportes que coincidan con ese filtro."
        payload = {"reportes": rows, "total": len(items)}
        return json.dumps(payload, ensure_ascii=False)
    except NestJSAPIError as e:
        if e.status_code == 403:
            return "Este usuario no tiene permiso para consultar reportes ejecutivos."
        return f"Error al listar reportes: {e.detail}"
    except Exception as e:
        return f"Error inesperado al listar reportes: {str(e)}"


@tool
async def generate_report_from_visit(
    visit_id: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
) -> str:
    """
    Genera un reporte ejecutivo (diagnóstico, costos, ROI y cotización) a partir
    de una visita COMPLETADA que tenga resumen. Úsala cuando pidan "genera el
    reporte de la visita a X" o "arma el informe de esa visita".

    Antes de llamarla: ubica la visita con get_customer_visits y confirma con el
    usuario cuál es. Si la visita no está completada o no tiene resumen, el API
    la rechaza — explícalo en vez de reintentar.

    Args:
        visit_id: ID de la visita completada.
    """
    try:
        client = NestJSClient(auth_token)
        report = await client.post(f"/reports/from-visit/{visit_id}", {})
        report_id = report.get("id")
        return json.dumps(
            {"id": report_id, "titulo": report.get("title"), **_links(report_id)},
            ensure_ascii=False,
        )
    except NestJSAPIError as e:
        if e.status_code == 403:
            return "Este usuario no tiene permiso para generar reportes ejecutivos."
        if e.status_code == 404:
            return "No encontré esa visita. Verifica el ID con get_customer_visits."
        if e.status_code == 400:
            return (
                f"El API no pudo generar el reporte: {e.detail}. "
                "Recuerda que la visita debe estar completada y tener resumen."
            )
        return f"Error al generar el reporte: {e.detail}"
    except Exception as e:
        return f"Error inesperado al generar el reporte: {str(e)}"

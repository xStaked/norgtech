"""Metas de venta vistas desde dirección (módulo seller-goals del API).

`get_goal_progress` (analytics.py) solo sabe responder por la meta del usuario
autenticado. Estas dos tools cubren lo que un director necesita: la foto del
equipo completo y la meta de un vendedor concreto.
"""

import json
from typing import Annotated, Optional

from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState

from .nestjs_client import NestJSClient, NestJSAPIError

MAX_ROWS = 15


def _row(item: dict) -> dict:
    return {
        "id": item.get("userId"),
        "vendedor": item.get("sellerName"),
        "meta": item.get("targetAmount"),
        "vendido": item.get("soldAmount"),
        "falta": item.get("remainingAmount"),
        "porcentaje": item.get("percentage"),
    }


@tool
async def get_team_goals(
    auth_token: Annotated[str, InjectedState("auth_token")],
    period_type: Optional[str] = None,
    period_value: Optional[str] = None,
    company_id: Optional[str] = None,
) -> str:
    """
    Progreso de meta de TODOS los vendedores en un periodo. Solo administrador y
    director_comercial. Úsala para "¿cómo va el equipo?", "¿quién va mejor/peor
    en la meta?", "¿cuánto le falta al equipo para la meta del mes?", o como
    primer paso para responder "¿cómo va Juan?" (de aquí sacas su id).

    Sin periodo devuelve el mes en curso. `periodos_disponibles` te dice qué
    otros periodos tienen metas cargadas, por si el usuario pide otro.

    Args:
        period_type: mensual | trimestral | anual. Va siempre junto a period_value.
        period_value: "2026-07" (mensual), "2026-Q3" (trimestral), "2026" (anual).
        company_id: Acota el vendido a una empresa que factura.
    """
    params = {
        "periodType": period_type,
        "periodValue": period_value,
        "companyId": company_id,
    }
    params = {k: v for k, v in params.items() if v}
    try:
        client = NestJSClient(auth_token)
        data = await client.get("/dashboard/seller-goals", params=params or None)
        items = data.get("items") or []
        if not items:
            return (
                f"No hay metas cargadas para {data.get('periodType')} "
                f"{data.get('periodValue')}. Periodos con metas: "
                f"{', '.join(str(p) for p in (data.get('availablePeriods') or [])) or 'ninguno'}."
            )
        # El API ya ordena por porcentaje desc, pero no dependemos de eso.
        rows = sorted(
            (_row(i) for i in items),
            key=lambda r: r["porcentaje"] or 0,
            reverse=True,
        )
        totals = data.get("totals") or {}
        payload = {
            "periodo": f"{data.get('periodType')} {data.get('periodValue')}",
            "totales": {
                "meta": totals.get("targetAmount"),
                "vendido": totals.get("soldAmount"),
                "falta": totals.get("remainingAmount"),
                "porcentaje": totals.get("percentage"),
                "vendedores": totals.get("sellers"),
            },
            "vendedores": rows[:MAX_ROWS],
            "truncado": len(rows) > MAX_ROWS,
            "periodos_disponibles": data.get("availablePeriods"),
        }
        return json.dumps(payload, ensure_ascii=False)
    except NestJSAPIError as e:
        if e.status_code == 403:
            return (
                "Este usuario no puede ver las metas del equipo: son cifras de "
                "toda la operación, reservadas a dirección comercial."
            )
        return f"Error al consultar las metas del equipo: {e.detail}"
    except Exception as e:
        return f"Error inesperado al consultar las metas del equipo: {str(e)}"


@tool
async def get_seller_goal_progress(
    seller_user_id: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
    period_type: Optional[str] = None,
    period_value: Optional[str] = None,
    company_id: Optional[str] = None,
) -> str:
    """
    Meta y avance de UN vendedor concreto. Úsala cuando pregunten por alguien
    con nombre propio: "¿cómo va Juan?", "¿cuánto le falta a Ana para su meta?".

    CÓMO OBTENER seller_user_id: NO lo inventes ni uses el nombre. Llama primero
    a get_team_goals y toma el campo `id` de la fila cuyo `vendedor` coincida con
    el nombre que dijo el usuario. Si en esa lista aparecen dos nombres parecidos,
    pregunta al usuario cuál es antes de llamar a esta tool. Si el vendedor que
    buscas ya sale en get_team_goals con el periodo pedido, esa respuesta basta:
    esta tool es para pedir otro periodo o el detalle de pedidos y clientes.

    Args:
        seller_user_id: ID del vendedor, sacado de get_team_goals.
        period_type: mensual | trimestral | anual. Va siempre junto a period_value.
        period_value: "2026-07" (mensual), "2026-Q3" (trimestral), "2026" (anual).
        company_id: Acota el vendido a una empresa que factura.
    """
    params = {
        "periodType": period_type,
        "periodValue": period_value,
        "companyId": company_id,
    }
    params = {k: v for k, v in params.items() if v}
    try:
        client = NestJSClient(auth_token)
        prog = await client.get(
            f"/users/{seller_user_id}/seller-goals/progress", params=params or None
        )
        summary = {
            "vendedor": prog.get("sellerName"),
            "periodo": f"{prog.get('periodType')} {prog.get('periodValue')}",
            "meta": prog.get("targetAmount"),
            "vendido": prog.get("soldAmount"),
            "falta": prog.get("remainingAmount"),
            "porcentaje": prog.get("percentage"),
            "pedidos": prog.get("ordersCount"),
            "clientes": prog.get("customersCount"),
        }
        return json.dumps(summary, ensure_ascii=False)
    except NestJSAPIError as e:
        if e.status_code == 404:
            return "Ese vendedor no tiene meta asignada en el periodo."
        if e.status_code == 403:
            return (
                "Este usuario solo puede ver su propia meta; la de otros vendedores "
                "es información de dirección comercial."
            )
        if e.status_code == 400:
            return (
                f"El API rechazó la consulta: {e.detail}. Recuerda que period_type y "
                "period_value van siempre juntos y que ese usuario debe ser un "
                "vendedor activo."
            )
        return f"Error al consultar la meta del vendedor: {e.detail}"
    except Exception as e:
        return f"Error inesperado al consultar la meta del vendedor: {str(e)}"

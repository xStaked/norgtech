import json
from typing import Annotated, Optional

from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState

from .nestjs_client import NestJSClient, NestJSAPIError


ANALYTICS_SCREENS = ("sales", "receivables", "funnel", "seller-performance")

# Filas por seccion. El API ya manda top-N (20-30); esto acota lo que entra al
# contexto del LLM sin perder el total, que va aparte en `filas_totales`.
_MAX_SECTION_ROWS = 10


def _sections(data: dict) -> dict[str, int]:
    """Listas disponibles en la respuesta, con su numero de filas.

    Generico a proposito: las 4 pantallas tienen formas distintas y el API las
    cambia sin avisar. Si mañana aparece un breakdown nuevo, Nora lo ve solo.
    """
    found: dict[str, int] = {}
    for key, value in data.items():
        if isinstance(value, list):
            found[key] = len(value)
        elif isinstance(value, dict) and key not in ("totals", "range", "filters"):
            for sub, sub_value in value.items():
                if isinstance(sub_value, list):
                    found[f"{key}.{sub}"] = len(sub_value)
    return found


def _pick(data: dict, path: str):
    node = data
    for part in path.split("."):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node


@tool
async def get_analytics(
    screen: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
    section: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    as_of: Optional[str] = None,
    seller_user_id: Optional[str] = None,
    company_id: Optional[str] = None,
    zone_id: Optional[str] = None,
    segment_id: Optional[str] = None,
    granularity: Optional[str] = None,
) -> str:
    """
    Analítica consolidada de TODA la operación (todos los vendedores). Solo para
    administrador y director_comercial. Úsala para preguntas de dirección:
    ventas por vendedor/zona/segmento/ciudad, comparación contra el año pasado,
    cartera y aging del total, embudo y tasa de cierre, desempeño por vendedor.

    Llámala DOS veces cuando necesites detalle: la primera sin `section` te
    devuelve totales + la lista de secciones disponibles; la segunda con la
    sección que te sirva te devuelve sus filas.

    Args:
        screen: sales | receivables | funnel | seller-performance
        section: Sección a detallar, p.ej. "breakdowns.bySeller", "aging",
            "series", "stages". Omítela para ver totales y qué secciones hay.
        date_from: Inicio del rango (YYYY-MM-DD). Por defecto, últimos 90 días.
        date_to: Fin del rango (YYYY-MM-DD).
        as_of: Solo receivables — foto de la cartera a esa fecha (YYYY-MM-DD).
        seller_user_id: Acota a un vendedor (así respondes "¿cómo va Juan?").
        company_id: Acota a una empresa que factura.
        zone_id: Acota a una zona.
        segment_id: Acota a un segmento de cliente.
        granularity: Solo sales — day | week | month para la serie temporal.
    """
    if screen not in ANALYTICS_SCREENS:
        return f"Pantalla inválida '{screen}'. Usa una de: {', '.join(ANALYTICS_SCREENS)}."
    params = {
        "from": date_from,
        "to": date_to,
        "asOf": as_of,
        "sellerUserId": seller_user_id,
        "companyId": company_id,
        "zoneId": zone_id,
        "segmentId": segment_id,
        "granularity": granularity,
    }
    params = {k: v for k, v in params.items() if v}
    try:
        client = NestJSClient(auth_token)
        data = await client.get(f"/analytics/{screen}", params=params or None)
        head = {
            "pantalla": screen,
            "rango": data.get("range"),
            "moneda": data.get("currency"),
            "filtros": data.get("filters"),
            "totales": data.get("totals"),
        }
        if data.get("previous"):
            head["periodo_anterior"] = data["previous"]
        if data.get("asOf"):
            head["a_fecha"] = data["asOf"]

        if section:
            rows = _pick(data, section)
            if rows is None:
                disponibles = ", ".join(_sections(data)) or "ninguna"
                return (
                    f"La sección '{section}' no existe en {screen}. "
                    f"Disponibles: {disponibles}."
                )
            payload = {**head, "seccion": section}
            if isinstance(rows, list):
                payload["filas"] = rows[:_MAX_SECTION_ROWS]
                payload["filas_totales"] = len(rows)
                payload["truncado"] = len(rows) > _MAX_SECTION_ROWS
            else:
                payload["contenido"] = rows
            return json.dumps(payload, ensure_ascii=False)

        return json.dumps(
            {**head, "secciones_disponibles": _sections(data)}, ensure_ascii=False
        )
    except NestJSAPIError as e:
        if e.status_code == 403:
            return (
                "Este usuario no puede ver la analítica consolidada: son cifras de "
                "toda la operación, reservadas a dirección comercial."
            )
        return f"Error al consultar la analítica: {e.detail}"
    except Exception as e:
        return f"Error inesperado al consultar la analítica: {str(e)}"


@tool
async def get_sales_summary(
    auth_token: Annotated[str, InjectedState("auth_token")],
    days: int = 90,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> str:
    """
    Resumen de ventas e indicadores del comercial, en una ventana de días o en
    un rango de fechas explícito. Úsala para: '¿cuánto llevo en ventas?',
    '¿cuánto vendí en junio?', '¿cómo me fue el trimestre pasado?', top
    clientes, top productos, recompra, devoluciones, clientes dormidos / a quién
    no le he vendido, productos de baja rotación. Los datos vienen filtrados al
    usuario actual.

    Para un periodo concreto pasa `date_from` y `date_to` (p.ej. junio de 2026 =
    2026-06-01 a 2026-06-30). Si no das rango, se usan los últimos `days` días.

    Args:
        days: Tamaño de la ventana en días (por defecto 90). Se ignora si das
            `date_from` y `date_to`.
        date_from: Inicio del rango (YYYY-MM-DD), inclusive.
        date_to: Fin del rango (YYYY-MM-DD), inclusive.
    """
    try:
        client = NestJSClient(auth_token)
        params: dict = {"days": days}
        if date_from:
            params["from"] = date_from
        if date_to:
            params["to"] = date_to
        data = await client.get("/dashboard/commercial-advanced", params=params)
        totals = data.get("totals", {}) or {}
        repurchase = data.get("repurchase", {}) or {}
        summary = {
            "ventana_dias": (data.get("window", {}) or {}).get("days", days),
            "totales": {
                "pedidos": totals.get("orders"),
                "ventas": totals.get("revenue"),
                "devoluciones": totals.get("returns"),
                "neto": totals.get("netRevenue"),
                "unidades": totals.get("units"),
                "clientes": totals.get("customers"),
                "productos": totals.get("products"),
            },
            "top_clientes": [
                {
                    "cliente": c.get("customerName"),
                    "neto": c.get("netRevenue"),
                    "pedidos": c.get("orders"),
                }
                for c in (data.get("byCustomer") or [])[:5]
            ],
            "top_productos": [
                {
                    "producto": p.get("name"),
                    "sku": p.get("sku"),
                    "cantidad": p.get("quantity"),
                    "ventas": p.get("revenue"),
                }
                for p in (data.get("byProduct") or [])[:5]
            ],
            "recompra": {
                "tasa_pct": repurchase.get("repurchaseRate"),
                "recompraron": repurchase.get("repeatCount"),
                "no_recompraron": repurchase.get("noRepurchaseCount"),
            },
            "clientes_dormidos": [
                {
                    "cliente": d.get("customerName"),
                    "dias_sin_comprar": d.get("daysSinceLastOrder"),
                }
                for d in (data.get("dormantCustomers") or [])[:5]
            ],
            "productos_baja_rotacion": [
                {"producto": p.get("name"), "cantidad": p.get("quantity")}
                for p in (data.get("lowRotationProducts") or [])[:5]
            ],
        }
        periodo = (
            f"del {date_from or 'inicio'} al {date_to or 'hoy'}"
            if (date_from or date_to)
            else f"últimos {summary['ventana_dias']} días"
        )
        return (
            f"Resumen de ventas ({periodo}): "
            f"{json.dumps(summary, ensure_ascii=False)}"
        )
    except NestJSAPIError as e:
        return f"Error al obtener el resumen de ventas: {e.detail}"
    except Exception as e:
        return f"Error inesperado al obtener el resumen de ventas: {str(e)}"


@tool
async def get_cartera(
    auth_token: Annotated[str, InjectedState("auth_token")],
    customer_id: Optional[str] = None,
) -> str:
    """
    Estado de la cartera (cuentas por cobrar): saldo total, aging por antigüedad
    y mayores deudores. Úsala para '¿cómo está la cartera?', '¿quién me debe?',
    'facturas vencidas'. Si pasas customer_id, se enfoca en ese cliente e incluye
    sus facturas vencidas. Datos filtrados al usuario actual.

    Args:
        customer_id: ID del cliente para enfocar la cartera (opcional).
    """
    try:
        client = NestJSClient(auth_token)
        params = {"customerId": customer_id} if customer_id else None
        data = await client.get("/invoices/summary", params=params)
        aging = data.get("aging", {}) or {}
        deudores = sorted(
            (
                {
                    "cliente": c.get("name"),
                    "facturado": c.get("total"),
                    "pagado": c.get("paid"),
                    "saldo": (c.get("total") or 0) - (c.get("paid") or 0),
                }
                for c in (data.get("byCustomer") or [])
            ),
            key=lambda x: x["saldo"],
            reverse=True,
        )
        summary = {
            "saldo_total": data.get("totalBalance"),
            "facturado_total": data.get("totalAmount"),
            "pagado_total": data.get("totalPaid"),
            "notas_credito": data.get("totalCreditNotes"),
            "aging": {
                "corriente": aging.get("current"),
                "1_30": aging.get("days1to30"),
                "31_60": aging.get("days31to60"),
                "61_90": aging.get("days61to90"),
                "mas_90": aging.get("over90"),
            },
            "top_deudores": deudores[:5],
        }
        if customer_id:
            overdue = await client.get("/invoices/overdue")
            overdue_list = overdue if isinstance(overdue, list) else overdue.get("data", [])
            vencidas = [
                {
                    "factura": i.get("invoiceNumber"),
                    "vence": i.get("dueDate"),
                    "saldo": (i.get("totalAmount") or 0) - (i.get("totalPaid") or 0),
                }
                for i in overdue_list
                if (i.get("customer") or {}).get("id") == customer_id
            ]
            vencidas.sort(key=lambda x: x["saldo"], reverse=True)
            summary["facturas_vencidas"] = vencidas[:5]
        return f"Estado de cartera: {json.dumps(summary, ensure_ascii=False)}"
    except NestJSAPIError as e:
        return f"Error al obtener la cartera: {e.detail}"
    except Exception as e:
        return f"Error inesperado al obtener la cartera: {str(e)}"


@tool
async def get_goal_progress(
    auth_token: Annotated[str, InjectedState("auth_token")],
) -> str:
    """
    Progreso del comercial actual frente a su meta de ventas del periodo más
    reciente. Úsala para '¿cuánto llevo de mi meta?', '¿cuánto me falta?'.

    Returns:
        Meta, vendido, faltante, porcentaje y periodo; o un mensaje claro si no
        hay meta asignada.
    """
    try:
        client = NestJSClient(auth_token)
        me = await client.get("/auth/me")
        user_id = me.get("id")
        if not user_id:
            return "No pude identificar tu usuario para consultar la meta."
        try:
            prog = await client.get(f"/users/{user_id}/seller-goals/progress")
        except NestJSAPIError as e:
            if e.status_code == 404:
                return "Aún no tienes una meta de ventas asignada para este periodo."
            raise
        summary = {
            "periodo": f"{prog.get('periodType')} {prog.get('periodValue')}",
            "meta": prog.get("targetAmount"),
            "vendido": prog.get("soldAmount"),
            "falta": prog.get("remainingAmount"),
            "porcentaje": prog.get("percentage"),
            "pedidos": prog.get("ordersCount"),
        }
        return f"Progreso de meta: {json.dumps(summary, ensure_ascii=False)}"
    except NestJSAPIError as e:
        return f"Error al obtener el progreso de meta: {e.detail}"
    except Exception as e:
        return f"Error inesperado al obtener el progreso de meta: {str(e)}"

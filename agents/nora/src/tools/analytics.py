import json
from typing import Annotated, Optional

from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState

from .nestjs_client import NestJSClient, NestJSAPIError


@tool
async def get_sales_summary(
    auth_token: Annotated[str, InjectedState("auth_token")],
    days: int = 90,
) -> str:
    """
    Resumen de ventas e indicadores del comercial en una ventana de días.
    Úsala para: '¿cuánto llevo en ventas?', top clientes, top productos,
    recompra, devoluciones, clientes dormidos / a quién no le he vendido,
    productos de baja rotación. Los datos vienen filtrados al usuario actual.

    Args:
        days: Tamaño de la ventana en días (por defecto 90).
    """
    try:
        client = NestJSClient(auth_token)
        data = await client.get(
            "/dashboard/commercial-advanced", params={"days": days}
        )
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
        return (
            f"Resumen de ventas (últimos {summary['ventana_dias']} días): "
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

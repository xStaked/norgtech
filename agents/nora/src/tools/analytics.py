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

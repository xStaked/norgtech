"""Cupo de credito y precio por cliente (modulos /credit y /products del API)."""

import json
from typing import Annotated, Optional

from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState

from .nestjs_client import NestJSClient, NestJSAPIError

MAX_ROWS = 10


@tool
async def get_customer_credit(
    customer_id: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
) -> str:
    """
    Cupo de crédito de un cliente: cuánto tiene asignado, cuánto debe hoy
    (facturas abiertas + pedidos aprobados sin facturar), cuánto le queda
    disponible y si ya se pasó del límite. Trae también el avance de compras
    del mes contra su presupuesto.

    Úsala para "¿tiene cupo?", "¿cuánto le queda a X?", "¿puedo pasarle este
    pedido?", "¿cuánto lleva comprando este mes?".

    El customer_id se resuelve ANTES con search_customers; no inventes IDs.

    Args:
        customer_id: ID del cliente.
    """
    try:
        client = NestJSClient(auth_token)
        data = await client.get(f"/credit/customers/{customer_id}/summary")
        available = data.get("availableCredit")
        progress = data.get("purchaseProgress") or {}
        summary = {
            "cupo": data.get("creditLimit"),
            "saldo_actual": data.get("currentBalance"),
            "disponible": available,
            "uso_pct": data.get("utilizationPercent"),
            "cerca_del_limite": data.get("isNearLimit"),
            # El API no manda esta bandera: disponible negativo = ya se pasó.
            "sobre_el_limite": available is not None and available < 0,
            "sin_cupo_asignado": data.get("creditLimit") in (None, 0),
            "compras_del_mes": progress.get("currentMonthSales"),
            "presupuesto_mensual": progress.get("budget"),
            "avance_presupuesto_pct": progress.get("percent"),
        }
        return json.dumps(summary, ensure_ascii=False)
    except NestJSAPIError as e:
        if e.status_code == 403:
            return "Este usuario no tiene permiso para consultar el cupo de crédito."
        if e.status_code == 404:
            return "No encontré ese cliente. Verifica el ID con search_customers."
        return f"Error al consultar el cupo: {e.detail}"
    except Exception as e:
        return f"Error inesperado al consultar el cupo: {str(e)}"


@tool
async def get_credit_alerts(
    auth_token: Annotated[str, InjectedState("auth_token")],
    company_id: Optional[str] = None,
) -> str:
    """
    Clientes en riesgo de crédito: los que ya usaron 80% o más de su cupo,
    ordenados del más comprometido al menos. Úsala para "¿quién está en
    riesgo?", "¿quién está cerca del límite?", "clientes con el cupo copado".

    Args:
        company_id: Acota a una empresa que factura (opcional).
    """
    try:
        client = NestJSClient(auth_token)
        params = {"companyId": company_id} if company_id else None
        data = await client.get("/credit/dashboard/alerts", params=params)
        items = data if isinstance(data, list) else data.get("data", [])
        if not items:
            return "Ningún cliente está cerca de su límite de crédito."
        rows = [
            {
                "cliente_id": a.get("customerId"),
                "cliente": a.get("displayName"),
                "cupo": a.get("creditLimit"),
                "saldo": a.get("currentBalance"),
                "uso_pct": a.get("utilizationPercent"),
            }
            for a in items[:MAX_ROWS]
        ]
        return json.dumps(
            {"alertas": rows, "total": len(items)}, ensure_ascii=False
        )
    except NestJSAPIError as e:
        if e.status_code == 403:
            return "Este usuario no tiene permiso para ver las alertas de crédito."
        return f"Error al consultar las alertas de crédito: {e.detail}"
    except Exception as e:
        return f"Error inesperado al consultar las alertas de crédito: {str(e)}"


@tool
async def get_price_for_customer(
    product_id: str,
    customer_id: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
    presentation_id: Optional[str] = None,
) -> str:
    """
    Precio que le aplica a ESE cliente para ESE producto, según su lista de
    precios (o el precio base con el descuento de su segmento si no tiene lista).
    Úsala para "¿a qué precio le queda a X?", "¿cuánto vale el producto Y para
    ese cliente?", antes de cotizar o armar un pedido.

    El customer_id se resuelve ANTES con search_customers y el product_id con
    search_products; no inventes IDs.

    Si el producto tiene varias presentaciones con precio en esa lista, la
    respuesta trae `origen: "ambiguo"` y las opciones: pregúntale al usuario cuál
    empaque y vuelve a llamar con `presentation_id`.

    Args:
        product_id: ID del producto.
        customer_id: ID del cliente.
        presentation_id: Presentación/empaque ya elegido (opcional).
    """
    try:
        client = NestJSClient(auth_token)
        params = {"presentationId": presentation_id} if presentation_id else None
        data = await client.get(
            f"/products/{product_id}/price-for-customer/{customer_id}", params=params
        )
        source = data.get("source")
        if source == "ambiguous":
            return json.dumps(
                {
                    "origen": "ambiguo",
                    "lista": data.get("priceListName"),
                    "moneda": data.get("currency"),
                    "opciones": [
                        {
                            "presentation_id": o.get("presentationId"),
                            "empaque": o.get("empaque"),
                            "forma": o.get("form"),
                            "precio_sin_iva": o.get("priceSinIva"),
                            "precio_con_iva": o.get("priceConIva"),
                        }
                        for o in (data.get("options") or [])[:MAX_ROWS]
                    ],
                },
                ensure_ascii=False,
            )
        if source == "price_list":
            payload = {
                "origen": "lista_de_precios",
                "lista": data.get("priceListName"),
                "moneda": data.get("currency"),
                "empaque": data.get("empaque"),
                "presentation_id": data.get("presentationId"),
                "precio": data.get("finalPrice"),
                "precio_con_iva": data.get("priceConIva"),
                "iva_pct": data.get("taxPercent"),
                "precio_base": data.get("basePrice"),
            }
        else:
            payload = {
                "origen": "precio_base",
                "precio": data.get("finalPrice"),
                "precio_base": data.get("basePrice"),
                "descuento_pct": data.get("discountPercent"),
                "cumple_meta": data.get("meetsGoal"),
                "ventas_ytd": data.get("salesYTD"),
                "meta_para_descuento": data.get("goalThreshold"),
            }
        return json.dumps(payload, ensure_ascii=False)
    except NestJSAPIError as e:
        if e.status_code == 403:
            return "Este usuario no tiene permiso para consultar precios por cliente."
        if e.status_code == 404:
            return (
                "No encontré el producto o el cliente. Verifica los IDs con "
                "search_products y search_customers."
            )
        return f"Error al consultar el precio: {e.detail}"
    except Exception as e:
        return f"Error inesperado al consultar el precio: {str(e)}"

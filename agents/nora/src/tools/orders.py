import json
from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from .nestjs_client import NestJSClient, NestJSAPIError
from typing import Annotated, Optional


@tool
async def get_companies(
    auth_token: Annotated[str, InjectedState("auth_token")],
) -> str:
    """
    Obtiene las empresas que pueden facturar un pedido (ej: Nortech, Nanonutrición).
    Úsala antes de crear un pedido para determinar el companyId. Si el usuario nombró
    la empresa, escoge la que coincida; si solo hay una, úsala; si hay varias y no la
    dijo, pregúntale cuál.

    Returns:
        Lista de empresas activas en JSON con id, nombre y prefix.
    """
    try:
        nestjs_client = NestJSClient(auth_token)
        result = await nestjs_client.get("/companies")
        companies = result if isinstance(result, list) else result.get("data", [])
        simplified = [
            {"id": c["id"], "nombre": c.get("name"), "prefix": c.get("prefix")}
            for c in companies
            if c.get("isActive", True)
        ]
        if not simplified:
            return "No hay empresas activas configuradas."
        return f"Empresas disponibles: {json.dumps(simplified, ensure_ascii=False, indent=2)}"
    except NestJSAPIError as e:
        return f"Error al obtener empresas: {e.detail}"
    except Exception as e:
        return f"Error inesperado al obtener empresas: {str(e)}"


@tool
async def search_products(
    query: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
) -> str:
    """
    Busca productos en el catálogo por nombre o SKU.
    Usa esta herramienta cuando necesites identificar qué productos
    incluir en un pedido o cotización.

    Args:
        query: Texto de búsqueda (nombre del producto o SKU)

    Returns:
        Lista de productos activos encontrados con id, nombre, SKU, unidad y precio base
    """
    try:
        nestjs_client = NestJSClient(auth_token)
        result = await nestjs_client.get("/products")
        products = result if isinstance(result, list) else result.get("data", [])
        if not products:
            return "No hay productos en el catálogo."

        # Normalizar query para búsqueda flexible
        query_lower = query.lower().strip()
        matched = [
            p for p in products
            if p.get("active", True) and (
                query_lower in (p.get("name") or "").lower()
                or query_lower in (p.get("sku") or "").lower()
                or query_lower in (p.get("description") or "").lower()
            )
        ]

        # Si no hay match exacto, devolver los primeros 10 activos como sugerencia
        candidates = matched if matched else [p for p in products if p.get("active", True)]

        simplified = [
            {
                "id": p["id"],
                "nombre": p.get("name"),
                "sku": p.get("sku"),
                "unidad": p.get("unit"),
                "presentacion": p.get("presentation"),
                "precioBase": p.get("basePrice"),
            }
            for p in candidates[:10]
        ]

        if matched:
            return f"Productos encontrados: {json.dumps(simplified, ensure_ascii=False, indent=2)}"
        else:
            return (
                f"No encontré productos que coincidan exactamente con '{query}'. "
                f"Estos son los productos disponibles en el catálogo: "
                f"{json.dumps(simplified, ensure_ascii=False, indent=2)}"
            )
    except NestJSAPIError as e:
        return f"Error al buscar productos: {e.detail}"
    except Exception as e:
        return f"Error inesperado al buscar productos: {str(e)}"


@tool
async def get_customer_quotes(
    customer_id: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
) -> str:
    """
    Obtiene las cotizaciones de un cliente específico.
    Usa esta herramienta cuando el usuario quiera convertir una cotización
    en pedido o necesite ver cotizaciones previas.

    Args:
        customer_id: ID del cliente

    Returns:
        Lista de cotizaciones del cliente con id, estado, total e items
    """
    try:
        nestjs_client = NestJSClient(auth_token)
        result = await nestjs_client.get("/quotes")
        quotes = result if isinstance(result, list) else result.get("data", [])
        if not quotes:
            return "No hay cotizaciones en el sistema."

        customer_quotes = [q for q in quotes if q.get("customerId") == customer_id]
        if not customer_quotes:
            return f"El cliente no tiene cotizaciones registradas."

        simplified = []
        for q in customer_quotes[:10]:
            items = q.get("items", [])
            simplified.append({
                "id": q["id"],
                "estado": q.get("status"),
                "total": q.get("total"),
                "validaHasta": q.get("validUntil"),
                "items": [
                    {
                        "producto": i.get("productSnapshotName") or i.get("productId"),
                        "cantidad": i.get("quantity"),
                        "precioUnitario": i.get("unitPrice"),
                        "subtotal": i.get("subtotal"),
                    }
                    for i in items
                ],
            })

        return f"Cotizaciones del cliente: {json.dumps(simplified, ensure_ascii=False, indent=2)}"
    except NestJSAPIError as e:
        return f"Error al obtener cotizaciones: {e.detail}"
    except Exception as e:
        return f"Error inesperado al obtener cotizaciones: {str(e)}"


@tool
async def create_order(
    customer_id: str,
    items: list[dict],
    auth_token: Annotated[str, InjectedState("auth_token")],
    opportunity_id: Optional[str] = None,
    source_quote_id: Optional[str] = None,
    notes: Optional[str] = None,
) -> str:
    """
    Crea un nuevo pedido en el CRM.

    IMPORTANTE: Antes de llamar esta herramienta DEBES:
    1. Identificar el cliente con search_customers
    2. Identificar los productos con search_products
    3. Asegurarte de que cada item tenga product_id, quantity y unit_price

    Args:
        customer_id: ID del cliente (obligatorio)
        items: Lista de items, cada uno con:
            - product_id: ID del producto
            - quantity: Cantidad (número, puede tener decimales)
            - unit_price: Precio unitario en pesos
            - notes: Notas del item (opcional)
        opportunity_id: ID de oportunidad relacionada (opcional)
        source_quote_id: ID de cotización origen (opcional)
        notes: Notas generales del pedido (opcional)

    Returns:
        Datos del pedido creado con su ID, estado y total
    """
    if not items or len(items) == 0:
        return "Error: Un pedido debe tener al menos un item."

    # Normalizar items al formato esperado por la API NestJS
    normalized_items = []
    for idx, item in enumerate(items):
        product_id = item.get("product_id") or item.get("productId")
        quantity = item.get("quantity")
        unit_price = item.get("unit_price") or item.get("unitPrice")
        item_notes = item.get("notes")

        if not product_id:
            return f"Error: El item #{idx + 1} no tiene product_id."
        if quantity is None or quantity == "":
            return f"Error: El item #{idx + 1} no tiene cantidad."
        if unit_price is None or unit_price == "":
            return f"Error: El item #{idx + 1} no tiene precio unitario."

        normalized_item = {
            "productId": product_id,
            "quantity": float(quantity),
            "unitPrice": float(unit_price),
        }
        if item_notes:
            normalized_item["notes"] = str(item_notes)
        normalized_items.append(normalized_item)

    payload = {
        "customerId": customer_id,
        "items": normalized_items,
    }
    if opportunity_id:
        payload["opportunityId"] = opportunity_id
    if source_quote_id:
        payload["sourceQuoteId"] = source_quote_id
    if notes:
        payload["notes"] = notes

    try:
        nestjs_client = NestJSClient(auth_token)
        result = await nestjs_client.post("/orders", payload)
        order_id = result.get("id", "desconocido")
        total = result.get("total", "desconocido")
        status = result.get("status", "recibido")
        return (
            f"Pedido creado exitosamente. "
            f"ID: {order_id}, Estado: {status}, Total: ${total}. "
            f"Detalle completo: {json.dumps(result, ensure_ascii=False, indent=2)}"
        )
    except NestJSAPIError as e:
        return f"Error al crear pedido: {e.detail}"
    except Exception as e:
        return f"Error inesperado al crear pedido: {str(e)}"

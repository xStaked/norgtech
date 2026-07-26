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
        return f"Empresas disponibles: {json.dumps(simplified, ensure_ascii=False)}"
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
            return f"Productos encontrados: {json.dumps(simplified, ensure_ascii=False)}"
        else:
            return (
                f"No encontré productos que coincidan exactamente con '{query}'. "
                f"Estos son los productos disponibles en el catálogo: "
                f"{json.dumps(simplified, ensure_ascii=False)}"
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

        return f"Cotizaciones del cliente: {json.dumps(simplified, ensure_ascii=False)}"
    except NestJSAPIError as e:
        return f"Error al obtener cotizaciones: {e.detail}"
    except Exception as e:
        return f"Error inesperado al obtener cotizaciones: {str(e)}"


@tool
async def get_customer_zones(
    customer_id: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
) -> str:
    """
    Obtiene las zonas de despacho registradas para un cliente. Úsala al crear un
    pedido: si el cliente tiene más de una zona, pregunta a cuál se despacha; si
    tiene una sola, úsala; si no tiene, omite la zona.

    Args:
        customer_id: ID del cliente.

    Returns:
        Lista de zonas en JSON con customerZoneId (úsalo en create_order), zona,
        departamento y direccion.
    """
    try:
        nestjs_client = NestJSClient(auth_token)
        result = await nestjs_client.get(f"/customers/{customer_id}/zones")
        zones = result if isinstance(result, list) else result.get("data", [])
        if not zones:
            return "Este cliente no tiene zonas de despacho registradas."
        simplified = [
            {
                "customerZoneId": z["id"],
                "zona": (z.get("zone") or {}).get("name"),
                "departamento": (z.get("zone") or {}).get("department"),
                "direccion": z.get("address"),
            }
            for z in zones
        ]
        return f"Zonas del cliente: {json.dumps(simplified, ensure_ascii=False)}"
    except NestJSAPIError as e:
        return f"Error al obtener zonas del cliente: {e.detail}"
    except Exception as e:
        return f"Error inesperado al obtener zonas del cliente: {str(e)}"


def _normalize_order_items(items: list[dict]) -> tuple[list[dict], str | None]:
    """Items -> payload del CRM. Devuelve (items, error) para no repetir validacion."""
    normalized_items = []
    for idx, item in enumerate(items):
        product_id = item.get("product_id") or item.get("productId")
        quantity = item.get("quantity")
        unit_price = item.get("unit_price")
        if unit_price is None:
            unit_price = item.get("unitPrice")
        item_notes = item.get("notes")

        if not product_id:
            return [], f"Error: El item #{idx + 1} no tiene product_id."
        if quantity is None or quantity == "":
            return [], f"Error: El item #{idx + 1} no tiene cantidad."
        if unit_price is None or unit_price == "":
            return [], f"Error: El item #{idx + 1} no tiene precio unitario."

        normalized_item = {
            "productId": product_id,
            "quantity": float(quantity),
            "unitPrice": float(unit_price),
        }
        if item_notes:
            normalized_item["notes"] = str(item_notes)
        normalized_items.append(normalized_item)
    return normalized_items, None


@tool
async def preview_order(
    customer_id: str,
    items: list[dict],
    auth_token: Annotated[str, InjectedState("auth_token")],
) -> str:
    """
    Calcula el pedido SIN crearlo: precios reales del cliente (su lista de precios
    y el descuento de su segmento), IVA y total.

    OBLIGATORIO antes de create_order: muestra este resumen al usuario (cliente,
    productos, cantidades, precio unitario y total) y espera que confirme
    explícitamente. Solo si confirma, llama create_order con los mismos datos.

    Args:
        customer_id: ID del cliente (de search_customers)
        items: Lista de items con product_id, quantity, unit_price

    Returns:
        Resumen del pedido con líneas, subtotal, IVA y total en JSON.
    """
    # ponytail: la confirmación se pide por prompt (preview -> resumen -> "sí").
    # Si el modelo se la salta, el paso siguiente es un gate duro: guardar el
    # hash del preview por conversación y que create_order lo exija.
    normalized_items, error = _normalize_order_items(items)
    if error:
        return error
    if not normalized_items:
        return "Error: Un pedido debe tener al menos un item."

    try:
        nestjs_client = NestJSClient(auth_token)
        result = await nestjs_client.post(
            "/orders/preview", {"customerId": customer_id, "items": normalized_items}
        )
        return (
            "Resumen del pedido (aún NO creado, pide confirmación al usuario antes de "
            f"crearlo): {json.dumps(result, ensure_ascii=False)}"
        )
    except NestJSAPIError as e:
        return f"Error al calcular el pedido: {e.detail}"
    except Exception as e:
        return f"Error inesperado al calcular el pedido: {str(e)}"


@tool
async def create_order(
    customer_id: str,
    items: list[dict],
    auth_token: Annotated[str, InjectedState("auth_token")],
    company_id: Optional[str] = None,
    customer_zone_id: Optional[str] = None,
    opportunity_id: Optional[str] = None,
    source_quote_id: Optional[str] = None,
    notes: Optional[str] = None,
) -> str:
    """
    Crea un nuevo pedido en el CRM. El pedido queda en revisión (en_revision) para
    que lo valide la persona encargada antes de facturación.

    IMPORTANTE: Antes de llamar esta herramienta DEBES:
    1. Identificar el cliente con search_customers EN ESTE MISMO TURNO (pide nombre
       o NIT si no lo tienes) y usar el id exacto que devuelve. Nunca reutilices ni
       inventes un customer_id de mensajes anteriores.
    2. Identificar los productos con search_products
    3. Determinar la zona de despacho con get_customer_zones (si el cliente tiene zonas)
    4. Mostrar el resumen con preview_order y esperar que el usuario CONFIRME.
       Nunca crees el pedido en el mismo mensaje en que recibiste los datos.

    NO preguntes por la empresa que factura: la define el cliente y el CRM la asigna sola.

    Args:
        customer_id: ID del cliente (obligatorio)
        items: Lista de items, cada uno con product_id, quantity, unit_price, notes (opc)
        company_id: NO lo uses; el CRM toma la empresa del cliente
        customer_zone_id: ID de la zona de despacho del cliente (opcional; usa get_customer_zones)
        opportunity_id: ID de oportunidad relacionada (opcional)
        source_quote_id: ID de cotización origen (opcional)
        notes: Notas generales del pedido (opcional)

    Returns:
        Datos del pedido creado con su ID, estado y total. El total final lo calcula
        el servidor según el precio base y el descuento del segmento del cliente.
    """
    if not items or len(items) == 0:
        return "Error: Un pedido debe tener al menos un item."

    normalized_items, error = _normalize_order_items(items)
    if error:
        return error

    payload = {
        "customerId": customer_id,
        "items": normalized_items,
        "approvalStatus": "en_revision",
    }
    # La empresa la hereda el CRM del cliente; solo se manda si el usuario la fijó.
    if company_id:
        payload["companyId"] = company_id
    if customer_zone_id:
        payload["customerZoneId"] = customer_zone_id
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
            f"Pedido creado exitosamente y enviado a revisión. "
            f"ID: {order_id}, Estado: {status}, Total: ${total}. "
            f"Detalle completo: {json.dumps(result, ensure_ascii=False)}"
        )
    except NestJSAPIError as e:
        # El historial de WhatsApp no conserva los resultados de las tools, así que
        # el LLM tiende a reusar un customer_id viejo o inventado: no le digas al
        # usuario que el cliente no existe, vuelve a buscarlo.
        if "customer not found" in (e.detail or "").lower():
            return (
                "El customer_id enviado no existe. NO le digas al usuario que el cliente "
                "no está registrado: vuelve a llamar search_customers con el nombre o NIT "
                "del cliente, toma el id exacto que devuelva y reintenta create_order."
            )
        return f"Error al crear pedido: {e.detail}"
    except Exception as e:
        return f"Error inesperado al crear pedido: {str(e)}"

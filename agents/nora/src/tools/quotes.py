"""Cotizaciones (modulo /quotes del API).

Nora solo sabia LEER las cotizaciones de un cliente (get_customer_quotes en
orders.py). Aqui viven las de escritura: calcular (preview), crear, cambiar de
estado y pedir facturacion.

Igual que en pedidos, crear es una accion con plata: preview_quote SIEMPRE va
antes de create_quote, y el usuario tiene que confirmar en medio.

@Roles del QuotesController:
- preview / create / status / billing-request: administrador, comercial,
  director_comercial.
- list / get: los anteriores + facturacion.
"""

import json
from typing import Annotated, Optional

from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState

from .nestjs_client import NestJSClient, NestJSAPIError
from .orders import CONFIRMATION_RULE as _CONFIRMATION_RULE

MAX_ROWS = 10
MAX_ITEMS = 15

# Estados validos, EXACTOS al enum QuoteStatus del API (schema.prisma). El API
# valida con @IsEnum: si Nora inventa un estado ("aprobada", "enviada") el
# resultado es un 400. Se valida aca ANTES de gastar la llamada.
QUOTE_STATUSES = (
    "abierta",
    "en_negociacion",
    "cerrada",
    "perdida",
)
_STATUSES_DOC = ", ".join(QUOTE_STATUSES)


def _normalize_quote_items(items: list[dict]) -> tuple[list[dict], Optional[str]]:
    """Items del LLM -> CreateQuoteItemDto. Devuelve (items, error)."""
    normalized = []
    for idx, item in enumerate(items):
        product_id = item.get("product_id") or item.get("productId")
        quantity = item.get("quantity")
        unit_price = item.get("unit_price")
        if unit_price is None:
            unit_price = item.get("unitPrice")
        presentation_id = item.get("presentation_id") or item.get("presentationId")
        presentation = item.get("presentation")
        notes = item.get("notes")

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
        if presentation_id:
            normalized_item["presentationId"] = str(presentation_id)
        elif presentation:
            normalized_item["presentation"] = str(presentation)
        if notes:
            normalized_item["notes"] = str(notes)
        normalized.append(normalized_item)
    return normalized, None


def _quote_row(q: dict) -> dict:
    """Fila compacta para listados: sin items, sin snapshots, sin auditoria."""
    return {
        "id": q.get("id"),
        "cliente": (q.get("customer") or {}).get("displayName"),
        "cliente_id": q.get("customerId"),
        "estado": q.get("status"),
        "total": q.get("total"),
        "valida_hasta": q.get("validUntil"),
        "creada": q.get("createdAt"),
    }


def _quote_detail(q: dict) -> dict:
    row = _quote_row(q)
    items = q.get("items") or []
    row.update(
        {
            "subtotal": q.get("subtotal"),
            "notas": q.get("notes"),
            "oportunidad": (q.get("opportunity") or {}).get("title"),
            "items": [
                {
                    "producto": i.get("productSnapshotName") or i.get("productId"),
                    "sku": i.get("productSnapshotSku"),
                    "empaque": i.get("presentationSnapshot"),
                    "cantidad": i.get("quantity"),
                    "precio_unitario": i.get("unitPrice"),
                    "descuento_pct": i.get("discountPercent"),
                    "subtotal": i.get("subtotal"),
                }
                for i in items[:MAX_ITEMS]
            ],
            "total_items": len(items),
        }
    )
    return row


@tool
async def preview_quote(
    customer_id: str,
    items: list[dict],
    auth_token: Annotated[str, InjectedState("auth_token")],
) -> str:
    """
    Calcula la cotización SIN crearla: precios reales del cliente (su lista de
    precios o el descuento de su segmento), IVA, subtotal y total. Los precios y
    totales los calcula el servidor — tú NO los sumes ni los estimes.

    OBLIGATORIO antes de create_quote: muestra este resumen al usuario (cliente,
    productos, cantidades, precio unitario y total) y espera que confirme
    explícitamente. Solo si confirma, llama create_quote con los MISMOS datos.
    Nunca crees una cotización en el mismo mensaje en que recibiste los datos.

    Antes: resuelve el cliente con search_customers y los productos con
    search_products (o get_price_for_customer si dudas del precio). No inventes IDs.

    Args:
        customer_id: ID del cliente (de search_customers).
        items: Lista de items con product_id, quantity, unit_price y, opcional,
            presentation_id (empaque) y notes.
    """
    normalized_items, error = _normalize_quote_items(items)
    if error:
        return error
    if not normalized_items:
        return "Error: Una cotización debe tener al menos un item."

    try:
        client = NestJSClient(auth_token)
        data = await client.post(
            "/quotes/preview", {"customerId": customer_id, "items": normalized_items}
        )
        resumen = {
            "segmento": data.get("segmentName"),
            "descuento_pct": data.get("discountPercent"),
            "descuento_valor": data.get("discountAmount"),
            "cumple_meta": data.get("meetsGoal"),
            "lineas": [
                {
                    "product_id": l.get("productId"),
                    "lista": l.get("priceListName"),
                    "empaque": l.get("presentation"),
                    "cantidad": l.get("quantity"),
                    "precio_original": l.get("originalUnitPrice"),
                    "precio_unitario": l.get("unitPrice"),
                    "subtotal": l.get("subtotal"),
                    "iva_pct": l.get("taxPercent"),
                    "total_con_iva": l.get("totalWithTax"),
                }
                for l in (data.get("lines") or [])[:MAX_ITEMS]
            ],
            "subtotal": data.get("subtotal"),
            "iva": data.get("taxAmount"),
            "total": data.get("total"),
        }
        return (
            "Cotización calculada, aún NO existe en el CRM. "
            + _CONFIRMATION_RULE.format(create_tool="create_quote")
            + f" Datos: {json.dumps(resumen, ensure_ascii=False)}"
        )
    except NestJSAPIError as e:
        if e.status_code == 403:
            return "Este usuario no tiene permiso para cotizar."
        if e.status_code == 404:
            return (
                "No encontré ese cliente o alguno de los productos. Verifica los IDs "
                "con search_customers y search_products."
            )
        if e.status_code == 400:
            return f"El API rechazó los datos de la cotización: {e.detail}"
        return f"Error al calcular la cotización: {e.detail}"
    except Exception as e:
        return f"Error inesperado al calcular la cotización: {str(e)}"


@tool
async def create_quote(
    customer_id: str,
    items: list[dict],
    auth_token: Annotated[str, InjectedState("auth_token")],
    opportunity_id: Optional[str] = None,
    notes: Optional[str] = None,
    valid_until: Optional[str] = None,
) -> str:
    """
    Crea la cotización en el CRM (queda en estado `abierta`).

    NUNCA llames esta herramienta sin haber hecho ANTES, en este mismo turno:
    1. search_customers para el cliente y search_products para los productos.
    2. preview_quote con estos mismos datos, mostrando el resumen al usuario.
    3. Una confirmación EXPLÍCITA del usuario ("sí", "créala", "dale").
    Si no hubo preview mostrado y confirmado, haz el preview primero — crear una
    cotización compromete precios frente al cliente.

    Esa confirmación vale aunque el usuario la haya dado respondiendo al resumen
    del turno ANTERIOR: por WhatsApp no ves tus llamadas previas, así que rehaces
    el preview y creas de una vez. Lo que no puedes hacer es volver a pedir la
    misma confirmación: eso deja al usuario en un bucle sin cotización.

    El total lo calcula el servidor con la lista de precios del cliente; tú solo
    mandas cantidades y precios unitarios acordados.

    Args:
        customer_id: ID del cliente (obligatorio).
        items: Lista de items con product_id, quantity, unit_price y, opcional,
            presentation_id (empaque) y notes.
        opportunity_id: ID de la oportunidad relacionada (opcional).
        notes: Notas generales de la cotización (opcional).
        valid_until: Fecha de vigencia en ISO 8601, ej "2026-08-31" (opcional).
    """
    if not items:
        return "Error: Una cotización debe tener al menos un item."

    normalized_items, error = _normalize_quote_items(items)
    if error:
        return error

    payload = {"customerId": customer_id, "items": normalized_items}
    if opportunity_id:
        payload["opportunityId"] = opportunity_id
    if notes:
        payload["notes"] = notes
    if valid_until:
        payload["validUntil"] = valid_until

    try:
        client = NestJSClient(auth_token)
        quote = await client.post("/quotes", payload)
        return (
            f"Cotización creada. ID: {quote.get('id')}, estado: {quote.get('status')}, "
            f"total: ${quote.get('total')}. "
            f"Detalle: {json.dumps(_quote_detail(quote), ensure_ascii=False)}"
        )
    except NestJSAPIError as e:
        if e.status_code == 403:
            return "Este usuario no tiene permiso para crear cotizaciones."
        if e.status_code == 404:
            # Igual que en create_order: el historial de WhatsApp no conserva los
            # resultados de las tools y el LLM reusa IDs viejos o inventados.
            return (
                "El cliente, la oportunidad o algún producto no existe con el ID enviado. "
                "NO le digas al usuario que el cliente no está registrado: vuelve a "
                "llamar search_customers / search_products, toma los IDs exactos y "
                "repite el preview antes de reintentar."
            )
        if e.status_code == 400:
            return f"El API rechazó la cotización: {e.detail}"
        return f"Error al crear la cotización: {e.detail}"
    except Exception as e:
        return f"Error inesperado al crear la cotización: {str(e)}"


@tool
async def list_quotes(
    auth_token: Annotated[str, InjectedState("auth_token")],
    customer_id: Optional[str] = None,
    status: Optional[str] = None,
) -> str:
    """
    Lista las cotizaciones del CRM, de la más reciente a la más antigua. Úsala
    para "¿qué cotizaciones hay?", "cotizaciones abiertas", "las cotizaciones
    de X", "¿qué le cotizamos a este cliente?".

    Args:
        customer_id: Filtra por cliente (resuélvelo antes con search_customers).
        status: Filtra por estado. Valores válidos: abierta, en_negociacion,
            cerrada, perdida.
    """
    if status and status not in QUOTE_STATUSES:
        return f"Estado inválido '{status}'. Usa uno de: {_STATUSES_DOC}"
    try:
        client = NestJSClient(auth_token)
        # GET /quotes no acepta query params (findAll() no recibe nada): el
        # filtro es del lado de Nora.
        data = await client.get("/quotes")
        quotes = data if isinstance(data, list) else data.get("data", [])
        if customer_id:
            quotes = [q for q in quotes if q.get("customerId") == customer_id]
        if status:
            quotes = [q for q in quotes if q.get("status") == status]
        if not quotes:
            return "No hay cotizaciones que coincidan con ese filtro."
        return json.dumps(
            {"cotizaciones": [_quote_row(q) for q in quotes[:MAX_ROWS]], "total": len(quotes)},
            ensure_ascii=False,
        )
    except NestJSAPIError as e:
        if e.status_code == 403:
            return "Este usuario no tiene permiso para consultar cotizaciones."
        return f"Error al listar cotizaciones: {e.detail}"
    except Exception as e:
        return f"Error inesperado al listar cotizaciones: {str(e)}"


@tool
async def get_quote(
    quote_id: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
) -> str:
    """
    Detalle de UNA cotización: cliente, estado, items con cantidades y precios,
    subtotal y total. Úsala cuando el usuario pregunte por una cotización
    concreta o antes de cambiarle el estado o pedir su facturación.

    El quote_id sale de list_quotes o get_customer_quotes; no lo inventes.

    Args:
        quote_id: ID de la cotización.
    """
    try:
        client = NestJSClient(auth_token)
        quote = await client.get(f"/quotes/{quote_id}")
        if not quote:
            return "No encontré esa cotización. Verifica el ID con list_quotes."
        return json.dumps(_quote_detail(quote), ensure_ascii=False)
    except NestJSAPIError as e:
        if e.status_code == 403:
            return "Este usuario no tiene permiso para consultar cotizaciones."
        if e.status_code == 404:
            return "No encontré esa cotización. Verifica el ID con list_quotes."
        return f"Error al consultar la cotización: {e.detail}"
    except Exception as e:
        return f"Error inesperado al consultar la cotización: {str(e)}"


@tool
async def update_quote_status(
    quote_id: str,
    status: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
) -> str:
    """
    Cambia el estado de una cotización. Úsala para "marca la cotización como
    cerrada", "esa se perdió", "quedó en negociación".

    Estados válidos: abierta, en_negociacion, cerrada, perdida. Cerrar una
    cotización es el paso previo a pedir su facturación
    (request_billing_for_quote), así que confirma con el usuario antes de
    cerrarla o darla por perdida.

    Args:
        quote_id: ID de la cotización (de list_quotes).
        status: Nuevo estado. Valores válidos: abierta, en_negociacion, cerrada, perdida.
    """
    if status not in QUOTE_STATUSES:
        return f"Estado inválido '{status}'. Usa uno de: {_STATUSES_DOC}"
    try:
        client = NestJSClient(auth_token)
        quote = await client.patch(f"/quotes/{quote_id}/status", {"status": status})
        return (
            f"Cotización {quote.get('id')} actualizada a estado '{quote.get('status')}' "
            f"(cliente: {(quote.get('customer') or {}).get('displayName')}, "
            f"total: ${quote.get('total')})."
        )
    except NestJSAPIError as e:
        if e.status_code == 403:
            return "Este usuario no tiene permiso para cambiar el estado de cotizaciones."
        if e.status_code == 404:
            return "No encontré esa cotización. Verifica el ID con list_quotes."
        if e.status_code == 400:
            return f"El API rechazó el cambio de estado: {e.detail}"
        return f"Error al cambiar el estado de la cotización: {e.detail}"
    except Exception as e:
        return f"Error inesperado al cambiar el estado de la cotización: {str(e)}"


@tool
async def request_billing_for_quote(
    quote_id: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
) -> str:
    """
    Crea la solicitud de facturación de una cotización: la manda a facturación
    en estado `pendiente`. Úsala para "pasa esa cotización a facturación",
    "solicita la factura de esta cotización".

    La cotización DEBE estar en estado `cerrada`; si no, el API la rechaza —
    ciérrala antes con update_quote_status y confírmalo con el usuario. Es una
    acción de escritura con plata: verifica la cotización con get_quote y pide
    confirmación explícita antes de llamarla.

    Args:
        quote_id: ID de la cotización cerrada.
    """
    try:
        client = NestJSClient(auth_token)
        billing = await client.post(f"/quotes/{quote_id}/billing-request", {})
        return (
            f"Solicitud de facturación creada. ID: {billing.get('id')}, "
            f"estado: {billing.get('status')}, "
            f"cliente: {(billing.get('customer') or {}).get('displayName')}."
        )
    except NestJSAPIError as e:
        if e.status_code == 403:
            return "Este usuario no tiene permiso para solicitar facturación."
        if e.status_code == 404:
            return (
                "No encontré esa cotización (o la empresa del cliente está inactiva). "
                f"Detalle del API: {e.detail}"
            )
        if e.status_code == 400:
            return (
                f"El API rechazó la solicitud: {e.detail}. Recuerda que solo se puede "
                "facturar una cotización en estado 'cerrada'."
            )
        return f"Error al solicitar la facturación: {e.detail}"
    except Exception as e:
        return f"Error inesperado al solicitar la facturación: {str(e)}"

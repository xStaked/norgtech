"""Devoluciones / notas credito (modulo /returns del API).

Nora solo veia las devoluciones como un numero agregado dentro del resumen de
ventas; no podia consultarlas ni registrarlas. Mismo @Roles que
ReturnsController: administrador, director_comercial, facturacion, comercial
(el comercial solo ve las devoluciones de SUS clientes).

OJO: el API NO modela items ni cantidades. Una devolucion es un monto en pesos
(`amount`) con un motivo en texto libre (`reason`), opcionalmente atada a un
pedido y/o a una factura. Si la atas a una factura, el API la trata como nota
credito: suma a `creditNoteTotal` y no puede superar el saldo pendiente.
"""

import json
from typing import Annotated, Optional

from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState

from .nestjs_client import NestJSClient, NestJSAPIError

MAX_ROWS = 15
MAX_REASON = 500
MAX_NOTES = 2000


def _row(r: dict) -> dict:
    return {
        "id": r.get("id"),
        "fecha": r.get("returnDate"),
        "cliente": (r.get("customer") or {}).get("displayName"),
        "cliente_id": r.get("customerId"),
        "monto": r.get("amount"),
        "motivo": r.get("reason"),
        "pedido": (r.get("order") or {}).get("orderNumber"),
        "factura": (r.get("invoice") or {}).get("invoiceNumber"),
    }


def _explain_400(detail: str) -> str:
    """Traduce los BadRequest de ReturnsService a espanol. No reintentes."""
    low = (detail or "").lower()
    if "exceeds invoice outstanding balance" in low:
        return (
            "El monto de la devolución supera el saldo pendiente de esa factura. "
            "El API no permite devolver más de lo que queda por pagar (ya se "
            "descontaron pagos y notas crédito previas). Revisa el saldo real de "
            "la factura con el usuario y registra un monto menor o igual; no "
            "reintentes con el mismo monto."
        )
    if "order does not belong to customer" in low:
        return "Ese pedido no es de ese cliente. Verifica el pedido con get_customer_orders."
    if "invoice does not belong to customer" in low:
        return "Esa factura no es de ese cliente. Verifica la factura del cliente antes de reintentar."
    return f"El API rechazó la devolución: {detail}"


@tool
async def list_returns(
    auth_token: Annotated[str, InjectedState("auth_token")],
    customer_id: Optional[str] = None,
    invoice_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> str:
    """
    Lista las devoluciones registradas (notas crédito / mercancía devuelta),
    de la más reciente a la más vieja. Úsala para "¿qué devoluciones tiene
    Acme?", "¿cuánto nos devolvieron este mes?", "devoluciones de esa factura".

    Si el usuario es comercial solo ve las devoluciones de sus clientes.
    El customer_id se resuelve ANTES con search_customers; no inventes IDs.

    Args:
        customer_id: Filtra por cliente (opcional).
        invoice_id: Filtra por factura (opcional).
        date_from: Desde esta fecha, ISO 8601 (opcional).
        date_to: Hasta esta fecha, ISO 8601 (opcional).
    """
    try:
        client = NestJSClient(auth_token)
        params = {}
        if customer_id:
            params["customerId"] = customer_id
        if invoice_id:
            params["invoiceId"] = invoice_id
        if date_from:
            params["from"] = date_from
        if date_to:
            params["to"] = date_to
        data = await client.get("/returns", params=params or None)
        items = data if isinstance(data, list) else data.get("data", [])
        if not items:
            return "No hay devoluciones que coincidan con ese filtro."
        return json.dumps(
            {
                "devoluciones": [_row(r) for r in items[:MAX_ROWS]],
                "total": len(items),
            },
            ensure_ascii=False,
        )
    except NestJSAPIError as e:
        if e.status_code == 403:
            return "Este usuario no tiene permiso para consultar devoluciones."
        return f"Error al listar devoluciones: {e.detail}"
    except Exception as e:
        return f"Error inesperado al listar devoluciones: {str(e)}"


@tool
async def get_return(
    return_id: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
) -> str:
    """
    Detalle de UNA devolución: cliente, monto, motivo, notas y el pedido o
    factura de origen. Úsala para "¿de qué era esa devolución?", "muéstrame la
    devolución X" o para confirmar lo que se registró.

    El return_id sale de list_returns; no lo inventes.

    Args:
        return_id: ID de la devolución.
    """
    try:
        client = NestJSClient(auth_token)
        data = await client.get(f"/returns/{return_id}")
        payload = _row(data)
        payload["notas"] = data.get("notes")
        payload["factura_estado"] = (data.get("invoice") or {}).get("status")
        payload["registrada"] = data.get("createdAt")
        return json.dumps(payload, ensure_ascii=False)
    except NestJSAPIError as e:
        if e.status_code == 403:
            return "Este usuario no tiene permiso para consultar devoluciones."
        if e.status_code == 404:
            return "No encontré esa devolución. Verifica el ID con list_returns."
        return f"Error al consultar la devolución: {e.detail}"
    except Exception as e:
        return f"Error inesperado al consultar la devolución: {str(e)}"


@tool
async def create_return(
    customer_id: str,
    amount: float,
    reason: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
    order_id: Optional[str] = None,
    invoice_id: Optional[str] = None,
    return_date: Optional[str] = None,
    notes: Optional[str] = None,
) -> str:
    """
    Registra una devolución. Úsala cuando digan "me devolvieron 3 bultos",
    "hay que hacerle nota crédito a X", "el cliente devolvió mercancía".

    MUEVE INVENTARIO Y PLATA: si la atas a una factura, el API la registra como
    nota crédito, le baja el saldo a esa factura y puede cambiarle el estado.

    IMPORTANTE: antes de llamar esta herramienta DEBES, en este mismo turno:
    1. Identificar el cliente con search_customers y usar el id exacto que
       devuelve. Nunca reutilices ni inventes un customer_id de mensajes viejos.
    2. Ubicar el pedido o la factura de origen (get_customer_orders / las
       facturas del cliente) si el usuario los menciona.
    3. RESUMIRLE AL USUARIO lo que vas a registrar —cliente, pedido o factura de
       origen, qué productos y cuántos, motivo y monto en pesos— y ESPERAR su
       confirmación explícita. Nunca registres la devolución en el mismo mensaje
       en que recibiste los datos.

    El API guarda un MONTO, no items: convierte las cantidades a pesos con el
    usuario (o con get_price_for_customer) y deja el detalle de productos y
    cantidades escrito en `reason` o en `notes`.

    Si el monto supera el saldo pendiente de la factura, el API lo rechaza:
    explícalo y pide el monto correcto en vez de reintentar.

    Args:
        customer_id: ID del cliente (obligatorio).
        amount: Monto devuelto en pesos, mayor que 0 (obligatorio).
        reason: Motivo en texto libre, máx 500 caracteres. Es el campo donde
            queda el detalle: "3 bultos de X, producto averiado".
        order_id: ID del pedido de origen (opcional; debe ser del mismo cliente).
        invoice_id: ID de la factura a la que se le hace la nota crédito
            (opcional; debe ser del mismo cliente).
        return_date: Fecha de la devolución ISO 8601 (opcional; por defecto hoy).
        notes: Notas adicionales, máx 2000 caracteres (opcional).
    """
    # El API valida esto con class-validator; frenarlo aca evita un 400 y una
    # devolucion a medias.
    if not customer_id:
        return "Falta el cliente. Búscalo con search_customers y usa su id exacto."
    if amount is None or amount < 0.01:
        return f"Monto inválido '{amount}'. La devolución debe ser un monto en pesos mayor que 0."
    if not reason or not reason.strip():
        return "Falta el motivo de la devolución (por ejemplo: '3 bultos averiados')."
    if len(reason) > MAX_REASON:
        return f"El motivo es muy largo ({len(reason)} caracteres). Máximo {MAX_REASON}; pasa el detalle a notes."
    if notes and len(notes) > MAX_NOTES:
        return f"Las notas son muy largas ({len(notes)} caracteres). Máximo {MAX_NOTES}."

    payload = {"customerId": customer_id, "amount": amount, "reason": reason}
    if order_id:
        payload["orderId"] = order_id
    if invoice_id:
        payload["invoiceId"] = invoice_id
    if return_date:
        payload["returnDate"] = return_date
    if notes:
        payload["notes"] = notes

    try:
        client = NestJSClient(auth_token)
        created = await client.post("/returns", payload)
        return json.dumps(
            {"registrada": True, **_row(created)},
            ensure_ascii=False,
        )
    except NestJSAPIError as e:
        if e.status_code == 403:
            return "Este usuario no tiene permiso para registrar devoluciones."
        if e.status_code == 404:
            return (
                "El API no encontró el cliente, el pedido o la factura. NO le digas al "
                "usuario que no existen: vuelve a buscarlos (search_customers, "
                "get_customer_orders), toma los IDs exactos y reintenta."
            )
        if e.status_code == 400:
            return _explain_400(e.detail)
        return f"Error al registrar la devolución: {e.detail}"
    except Exception as e:
        return f"Error inesperado al registrar la devolución: {str(e)}"

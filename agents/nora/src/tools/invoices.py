"""Detalle de facturas y pagos (modulo /invoices del API). SOLO LECTURA.

get_cartera (analytics.py) da el panorama agregado: saldo total, aging y
mayores deudores. Estas tools bajan al detalle: que facturas concretas tiene un
cliente, cuales estan vencidas y por cuanto, y que pagos se le registraron.

El API ya acota por vendedor cuando el usuario es `comercial`
(customer.assignedToUserId = user.id), asi que estas tools no filtran por
vendedor. Crear facturas y registrar pagos es de roles de control: aqui no se
hace.
"""

import json
from datetime import date, datetime
from typing import Annotated, Optional

from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState

from .nestjs_client import NestJSClient, NestJSAPIError

MAX_ROWS = 15

# Enum InvoiceStatus del API (schema.prisma).
INVOICE_STATUSES = (
    "emitida",
    "enviada",
    "parcialmente_pagada",
    "pagada",
    "vencida",
    "anulada",
)

_SETTLED = ("pagada", "anulada")


def _num(value) -> float:
    """Los Decimal de Prisma llegan como string en el JSON; normalizalos."""
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return 0.0


def _balance(invoice: dict) -> float:
    """Saldo real: total - pagado - notas de credito (igual que el API)."""
    return round(
        _num(invoice.get("totalAmount"))
        - _num(invoice.get("totalPaid"))
        - _num(invoice.get("creditNoteTotal")),
        2,
    )


def _days_overdue(invoice: dict) -> Optional[int]:
    """Dias de mora si la factura sigue abierta y ya vencio; si no, None."""
    if invoice.get("status") in _SETTLED:
        return None
    raw = invoice.get("dueDate")
    if not raw:
        return None
    try:
        due = datetime.fromisoformat(str(raw).replace("Z", "+00:00")).date()
    except ValueError:
        return None
    days = (date.today() - due).days
    return days if days > 0 else None


def _row(invoice: dict) -> dict:
    row = {
        "id": invoice.get("id"),
        "factura": invoice.get("invoiceNumber"),
        "cliente": (invoice.get("customer") or {}).get("displayName"),
        "emitida": invoice.get("issueDate"),
        "vence": invoice.get("dueDate"),
        "total": _num(invoice.get("totalAmount")),
        "pagado": _num(invoice.get("totalPaid")),
        "saldo": _balance(invoice),
        "estado": invoice.get("status"),
    }
    mora = _days_overdue(invoice)
    if mora is not None:
        row["dias_mora"] = mora
    return row


def _pack(invoices: list, key: str = "facturas") -> str:
    rows = [_row(i) for i in invoices[:MAX_ROWS]]
    return json.dumps(
        {
            key: rows,
            "total_facturas": len(invoices),
            "saldo_total": round(sum(_balance(i) for i in invoices), 2),
            "truncado": len(invoices) > MAX_ROWS,
        },
        ensure_ascii=False,
    )


def _items(data) -> list:
    return data if isinstance(data, list) else (data.get("data") or [])


@tool
async def list_invoices(
    auth_token: Annotated[str, InjectedState("auth_token")],
    customer_id: Optional[str] = None,
    status: Optional[str] = None,
    company_id: Optional[str] = None,
    order_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    only_overdue: bool = False,
) -> str:
    """
    Facturas concretas, una por una: número, fechas, total, pagado, saldo y
    estado. Úsala para "¿qué le debe Acme?", "muéstrame las facturas de X",
    "¿qué facturé en junio?", "¿qué factura salió de ese pedido?".

    Para el panorama agregado (saldo total, aging, mayores deudores) usa
    get_cartera; esta tool es para bajar al detalle factura por factura.

    El customer_id se resuelve ANTES con search_customers; no inventes IDs.
    Los datos ya vienen filtrados al usuario actual (si es comercial, solo sus
    clientes).

    Args:
        customer_id: Filtra por cliente.
        status: emitida | enviada | parcialmente_pagada | pagada | vencida | anulada.
        company_id: Empresa que factura.
        order_id: Factura asociada a ese pedido.
        date_from: Fecha de emisión desde (YYYY-MM-DD).
        date_to: Fecha de emisión hasta (YYYY-MM-DD).
        only_overdue: True para dejar solo las vencidas sin pagar.
    """
    if status and status not in INVOICE_STATUSES:
        return (
            f"Estado inválido '{status}'. Usa uno de: {', '.join(INVOICE_STATUSES)}."
        )
    params = {
        "customerId": customer_id,
        "status": status,
        "companyId": company_id,
        "orderId": order_id,
        "from": date_from,
        "to": date_to,
    }
    params = {k: v for k, v in params.items() if v}
    if only_overdue:
        params["overdue"] = "true"
    try:
        client = NestJSClient(auth_token)
        data = await client.get("/invoices", params=params or None)
        invoices = _items(data)
        if not invoices:
            return "No hay facturas que coincidan con ese filtro."
        return _pack(invoices)
    except NestJSAPIError as e:
        if e.status_code == 403:
            return "Este usuario no tiene permiso para consultar facturas."
        return f"Error al listar facturas: {e.detail}"
    except Exception as e:
        return f"Error inesperado al listar facturas: {str(e)}"


@tool
async def get_invoice(
    invoice_id: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
) -> str:
    """
    Detalle de UNA factura: cliente, fechas, total, pagado, notas de crédito,
    saldo, estado, días de mora y sus pagos. Úsala para "¿ya pagó la factura
    X?", "¿cuánto queda de esa factura?", "¿de qué pedido salió?".

    El invoice_id se obtiene antes con list_invoices o list_overdue_invoices;
    no inventes IDs ni uses el número de factura como ID.

    Args:
        invoice_id: ID de la factura.
    """
    try:
        client = NestJSClient(auth_token)
        invoice = await client.get(f"/invoices/{invoice_id}")
        payments = invoice.get("payments") or []
        detail = {
            **_row(invoice),
            "notas_credito": _num(invoice.get("creditNoteTotal")),
            "empresa": (invoice.get("company") or {}).get("name"),
            "pedido": (invoice.get("order") or {}).get("orderNumber"),
            "notas": invoice.get("notes"),
            "pagos": [
                {
                    "fecha": p.get("paymentDate"),
                    "monto": _num(p.get("amount")),
                    "metodo": p.get("method"),
                    "referencia": p.get("reference"),
                }
                for p in payments[:MAX_ROWS]
            ],
            "total_pagos": len(payments),
        }
        return json.dumps(detail, ensure_ascii=False)
    except NestJSAPIError as e:
        if e.status_code == 403:
            return "Este usuario no tiene permiso para consultar esa factura."
        if e.status_code == 404:
            return "No encontré esa factura. Verifica el ID con list_invoices."
        return f"Error al consultar la factura: {e.detail}"
    except Exception as e:
        return f"Error inesperado al consultar la factura: {str(e)}"


@tool
async def list_overdue_invoices(
    auth_token: Annotated[str, InjectedState("auth_token")],
    customer_id: Optional[str] = None,
    min_dias_mora: Optional[int] = None,
) -> str:
    """
    Facturas vencidas y sin pagar, de la más antigua a la más reciente, con los
    días de mora y el saldo de cada una. Úsala para "¿cuáles facturas están
    vencidas?", "¿qué tiene vencido Acme?", "¿a quién hay que cobrarle?" y
    "clientes en mora" (lista TODAS las vencidas). Solo cuando el usuario dé
    un umbral explícito ("morosos de más de 30 días") pasa min_dias_mora=30.

    SOLO LECTURA: lista morosos, no envía mensajes ni hace cobros. Registrar
    pagos o anular facturas es de roles de control y no se hace aquí.

    Para el aging agregado de toda la cartera usa get_cartera; esta tool lista
    las facturas vencidas una por una.

    El customer_id se resuelve ANTES con search_customers; no inventes IDs. El
    endpoint no filtra por cliente ni por días de mora, así que esos filtros se
    aplican aquí sobre la lista completa que devuelve el API (GET
    /invoices/overdue no pagina: trae todas las vencidas del usuario actual,
    de la más antigua a la más reciente; el pack muestra 15 filas pero los
    totales cubren todo lo devuelto).

    min_dias_mora se usa SOLO cuando el usuario da un umbral explícito
    ("+30 días", "más de 60 días"): "clientes en mora" a secas lista TODAS
    las vencidas, sin este filtro.

    Args:
        customer_id: Deja solo las vencidas de ese cliente.
        min_dias_mora: Deja solo las vencidas con al menos esos días de mora
            (ej. 30 para "morosos +30 días"). 0 equivale a no filtrar;
            negativo es inválido y no toca el API.
    """
    if min_dias_mora is not None and min_dias_mora < 0:
        return "min_dias_mora debe ser 0 o más. Con 0 (o sin el parámetro) se listan todas las vencidas."
    try:
        client = NestJSClient(auth_token)
        # Endpoint: GET /invoices/overdue (NO ?overdue=true). Equivalencia
        # verificada en el API:
        # - controller L93-95 (@Get("overdue") -> getOverdueInvoices) vs L75-80
        #   (findAll acepta ListInvoicesDto.overdue?: "true", dto L36).
        # - service getOverdueInvoices L414-422: dueDate < now, status notIn
        #   [pagada, anulada], scoping comercial por assignedToUserId (L420)
        #   y orderBy dueDate ASC — el mismo where que buildWhere L446-448 +
        #   scoping L431 aplica para ?overdue=true. Se usa este endpoint porque
        #   su orden (vencida más antigua primero) es el contrato de la tool;
        #   ?overdue=true ordena por issueDate DESC (service L155) y ya lo
        #   reusa list_invoices(only_overdue=True).
        data = await client.get("/invoices/overdue")
        invoices = _items(data)
        if customer_id:
            invoices = [
                i
                for i in invoices
                if (i.get("customer") or {}).get("id") == customer_id
            ]
        if not invoices:
            return (
                "Ese cliente no tiene facturas vencidas."
                if customer_id
                else "No hay facturas vencidas."
            )
        if min_dias_mora:
            filtradas = [
                i
                for i in invoices
                if (_days_overdue(i) or 0) >= min_dias_mora
            ]
            if not filtradas:
                return (
                    f"Ese cliente no tiene facturas vencidas con más de {min_dias_mora} días de mora."
                    if customer_id
                    else f"No hay facturas vencidas con más de {min_dias_mora} días de mora."
                )
            invoices = filtradas
        return _pack(invoices, key="vencidas")
    except NestJSAPIError as e:
        if e.status_code == 403:
            return "Este usuario no tiene permiso para consultar facturas vencidas."
        return f"Error al listar las facturas vencidas: {e.detail}"
    except Exception as e:
        return f"Error inesperado al listar las facturas vencidas: {str(e)}"


@tool
async def get_invoice_payments(
    invoice_id: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
) -> str:
    """
    Pagos registrados contra una factura: fecha, monto, método, referencia y si
    tiene soporte adjunto. Úsala para "¿ya pagó la factura X?", "¿qué abonos
    tiene?", "¿con qué pagó?".

    El invoice_id se obtiene antes con list_invoices o list_overdue_invoices.
    Registrar pagos es de roles de control: esta tool solo consulta.

    Args:
        invoice_id: ID de la factura.
    """
    try:
        client = NestJSClient(auth_token)
        data = await client.get(f"/invoices/{invoice_id}/payments")
        payments = _items(data)
        if not payments:
            return "Esa factura no tiene pagos registrados."
        rows = [
            {
                "fecha": p.get("paymentDate"),
                "monto": _num(p.get("amount")),
                "metodo": p.get("method"),
                "referencia": p.get("reference"),
                "soportes": len(p.get("supports") or []),
            }
            for p in payments[:MAX_ROWS]
        ]
        return json.dumps(
            {
                "pagos": rows,
                "total_pagos": len(payments),
                "total_pagado": round(
                    sum(_num(p.get("amount")) for p in payments), 2
                ),
                "truncado": len(payments) > MAX_ROWS,
            },
            ensure_ascii=False,
        )
    except NestJSAPIError as e:
        if e.status_code == 403:
            return "Este usuario no tiene permiso para consultar los pagos de esa factura."
        if e.status_code == 404:
            return "No encontré esa factura. Verifica el ID con list_invoices."
        return f"Error al consultar los pagos: {e.detail}"
    except Exception as e:
        return f"Error inesperado al consultar los pagos: {str(e)}"

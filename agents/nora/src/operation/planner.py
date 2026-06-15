from datetime import date
from dataclasses import dataclass, field
import re
from typing import Any, Literal

from ..models.whatsapp_models import WhatsAppRouteRequest


PlannedIntent = Literal[
    "pedido",
    "consulta_pedidos",
    "consulta_cartera",
    "soporte_pago",
    "guia_logistica",
    "gasto",
    "agenda",
    "resumen_conversacion",
    "clasificacion",
]


ORDER_WORDS = ("pedido", "necesito", "cotizar", "bulto", "bultos", "tonelada", "kg")
STATUS_WORDS = ("estado", "pendiente", "despachado", "facturado", "factura")
CREDIT_WORDS = ("cupo", "cartera", "credito", "crédito", "debe", "saldo")
PAYMENT_WORDS = ("pago", "pagamos", "soporte", "comprobante", "transferencia")
LOGISTICS_WORDS = ("guia", "guía", "transportadora", "despacho", "transito", "tránsito")
EXPENSE_WORDS = ("gasto", "almuerzo", "hotel", "gasolina", "peaje", "parqueadero")
AGENDA_WORDS = ("agenda", "visita", "pendiente hoy", "tengo hoy")
SUMMARY_WORDS = ("resume", "resumen", "clasifica", "intencion", "intención")


@dataclass
class PlannedAction:
    domain: str
    action: str
    fields: dict[str, Any] = field(default_factory=dict)
    confidence: float = 0.75


@dataclass
class NoraPlan:
    intent: PlannedIntent
    actions: list[PlannedAction]
    summary: str


def plan_message(request: WhatsAppRouteRequest) -> NoraPlan:
    message = request.message.strip()
    normalized = message.lower()

    if any(word in normalized for word in PAYMENT_WORDS):
        return NoraPlan(
            intent="soporte_pago",
            actions=[
                PlannedAction(
                    domain="payments",
                    action="register_support_event",
                    fields={"customer_id": _customer_id(request), "notes": message},
                    confidence=0.82,
                )
            ],
            summary=f"Soporte o mensaje de pago recibido: {message}",
        )

    if any(word in normalized for word in LOGISTICS_WORDS):
        return NoraPlan(
            intent="guia_logistica",
            actions=[
                PlannedAction(
                    domain="logistics",
                    action="register_tracking_event",
                    fields={"notes": message},
                    confidence=0.78,
                )
            ],
            summary=f"Mensaje logistico recibido: {message}",
        )

    if any(word in normalized for word in CREDIT_WORDS):
        return NoraPlan(
            intent="consulta_cartera",
            actions=[
                PlannedAction(
                    domain="credit",
                    action="summary",
                    fields={"customer_id": _customer_id(request)},
                    confidence=0.8,
                )
            ],
            summary=f"Consulta de cupo o cartera: {message}",
        )

    if any(word in normalized for word in EXPENSE_WORDS):
        amount = _expense_amount(message)
        return NoraPlan(
            intent="gasto",
            actions=[
                PlannedAction(
                    domain="expenses",
                    action="create_expense_draft",
                    fields={
                        "expense_date": date.today().isoformat(),
                        "category": _expense_category(normalized),
                        "amount": amount,
                        "description": message,
                    },
                    confidence=0.72,
                )
            ],
            summary=f"Posible gasto comercial: {message}",
        )

    if any(word in normalized for word in AGENDA_WORDS):
        return NoraPlan(
            intent="agenda",
            actions=[PlannedAction(domain="visits", action="agenda", confidence=0.85)],
            summary=f"Consulta de agenda: {message}",
        )

    if any(word in normalized for word in SUMMARY_WORDS) and request.sender_type == "admin":
        return NoraPlan(
            intent="resumen_conversacion",
            actions=[
                PlannedAction(
                    domain="whatsapp",
                    action="summarize_conversation",
                    confidence=0.82,
                )
            ],
            summary=_conversation_summary(request),
        )

    if any(word in normalized for word in STATUS_WORDS):
        return NoraPlan(
            intent="consulta_pedidos",
            actions=[PlannedAction(domain="orders", action="status", confidence=0.78)],
            summary=f"Consulta relacionada con pedidos: {message}",
        )

    if any(word in normalized for word in ORDER_WORDS):
        return NoraPlan(
            intent="pedido",
            actions=[
                PlannedAction(
                    domain="orders",
                    action="create_draft",
                    fields={
                        "customer_id": _customer_id(request),
                        "company_id": _company_id(request, normalized),
                        "customer_zone_id": _customer_zone_id(request, normalized),
                        "items": [{"rawText": message}],
                        "notes": message,
                        "source_conversation_id": request.conversation_id,
                    },
                    confidence=0.82,
                )
            ],
            summary=_order_summary(request, message),
        )

    return NoraPlan(
        intent="clasificacion",
        actions=[],
        summary=f"Mensaje pendiente de clasificacion: {message}",
    )


def _customer_id(request: WhatsAppRouteRequest) -> str | None:
    if not request.customer:
        return None
    value = request.customer.get("id")
    return str(value) if value else None


def _company_id(request: WhatsAppRouteRequest, normalized_message: str) -> str | None:
    if len(request.companies) == 1:
        return request.companies[0].id

    for company in request.companies:
        candidates = [company.id, company.name or "", company.prefix or ""]
        if any(candidate and candidate.lower() in normalized_message for candidate in candidates):
            return company.id

    return None


def _customer_zone_id(request: WhatsAppRouteRequest, normalized_message: str) -> str | None:
    if len(request.customer_zones) == 1:
        return request.customer_zones[0].id

    for zone in request.customer_zones:
        if zone.name.lower() in normalized_message:
            return zone.id

    return None


def _order_summary(request: WhatsAppRouteRequest, message: str) -> str:
    customer_name = None
    if request.customer:
        customer_name = request.customer.get("displayName") or request.customer.get("legalName")
    prefix = f"{customer_name} solicita un pedido" if customer_name else "Solicitud de pedido"
    return f"{prefix}: {message}"


def _conversation_summary(request: WhatsAppRouteRequest) -> str:
    if not request.recent_messages:
        return "No hay mensajes recientes suficientes para resumir la conversacion."
    text = " ".join(message.body for message in request.recent_messages[-4:])
    return f"Resumen operativo de la conversacion: {text[:400]}"


def _expense_category(normalized_message: str) -> str:
    if "almuerzo" in normalized_message:
        return "alimentacion"
    if "hotel" in normalized_message:
        return "hospedaje"
    if "gasolina" in normalized_message:
        return "combustible"
    if "peaje" in normalized_message:
        return "peajes"
    return "otros"


def _expense_amount(message: str) -> int | None:
    match = re.search(r"(?:\$?\s*)(\d{1,3}(?:\.\d{3})+|\d{4,})", message)
    if not match:
        return None
    digits = match.group(1).replace(".", "")
    return int(digits)

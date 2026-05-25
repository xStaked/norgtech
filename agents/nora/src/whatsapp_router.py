from typing import Any

from .models.whatsapp_models import WhatsAppRouteRequest, WhatsAppRouteResponse


ORDER_WORDS = ("pedido", "necesito", "cotizar", "bulto", "bultos", "tonelada", "kg")
STATUS_WORDS = ("estado", "pendiente", "despachado", "facturado", "factura")


def route_whatsapp_message(payload: dict[str, Any] | WhatsAppRouteRequest) -> dict[str, Any]:
    request = (
        payload
        if isinstance(payload, WhatsAppRouteRequest)
        else WhatsAppRouteRequest.model_validate(payload)
    )
    message = request.message.strip()
    normalized_message = message.lower()
    mode = _mode_for_sender(request.sender_type)
    intent = _detect_intent(normalized_message)
    response = WhatsAppRouteResponse(
        mode=mode,
        intent=intent,
        summary=_summary_for(request, intent),
        suggested_reply=_suggested_reply_for(mode, intent),
        requires_human_review=True,
        proposed_order=_proposed_order_for(message, intent),
    )
    return response.model_dump()


def _mode_for_sender(sender_type: str) -> str:
    if sender_type in ("cliente", "desconocido"):
        return "cliente"
    if sender_type == "admin":
        return "admin"
    return "comercial"


def _detect_intent(normalized_message: str) -> str:
    if any(word in normalized_message for word in STATUS_WORDS):
        return "consulta_pedidos"
    if any(word in normalized_message for word in ORDER_WORDS):
        return "pedido"
    return "clasificar"


def _summary_for(request: WhatsAppRouteRequest, intent: str) -> str:
    customer_name = None
    if request.customer:
        customer_name = request.customer.get("displayName") or request.customer.get("legalName")

    if intent == "pedido":
        prefix = f"{customer_name} solicita un pedido" if customer_name else "Solicitud de pedido"
        return f"{prefix}: {request.message.strip()}"
    if intent == "consulta_pedidos":
        return f"Consulta relacionada con pedidos: {request.message.strip()}"
    return f"Mensaje pendiente de clasificacion: {request.message.strip()}"


def _suggested_reply_for(mode: str, intent: str) -> str:
    if intent == "pedido":
        return "Recibido. Voy a validar los datos del pedido y te confirmamos en breve."
    if intent == "consulta_pedidos":
        if mode == "cliente":
            return "Recibido. Voy a revisar el estado del pedido y te respondemos en breve."
        return "Voy a revisar tus pedidos pendientes y te comparto el resumen."
    return "Recibido. Voy a revisar tu mensaje y te confirmamos el siguiente paso."


def _proposed_order_for(message: str, intent: str) -> dict[str, Any] | None:
    if intent != "pedido":
        return None
    return {
        "source": "whatsapp",
        "rawMessage": message,
        "items": [],
    }

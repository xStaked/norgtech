from typing import Any

from .models.whatsapp_models import NoraProposal, WhatsAppRouteRequest, WhatsAppRouteResponse
from .operation.capabilities import get_capability
from .operation.planner import PlannedAction, plan_message
from .operation.validator import mode_for_sender, validate_plan


def route_whatsapp_message(payload: dict[str, Any] | WhatsAppRouteRequest) -> dict[str, Any]:
    request = (
        payload
        if isinstance(payload, WhatsAppRouteRequest)
        else WhatsAppRouteRequest.model_validate(payload)
    )
    mode = mode_for_sender(request.sender_type)

    if request.sender_type == "desconocido" and not request.customer and not request.contact:
        response = WhatsAppRouteResponse(
            mode=mode,
            intent="primer_contacto",
            summary=f"Numero no registrado inicia conversacion: {request.message.strip()}",
            suggested_reply=(
                "Hola, recibimos tu mensaje. Para ayudarte, por favor comparte tu nombre "
                "y la empresa o cliente que representas."
            ),
            requires_human_review=False,
            risk_level="medium",
            missing_fields=[],
            proposals=[],
        )
        return response.model_dump()

    plan = plan_message(request)
    validation = validate_plan(request, plan)

    if not validation.ok and validation.missing_fields:
        response = WhatsAppRouteResponse(
            mode=mode,
            intent="clarification",
            summary=plan.summary,
            suggested_reply=_clarification_for(validation.missing_fields, request),
            requires_human_review=False,
            risk_level=_risk_for(plan.actions),
            missing_fields=validation.missing_fields,
            proposals=[],
        )
        return response.model_dump()

    if not validation.ok:
        response = WhatsAppRouteResponse(
            mode=mode,
            intent="unsupported",
            summary=plan.summary,
            suggested_reply=validation.blocked_reason or "No puedo hacer esa accion desde Nora.",
            requires_human_review=True,
            risk_level="medium",
            missing_fields=[],
            blocked_reason=validation.blocked_reason,
            proposals=[],
        )
        return response.model_dump()

    proposals = [_proposal_for_action(action) for action in plan.actions]
    proposals = [proposal for proposal in proposals if proposal is not None]

    response = WhatsAppRouteResponse(
        mode=mode,
        intent=plan.intent,
        summary=plan.summary,
        suggested_reply=_suggested_reply_for(mode, plan.intent, request),
        requires_human_review=_requires_review(plan.actions),
        risk_level=_risk_for(plan.actions),
        missing_fields=[],
        proposals=proposals,
        proposed_order=_legacy_order_payload(proposals),
    )
    return response.model_dump()


def _proposal_for_action(action: PlannedAction) -> NoraProposal | None:
    if action.domain == "orders" and action.action == "create_draft":
        return NoraProposal(
            type="order_draft",
            title="Borrador de pedido",
            payload={
                "customerId": action.fields.get("customer_id"),
                "companyId": action.fields.get("company_id"),
                "customerZoneId": action.fields.get("customer_zone_id"),
                "items": action.fields.get("items", []),
                "notes": action.fields.get("notes"),
                "sourceConversationId": action.fields.get("source_conversation_id"),
                "approvalStatus": "en_revision",
            },
            requires_human_review=True,
        )

    if action.domain == "payments" and action.action == "register_support_event":
        return NoraProposal(
            type="payment_support",
            title="Soporte de pago para revision",
            payload={
                "customerId": action.fields.get("customer_id"),
                "notes": action.fields.get("notes"),
            },
            requires_human_review=True,
        )

    if action.domain == "logistics" and action.action == "register_tracking_event":
        return NoraProposal(
            type="logistics_event",
            title="Evento logistico para revision",
            payload={"notes": action.fields.get("notes")},
            requires_human_review=True,
        )

    if action.domain == "expenses" and action.action == "create_expense_draft":
        return NoraProposal(
            type="expense_draft",
            title="Gasto comercial para completar",
            payload={
                "expenseDate": action.fields.get("expense_date"),
                "category": action.fields.get("category"),
                "amount": action.fields.get("amount"),
                "description": action.fields.get("description"),
            },
            requires_human_review=True,
        )

    return None


def _requires_review(actions: list[PlannedAction]) -> bool:
    if not actions:
        return False
    for action in actions:
        capability = get_capability(action.domain, action.action)
        if capability is None or capability.requires_human_review:
            return True
    return False


def _risk_for(actions: list[PlannedAction]) -> str:
    ranking = {"low": 0, "medium": 1, "high": 2}
    risk = "low"
    for action in actions:
        capability = get_capability(action.domain, action.action)
        if capability and ranking[capability.risk_level] > ranking[risk]:
            risk = capability.risk_level
    return risk if actions else "medium"


def _legacy_order_payload(proposals: list[NoraProposal]) -> dict[str, Any] | None:
    for proposal in proposals:
        if proposal.type == "order_draft":
            payload = dict(proposal.payload)
            payload["source"] = "whatsapp"
            return payload
    return None


def _suggested_reply_for(
    mode: str,
    intent: str,
    request: WhatsAppRouteRequest | None = None,
) -> str:
    if intent == "pedido":
        return "Recibido. Voy a validar los datos del pedido y te confirmamos en breve."
    if intent == "consulta_pedidos":
        if mode == "cliente":
            return "Recibido. Voy a revisar el estado del pedido y te respondemos en breve."
        return "Voy a revisar tus pedidos pendientes y te comparto el resumen."
    if intent == "consulta_cartera":
        return "Voy a revisar la informacion de cupo y cartera disponible."
    if intent == "soporte_pago":
        return "Recibido el soporte. Lo dejamos para revision administrativa."
    if intent == "guia_logistica":
        return "Recibido. Dejamos la informacion logistica para revision."
    if intent == "agenda":
        return "Voy a revisar tu agenda y pendientes."
    if intent == "gasto":
        if request and _is_expense_support_question(request.message):
            return (
                "Si, puedes pasarme la foto del soporte. Si ahi no se ve el valor, "
                "tambien necesitare que me lo escribas para dejar el gasto listo."
            )
        return "Recibido. Voy a dejar el gasto listo para revision."
    if intent == "resumen_conversacion":
        return "Prepare un resumen operativo de esta conversacion."
    if intent == "clasificacion":
        if request and request.user and request.user.name:
            name = request.user.name.split()[0]
            if mode == "comercial":
                return (
                    f"¡Hola {name}! Puedo ayudarte a consultar pedidos, "
                    "revisar tu cartera, registrar gastos, consultar tu agenda, "
                    "o registrar soportes de pago. ¿En que puedo ayudarte?"
                )
            if mode == "admin":
                return (
                    f"¡Hola {name}! Puedo ayudarte a consultar pedidos, "
                    "revisar guias logisticas, procesar soportes de pago, "
                    "o hacer un resumen de conversacion. ¿En que puedo ayudarte?"
                )
        if request and request.customer:
            display = (
                request.customer.get("displayName")
                or request.customer.get("legalName")
                or ""
            )
            prefix = f"¡Hola {display}! " if display else "¡Hola! "
            return (
                f"{prefix}Recibimos tu mensaje. Puedo ayudarte a hacer pedidos, "
                "consultar el estado de tus pedidos, "
                "o registrar soportes de pago. ¿En que puedo ayudarte?"
            )
        return "¡Hola! ¿En que puedo ayudarte?"
    return "Recibido. Dejamos el mensaje pendiente de revision."


def _clarification_for(
    missing_fields: list[str],
    request: WhatsAppRouteRequest | None = None,
) -> str:
    if "company_id" in missing_fields:
        return "Para preparar el pedido, dime por cual empresa debe salir."
    if "customer_zone_id" in missing_fields:
        return "Para preparar el pedido, dime la zona o sede de despacho."
    if "amount" in missing_fields:
        if request and _is_expense_support_message(request.message):
            return (
                "Recibi la foto del soporte. Necesito tambien el valor del gasto "
                "para dejarlo listo."
            )
        return "Necesito el valor del gasto para dejarlo registrado."
    if "customer_id" in missing_fields:
        return "Necesito identificar el cliente antes de continuar."
    if "items" in missing_fields:
        return "Dime que productos y cantidades necesita el pedido."
    return "Me falta un dato para continuar. Puedes confirmarme la informacion faltante?"


def _is_expense_support_question(message: str) -> bool:
    normalized = message.strip().lower()
    return "foto" in normalized or "imagen" in normalized or "soporte" in normalized


def _is_expense_support_message(message: str) -> bool:
    normalized = message.strip().lower()
    return normalized in ("[imagen]", "[documento]") or _is_expense_support_question(normalized)

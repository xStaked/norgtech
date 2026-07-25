import re
from datetime import date
from .visit_parsing import resolve_visit_datetime
from typing import Any

from .models.whatsapp_models import (
    NoraCaseTransition,
    NoraOrderCandidate,
    NoraOrderCandidateItem,
    NoraProposal,
    WhatsAppRouteRequest,
    WhatsAppRouteResponse,
)
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
                "Hola, recibimos tu mensaje. Para identificarte, por favor envianos "
                "tu nombre y el NIT de tu empresa."
            ),
            requires_human_review=False,
            risk_level="medium",
            missing_fields=[],
            proposals=[],
            case_transition=None,
        )
        return response.model_dump()

    plan = plan_message(request)
    case_transition = _case_transition_for(request, plan)
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
            case_transition=case_transition,
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
            case_transition=case_transition,
        )
        return response.model_dump()

    proposals = [_proposal_for_action(action) for action in plan.actions]
    proposals = [proposal for proposal in proposals if proposal is not None]
    is_order_confirmation_turn = bool(
        request.open_case
        and request.open_case.type == "order"
        and request.open_case.status == "ready_for_review"
    )
    order_candidate = (
        next(
            (
                candidate
                for candidate in (
                    _order_candidate_for_action(action) for action in plan.actions
                )
                if candidate is not None
            ),
            None,
        )
        if is_order_confirmation_turn
        else None
    )

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
        order_candidate=order_candidate,
        case_transition=case_transition,
    )
    return response.model_dump()


def _proposal_for_action(action: PlannedAction) -> NoraProposal | None:
    if action.domain == "orders" and action.action in (
        "create_draft",
        "resolve_and_create_from_whatsapp",
    ):
        items = [
            {
                "productRef": item.get("product_ref"),
                "quantity": item.get("quantity"),
                "presentation": item.get("presentation"),
                "notes": item.get("notes"),
            }
            for item in action.fields.get("items", [])
        ]
        return NoraProposal(
            type="order_draft",
            title="Borrador de pedido",
            payload={
                "customerId": action.fields.get("customer_id"),
                "companyId": action.fields.get("company_id"),
                "companyRef": action.fields.get("company_ref"),
                "customerZoneId": action.fields.get("customer_zone_id"),
                "zoneRef": action.fields.get("zone_ref"),
                "items": items,
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


def _order_candidate_for_action(action: PlannedAction) -> NoraOrderCandidate | None:
    if action.domain != "orders" or action.action != "resolve_and_create_from_whatsapp":
        return None
    items = [
        NoraOrderCandidateItem(
            productRef=str(item.get("product_ref") or item.get("productRef")),
            quantity=float(item["quantity"]),
            presentation=item.get("presentation"),
            notes=item.get("notes"),
        )
        for item in action.fields.get("items", [])
        if (item.get("product_ref") or item.get("productRef")) and item.get("quantity") is not None
    ]
    return NoraOrderCandidate(
        customerId=action.fields.get("customer_id"),
        customerRef=action.fields.get("customer_ref"),
        companyRef=action.fields.get("company_ref"),
        customerZoneId=action.fields.get("customer_zone_id"),
        zoneRef=action.fields.get("zone_ref"),
        items=items,
        notes=action.fields.get("notes"),
        sourceConversationId=action.fields.get("source_conversation_id"),
    )


def _requires_review(actions: list[PlannedAction]) -> bool:
    if not actions:
        return False
    for action in actions:
        capability = get_capability(action.domain, action.action)
        if capability is None or capability.requires_human_review:
            return True
    return False


def _case_transition_for(
    request: WhatsAppRouteRequest,
    plan: Any,
) -> NoraCaseTransition | None:
    if request.open_case and request.open_case.type == "visit":
        extracted = _extract_visit_fields(request.message)
        merged = {**(request.open_case.extractedData or {}), **extracted}
        missing = _visit_missing_fields(merged)
        return NoraCaseTransition(
            action="update_case",
            caseId=request.open_case.id,
            type="visit",
            extractedData=extracted,
            missingFields=missing,
            lastQuestion=_visit_question(missing, merged),
        )

    if request.open_case and request.open_case.type == "new_customer":
        extracted = _extract_new_customer_fields(request.message)
        merged = {**(request.open_case.extractedData or {}), **extracted}
        missing = _new_customer_missing_fields(merged)
        return NoraCaseTransition(
            action="update_case",
            caseId=request.open_case.id,
            type="new_customer",
            extractedData=extracted,
            missingFields=missing,
            lastQuestion=_new_customer_question(missing),
        )

    if (
        request.open_case
        and request.open_case.type == "order"
        and plan.intent == "continuar_caso"
        and "customerRef" in (request.open_case.missingFields or [])
    ):
        return NoraCaseTransition(
            action="update_case",
            caseId=request.open_case.id,
            type="order",
            extractedData={"customerRef": request.message.strip()},
            missingFields=[],
            lastQuestion=(
                "Gracias. ¿Confirmas el pedido para ese cliente? "
                "(responde 'sí' para crearlo)"
            ),
        )

    if (
        request.open_case
        and request.open_case.type == "order"
        and plan.intent == "continuar_caso"
    ):
        return NoraCaseTransition(
            action="create_new_customer_subcase",
            caseId=request.open_case.id,
            type="new_customer",
            missingFields=["displayName", "contactName"],
            lastQuestion=(
                "Listo. Para dejar la propuesta de cliente nuevo, dime la razon social "
                "o nombre comercial."
            ),
        )

    if (
        request.open_case
        and request.open_case.type == "expense"
        and plan.intent == "continuar_caso"
    ):
        return NoraCaseTransition(
            action="update_case",
            caseId=request.open_case.id,
            type="expense",
            missingFields=request.open_case.missingFields,
            lastQuestion=_expense_continuation_reply(request.open_case),
        )

    if request.sender_type == "comercial" and plan.intent == "gasto" and request.media:
        return NoraCaseTransition(
            action="start_case",
            type="expense",
            missingFields=["amount", "expenseDate", "category", "description"],
            lastQuestion=(
                "Recibi el soporte. Voy a extraer los datos; si falta cliente o valor, "
                "te lo pido enseguida."
            ),
        )

    if request.sender_type == "comercial" and plan.intent == "gasto" and not request.open_case:
        return NoraCaseTransition(
            action="start_case",
            type="expense",
            extractedData={
                "description": request.message,
            },
            missingFields=["amount"],
            lastQuestion="Listo. Dime el valor del gasto y el cliente o visita a asociar.",
        )

    # An explicit "crear cliente" starts a new-customer case even if an unrelated
    # case (e.g. a stale expense) is still open. plan_message only emits
    # crear_cliente when not continuing a new_customer case, so this never
    # collides with one in progress.
    if plan.intent == "crear_cliente" and not (
        request.open_case and request.open_case.type == "new_customer"
    ):
        extracted = _extract_new_customer_fields(request.message)
        missing = _new_customer_missing_fields(extracted)
        return NoraCaseTransition(
            action="start_case",
            type="new_customer",
            extractedData=extracted,
            missingFields=missing,
            lastQuestion=_new_customer_question(missing),
        )

    # Same rule for visits: an explicit "crear/registrar visita" starts a fresh
    # visit case regardless of an unrelated open case (crear_visita is never
    # emitted while a visit case is already in progress).
    if plan.intent == "crear_visita" and not (
        request.open_case and request.open_case.type == "visit"
    ):
        extracted = _extract_visit_fields(request.message)
        missing = _visit_missing_fields(extracted)
        return NoraCaseTransition(
            action="start_case",
            type="visit",
            extractedData=extracted,
            missingFields=missing,
            lastQuestion=_visit_question(missing, extracted),
        )

    if (
        plan.intent == "pedido"
        and not (request.open_case and request.open_case.type == "order")
    ):
        order_action = next(
            (
                action
                for action in plan.actions
                if action.domain == "orders"
                and action.action == "resolve_and_create_from_whatsapp"
            ),
            None,
        )
        if order_action and order_action.fields.get("items"):
            return NoraCaseTransition(
                action="start_case",
                type="order",
                extractedData={
                    "customerId": order_action.fields.get("customer_id"),
                    "companyRef": order_action.fields.get("company_ref"),
                    "companyId": order_action.fields.get("company_id"),
                    "customerZoneId": order_action.fields.get("customer_zone_id"),
                    "zoneRef": order_action.fields.get("zone_ref"),
                    "items": order_action.fields.get("items", []),
                    "notes": order_action.fields.get("notes"),
                },
                missingFields=(
                    []
                    if order_action.fields.get("customer_id")
                    else ["customerRef"]
                ),
                lastQuestion=(
                    _order_confirmation_question(order_action)
                    if order_action.fields.get("customer_id")
                    else "¿Para qué cliente es el pedido? Dime el nombre o NIT."
                ),
            )

    return None


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
    if intent == "continuar_caso":
        if request and request.open_case and request.open_case.type == "new_customer":
            extracted = {
                **(request.open_case.extractedData or {}),
                **_extract_new_customer_fields(request.message),
            }
            return _new_customer_question(_new_customer_missing_fields(extracted))
        if (
            request
            and request.open_case
            and request.open_case.type == "order"
            and "customerRef" in (request.open_case.missingFields or [])
        ):
            return (
                "Gracias. ¿Confirmas el pedido para ese cliente? "
                "(responde 'sí' para crearlo)"
            )
        if request and request.open_case and request.open_case.type == "expense":
            return _expense_continuation_reply(request.open_case)
        if request and request.open_case and request.open_case.type == "visit":
            extracted = {
                **(request.open_case.extractedData or {}),
                **_extract_visit_fields(request.message),
            }
            return _visit_question(_visit_missing_fields(extracted), extracted)
        return (
            "Listo. Para dejar la propuesta de cliente nuevo, dime la razon social "
            "o nombre comercial."
        )
    if intent == "crear_cliente":
        extracted = _extract_new_customer_fields(request.message) if request else {}
        return _new_customer_question(_new_customer_missing_fields(extracted))
    if intent == "crear_visita":
        extracted = _extract_visit_fields(request.message) if request else {}
        return _visit_question(_visit_missing_fields(extracted), extracted)
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
        if request and request.media:
            return (
                "Recibi el soporte. Voy a extraer los datos; si falta cliente o valor, "
                "te lo pido enseguida."
            )
        if request and _is_expense_support_question(request.message):
            return (
                "Si, puedes pasarme la foto del soporte. Si ahi no se ve el valor, "
                "tambien necesitare que me lo escribas para dejar el gasto listo."
            )
        if request and not request.open_case:
            return "Listo. Dime el valor del gasto y el cliente o visita a asociar."
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
    if "company_id" in missing_fields or "company_ref" in missing_fields:
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
        return "Dime que productos y que cantidad necesita el pedido."
    return "Me falta un dato para continuar. Puedes confirmarme la informacion faltante?"


_EXPENSE_FIELD_LABELS = {
    "amount": "el valor del gasto",
    "expenseDate": "la fecha",
    "category": "la categoria",
    "description": "la descripcion",
}


def _format_cop(amount: float) -> str:
    return "$" + f"{int(round(amount)):,}".replace(",", ".")


def _join_expense_fields(fields: list[str]) -> str:
    readable = [_EXPENSE_FIELD_LABELS.get(field, field) for field in fields]
    if len(readable) == 1:
        return readable[0]
    return f"{', '.join(readable[:-1])} y {readable[-1]}"


def _expense_continuation_reply(open_case: Any) -> str:
    """Build Nora's reply when continuing an open expense case.

    Reads the case's actual extractedData/missingFields instead of asking for
    the value unconditionally, so once the OCR has read the support image Nora
    acknowledges the value it already has rather than re-asking for it.
    """
    extracted = open_case.extractedData or {}
    missing = open_case.missingFields or []

    amount = extracted.get("amount")
    has_amount = amount is not None and "amount" not in missing
    if not has_amount:
        # Value still unknown: keep asking for it (and the association).
        return "Necesito el valor del gasto y el cliente o visita a asociar."

    value_phrase = (
        f"Ya tengo el valor del gasto ({_format_cop(amount)})"
        if isinstance(amount, (int, float))
        else "Ya tengo el valor del gasto"
    )

    other_missing = [field for field in missing if field != "amount"]
    if other_missing:
        return (
            f"{value_phrase}. Me falta {_join_expense_fields(other_missing)} "
            "y el cliente o visita a asociar."
        )

    # All required fields captured: gasto is ready, only the optional
    # customer/visit association remains.
    return (
        f"{value_phrase} y los datos del soporte. El gasto quedo listo para "
        "revision; si quieres lo asocio a un cliente o visita, dime cual."
    )


def _is_expense_support_question(message: str) -> bool:
    normalized = message.strip().lower()
    return "foto" in normalized or "imagen" in normalized or "soporte" in normalized


def _is_expense_support_message(message: str) -> bool:
    normalized = message.strip().lower()
    return normalized in ("[imagen]", "[documento]") or _is_expense_support_question(normalized)


def _order_confirmation_question(action: PlannedAction) -> str:
    lines = []
    for item in action.fields.get("items", []):
        qty = item.get("quantity")
        ref = item.get("product_ref") or item.get("productRef")
        lines.append(f"- {qty} x {ref}")
    detail = "\n".join(lines)
    return f"Voy a registrar este pedido:\n{detail}\n¿Confirmas el pedido? (responde 'sí' para crearlo)"


def _extract_new_customer_fields(message: str) -> dict[str, Any]:
    fields: dict[str, Any] = {}
    name = _field_value(message, ("nombre", "razon social", "razón social", "cliente"))
    tax_id = _field_value(message, ("nit", "tax id"))
    city = _field_value(message, ("ciudad",))
    phone = _field_value(message, ("telefono", "teléfono", "celular"))

    if not phone and not re.search(r"(?im)^\s*(?:nit|tax id)\s*:", message):
        phone_match = re.search(r"\b(?:\+?\d[\d\s().-]{6,}\d)\b", message)
        if phone_match:
            phone = re.sub(r"\D+", "", phone_match.group(0))
    if not city and phone:
        without_phone = re.sub(re.escape(phone), " ", message)
        without_phone = re.sub(r"\b(?:telefono|teléfono|celular|ciudad)\b\s*:?", " ", without_phone, flags=re.IGNORECASE)
        without_phone = re.sub(r"\b(?:y|e)\b", " ", without_phone, flags=re.IGNORECASE)
        candidate = re.sub(r"[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s.-]", " ", without_phone)
        candidate = re.sub(r"\s+", " ", candidate).strip(" .-")
        if candidate and not re.search(r"\b(?:nombre|nit|crear|cliente)\b", candidate, flags=re.IGNORECASE):
            city = candidate

    # Optional, prompt-but-don't-block fields (AI-05). Only labeled forms are
    # captured so the required-field heuristics above stay unaffected; a user
    # who never provides them can still create the customer.
    email = _field_value(message, ("correo", "email", "e-mail", "e mail"))
    address = _field_value(message, ("direccion", "dirección"))
    department = _field_value(message, ("departamento",))
    notes = _field_value(message, ("notas", "nota", "observaciones", "observacion", "observación"))

    if name:
        fields["legalName"] = name
        fields["displayName"] = name
    if tax_id:
        fields["taxId"] = tax_id
    if city:
        fields["city"] = city
    if phone:
        fields["phone"] = phone
    if email:
        fields["email"] = email
    if address:
        fields["address"] = address
    if department:
        fields["department"] = department
    if notes:
        fields["notes"] = notes

    return fields


def _field_value(message: str, labels: tuple[str, ...]) -> str | None:
    for label in labels:
        pattern = rf"(?im)^\s*{label}\s*:\s*(.+?)\s*$"
        match = re.search(pattern, message)
        if match:
            return match.group(1).strip()
    return None


# AI-05: required fields hard-gate creation; optional fields are prompted but
# must NOT block creation ("no tengo correo" still creates). Both lists are
# mirrored in nora-routing.service.ts (newCustomerRequiredFields / the subcase
# missingFields seed) — keep them in sync.
_NEW_CUSTOMER_REQUIRED_FIELDS = ("displayName", "taxId", "city", "phone")
_NEW_CUSTOMER_OPTIONAL_FIELDS = ("email", "address", "department", "notes")


def _new_customer_missing_required(extracted: dict[str, Any]) -> list[str]:
    missing = []
    if not (extracted.get("legalName") or extracted.get("displayName")):
        missing.append("displayName")
    if not extracted.get("taxId"):
        missing.append("taxId")
    if not extracted.get("city"):
        missing.append("city")
    if not extracted.get("phone"):
        missing.append("phone")
    return missing


def _new_customer_missing_fields(extracted: dict[str, Any]) -> list[str]:
    # Required first (hard gate), then the optional fields Nora still asks for.
    missing = _new_customer_missing_required(extracted)
    missing += [field for field in _NEW_CUSTOMER_OPTIONAL_FIELDS if not extracted.get(field)]
    return missing


def _new_customer_ready(extracted: dict[str, Any]) -> bool:
    """True once every REQUIRED field is present, regardless of optional gaps."""
    return not _new_customer_missing_required(extracted)


def _new_customer_question(missing: list[str]) -> str:
    required_missing = [field for field in missing if field in _NEW_CUSTOMER_REQUIRED_FIELDS]
    if not required_missing:
        # Required data complete -> ready to create. Optional fields are asked
        # for but never block: the user can create with what we have.
        if missing:
            return (
                "Listo, con eso ya puedo crear el cliente. Si tienes correo, dirección, "
                "departamento o notas, pásamelos; si no, dime 'créalo' y lo registro así."
            )
        return "Listo, ya tengo los datos. Voy a crear el cliente y te confirmo."
    if "displayName" in required_missing and "taxId" in required_missing:
        return "Claro. Envíame el nombre o razón social y el NIT del cliente."
    if "displayName" in required_missing:
        return "Me falta el nombre o razón social del cliente."
    if "taxId" in required_missing:
        return "Me falta el NIT del cliente."
    if "city" in required_missing and "phone" in required_missing:
        return "Perfecto. Ahora envíame la ciudad y el teléfono de contacto."
    if "city" in required_missing:
        return "Me falta la ciudad del cliente."
    if "phone" in required_missing:
        return "Me falta el teléfono de contacto del cliente."
    return "Me falta un dato del cliente para continuar."


_VISIT_MONTHS = {
    "enero": 1,
    "febrero": 2,
    "marzo": 3,
    "abril": 4,
    "mayo": 5,
    "junio": 6,
    "julio": 7,
    "agosto": 8,
    "septiembre": 9,
    "setiembre": 9,
    "octubre": 10,
    "noviembre": 11,
    "diciembre": 12,
}


def _extract_visit_fields(message: str) -> dict[str, Any]:
    fields: dict[str, Any] = {}
    customer_ref = _visit_customer_ref(message)
    scheduled_at = _visit_datetime(message)
    summary = _visit_summary(message)

    if customer_ref:
        fields["customerRef"] = customer_ref
        fields.pop("customerId", None)
    if scheduled_at:
        fields["scheduledAt"] = scheduled_at
    if summary:
        fields["summary"] = summary

    return fields


def _visit_customer_ref(message: str) -> str | None:
    patterns = (
        r"\bpara\s+(.+?)\s+(?:los\s+voy\s+a\s+visitar|voy\s+a\s+visitarlos|el\s+\d{1,2}\s+de\s+)",
        r"\bcliente\s*:?\s*(.+?)(?:\n|,|$)",
        r"\b(?:con|a)\s+([A-ZÁÉÍÓÚÜÑ][\wÁÉÍÓÚÜÑáéíóúüñ .&-]+?)(?:\s+el\s+\d{1,2}\s+de\s+|\n|,|$)",
    )
    for pattern in patterns:
        match = re.search(pattern, message, flags=re.IGNORECASE)
        if match:
            candidate = re.sub(r"\s+", " ", match.group(1)).strip(" .,-")
            if candidate and not _is_visit_generic_customer_ref(candidate) and not _looks_like_visit_command(candidate):
                return candidate

    stripped = re.sub(r"\s+", " ", message).strip(" .,-")
    if (
        2 <= len(stripped.split()) <= 6
        and not re.search(r"\b(?:visita|visitar|fecha|hora|seguimiento|producto|crear|registrar)\b", stripped, flags=re.IGNORECASE)
        and not _is_confirmation_message(stripped)
    ):
        return stripped
    return None


def _is_visit_generic_customer_ref(value: str) -> bool:
    return _normalize_for_visit(value) in {"ese cliente", "este cliente", "el cliente", "la empresa"}


def _looks_like_visit_command(value: str) -> bool:
    return bool(
        re.search(
            r"\b(?:crear|registrar|programar|agendar|visita|visitarlos|visitar)\b",
            value,
            flags=re.IGNORECASE,
        )
    )


def _visit_datetime(message: str) -> str | None:
    # AI-07: parser compartido (src/visit_parsing.py). Ademas de "DD de <mes>"
    # ahora entiende hoy/manana/pasado manana/dia-de-semana + horas sueltas,
    # resueltas contra el dia de HOY EN COLOMBIA (no la zona del proceso).
    return resolve_visit_datetime(message)


def _visit_summary(message: str) -> str | None:
    matches = re.findall(
        r"(?:es una|sera una|será una|visita de)\s+(.+?)(?:\n|$)",
        message,
        flags=re.IGNORECASE,
    )
    if matches:
        summary = re.sub(r"\s+", " ", matches[-1]).strip(" .")
        if summary.lower().startswith("visita"):
            return summary[:1].upper() + summary[1:]
        return f"Visita {summary}"
    if "seguimiento" in message.lower():
        return "Visita de seguimiento"
    return None


def _visit_missing_fields(extracted: dict[str, Any]) -> list[str]:
    missing = []
    if not (extracted.get("customerId") or extracted.get("customerRef")):
        missing.append("customerRef")
    if not extracted.get("scheduledAt"):
        missing.append("scheduledAt")
    if not extracted.get("summary"):
        missing.append("summary")
    return missing


def _visit_question(missing: list[str], extracted: dict[str, Any]) -> str:
    if missing == ["customerRef", "scheduledAt", "summary"]:
        return "Claro. Para crear la visita, dime el cliente, la fecha y hora, y una breve descripción."
    if "customerRef" in missing:
        return "Me falta el cliente de la visita. Puedes decirme el nombre o NIT."
    if "scheduledAt" in missing:
        return "Me falta la fecha y hora de la visita."
    if "summary" in missing:
        return "Me falta una breve descripción de la visita."
    customer_ref = extracted.get("customerRef") or "ese cliente"
    return (
        f"Voy a validar coincidencias para {customer_ref}. "
        "Antes de crear la visita te pido confirmación del cliente y los datos."
    )


def _is_confirmation_message(message: str) -> bool:
    return _normalize_for_visit(message) in {
        "si",
        "sí",
        "ok",
        "okay",
        "okey",
        "dale",
        "listo",
        "confirmo",
        "correcto",
        "perfecto",
        "de acuerdo",
    }


def _normalize_for_visit(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())

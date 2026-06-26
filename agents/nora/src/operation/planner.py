from datetime import date
from dataclasses import dataclass, field
import re
import unicodedata
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
    "crear_cliente",
    "continuar_caso",
    "clasificacion",
]


ORDER_WORDS = ("pedido", "necesito", "cotizar", "bulto", "bultos", "tonelada", "kg")
CONFIRM_WORDS = (
    "si",
    "sí",
    "confirmo",
    "confirmar",
    "dale",
    "ok",
    "okay",
    "listo",
    "de acuerdo",
    "correcto",
    "perfecto",
    "asi es",
)
STATUS_WORDS = ("estado", "pendiente", "despachado", "facturado", "factura")
CREDIT_WORDS = ("cupo", "cartera", "credito", "crédito", "debe", "saldo")
PAYMENT_WORDS = ("pago", "pagamos", "soporte", "comprobante", "transferencia")
LOGISTICS_WORDS = ("guia", "guía", "transportadora", "despacho", "transito", "tránsito")
EXPENSE_WORDS = ("gasto", "almuerzo", "hotel", "gasolina", "peaje", "parqueadero")
AGENDA_WORDS = ("agenda", "visita", "pendiente hoy", "tengo hoy")
SUMMARY_WORDS = ("resume", "resumen", "clasifica", "intencion", "intención")
SUPPORT_MEDIA_WORDS = ("foto", "imagen", "documento", "archivo", "factura", "recibo")


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


def _is_order_confirmation(normalized_message: str) -> bool:
    normalized = _normalize_phrase(normalized_message)
    return any(normalized == _normalize_phrase(word) for word in CONFIRM_WORDS) or any(
        word in normalized for word in ("si confirmo", "confirmo el pedido", "confirmo")
    )


def plan_message(request: WhatsAppRouteRequest) -> NoraPlan:
    message = request.message.strip()
    normalized = message.lower()
    normalized_context = _recent_context(request)

    if (
        request.open_case
        and request.open_case.type == "order"
        and request.open_case.status == "ready_for_review"
        and _is_order_confirmation(normalized)
    ):
        extracted = request.open_case.extractedData or {}
        return NoraPlan(
            intent="pedido",
            actions=[
                PlannedAction(
                    domain="orders",
                    action="resolve_and_create_from_whatsapp",
                    fields={
                        "customer_id": extracted.get("customerId") or _customer_id(request),
                        "company_ref": extracted.get("companyRef"),
                        "company_id": extracted.get("companyId"),
                        "customer_zone_id": extracted.get("customerZoneId"),
                        "zone_ref": extracted.get("zoneRef"),
                        "customer_ref": extracted.get("customerRef"),
                        "items": extracted.get("items", []),
                        "notes": extracted.get("notes"),
                        "source_conversation_id": request.conversation_id,
                    },
                    confidence=0.9,
                )
            ],
            summary="Confirmacion de pedido recibida; se procede a crear.",
        )

    if (
        request.open_case
        and request.open_case.type == "order"
        and "customerRef" in (request.open_case.missingFields or [])
        and not _is_order_confirmation(normalized)
    ):
        return NoraPlan(
            intent="continuar_caso",
            actions=[],
            summary="El comercial indica el cliente del pedido en curso.",
        )

    if request.open_case and request.open_case.type == "order" and _wants_new_customer(normalized):
        return NoraPlan(
            intent="continuar_caso",
            actions=[],
            summary="El usuario quiere crear una propuesta de cliente nuevo para continuar el pedido.",
        )

    if request.open_case and request.open_case.type == "new_customer":
        return NoraPlan(
            intent="continuar_caso",
            actions=[],
            summary="El usuario continua la creacion de un cliente nuevo.",
        )

    if (
        request.sender_type == "comercial"
        and request.open_case
        and request.open_case.type == "expense"
        and _is_expense_case_continuation(normalized)
    ):
        return NoraPlan(
            intent="continuar_caso",
            actions=[],
            summary="El usuario continua un caso de gasto abierto.",
        )

    if request.sender_type == "comercial" and _is_inbound_media(request, normalized):
        return NoraPlan(
            intent="gasto",
            actions=[],
            summary="Soporte de gasto recibido por WhatsApp.",
        )

    if request.sender_type == "comercial" and _is_expense_media_follow_up(
        normalized,
        normalized_context,
    ):
        if _is_media_placeholder(normalized):
            return NoraPlan(
                intent="gasto",
                actions=[
                    PlannedAction(
                        domain="expenses",
                        action="create_expense_draft",
                        fields={
                            "expense_date": date.today().isoformat(),
                            "category": "otros",
                            "amount": None,
                            "description": "Soporte de gasto recibido por WhatsApp",
                        },
                        confidence=0.72,
                    )
                ],
                summary="Soporte de gasto recibido por WhatsApp",
            )

        return NoraPlan(
            intent="gasto",
            actions=[],
            summary=f"Pregunta sobre soporte de gasto: {message}",
        )

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

    if request.sender_type == "comercial" and _starts_expense_form(normalized):
        return NoraPlan(
            intent="gasto",
            actions=[],
            summary=f"Inicio conversacional de gasto comercial: {message}",
        )

    if request.sender_type in ("comercial", "admin") and _starts_new_customer_flow(normalized):
        return NoraPlan(
            intent="crear_cliente",
            actions=[],
            summary=f"Inicio conversacional de cliente nuevo: {message}",
        )

    if any(word in normalized for word in EXPENSE_WORDS) or (
        _phrase_matches(normalized, "factura")
        and request.sender_type in ("comercial", "admin")
    ):
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
        quantity, presentation = _quantity_and_presentation(message)
        product_ref = _product_ref(message, quantity, presentation)
        items = []
        if product_ref and quantity is not None:
            items.append(
                {
                    "product_ref": product_ref,
                    "quantity": quantity,
                    "presentation": presentation,
                    "notes": message,
                }
            )
        return NoraPlan(
            intent="pedido",
            actions=[
                PlannedAction(
                    domain="orders",
                    action="resolve_and_create_from_whatsapp",
                    fields={
                        "customer_id": _customer_id(request),
                        "company_ref": _company_ref(request, normalized),
                        "company_id": _company_id(request, normalized),
                        "customer_zone_id": _customer_zone_id(request, normalized),
                        "zone_ref": _zone_ref(request, normalized),
                        "items": items,
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


def _quantity_and_presentation(message: str) -> tuple[float | None, str | None]:
    match = re.search(
        r"(?P<quantity>\d+(?:[.,]\d+)?)\s*(?P<presentation>bultos?|kg|kilos?|toneladas?|unidades?)?",
        message,
        flags=re.IGNORECASE,
    )
    if not match:
        return None, None
    quantity = float(match.group("quantity").replace(",", "."))
    presentation = match.group("presentation")
    return quantity, presentation.lower() if presentation else None


def _product_ref(message: str, quantity: float | None, presentation: str | None) -> str | None:
    cleaned = message.strip()
    if quantity is not None:
        cleaned = re.sub(
            r"\b\d+(?:[.,]\d+)?\s*(?:bultos?|kg|kilos?|toneladas?|unidades?)?\b",
            "",
            cleaned,
            count=1,
            flags=re.IGNORECASE,
        ).strip()
    cleaned = re.sub(
        r"^(?:necesito|pedido|cotizar|solicito|quiero)\b",
        " ",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"^\s*de\b", " ", cleaned, flags=re.IGNORECASE)
    split_match = re.search(r"\b(?:por|para)\b", cleaned, flags=re.IGNORECASE)
    if split_match:
        cleaned = cleaned[: split_match.start()]
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,-")
    return cleaned or None


def _company_ref(request: WhatsAppRouteRequest, normalized_message: str) -> str | None:
    if len(request.companies) == 1:
        company = request.companies[0]
        return company.name or company.prefix or company.id

    matches: list[str] = []
    for company in request.companies:
        for candidate in (company.name, company.prefix, company.id):
            if candidate and _phrase_matches(normalized_message, candidate):
                matches.append(candidate)

    unique_matches = list(dict.fromkeys(matches))
    return unique_matches[0] if len(unique_matches) == 1 else None


def _zone_ref(request: WhatsAppRouteRequest, normalized_message: str) -> str | None:
    if len(request.customer_zones) == 1:
        return request.customer_zones[0].name

    matches: list[str] = []
    for zone in request.customer_zones:
        if _phrase_matches(normalized_message, zone.name):
            matches.append(zone.name)

    unique_matches = list(dict.fromkeys(matches))
    return unique_matches[0] if len(unique_matches) == 1 else None


def _company_id(request: WhatsAppRouteRequest, normalized_message: str) -> str | None:
    if len(request.companies) == 1:
        return request.companies[0].id

    matches: list[str] = []
    for company in request.companies:
        candidates = [company.id, company.name or "", company.prefix or ""]
        if any(candidate and _phrase_matches(normalized_message, candidate) for candidate in candidates):
            matches.append(company.id)

    unique_matches = list(dict.fromkeys(matches))
    return unique_matches[0] if len(unique_matches) == 1 else None


def _customer_zone_id(request: WhatsAppRouteRequest, normalized_message: str) -> str | None:
    if len(request.customer_zones) == 1:
        return request.customer_zones[0].id

    matches: list[str] = []
    for zone in request.customer_zones:
        if _phrase_matches(normalized_message, zone.name):
            matches.append(zone.id)

    unique_matches = list(dict.fromkeys(matches))
    return unique_matches[0] if len(unique_matches) == 1 else None


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


def _recent_context(request: WhatsAppRouteRequest) -> str:
    return " ".join(
        _normalize_phrase(message.body) for message in request.recent_messages[-6:]
    )


def _wants_new_customer(normalized_message: str) -> bool:
    return any(
        phrase in normalized_message
        for phrase in (
            "crea uno nuevo",
            "crear uno nuevo",
            "crealo nuevo",
            "cliente nuevo",
            "nuevo cliente",
        )
    )


def _starts_new_customer_flow(normalized_message: str) -> bool:
    normalized = _normalize_phrase(normalized_message)
    return any(
        phrase in normalized
        for phrase in (
            "crear cliente",
            "crear un cliente",
            "crear una cliente",
            "agregar cliente",
            "agregar un cliente",
            "nuevo cliente",
            "cliente nuevo",
            "registrar cliente",
            "registrar un cliente",
        )
    )


def _is_expense_case_continuation(normalized_message: str) -> bool:
    normalized = _normalize_phrase(normalized_message)
    return normalized in (
        "dale",
        "ok",
        "okay",
        "okey",
        "listo",
        "si",
        "sigue",
        "continua",
        "continuemos",
        "de acuerdo",
        "perfecto",
        "recibido",
        "bueno",
        "buenisimo",
        "vale",
        "ya",
    )


def _is_inbound_media(request: WhatsAppRouteRequest, normalized_message: str) -> bool:
    return request.media is not None


def _starts_expense_form(normalized_message: str) -> bool:
    return any(
        phrase in normalized_message
        for phrase in (
            "registrar un gasto",
            "registrar gasto",
            "generar un gasto",
            "crear un gasto",
            "voy a registrar un gasto",
        )
    )


def _is_expense_media_follow_up(normalized_message: str, normalized_context: str) -> bool:
    if not any(word in normalized_context for word in ("gasto", "gastos")):
        return False
    return _is_media_placeholder(normalized_message) or any(
        word in normalized_message for word in SUPPORT_MEDIA_WORDS
    )


def _is_media_placeholder(normalized_message: str) -> bool:
    return normalized_message.strip().lower() in ("[imagen]", "[documento]")


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
    matches = list(re.finditer(r"\$?\s*(\d{1,3}(?:\.\d{3})+|\d+)", message))
    if not matches:
        return None
    scored_matches = [
        (_expense_amount_score(message, match), match.start(), match) for match in matches
    ]
    valid_matches = [item for item in scored_matches if item[0] is not None]
    if not valid_matches:
        return None
    _, _, best_match = max(valid_matches, key=lambda item: (item[0], item[1]))
    digits = best_match.group(1).replace(".", "")
    return int(digits)


def _expense_amount_score(message: str, match: re.Match[str]) -> tuple[int, int, int, int] | None:
    token = match.group(1)
    before = message[: match.start()].lower()
    raw = match.group(0)
    digits = token.replace(".", "")

    if _is_date_like_number(message, match):
        return None

    after_por = 1 if re.search(r"por\s*$", before) else 0
    has_currency = 1 if "$" in raw else 0
    money_shaped = 1 if "." in token or len(digits) >= 4 else 0
    incidental = 1 if _is_incidental_count(message, match) else 0

    if incidental and not (after_por or has_currency or money_shaped):
        return None

    return (after_por, has_currency, money_shaped, 1 - incidental)


def _is_date_like_number(message: str, match: re.Match[str]) -> bool:
    before = message[max(0, match.start() - 3) : match.start()]
    after = message[match.end() : match.end() + 3]
    return bool(re.search(r"[/-]\d{1,2}", after)) or bool(re.search(r"\d{1,2}[/-]$", before))


def _is_incidental_count(message: str, match: re.Match[str]) -> bool:
    after = message[match.end() :].lower()
    return bool(re.match(r"\s*(?:con\s+)?personas?\b", after))


def _phrase_matches(message: str, candidate: str) -> bool:
    normalized_message = _normalize_phrase(message)
    normalized_candidate = _normalize_phrase(candidate)
    if not normalized_candidate:
        return False
    pattern = rf"(?<!\w){re.escape(normalized_candidate)}(?!\w)"
    return re.search(pattern, normalized_message) is not None


def _normalize_phrase(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_value = "".join(char for char in decomposed if not unicodedata.combining(char))
    lowered = ascii_value.lower()
    cleaned = re.sub(r"[^a-z0-9]+", " ", lowered)
    return re.sub(r"\s+", " ", cleaned).strip()

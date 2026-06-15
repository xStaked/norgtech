from dataclasses import dataclass, field
from typing import Iterable

from ..models.whatsapp_models import WhatsAppRouteRequest
from .capabilities import get_capability
from .planner import NoraPlan, PlannedAction


@dataclass
class ValidationResult:
    ok: bool
    missing_fields: list[str] = field(default_factory=list)
    blocked_reason: str | None = None


def validate_plan(request: WhatsAppRouteRequest, plan: NoraPlan) -> ValidationResult:
    missing: list[str] = []

    for action in plan.actions:
        capability = get_capability(action.domain, action.action)
        if capability is None:
            return ValidationResult(
                ok=False,
                blocked_reason=f"Nora no soporta la accion {action.domain}.{action.action}.",
            )

        mode = mode_for_sender(request.sender_type)
        if mode not in capability.modes:
            return ValidationResult(
                ok=False,
                blocked_reason="Este remitente no tiene permisos para esa accion.",
            )

        missing.extend(_missing_required_fields(action, capability.required_fields))

        if action.domain == "orders" and action.action == "create_draft":
            if len(request.companies) > 1 and not action.fields.get("company_id"):
                missing.append("company_id")
            if len(request.customer_zones) > 1 and not action.fields.get("customer_zone_id"):
                missing.append("customer_zone_id")

    unique_missing = list(dict.fromkeys(missing))
    return ValidationResult(ok=len(unique_missing) == 0, missing_fields=unique_missing)


def mode_for_sender(sender_type: str) -> str:
    if sender_type in ("cliente", "desconocido"):
        return "cliente"
    if sender_type == "admin":
        return "admin"
    return "comercial"


def _missing_required_fields(
    action: PlannedAction, required_fields: Iterable[str]
) -> list[str]:
    missing: list[str] = []
    for field_name in required_fields:
        value = action.fields.get(field_name)
        if value is None or value == "" or value == []:
            missing.append(field_name)
    return missing

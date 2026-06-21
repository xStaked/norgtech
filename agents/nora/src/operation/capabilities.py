from dataclasses import dataclass
from typing import Literal


Mode = Literal["cliente", "comercial", "admin"]
CapabilityKind = Literal["read", "write"]
RiskLevel = Literal["low", "medium", "high"]


@dataclass(frozen=True)
class NoraCapability:
    domain: str
    action: str
    modes: tuple[Mode, ...]
    kind: CapabilityKind
    requires_human_review: bool
    required_fields: tuple[str, ...]
    risk_level: RiskLevel
    summary: str


CAPABILITIES: tuple[NoraCapability, ...] = (
    NoraCapability(
        domain="customers",
        action="search",
        modes=("comercial", "admin"),
        kind="read",
        requires_human_review=False,
        required_fields=(),
        risk_level="low",
        summary="Buscar clientes",
    ),
    NoraCapability(
        domain="orders",
        action="status",
        modes=("cliente", "comercial", "admin"),
        kind="read",
        requires_human_review=False,
        required_fields=(),
        risk_level="low",
        summary="Consultar estado de pedidos",
    ),
    NoraCapability(
        domain="orders",
        action="create_draft",
        modes=("cliente", "comercial", "admin"),
        kind="write",
        requires_human_review=True,
        required_fields=("customer_id", "company_id", "items"),
        risk_level="high",
        summary="Preparar borrador de pedido",
    ),
    NoraCapability(
        domain="orders",
        action="resolve_and_create_from_whatsapp",
        modes=("cliente", "comercial", "admin"),
        kind="write",
        requires_human_review=False,
        required_fields=("customer_id", "company_ref", "items"),
        risk_level="high",
        summary="Resolver y crear pedido desde WhatsApp cuando los datos son claros",
    ),
    NoraCapability(
        domain="credit",
        action="summary",
        modes=("comercial", "admin"),
        kind="read",
        requires_human_review=False,
        required_fields=("customer_id",),
        risk_level="medium",
        summary="Consultar cupo y cartera",
    ),
    NoraCapability(
        domain="payments",
        action="register_support_event",
        modes=("cliente", "admin"),
        kind="write",
        requires_human_review=True,
        required_fields=("customer_id",),
        risk_level="high",
        summary="Registrar soporte de pago para revision",
    ),
    NoraCapability(
        domain="logistics",
        action="register_tracking_event",
        modes=("admin",),
        kind="write",
        requires_human_review=True,
        required_fields=(),
        risk_level="high",
        summary="Registrar guia o evento logistico para revision",
    ),
    NoraCapability(
        domain="visits",
        action="agenda",
        modes=("comercial",),
        kind="read",
        requires_human_review=False,
        required_fields=(),
        risk_level="low",
        summary="Consultar agenda comercial",
    ),
    NoraCapability(
        domain="expenses",
        action="create_expense_draft",
        modes=("comercial",),
        kind="write",
        requires_human_review=True,
        required_fields=("expense_date", "category", "amount", "description"),
        risk_level="medium",
        summary="Preparar gasto comercial para revision",
    ),
    NoraCapability(
        domain="dashboard",
        action="sales_summary",
        modes=("comercial", "admin"),
        kind="read",
        requires_human_review=False,
        required_fields=(),
        risk_level="low",
        summary="Consultar resumen de ventas",
    ),
    NoraCapability(
        domain="whatsapp",
        action="summarize_conversation",
        modes=("admin",),
        kind="read",
        requires_human_review=False,
        required_fields=(),
        risk_level="low",
        summary="Resumir conversacion de WhatsApp",
    ),
)


def list_capabilities() -> tuple[NoraCapability, ...]:
    return CAPABILITIES


def get_capability(domain: str, action: str) -> NoraCapability | None:
    return next(
        (
            capability
            for capability in CAPABILITIES
            if capability.domain == domain and capability.action == action
        ),
        None,
    )

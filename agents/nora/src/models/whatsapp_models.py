from typing import Any, Literal

from pydantic import BaseModel, Field


class NoraCompanyContext(BaseModel):
    id: str
    name: str | None = None
    prefix: str | None = None


class NoraZoneContext(BaseModel):
    id: str
    name: str


class NoraMessageContext(BaseModel):
    role: str
    body: str


class WhatsAppRouteRequest(BaseModel):
    sender_type: Literal["cliente", "comercial", "admin", "desconocido"]
    message: str
    conversation_id: str | None = None
    customer: dict[str, Any] | None = None
    contact: dict[str, Any] | None = None
    companies: list[NoraCompanyContext] = Field(default_factory=list)
    customer_zones: list[NoraZoneContext] = Field(default_factory=list)
    recent_messages: list[NoraMessageContext] = Field(default_factory=list)


class NoraProposal(BaseModel):
    type: Literal[
        "order_draft",
        "payment_support",
        "logistics_event",
        "expense_draft",
    ]
    title: str
    payload: dict[str, Any] = Field(default_factory=dict)
    requires_human_review: bool = True


class WhatsAppRouteResponse(BaseModel):
    mode: Literal["cliente", "comercial", "admin"]
    intent: str
    summary: str
    suggested_reply: str
    requires_human_review: bool = True
    risk_level: Literal["low", "medium", "high"] = "medium"
    missing_fields: list[str] = Field(default_factory=list)
    blocked_reason: str | None = None
    proposals: list[NoraProposal] = Field(default_factory=list)
    proposed_order: dict[str, Any] | None = None

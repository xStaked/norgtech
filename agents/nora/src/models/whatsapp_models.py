from typing import Any, Literal

from pydantic import BaseModel


class WhatsAppRouteRequest(BaseModel):
    sender_type: Literal["cliente", "comercial", "admin", "desconocido"]
    message: str
    conversation_id: str | None = None
    customer: dict[str, Any] | None = None


class WhatsAppRouteResponse(BaseModel):
    mode: Literal["cliente", "comercial", "admin"]
    intent: str
    summary: str
    suggested_reply: str
    requires_human_review: bool = True
    proposed_order: dict[str, Any] | None = None

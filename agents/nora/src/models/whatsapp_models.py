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


class NoraUserContext(BaseModel):
    id: str
    role: str
    name: str | None = None
    email: str | None = None


class NoraOpenCaseContext(BaseModel):
    id: str
    type: Literal["order", "new_customer", "expense", "visit"]
    status: str
    extractedData: dict[str, Any] = Field(default_factory=dict)
    missingFields: list[str] = Field(default_factory=list)
    lastQuestion: str | None = None
    attachments: list[dict[str, Any]] = Field(default_factory=list)


class NoraMediaContext(BaseModel):
    kind: Literal["image", "document"]
    providerMediaId: str | None = None
    fileName: str | None = None
    contentType: str | None = None
    caption: str | None = None


class WhatsAppRouteRequest(BaseModel):
    sender_type: Literal["cliente", "comercial", "admin", "desconocido"]
    message: str
    conversation_id: str | None = None
    customer: dict[str, Any] | None = None
    contact: dict[str, Any] | None = None
    user: NoraUserContext | None = None
    user_id: str | None = None
    user_role: str | None = None
    companies: list[NoraCompanyContext] = Field(default_factory=list)
    customer_zones: list[NoraZoneContext] = Field(default_factory=list)
    recent_messages: list[NoraMessageContext] = Field(default_factory=list)
    open_case: NoraOpenCaseContext | None = None
    media: NoraMediaContext | None = None


class NoraOrderCandidateItem(BaseModel):
    productRef: str
    quantity: float
    presentation: str | None = None
    notes: str | None = None


class NoraOrderCandidate(BaseModel):
    customerId: str | None = None
    companyRef: str | None = None
    customerRef: str | None = None
    customerZoneId: str | None = None
    zoneRef: str | None = None
    items: list[NoraOrderCandidateItem] = Field(default_factory=list)
    deliveryInstructions: str | None = None
    notes: str | None = None
    sourceConversationId: str | None = None


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


class NoraCaseTransition(BaseModel):
    action: Literal[
        "none",
        "start_case",
        "update_case",
        "create_new_customer_subcase",
        "cancel_case",
    ] = "none"
    caseId: str | None = None
    type: Literal["order", "new_customer", "expense", "visit"] | None = None
    extractedData: dict[str, Any] = Field(default_factory=dict)
    missingFields: list[str] = Field(default_factory=list)
    lastQuestion: str | None = None


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
    order_candidate: NoraOrderCandidate | None = None
    case_transition: NoraCaseTransition | None = None


class NoraAgentAttachment(BaseModel):
    kind: Literal["image", "document"]
    providerMediaId: str | None = None
    fileName: str | None = None
    contentType: str | None = None
    caption: str | None = None


class NoraCustomerSnapshot(BaseModel):
    customerName: str | None = None
    catalogo: list[dict] = Field(default_factory=list)
    zonas: list[dict] = Field(default_factory=list)
    recentOrders: list[dict] = Field(default_factory=list)
    cartera: dict = Field(default_factory=dict)


class NoraHandoff(BaseModel):
    needed: bool = False
    reason: str | None = None
    rol: str | None = None


class NoraOrderDraft(BaseModel):
    orderRef: str | None = None
    items: list[dict] = Field(default_factory=list)
    zona: str | None = None
    motivo: str = ""


class WhatsAppAgentRequest(BaseModel):
    current_message: str
    history: list[NoraMessageContext] = Field(default_factory=list)
    open_case: NoraOpenCaseContext | None = None
    attachments: list[NoraAgentAttachment] = Field(default_factory=list)
    sender: NoraUserContext | None = None
    conversation_id: str | None = None
    auth: str
    customer_snapshot: "NoraCustomerSnapshot | None" = None


class WhatsAppAgentResponse(BaseModel):
    reply_text: str
    case_update: dict[str, Any] | None = None
    executed_entity: dict[str, Any] | None = None
    # Si el turno reventó: el mensaje del error viaja al CRM para quedar en el
    # NoraActionLog. Sin esto un 500 se veía como silencio total en WhatsApp.
    error: str | None = None
    handoff: "NoraHandoff | None" = None
    order_case: "NoraOrderDraft | None" = None

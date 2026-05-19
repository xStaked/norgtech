from pydantic import BaseModel, Field
from typing import Optional, Literal, Any
from enum import Enum

class OpportunityStage(str, Enum):
    prospeccion = "prospeccion"
    contacto_inicial = "contacto_inicial"
    diagnostico = "diagnostico"
    propuesta = "propuesta"
    negociacion = "negociacion"
    cerrada_ganada = "cerrada_ganada"
    cerrada_perdida = "cerrada_perdida"

class FollowUpTaskType(str, Enum):
    llamada = "llamada"
    correo = "correo"
    whatsapp = "whatsapp"
    visita = "visita"
    cotizacion = "cotizacion"
    otro = "otro"

class NoraInteractionBlock(BaseModel):
    enabled: bool
    summary: str = Field(min_length=1)
    rawMessage: str = Field(min_length=1)

class NoraOpportunityBlock(BaseModel):
    enabled: bool
    opportunityId: Optional[str] = None
    createNew: Optional[bool] = None
    title: Optional[str] = None
    stage: Optional[OpportunityStage] = None

class NoraFollowUpBlock(BaseModel):
    enabled: bool
    title: str = Field(min_length=1)
    dueAt: str = Field(min_length=1)
    opportunityId: Optional[str] = None
    type: FollowUpTaskType

class NoraTaskBlock(BaseModel):
    enabled: bool
    title: str = Field(min_length=1)
    dueAt: Optional[str] = None
    notes: Optional[str] = None

class NoraSignalsBlock(BaseModel):
    enabled: bool
    objections: list[str] = Field(default_factory=list)
    risk: Optional[str] = None
    buyingIntent: Optional[str] = None

class NoraOrderBlock(BaseModel):
    enabled: bool
    action: Literal["create", "update", "delete"] = "create"
    customerId: Optional[str] = None
    opportunityId: Optional[str] = None
    sourceQuoteId: Optional[str] = None
    notes: Optional[str] = None
    items: Optional[list[dict]] = None
    id: Optional[str] = None
    relatedTo: Optional[str] = None

class NoraProposalBlocks(BaseModel):
    interaction: Optional[NoraInteractionBlock] = None
    opportunity: Optional[NoraOpportunityBlock] = None
    followUp: Optional[NoraFollowUpBlock] = None
    task: Optional[NoraTaskBlock] = None
    signals: Optional[NoraSignalsBlock] = None
    order: Optional[NoraOrderBlock] = None

class NoraProposalPayload(BaseModel):
    blocks: NoraProposalBlocks

class CreateMessageRequest(BaseModel):
    content: str = Field(min_length=1)
    sessionId: Optional[str] = None
    contextType: Optional[str] = None
    contextEntityId: Optional[str] = None

class ConfirmProposalRequest(BaseModel):
    proposal: NoraProposalPayload

class ClarificationOption(BaseModel):
    id: str
    label: str

class ClarificationInfo(BaseModel):
    type: Literal["customer", "opportunity", "date", "action"]
    options: Optional[list[ClarificationOption]] = None

class AgendaItem(BaseModel):
    id: str
    type: Literal["visit", "follow_up_task"]
    label: str
    scheduledAt: Optional[str] = None
    priorityGroup: Optional[int] = None

# Union response type
class GreetingResponse(BaseModel):
    mode: Literal["greeting"] = "greeting"
    sessionId: str
    message: str

class ClarificationResponse(BaseModel):
    mode: Literal["clarification"] = "clarification"
    sessionId: str
    message: str
    clarification: ClarificationInfo

class ProposalResponse(BaseModel):
    mode: Literal["proposal"] = "proposal"
    sessionId: str
    message: str
    proposalId: str
    proposal: NoraProposalPayload

class AgendaResponse(BaseModel):
    mode: Literal["agenda"] = "agenda"
    sessionId: str
    message: str
    agenda: dict  # { items: AgendaItem[] }

NoraResponse = GreetingResponse | ClarificationResponse | ProposalResponse | AgendaResponse

class NoraConfirmationResponse(BaseModel):
    proposalId: str
    status: Literal["confirmed"] = "confirmed"
    proposal: NoraProposalPayload
    saved: list[str]
    discarded: list[str]
    createdIds: dict[str, str]

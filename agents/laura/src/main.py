import uuid
from fastapi import FastAPI, Depends, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
import json as json_lib

from .config import settings
from .models.api_models import (
    CreateMessageRequest,
    LauraResponse,
    GreetingResponse,
    ClarificationResponse,
    ProposalResponse,
    AgendaResponse,
    LauraProposalPayload,
    ConfirmProposalRequest,
    LauraConfirmationResponse,
    ClarificationOption,
)
from .agent import laura_graph, LauraState
from .sessions import session_store

app = FastAPI(title="Laura Agent", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def detect_response_mode(result: dict, session_id: str) -> LauraResponse:
    """Detecta el modo de respuesta basado en las tools ejecutadas y el contenido."""
    messages = result.get("messages", [])
    
    # Revisar si hay tool calls ejecutadas
    tool_outputs = []
    for msg in messages:
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            for tc in msg.tool_calls:
                tool_outputs.append(tc.get("name"))
    
    # Obtener el último mensaje de texto del agente
    response_text = ""
    for msg in reversed(messages):
        if hasattr(msg, "content") and msg.content and not getattr(msg, "tool_calls", None):
            response_text = msg.content
            break
    
    if not response_text:
        response_text = "¿En qué más puedo ayudarte?"
    
    # Detectar modo
    if "get_agenda" in tool_outputs:
        # Extraer items de agenda del tool output
        agenda_data = {"items": []}
        for msg in messages:
            if hasattr(msg, "content") and "items" in str(msg.content):
                try:
                    import json
                    data = json.loads(msg.content) if isinstance(msg.content, str) else msg.content
                    if "items" in data:
                        agenda_data = data
                except:
                    pass
        return AgendaResponse(
            sessionId=session_id,
            message=response_text,
            agenda=agenda_data,
        )
    
    # Propuesta (se usaron tools de creación/modificación)
    crm_tools = [
        "search_customers", "create_customer",
        "create_visit", "create_opportunity",
        "update_opportunity_stage", "create_follow_up",
    ]
    if any(t in tool_outputs for t in crm_tools):
        # Generar propuesta basada en tools ejecutadas
        return ProposalResponse(
            sessionId=session_id,
            message=response_text,
            proposalId=str(uuid.uuid4()),
            proposal=build_proposal_from_tool_outputs(messages, tool_outputs),
        )
    
    # Sin tools → greeting o respuesta simple
    return GreetingResponse(
        sessionId=session_id,
        message=response_text,
    )

def build_proposal_from_tool_outputs(messages: list, tool_names: list[str]) -> LauraProposalPayload:
    """Construye payload de propuesta basado en las tools ejecutadas."""
    from .models.api_models import (
        LauraProposalBlocks,
        LauraInteractionBlock,
        LauraFollowUpBlock,
        LauraTaskBlock,
        LauraSignalsBlock,
    )
    
    blocks = LauraProposalBlocks()
    
    if "create_visit" in tool_names:
        blocks.interaction = LauraInteractionBlock(
            enabled=True,
            summary="Visita registrada",
            rawMessage="Ver detalles en mensaje",
        )
    
    if "create_follow_up" in tool_names:
        blocks.followUp = LauraFollowUpBlock(
            enabled=True,
            title="Seguimiento creado",
            dueAt="2026-05-12T00:00:00Z",
            type="llamada",
        )
    
    return LauraProposalPayload(blocks=blocks)

def get_auth_header(authorization: str = Header(...)) -> str:
    """Extrae y valida el header de autorización."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    return authorization

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/messages")
async def send_message(
    body: CreateMessageRequest,
    authorization: str = Depends(get_auth_header),
) -> LauraResponse:
    """
    Endpoint principal de Laura.
    Recibe mensaje del usuario, ejecuta el agente, devuelve respuesta.
    Mantiene compatibilidad exacta con el contrato NestJS actual.
    """
    session_id = body.sessionId or str(uuid.uuid4())
    
    # Obtener/crear metadata de sesión
    ctx = session_store.get_or_create(
        session_id=session_id,
        context_type=body.contextType,
        context_entity_id=body.contextEntityId,
    )
    
    # Configurar el estado inicial
    config = {"configurable": {"thread_id": session_id}}
    
    # Construir mensaje con contexto
    context_note = ""
    if ctx.context_type and ctx.context_entity_id:
        context_note = f"\n\n[Contexto: el usuario está viendo el {ctx.context_type} con ID {ctx.context_entity_id}]"
    
    human_msg = HumanMessage(content=body.content + context_note)
    
    # Ejecutar el grafo
    initial_state: LauraState = {
        "messages": [human_msg],
        "auth_token": authorization,
        "session_id": session_id,
    }
    
    result = await laura_graph.ainvoke(initial_state, config=config)
    
    # Extraer último mensaje del agente
    last_msg = result["messages"][-1]
    response_text = last_msg.content if hasattr(last_msg, "content") else str(last_msg)
    
    # Determinar el modo de respuesta
    # Por ahora retornamos proposal como default. En siguientes iteraciones
    # el agente decidirá el modo basado en el contenido.
    
    # TODO: Detectar greeting, clarification, agenda, proposal del contenido
    # Por ahora retornamos modo proposal para mantener compatibilidad
    
    return detect_response_mode(result, session_id)

@app.post("/proposals/{proposal_id}/confirm")
async def confirm_proposal(
    proposal_id: str,
    body: ConfirmProposalRequest,
    authorization: str = Depends(get_auth_header),
) -> LauraConfirmationResponse:
    """
    Confirma una propuesta. En el nuevo modelo, las tools YA se ejecutaron
    durante la conversación, así que confirmar es un no-op que devuelve
    lo que ya se hizo. Mantenemos el endpoint por compatibilidad con frontend.
    """
    return LauraConfirmationResponse(
        proposalId=proposal_id,
        status="confirmed",
        proposal=body.proposal,
        saved=["interaction"],
        discarded=[],
        createdIds={},
    )

@app.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    authorization: str = Depends(get_auth_header),
):
    """
    Obtiene la sesión con sus mensajes y propuestas.
    """
    ctx = session_store.get(session_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Obtener historial del checkpointer de LangGraph
    config = {"configurable": {"thread_id": session_id}}
    try:
        state = laura_graph.get_state(config)
    except:
        state = None
    
    messages = []
    if state and state.values and "messages" in state.values:
        for msg in state.values["messages"]:
            messages.append({
                "id": getattr(msg, "id", str(uuid.uuid4())),
                "role": "user" if msg.type == "human" else "assistant",
                "kind": "report",
                "content": msg.content if hasattr(msg, "content") else "",
                "createdAt": "2026-05-11T00:00:00Z",
            })
    
    return {
        "id": session_id,
        "ownerUserId": "unknown",
        "contextType": ctx.context_type,
        "contextEntityId": ctx.context_entity_id,
        "messages": messages,
        "proposals": [],
        "createdAt": "2026-05-11T00:00:00Z",
        "updatedAt": "2026-05-11T00:00:00Z",
    }

@app.get("/messages/stream")
async def stream_message(
    content: str,
    authorization: str = Depends(get_auth_header),
    sessionId: str = None,
    contextType: str = None,
    contextEntityId: str = None,
):
    """
    Streaming SSE real: envía tokens del LLM en tiempo real.
    """
    session_id = sessionId or str(uuid.uuid4())
    
    ctx = session_store.get_or_create(
        session_id=session_id,
        context_type=contextType,
        context_entity_id=contextEntityId,
    )
    
    config = {"configurable": {"thread_id": session_id}}
    
    context_note = ""
    if ctx.context_type and ctx.context_entity_id:
        context_note = f"\n\n[Contexto: {ctx.context_type} ID {ctx.context_entity_id}]"
    
    human_msg = HumanMessage(content=content + context_note)
    
    initial_state: LauraState = {
        "messages": [human_msg],
        "auth_token": authorization,
        "session_id": session_id,
    }
    
    async def event_stream():
        full_response = ""
        async for event in laura_graph.astream_events(initial_state, config=config, version="v2"):
            kind = event.get("event")
            
            if kind == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                if hasattr(chunk, "content") and chunk.content:
                    full_response += chunk.content
                    data = json_lib.dumps({"token": chunk.content})
                    yield f"data: {data}\n\n"
            
            elif kind == "on_tool_start":
                data = json_lib.dumps({"event": "tool_start", "tool": event.get("name", "unknown")})
                yield f"data: {data}\n\n"
            
            elif kind == "on_tool_end":
                data = json_lib.dumps({"event": "tool_end", "tool": event.get("name", "unknown")})
                yield f"data: {data}\n\n"
        
        # Evento final con el resultado completo
        result = GreetingResponse(
            sessionId=session_id,
            message=full_response,
        )
        yield f"data: {json_lib.dumps(result.model_dump())}\n\n"
        yield "data: [DONE]\n\n"
    
    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=settings.port)

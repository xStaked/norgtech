import json
from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from .nestjs_client import NestJSClient
from typing import Annotated, Optional

# Tipos validos, EXACTOS al enum FollowUpTaskType del API (schema.prisma). El API
# valida con @IsEnum. La docstring anunciaba 'correo' (el enum es 'email') y
# 'visita'/'cotizacion' (no existen) -> 400 latente en cada tarea de ese tipo.
FOLLOW_UP_TASK_TYPES = (
    "llamada",
    "email",
    "whatsapp",
    "reunion",
    "recordatorio",
    "otro",
)
_TASK_TYPES_DOC = ", ".join(FOLLOW_UP_TASK_TYPES)

@tool
async def create_follow_up(
    customer_id: str,
    title: str,
    due_at: str,
    task_type: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
    opportunity_id: Optional[str] = None,
    notes: Optional[str] = None,
) -> str:
    """
    Crea una tarea de seguimiento para un cliente.
    
    Args:
        customer_id: ID del cliente
        title: Descripción de la tarea
        due_at: Fecha de vencimiento (ISO 8601)
        task_type: Tipo de tarea. Valores validos: llamada, email, whatsapp, reunion, recordatorio, otro
        opportunity_id: ID de la oportunidad asociada (opcional)
        notes: Notas adicionales (opcional)
    """
    if task_type not in FOLLOW_UP_TASK_TYPES:
        return f"Tipo de tarea invalido '{task_type}'. Usa uno de: {_TASK_TYPES_DOC}"
    try:
        nestjs_client = NestJSClient(auth_token)
        payload = {
            "customerId": customer_id,
            "title": title,
            "dueAt": due_at,
            "type": task_type,
        }
        if opportunity_id: payload["opportunityId"] = opportunity_id
        if notes: payload["notes"] = notes
        
        result = await nestjs_client.post("/follow-up-tasks", payload)
        return f"Tarea de seguimiento creada: {json.dumps(result, ensure_ascii=False, indent=2)}"
    except Exception as e:
        return f"Error al crear tarea: {str(e)}"

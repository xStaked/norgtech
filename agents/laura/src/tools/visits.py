import json
from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from .nestjs_client import NestJSClient
from typing import Annotated, Optional

@tool
async def create_visit(
    customer_id: str,
    scheduled_at: str,
    summary: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
    opportunity_id: Optional[str] = None,
    notes: Optional[str] = None,
    next_step: Optional[str] = None,
) -> str:
    """
    Registra una visita/interacción con un cliente en el CRM.
    Usa esta herramienta cuando el usuario reporte una visita realizada
    o quiera programar una nueva visita.
    
    Args:
        customer_id: ID del cliente visitado
        scheduled_at: Fecha y hora de la visita (ISO 8601)
        summary: Resumen de lo que ocurrió en la visita
        opportunity_id: ID de la oportunidad asociada (opcional)
        notes: Notas adicionales (opcional)
        next_step: Próximo paso acordado (opcional)
    """
    try:
        nestjs_client = NestJSClient(auth_token)
        payload = {
            "customerId": customer_id,
            "scheduledAt": scheduled_at,
            "summary": summary,
        }
        if opportunity_id: payload["opportunityId"] = opportunity_id
        if notes: payload["notes"] = notes
        if next_step: payload["nextStep"] = next_step
        
        result = await nestjs_client.post("/visits", payload)
        return f"Visita registrada exitosamente: {json.dumps(result, ensure_ascii=False, indent=2)}"
    except Exception as e:
        return f"Error al registrar visita: {str(e)}"

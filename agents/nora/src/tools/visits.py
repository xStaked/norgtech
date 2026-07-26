import json
from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from .nestjs_client import NestJSClient, NestJSAPIError
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
        return f"Visita registrada exitosamente: {json.dumps(result, ensure_ascii=False)}"
    except Exception as e:
        return f"Error al registrar visita: {str(e)}"


@tool
async def get_customer_visits(
    customer_id: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
) -> str:
    """
    Lista las visitas de un cliente (incluye pasadas y futuras) con su ID,
    fecha, resumen y estado.

    Úsala para encontrar la visita que el usuario quiere eliminar o consultar.
    Primero resuelve el customer_id con search_customers.

    Args:
        customer_id: ID del cliente
    """
    try:
        nestjs_client = NestJSClient(auth_token)
        result = await nestjs_client.get("/visits", params={"customerId": customer_id})
        visits = result if isinstance(result, list) else result.get("data", [])
        if not visits:
            return "Ese cliente no tiene visitas registradas."
        simplified = [
            {
                "id": v["id"],
                "fecha": v.get("scheduledAt"),
                "resumen": v.get("summary"),
                "estado": v.get("status"),
            }
            for v in visits[:15]
        ]
        return f"Visitas del cliente: {json.dumps(simplified, ensure_ascii=False)}"
    except NestJSAPIError as e:
        return f"Error al obtener visitas: {e.detail}"
    except Exception as e:
        return f"Error inesperado al obtener visitas: {str(e)}"


@tool
async def update_visit(
    visit_id: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
    scheduled_at: Optional[str] = None,
    summary: Optional[str] = None,
    notes: Optional[str] = None,
    next_step: Optional[str] = None,
    customer_id: Optional[str] = None,
) -> str:
    """
    Edita/actualiza una visita existente en el CRM.

    Usa esta herramienta cuando el usuario pida modificar/cambiar/reagendar
    datos de una visita (por ejemplo su fecha, resumen, notas, próximo paso
    o el cliente asociado). Solo se actualizan los campos que proporciones.

    Primero usa get_customer_visits para encontrar el visit_id de la visita
    y SIEMPRE confirma con el usuario cuál visita y qué cambios antes de editar.

    Args:
        visit_id: ID de la visita a actualizar
        scheduled_at: Nueva fecha y hora de la visita (ISO 8601, opcional)
        summary: Nuevo resumen de la visita (opcional)
        notes: Nuevas notas (opcional)
        next_step: Nuevo próximo paso acordado (opcional)
        customer_id: Nuevo cliente asociado (opcional)
    """
    try:
        nestjs_client = NestJSClient(auth_token)
        payload = {}
        if scheduled_at: payload["scheduledAt"] = scheduled_at
        if summary: payload["summary"] = summary
        if notes: payload["notes"] = notes
        if next_step: payload["nextStep"] = next_step
        if customer_id: payload["customerId"] = customer_id

        result = await nestjs_client.patch(f"/visits/{visit_id}", payload)
        return f"Visita actualizada exitosamente: {json.dumps(result, ensure_ascii=False)}"
    except NestJSAPIError as e:
        return f"Error al actualizar visita: {e.detail}"
    except Exception as e:
        return f"Error inesperado al actualizar visita: {str(e)}"


@tool
async def delete_visit(
    visit_id: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
) -> str:
    """
    Elimina (borra) una visita del CRM de forma permanente.

    Usa esta herramienta cuando el usuario pida eliminar/borrar/cancelar
    definitivamente una visita. SIEMPRE confirma con el usuario cuál visita
    antes de eliminarla. Si no sabes el ID, usa get_agenda para encontrarlo.

    No se puede eliminar una visita que ya tiene reportes o gastos asociados.

    Args:
        visit_id: ID de la visita a eliminar
    """
    try:
        nestjs_client = NestJSClient(auth_token)
        await nestjs_client.delete(f"/visits/{visit_id}")
        return "Visita eliminada exitosamente."
    except NestJSAPIError as e:
        return f"Error al eliminar visita: {e.detail}"
    except Exception as e:
        return f"Error inesperado al eliminar visita: {str(e)}"

import json
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from .nestjs_client import NestJSClient, NestJSAPIError
from ..visit_parsing import BOGOTA_TZ
from typing import Annotated, Optional


def google_calendar_link(
    scheduled_at: str,
    title: str,
    details: str = "",
    location: str = "",
) -> Optional[str]:
    """Link de plantilla de Google Calendar para una visita ya agendada.

    Se acordo con el cliente NO integrar OAuth por cuenta: la agenda sigue
    viviendo en la plataforma y al confirmar la visita se devuelve este link,
    que la persona abre desde WhatsApp y le deja el evento en su calendario.

    ZONA HORARIA: Google exige UTC compacto 'YYYYMMDDTHHMMSSZ'. Una fecha SIN
    offset significa hora de pared de Colombia (mismo criterio que toInstantIso
    en apps/api/src/shared/instant.ts, que es lo que Nora postea), asi que hay
    que fijarle BOGOTA_TZ antes de pasar a UTC o el evento cae 5 horas corrido.
    """
    try:
        start = datetime.fromisoformat(scheduled_at.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if start.tzinfo is None:
        start = start.replace(tzinfo=BOGOTA_TZ)
    start = start.astimezone(timezone.utc)
    # El modelo de visita no tiene hora de fin: asumimos 1 hora de duracion.
    end = start + timedelta(hours=1)
    stamp = "%Y%m%dT%H%M%SZ"
    params = {
        "action": "TEMPLATE",
        "text": title,
        "dates": f"{start.strftime(stamp)}/{end.strftime(stamp)}",
    }
    if details:
        params["details"] = details
    if location:
        params["location"] = location
    # safe="/" deja crudo el separador inicio/fin de `dates`, que es la forma
    # documentada por Google; el resto va URL-encoded.
    return "https://calendar.google.com/calendar/render?" + urlencode(params, safe="/")


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
        # El JSON va SIEMPRE al final: whatsapp_general_agent lo parsea desde la
        # primera "{" hasta el final para sacar el executed_entity.
        link = google_calendar_link(scheduled_at, f"Visita: {summary}", next_step or notes or "")
        aviso = (
            f"Pasale al usuario este link tal cual para que agregue la visita a su "
            f"Google Calendar: {link}\n" if link else ""
        )
        return f"Visita registrada exitosamente. {aviso}{json.dumps(result, ensure_ascii=False)}"
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
        # Solo al REAGENDAR: si no cambio la fecha, el link seria ruido. La
        # fecha sale de la respuesta del API (ya normalizada) y no del texto
        # que mando el usuario. El JSON va SIEMPRE al final, igual que en
        # create_visit: whatsapp_general_agent lo parsea desde la primera "{".
        link = (
            google_calendar_link(
                result.get("scheduledAt") or scheduled_at,
                f"Visita: {result.get('summary') or summary or 'visita'}",
                next_step or notes or "",
            )
            if scheduled_at
            else None
        )
        aviso = (
            f"Pasale al usuario este link tal cual para que actualice la visita en su "
            f"Google Calendar: {link}\n" if link else ""
        )
        return f"Visita actualizada exitosamente. {aviso}{json.dumps(result, ensure_ascii=False)}"
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

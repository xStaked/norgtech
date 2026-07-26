"""Pendientes del dia: tareas de seguimiento y visitas (listar y completar).

Mismo @Roles que FollowUpTasksController y VisitsController:
administrador, comercial, director_comercial y tecnico.
"""

import json
from typing import Annotated, Optional

from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState

from .nestjs_client import NestJSClient, NestJSAPIError

MAX_ROWS = 20

FOLLOW_UP_TASK_STATUSES = ("pendiente", "completada", "vencida")
VISIT_STATUSES = ("programada", "completada", "cancelada", "no_realizada")


def _flag(params: dict, key: str, value: Optional[bool]) -> None:
    # El controller compara `=== "true"`, y cualquier string (incluido "false")
    # activa el modo filtrado; por eso solo mandamos el flag cuando es True.
    if value:
        params[key] = "true"


@tool
async def list_follow_ups(
    auth_token: Annotated[str, InjectedState("auth_token")],
    status: Optional[str] = None,
    overdue: Optional[bool] = None,
    due_today: Optional[bool] = None,
    this_week: Optional[bool] = None,
    assigned_to_me: Optional[bool] = None,
) -> str:
    """
    Lista las tareas de seguimiento (llamadas, correos, recordatorios). Úsala
    para "¿qué tengo pendiente?", "¿qué tengo vencido?", "mis tareas de hoy",
    "qué hay para esta semana". Sin filtros devuelve todas las tareas.

    Args:
        status: pendiente | completada | vencida.
        overdue: True para solo las vencidas.
        due_today: True para solo las que vencen hoy.
        this_week: True para solo las de esta semana.
        assigned_to_me: True para acotar a las del usuario que pregunta.
    """
    if status and status not in FOLLOW_UP_TASK_STATUSES:
        return f"Estado inválido '{status}'. Usa uno de: {', '.join(FOLLOW_UP_TASK_STATUSES)}"
    try:
        client = NestJSClient(auth_token)
        params: dict = {}
        if status:
            params["status"] = status
        _flag(params, "overdue", overdue)
        _flag(params, "dueToday", due_today)
        _flag(params, "thisWeek", this_week)
        _flag(params, "assignedToMe", assigned_to_me)
        data = await client.get("/follow-up-tasks", params=params or None)
        items = data if isinstance(data, list) else data.get("data", [])
        rows = [
            {
                "id": t.get("id"),
                "titulo": t.get("title"),
                "tipo": t.get("type"),
                "cliente": (t.get("customer") or {}).get("displayName"),
                "vence": t.get("dueAt"),
                "estado": t.get("status"),
                "vencida": t.get("isOverdue"),
            }
            for t in items[:MAX_ROWS]
        ]
        if not rows:
            return "No hay tareas de seguimiento que coincidan con ese filtro."
        return json.dumps({"tareas": rows, "total": len(items)}, ensure_ascii=False)
    except NestJSAPIError as e:
        if e.status_code == 403:
            return "Este usuario no tiene permiso para consultar tareas de seguimiento."
        return f"Error al listar tareas de seguimiento: {e.detail}"
    except Exception as e:
        return f"Error inesperado al listar tareas de seguimiento: {str(e)}"


@tool
async def complete_follow_up(
    task_id: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
) -> str:
    """
    Marca una tarea de seguimiento como completada. Úsala cuando digan "marca
    esa tarea como hecha", "ya llamé al cliente", "listo el recordatorio".

    Antes de llamarla: ubica la tarea con list_follow_ups y confirma cuál es.
    Solo funciona si la tarea sigue pendiente.

    Args:
        task_id: ID de la tarea de seguimiento.
    """
    try:
        client = NestJSClient(auth_token)
        task = await client.patch(f"/follow-up-tasks/{task_id}/complete", {})
        return json.dumps(
            {
                "id": task.get("id"),
                "titulo": task.get("title"),
                "estado": task.get("status"),
                "completada": task.get("completedAt"),
            },
            ensure_ascii=False,
        )
    except NestJSAPIError as e:
        if e.status_code == 403:
            return "Este usuario no tiene permiso para completar tareas de seguimiento."
        if e.status_code == 404:
            return "No encontré esa tarea. Verifica el ID con list_follow_ups."
        if e.status_code == 400:
            return f"El API rechazó completar la tarea: {e.detail}. Puede que ya no esté pendiente."
        return f"Error al completar la tarea: {e.detail}"
    except Exception as e:
        return f"Error inesperado al completar la tarea: {str(e)}"


@tool
async def list_visits(
    auth_token: Annotated[str, InjectedState("auth_token")],
    status: Optional[str] = None,
    today: Optional[bool] = None,
    this_week: Optional[bool] = None,
    overdue: Optional[bool] = None,
    assigned_to_me: Optional[bool] = None,
    customer_id: Optional[str] = None,
) -> str:
    """
    Lista las visitas programadas o realizadas. Úsala para "¿qué visitas tengo
    hoy?", "mi agenda de la semana", "visitas atrasadas", "las visitas al
    cliente X". Sin filtros devuelve todas las visitas.

    Args:
        status: programada | completada | cancelada | no_realizada.
        today: True para solo las de hoy.
        this_week: True para solo las de esta semana.
        overdue: True para solo las atrasadas.
        assigned_to_me: True para acotar a las del usuario que pregunta.
        customer_id: Filtra por cliente (resuélvelo antes con search_customers).
    """
    if status and status not in VISIT_STATUSES:
        return f"Estado inválido '{status}'. Usa uno de: {', '.join(VISIT_STATUSES)}"
    try:
        client = NestJSClient(auth_token)
        params: dict = {}
        if status:
            params["status"] = status
        _flag(params, "today", today)
        _flag(params, "thisWeek", this_week)
        _flag(params, "overdue", overdue)
        _flag(params, "assignedToMe", assigned_to_me)
        if customer_id:
            params["customerId"] = customer_id
        data = await client.get("/visits", params=params or None)
        items = data if isinstance(data, list) else data.get("data", [])
        rows = [
            {
                "id": v.get("id"),
                "cliente": (v.get("customer") or {}).get("displayName"),
                "fecha": v.get("scheduledAt"),
                "estado": v.get("status"),
                "atrasada": v.get("isOverdue"),
            }
            for v in items[:MAX_ROWS]
        ]
        if not rows:
            return "No hay visitas que coincidan con ese filtro."
        return json.dumps({"visitas": rows, "total": len(items)}, ensure_ascii=False)
    except NestJSAPIError as e:
        if e.status_code == 403:
            return "Este usuario no tiene permiso para consultar visitas."
        return f"Error al listar visitas: {e.detail}"
    except Exception as e:
        return f"Error inesperado al listar visitas: {str(e)}"


@tool
async def complete_visit(
    visit_id: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
    summary: Optional[str] = None,
    diagnosis: Optional[str] = None,
    problems: Optional[str] = None,
    proposed_solution: Optional[str] = None,
    notes: Optional[str] = None,
    next_step: Optional[str] = None,
) -> str:
    """
    Marca una visita como completada y guarda lo que pasó en ella. Úsala cuando
    digan "ya hice la visita a X", "cierra esa visita", "la visita salió así".

    Antes de llamarla: ubica la visita con list_visits y confirma cuál es. Pide
    al menos el resumen: sin él no se puede generar el reporte ejecutivo después.

    Args:
        visit_id: ID de la visita.
        summary: Resumen de lo que ocurrió en la visita.
        diagnosis: Diagnóstico técnico.
        problems: Problemas detectados.
        proposed_solution: Solución propuesta al cliente.
        notes: Notas adicionales.
        next_step: Próximo paso acordado.
    """
    try:
        client = NestJSClient(auth_token)
        payload = {
            k: v
            for k, v in {
                "summary": summary,
                "diagnosis": diagnosis,
                "problems": problems,
                "proposedSolution": proposed_solution,
                "notes": notes,
                "nextStep": next_step,
            }.items()
            if v
        }
        visit = await client.patch(f"/visits/{visit_id}/complete", payload)
        return json.dumps(
            {
                "id": visit.get("id"),
                "cliente": (visit.get("customer") or {}).get("displayName"),
                "estado": visit.get("status"),
                "completada": visit.get("completedAt"),
            },
            ensure_ascii=False,
        )
    except NestJSAPIError as e:
        if e.status_code == 403:
            return "Este usuario no tiene permiso para completar visitas."
        if e.status_code == 404:
            return "No encontré esa visita. Verifica el ID con list_visits."
        if e.status_code == 400:
            return f"El API rechazó completar la visita: {e.detail}. Puede que ya no esté programada."
        return f"Error al completar la visita: {e.detail}"
    except Exception as e:
        return f"Error inesperado al completar la visita: {str(e)}"

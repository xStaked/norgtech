import json
from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from .nestjs_client import NestJSClient
from datetime import datetime, timedelta
from typing import Annotated

@tool
async def get_agenda(auth_token: Annotated[str, InjectedState("auth_token")]) -> str:
    """
    Obtiene la agenda del usuario actual: visitas programadas y tareas pendientes.
    Usa esta herramienta cuando el usuario pregunte "¿qué tengo hoy?", 
    "mi agenda", "¿qué visitas tengo?", "próximas tareas", etc.
    """
    try:
        nestjs_client = NestJSClient(auth_token)
        today = datetime.now()
        next_week = today + timedelta(days=7)
        
        # Obtener visitas
        visits_result = await nestjs_client.get("/visits", params={
            "from": today.strftime("%Y-%m-%d"),
            "to": next_week.strftime("%Y-%m-%d"),
        })
        visits = visits_result if isinstance(visits_result, list) else visits_result.get("data", [])
        
        # Obtener tareas
        tasks_result = await nestjs_client.get("/follow-up-tasks", params={
            "status": "pendiente",
        })
        tasks = tasks_result if isinstance(tasks_result, list) else tasks_result.get("data", [])
        
        agenda_items = []
        for v in visits[:10]:
            agenda_items.append({
                "id": v["id"],
                "type": "visit",
                "label": f"Visita: {v.get('customer', {}).get('displayName', 'Cliente')} - {v.get('summary', 'Sin resumen')}",
                "scheduledAt": v.get("scheduledAt"),
            })
        for t in tasks[:10]:
            agenda_items.append({
                "id": t["id"],
                "type": "follow_up_task",
                "label": f"Tarea: {t.get('title', 'Sin título')} - Vence: {t.get('dueAt', 'N/A')}",
                "scheduledAt": t.get("dueAt"),
            })
        
        agenda_items.sort(key=lambda x: x.get("scheduledAt") or "")
        
        if not agenda_items:
            return "No tienes visitas ni tareas pendientes para los próximos 7 días."
        
        return json.dumps({"items": agenda_items}, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"Error al obtener agenda: {str(e)}"

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
            summary = v.get("summary")
            display_name = v.get("customer", {}).get("displayName", "Cliente")
            label = summary if summary and summary != "None" else display_name
            agenda_items.append({
                "id": v["id"],
                "type": "visit",
                "label": label,
                "scheduledAt": v.get("scheduledAt"),
            })
        for t in tasks[:10]:
            title = t.get("title", "Sin título")
            agenda_items.append({
                "id": t["id"],
                "type": "follow_up_task",
                "label": title,
                "scheduledAt": t.get("dueAt"),
            })
        
        agenda_items.sort(key=lambda x: x.get("scheduledAt") or "")
        
        if not agenda_items:
            return "No tienes visitas ni tareas pendientes para los próximos 7 días."
        
        return json.dumps({"items": agenda_items}, ensure_ascii=False)
    except Exception as e:
        return f"Error al obtener agenda: {str(e)}"

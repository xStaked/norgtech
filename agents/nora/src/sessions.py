"""
Manejo de sesiones de Nora.
Usamos LangGraph MemorySaver para la memoria conversacional (mensajes).
La metadata de sesión (contexto) la manejamos en memoria por simplicidad.
Para producción, usar Redis o DB.
"""
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class SessionContext:
    session_id: str
    context_type: Optional[str] = None      # "customer" | "opportunity"
    context_entity_id: Optional[str] = None  # ID del cliente u oportunidad

class SessionStore:
    """Almacén simple en memoria para metadata de sesiones."""
    
    def __init__(self):
        self._sessions: dict[str, SessionContext] = {}

    def get_or_create(
        self,
        session_id: str,
        context_type: Optional[str] = None,
        context_entity_id: Optional[str] = None,
    ) -> SessionContext:
        if session_id not in self._sessions:
            self._sessions[session_id] = SessionContext(
                session_id=session_id,
                context_type=context_type,
                context_entity_id=context_entity_id,
            )
        return self._sessions[session_id]

    def get(self, session_id: str) -> Optional[SessionContext]:
        return self._sessions.get(session_id)

# Singleton
session_store = SessionStore()

"""
Manejo de sesiones de Nora.
Usamos LangGraph MemorySaver para la memoria conversacional (mensajes).
La metadata de sesión (contexto) la manejamos en memoria por simplicidad.
Para producción, usar Redis o DB.
"""
from dataclasses import dataclass, field
from typing import Optional

class SessionOwnershipError(Exception):
    """La sesión existe pero el request no viene de su dueño."""


@dataclass
class SessionContext:
    session_id: str
    owner_user_id: Optional[str] = None      # `sub` del JWT que la creó
    context_type: Optional[str] = None      # "customer" | "opportunity"
    context_entity_id: Optional[str] = None  # ID del cliente u oportunidad

class SessionStore:
    """Almacén simple en memoria para metadata de sesiones."""

    def __init__(self):
        self._sessions: dict[str, SessionContext] = {}

    def get_or_create(
        self,
        session_id: str,
        owner_user_id: Optional[str] = None,
        context_type: Optional[str] = None,
        context_entity_id: Optional[str] = None,
    ) -> SessionContext:
        existing = self._sessions.get(session_id)
        if existing is None:
            self._sessions[session_id] = SessionContext(
                session_id=session_id,
                owner_user_id=owner_user_id,
                context_type=context_type,
                context_entity_id=context_entity_id,
            )
            return self._sessions[session_id]
        # Sesión ya existente: solo su dueño puede seguirla. Sin usuario en el
        # token la sesión no es atribuible, así que tampoco pasa.
        if not owner_user_id or existing.owner_user_id != owner_user_id:
            raise SessionOwnershipError(session_id)
        return existing

    def get(self, session_id: str) -> Optional[SessionContext]:
        return self._sessions.get(session_id)

# Singleton
session_store = SessionStore()

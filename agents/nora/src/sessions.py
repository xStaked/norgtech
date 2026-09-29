"""
Manejo de sesiones de Nora.
Usamos LangGraph MemorySaver para la memoria conversacional (mensajes).
La metadata de sesión (contexto) la manejamos en memoria por simplicidad.
Para producción, usar Redis o DB.
"""
from dataclasses import dataclass, field
from typing import Optional
import time

class SessionOwnershipError(Exception):
    """La sesión existe pero el request no viene de su dueño."""


@dataclass
class SessionContext:
    session_id: str
    owner_user_id: Optional[str] = None      # `sub` del JWT que la creó
    context_type: Optional[str] = None      # "customer" | "opportunity"
    context_entity_id: Optional[str] = None  # ID del cliente u oportunidad

class SessionStore:
    """Metadata de sesiones en memoria con TTL y cota anti-OOM.

    TTL 24h + LRU 5000: un atacante con sessionIds aleatorios no puede
    tumbar el proceso. Al reusar la sesión el dueño sí puede actualizar
    el contexto (antes se ignoraba).
    """

    def __init__(self, ttl_hours: float = 24, max_sessions: int = 5000):
        self._sessions: dict[str, SessionContext] = {}
        self._seen: dict[str, float] = {}
        self._ttl_seconds = ttl_hours * 3600
        self._max = max_sessions

    def _purge_expired(self, now: float) -> None:
        threshold = self._ttl_seconds if self._ttl_seconds > 0 else 0
        expired = [
            sid for sid, seen in self._seen.items()
            if now - seen > threshold
        ]
        for sid in expired:
            self._sessions.pop(sid, None)
            self._seen.pop(sid, None)

    def _evict_lru_if_needed(self) -> None:
        while len(self._sessions) > self._max:
            oldest = min(self._seen, key=self._seen.get)
            self._sessions.pop(oldest, None)
            self._seen.pop(oldest, None)

    def get_or_create(
        self,
        session_id: str,
        owner_user_id: Optional[str] = None,
        context_type: Optional[str] = None,
        context_entity_id: Optional[str] = None,
    ) -> SessionContext:
        now = time.monotonic()
        self._purge_expired(now)
        existing = self._sessions.get(session_id)
        if existing is None:
            self._sessions[session_id] = SessionContext(
                session_id=session_id,
                owner_user_id=owner_user_id,
                context_type=context_type,
                context_entity_id=context_entity_id,
            )
            self._seen[session_id] = now
            self._evict_lru_if_needed()
            return self._sessions[session_id]
        # Sesión ya existente: solo su dueño puede seguirla. Sin usuario en el
        # token la sesión no es atribuible, así que tampoco pasa.
        if not owner_user_id or existing.owner_user_id != owner_user_id:
            raise SessionOwnershipError(session_id)
        # El dueño actualiza contexto solo con valores no-None (no borra).
        if context_type is not None:
            existing.context_type = context_type
        if context_entity_id is not None:
            existing.context_entity_id = context_entity_id
        self._seen[session_id] = now
        return existing

    def get(self, session_id: str) -> Optional[SessionContext]:
        now = time.monotonic()
        self._purge_expired(now)
        ctx = self._sessions.get(session_id)
        if ctx is not None:
            self._seen[session_id] = now
        return ctx

# Singleton
session_store = SessionStore()

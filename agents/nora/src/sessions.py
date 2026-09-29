"""
Sesiones de Nora: metadata de sesión (dueño + contexto) con backend dual.

- Con pool Postgres (prod / tests con TEST_DATABASE_URL): tabla `nora_sessions`
  (misma regla que Fase 1: solo el dueño continúa la sesión; el dueño actualiza
  contexto solo con valores no-None; TTL 24h con DELETE oportunista; cota
  anti-OOM por LRU sobre `last_seen_at`).
- Sin pool (dev sin DB, tests sin lifespan): memoria en proceso, igual que
  Fase 1.

La API pública no cambia: clase `SessionStore`, `get_or_create(...)` y `get(...)`.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional
import time

from . import persistence

class SessionOwnershipError(Exception):
    """La sesión existe pero el request no viene de su dueño."""


@dataclass
class SessionContext:
    session_id: str
    owner_user_id: Optional[str] = None      # `sub` del JWT que la creó
    context_type: Optional[str] = None      # "customer" | "opportunity"
    context_entity_id: Optional[str] = None  # ID del cliente u oportunidad


async def setup_sessions() -> None:
    """Crea la tabla `nora_sessions` sobre el pool compartido (ver Task 1)."""
    pool = persistence.get_pool()
    if pool is None:
        raise RuntimeError("setup_sessions sin pool: llamar a create_saver() primero")
    async with pool.connection() as conn:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS nora_sessions (
                session_id TEXT PRIMARY KEY,
                owner_user_id TEXT,
                context_type TEXT,
                context_entity_id TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )

class SessionStore:
    """Metadata de sesiones con TTL y cota anti-OOM.

    TTL 24h + LRU 5000: un atacante con sessionIds aleatorios no puede
    tumbar el proceso. Al reusar la sesión el dueño sí puede actualizar
    el contexto (antes se ignoraba).
    """

    _ROW_COLS = (
        "session_id, owner_user_id, context_type, context_entity_id, last_seen_at"
    )

    def __init__(self, ttl_hours: float = 24, max_sessions: int = 5000):
        self._sessions: dict[str, SessionContext] = {}
        self._seen: dict[str, float] = {}
        self._ttl_seconds = ttl_hours * 3600
        self._max = max_sessions

    def _pool(self):
        """Pool compartido si está abierto; None en dev sin DB (modo memoria)."""
        return persistence.get_pool()

    def _cutoff(self) -> datetime:
        return datetime.now(timezone.utc) - timedelta(seconds=self._ttl_seconds)

    async def get_or_create(
        self,
        session_id: str,
        owner_user_id: Optional[str] = None,
        context_type: Optional[str] = None,
        context_entity_id: Optional[str] = None,
    ) -> SessionContext:
        pool = self._pool()
        if pool is None:
            return self._get_or_create_local(
                session_id, owner_user_id, context_type, context_entity_id
            )
        return await self._get_or_create_pg(
            pool, session_id, owner_user_id, context_type, context_entity_id
        )

    async def get(self, session_id: str) -> Optional[SessionContext]:
        pool = self._pool()
        if pool is None:
            return self._get_local(session_id)
        return await self._get_pg(pool, session_id)

    # -- Backend en memoria (Fase 1, sin cambios) ---------------------------

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

    def _get_or_create_local(
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

    def _get_local(self, session_id: str) -> Optional[SessionContext]:
        now = time.monotonic()
        self._purge_expired(now)
        ctx = self._sessions.get(session_id)
        if ctx is not None:
            self._seen[session_id] = now
        return ctx

    # -- Backend Postgres ----------------------------------------------------

    async def _get_or_create_pg(
        self,
        pool,
        session_id: str,
        owner_user_id: Optional[str] = None,
        context_type: Optional[str] = None,
        context_entity_id: Optional[str] = None,
    ) -> SessionContext:
        now = datetime.now(timezone.utc)
        async with pool.connection() as conn:
            # TTL 24h: purga oportunista de expiradas en cada escritura.
            await conn.execute(
                "DELETE FROM nora_sessions WHERE last_seen_at < %s",
                (self._cutoff(),),
            )
            cur = await conn.execute(
                f"SELECT {self._ROW_COLS} FROM nora_sessions WHERE session_id = %s",
                (session_id,),
            )
            row = await cur.fetchone()
            if row is None:
                cur = await conn.execute(
                    "INSERT INTO nora_sessions "
                    "(session_id, owner_user_id, context_type, "
                    "context_entity_id, created_at, last_seen_at) "
                    "VALUES (%s, %s, %s, %s, %s, %s) "
                    "ON CONFLICT (session_id) DO NOTHING "
                    f"RETURNING {self._ROW_COLS}",
                    (
                        session_id,
                        owner_user_id,
                        context_type,
                        context_entity_id,
                        now,
                        now,
                    ),
                )
                row = await cur.fetchone()
                if row is None:
                    # Carrera: otro worker la creó entre el SELECT y el INSERT.
                    cur = await conn.execute(
                        f"SELECT {self._ROW_COLS} FROM nora_sessions "
                        "WHERE session_id = %s",
                        (session_id,),
                    )
                    row = await cur.fetchone()
                    if row is None:  # pragma: no cover - purga concurrente
                        raise RuntimeError(f"sesión no visible tras crear: {session_id}")
                else:
                    # Creada por nosotros: es nuestra, sin chequeo de ownership.
                    await self._evict_lru_pg(conn)
                    return SessionContext(
                        session_id=row["session_id"],
                        owner_user_id=row["owner_user_id"],
                        context_type=row["context_type"],
                        context_entity_id=row["context_entity_id"],
                    )
            # Sesión ya existente: solo su dueño puede seguirla. Sin usuario en
            # el token la sesión no es atribuible, así que tampoco pasa.
            if not owner_user_id or row["owner_user_id"] != owner_user_id:
                raise SessionOwnershipError(session_id)
            # El dueño actualiza contexto solo con valores no-None (no borra).
            new_type = (
                context_type if context_type is not None else row["context_type"]
            )
            new_entity = (
                context_entity_id
                if context_entity_id is not None
                else row["context_entity_id"]
            )
            cur = await conn.execute(
                "UPDATE nora_sessions SET context_type = %s, "
                "context_entity_id = %s, last_seen_at = %s "
                "WHERE session_id = %s "
                f"RETURNING {self._ROW_COLS}",
                (new_type, new_entity, now, session_id),
            )
            row = await cur.fetchone()
            return SessionContext(
                session_id=row["session_id"],
                owner_user_id=row["owner_user_id"],
                context_type=row["context_type"],
                context_entity_id=row["context_entity_id"],
            )

    async def _evict_lru_pg(self, conn) -> None:
        """Cota anti-OOM: conserva las `max` sesiones vistas más recientemente."""
        await conn.execute(
            "DELETE FROM nora_sessions WHERE session_id IN ("
            "SELECT session_id FROM nora_sessions "
            "ORDER BY last_seen_at ASC, session_id ASC OFFSET %s)",
            (self._max,),
        )

    async def _get_pg(self, pool, session_id: str) -> Optional[SessionContext]:
        now = datetime.now(timezone.utc)
        async with pool.connection() as conn:
            cur = await conn.execute(
                f"SELECT {self._ROW_COLS} FROM nora_sessions WHERE session_id = %s",
                (session_id,),
            )
            row = await cur.fetchone()
            if row is None:
                return None
            if row["last_seen_at"] < self._cutoff():
                await conn.execute(
                    "DELETE FROM nora_sessions WHERE session_id = %s",
                    (session_id,),
                )
                return None
            await conn.execute(
                "UPDATE nora_sessions SET last_seen_at = %s WHERE session_id = %s",
                (now, session_id),
            )
            return SessionContext(
                session_id=row["session_id"],
                owner_user_id=row["owner_user_id"],
                context_type=row["context_type"],
                context_entity_id=row["context_entity_id"],
            )

# Singleton
session_store = SessionStore()

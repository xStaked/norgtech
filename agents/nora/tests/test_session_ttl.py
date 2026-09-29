"""TTL + cota + actualización de contexto en SessionStore."""
import asyncio
import time

from src.sessions import SessionStore


def test_context_updates_on_reuse():
    async def _run():
        s = SessionStore(ttl_hours=24, max_sessions=10)
        await s.get_or_create("s1", owner_user_id="u1")
        ctx = await s.get_or_create(
            "s1", owner_user_id="u1", context_type="customer", context_entity_id="c9"
        )
        assert ctx.context_type == "customer"
        assert ctx.context_entity_id == "c9"

    asyncio.run(_run())


def test_context_none_does_not_wipe_existing():
    async def _run():
        s = SessionStore(ttl_hours=24, max_sessions=10)
        await s.get_or_create(
            "s1", owner_user_id="u1", context_type="customer", context_entity_id="c9"
        )
        ctx = await s.get_or_create("s1", owner_user_id="u1")
        assert ctx.context_type == "customer"
        assert ctx.context_entity_id == "c9"

    asyncio.run(_run())


def test_ttl_evicts_old_session():
    async def _run():
        s = SessionStore(ttl_hours=0, max_sessions=10)
        await s.get_or_create("sold", owner_user_id="u1")
        # Forzar expiración manipulando el timestamp interno
        s._seen["sold"] = time.monotonic() - 7200
        # Debe poder recrearse con otro dueño sin 403 fantasma
        ctx = await s.get_or_create("sold", owner_user_id="u2")
        assert ctx.owner_user_id == "u2"

    asyncio.run(_run())


def test_max_sessions_evicts_lru():
    async def _run():
        s = SessionStore(ttl_hours=24, max_sessions=2)
        await s.get_or_create("a", owner_user_id="u1")
        await s.get_or_create("b", owner_user_id="u1")
        await s.get_or_create("c", owner_user_id="u1")
        assert await s.get("a") is None
        assert await s.get("c") is not None

    asyncio.run(_run())

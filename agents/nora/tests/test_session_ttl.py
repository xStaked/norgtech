"""TTL + cota + actualización de contexto en SessionStore."""
import time

from src.sessions import SessionStore


def test_context_updates_on_reuse():
    s = SessionStore(ttl_hours=24, max_sessions=10)
    s.get_or_create("s1", owner_user_id="u1")
    ctx = s.get_or_create(
        "s1", owner_user_id="u1", context_type="customer", context_entity_id="c9"
    )
    assert ctx.context_type == "customer"
    assert ctx.context_entity_id == "c9"


def test_context_none_does_not_wipe_existing():
    s = SessionStore(ttl_hours=24, max_sessions=10)
    s.get_or_create(
        "s1", owner_user_id="u1", context_type="customer", context_entity_id="c9"
    )
    ctx = s.get_or_create("s1", owner_user_id="u1")
    assert ctx.context_type == "customer"
    assert ctx.context_entity_id == "c9"


def test_ttl_evicts_old_session():
    s = SessionStore(ttl_hours=0, max_sessions=10)
    s.get_or_create("sold", owner_user_id="u1")
    # Forzar expiración manipulando el timestamp interno
    s._seen["sold"] = time.monotonic() - 7200
    # Debe poder recrearse con otro dueño sin 403 fantasma
    ctx = s.get_or_create("sold", owner_user_id="u2")
    assert ctx.owner_user_id == "u2"


def test_max_sessions_evicts_lru():
    s = SessionStore(ttl_hours=24, max_sessions=2)
    s.get_or_create("a", owner_user_id="u1")
    s.get_or_create("b", owner_user_id="u1")
    s.get_or_create("c", owner_user_id="u1")
    assert s.get("a") is None
    assert s.get("c") is not None

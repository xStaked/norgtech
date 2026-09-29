"""Serializa turnos de la misma sesión: el doble-submit espera, no pisa el checkpoint."""
import asyncio


def test_same_session_returns_same_lock():
    from src.locks import get_session_lock

    assert get_session_lock("s-1") is get_session_lock("s-1")


def test_different_sessions_different_locks():
    from src.locks import get_session_lock

    assert get_session_lock("s-1") is not get_session_lock("s-2")


def test_concurrent_same_session_serializes():
    from src.locks import get_session_lock

    async def _run():
        order: list[str] = []

        async def _turn(name: str):
            async with get_session_lock("s-busy"):
                order.append(f"start-{name}")
                await asyncio.sleep(0.05)
                order.append(f"end-{name}")

        await asyncio.gather(_turn("a"), _turn("b"))
        return order

    order = asyncio.run(_run())
    # Serializado: a termina antes de que b empiece, o viceversa. Nunca intercalado.
    assert order in (
        ["start-a", "end-a", "start-b", "end-b"],
        ["start-b", "end-b", "start-a", "end-a"],
    )

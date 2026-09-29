"""Persistencia compartida de Nora en Postgres (Fase 2a).

El pool vive en este módulo y es ÚNICO: las tareas siguientes (locks
pg, sesiones) lo importan de aquí, no crean pools propios. Costo de
duplicarlo: locks contra un pool y checkpoints contra otro.
"""
from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

SCHEMA = "nora_langgraph"

_pool: AsyncConnectionPool | None = None
_pool_dsn: str | None = None


async def _configure_conn(conn: AsyncConnection) -> None:
    """Cada conexión del pool apunta al schema de Nora."""
    await conn.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")
    await conn.execute(f"SET search_path TO {SCHEMA}, public")


async def create_saver(dsn: str) -> AsyncPostgresSaver:
    """Saver contra el pool compartido del módulo (lo abre si falta).

    Dos llamadas devuelven instancias distintas sobre el mismo pool, así
    que ven el mismo estado de cada thread.
    """
    global _pool, _pool_dsn
    if _pool is None or _pool.closed or _pool_dsn != dsn:
        if _pool is not None and not _pool.closed:
            await _pool.close()
        _pool = None
        pool = AsyncConnectionPool(
            dsn,
            open=False,
            timeout=10,
            kwargs={
                "autocommit": True,
                "prepare_threshold": 0,
                "row_factory": dict_row,
            },
            configure=_configure_conn,
        )
        try:
            await pool.open()
        except Exception:
            await pool.close()
            raise
        _pool = pool
        _pool_dsn = dsn
    return AsyncPostgresSaver(conn=_pool)


async def setup_saver(saver: AsyncPostgresSaver) -> None:
    """Crea el schema `nora_langgraph` + tablas (vía el setup() del saver)."""
    if _pool is not None and not _pool.closed:
        async with _pool.connection() as conn:
            await conn.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")
    await saver.setup()


async def close_pool() -> None:
    """Cierra el pool compartido (shutdown del lifespan, higiene en tests)."""
    global _pool, _pool_dsn
    if _pool is not None:
        try:
            if not _pool.closed:
                await _pool.close()
        finally:
            _pool = None
            _pool_dsn = None

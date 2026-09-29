"""Guard de workers (Fase 2a): N workers solo con backend Postgres.

Sin backend PG (locks locales o sin DATABASE_URL) más de 1 worker parte la
memoria en dos (split-brain de hilos y bypass de ownership): se rechaza.
Con backend PG (DATABASE_URL sin NORA_LOCAL_LOCKS) turnos y sesiones viven
en Postgres y N workers son seguros: se permite.
"""
import os


def test_dockerfile_runs_multi_worker_by_default():
    here = os.path.dirname(__file__)
    dockerfile = os.path.join(here, "..", "Dockerfile")
    with open(dockerfile) as f:
        text = f.read()
    assert "--workers ${WEB_CONCURRENCY:-2}" in text
    assert "ENV WEB_CONCURRENCY=2" in text
    assert "--workers 1" not in text


def _local_env(monkeypatch):
    """Backend local: sin DATABASE_URL y con locks en memoria."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("NORA_LOCAL_LOCKS", "1")


def test_guard_rejects_multi_worker(monkeypatch):
    from src.main import assert_single_worker

    _local_env(monkeypatch)
    monkeypatch.setenv("WEB_CONCURRENCY", "2")
    try:
        assert_single_worker()
    except RuntimeError:
        return
    raise AssertionError("debió lanzar RuntimeError con WEB_CONCURRENCY=2 en local")


def test_guard_rejects_multi_worker_without_database_url(monkeypatch):
    """Sin DATABASE_URL tampoco hay backend PG: N workers se rechazan."""
    from src.main import assert_single_worker

    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("NORA_LOCAL_LOCKS", raising=False)
    monkeypatch.setenv("WEB_CONCURRENCY", "2")
    try:
        assert_single_worker()
    except RuntimeError:
        return
    raise AssertionError("debió lanzar RuntimeError con WEB_CONCURRENCY=2 sin DB")


def test_guard_rejects_workers_flag_in_argv(monkeypatch):
    """El Dockerfile escala con --workers, no con WEB_CONCURRENCY."""
    from src.main import assert_single_worker

    _local_env(monkeypatch)
    monkeypatch.delenv("WEB_CONCURRENCY", raising=False)
    monkeypatch.setattr(
        "sys.argv",
        ["uvicorn", "src.main:app", "--workers", "2"],
    )
    try:
        assert_single_worker()
    except RuntimeError:
        return
    raise AssertionError("debió lanzar RuntimeError con --workers 2 en argv")


def test_guard_rejects_workers_flag_equals_form(monkeypatch):
    from src.main import assert_single_worker

    _local_env(monkeypatch)
    monkeypatch.delenv("WEB_CONCURRENCY", raising=False)
    monkeypatch.setattr(
        "sys.argv",
        ["uvicorn", "src.main:app", "--workers=4"],
    )
    try:
        assert_single_worker()
    except RuntimeError:
        return
    raise AssertionError("debió lanzar RuntimeError con --workers=4 en argv")


def test_guard_allows_single_worker(monkeypatch):
    from src.main import assert_single_worker

    _local_env(monkeypatch)
    monkeypatch.delenv("WEB_CONCURRENCY", raising=False)
    assert_single_worker()


def test_guard_allows_multi_worker_with_pg_backend(monkeypatch):
    """Con DATABASE_URL (y sin locks locales) N workers están permitidos."""
    from src.main import assert_single_worker

    monkeypatch.setenv("DATABASE_URL", "postgresql://nora:nora@localhost:5432/nora_test")
    monkeypatch.delenv("NORA_LOCAL_LOCKS", raising=False)
    monkeypatch.setenv("WEB_CONCURRENCY", "2")
    assert_single_worker()


def test_guard_allows_workers_flag_with_pg_backend(monkeypatch):
    from src.main import assert_single_worker

    monkeypatch.setenv("DATABASE_URL", "postgresql://nora:nora@localhost:5432/nora_test")
    monkeypatch.delenv("NORA_LOCAL_LOCKS", raising=False)
    monkeypatch.delenv("WEB_CONCURRENCY", raising=False)
    monkeypatch.setattr(
        "sys.argv",
        ["uvicorn", "src.main:app", "--workers", "4"],
    )
    assert_single_worker()


def test_pg_backend_active_matrix(monkeypatch):
    """pg_backend_active: DATABASE_URL sin flag local; el flag local manda."""
    from src.main import pg_backend_active

    monkeypatch.setenv("DATABASE_URL", "postgresql://x")
    monkeypatch.delenv("NORA_LOCAL_LOCKS", raising=False)
    assert pg_backend_active() is True

    monkeypatch.setenv("NORA_LOCAL_LOCKS", "1")
    assert pg_backend_active() is False

    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("NORA_LOCAL_LOCKS", raising=False)
    assert pg_backend_active() is False

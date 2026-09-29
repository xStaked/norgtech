"""Single worker hasta Fase 2: sin split-brain de MemorySaver/SessionStore."""
import os


def test_dockerfile_runs_single_worker():
    here = os.path.dirname(__file__)
    dockerfile = os.path.join(here, "..", "Dockerfile")
    with open(dockerfile) as f:
        text = f.read()
    assert "--workers 1" in text
    assert "--workers 2" not in text


def test_guard_rejects_multi_worker(monkeypatch):
    from src.main import assert_single_worker

    monkeypatch.setenv("WEB_CONCURRENCY", "2")
    try:
        assert_single_worker()
    except RuntimeError:
        return
    raise AssertionError("debió lanzar RuntimeError con WEB_CONCURRENCY=2")


def test_guard_allows_single_worker(monkeypatch):
    from src.main import assert_single_worker

    monkeypatch.delenv("WEB_CONCURRENCY", raising=False)
    assert_single_worker()

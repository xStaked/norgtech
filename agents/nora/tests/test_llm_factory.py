"""create_llm sin rama muerta: provider openai usa openai_model siempre."""


def test_create_llm_openai_uses_openai_model(monkeypatch):
    import src.agent as agent_mod

    monkeypatch.setattr(agent_mod.settings, "llm_provider", "openai")
    monkeypatch.setattr(agent_mod.settings, "openai_model", "gpt-4o-test")
    monkeypatch.setattr(agent_mod.settings, "openai_api_key", "sk-test")

    llm = agent_mod.create_llm()
    assert llm.model_name == "gpt-4o-test"


def test_create_llm_unknown_provider_raises(monkeypatch):
    import pytest

    import src.agent as agent_mod

    monkeypatch.setattr(agent_mod.settings, "llm_provider", "no-existe")
    with pytest.raises(ValueError):
        agent_mod.create_llm()


def test_no_duplicate_openai_branch():
    import inspect

    import src.agent as agent_mod

    src = inspect.getsource(agent_mod.create_llm)
    assert src.count('llm_provider == "openai"') == 1
    assert "llm_model" not in src

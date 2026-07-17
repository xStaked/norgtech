"""AI-06: create_expense debe estar registrada en ALL_TOOLS, si no el LLM no
puede crear un gasto desde un mensaje escrito. Este test se rompe si alguien la
quita de la lista (mutation-tested)."""
from src.agent import ALL_TOOLS


def _tool_names():
    return {t.name for t in ALL_TOOLS}


def test_create_expense_is_registered():
    assert "create_expense" in _tool_names()


def test_get_customer_summary_is_registered():
    assert "get_customer_summary" in _tool_names()

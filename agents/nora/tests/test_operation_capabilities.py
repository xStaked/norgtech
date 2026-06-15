from src.operation.capabilities import get_capability, list_capabilities


def test_lists_core_commercial_capabilities():
    capabilities = list_capabilities()

    assert any(cap.domain == "orders" and cap.action == "create_draft" for cap in capabilities)
    assert any(cap.domain == "credit" and cap.action == "summary" for cap in capabilities)
    assert any(cap.domain == "whatsapp" and cap.action == "summarize_conversation" for cap in capabilities)


def test_order_draft_requires_human_review_and_core_fields():
    capability = get_capability("orders", "create_draft")

    assert capability is not None
    assert capability.requires_human_review is True
    assert capability.required_fields == ["customer_id", "company_id", "items"]
    assert capability.risk_level == "high"


def test_unsupported_capability_returns_none():
    assert get_capability("orders", "bulk_delete") is None

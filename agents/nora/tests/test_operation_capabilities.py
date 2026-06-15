from src.operation.capabilities import get_capability, list_capabilities


def test_registry_matches_initial_contract():
    capabilities = list_capabilities()

    expected = (
        ("customers", "search", ("comercial", "admin"), "read", False, (), "low", "Buscar clientes"),
        (
            "orders",
            "status",
            ("cliente", "comercial", "admin"),
            "read",
            False,
            (),
            "low",
            "Consultar estado de pedidos",
        ),
        (
            "orders",
            "create_draft",
            ("cliente", "comercial", "admin"),
            "write",
            True,
            ("customer_id", "company_id", "items"),
            "high",
            "Preparar borrador de pedido",
        ),
        (
            "credit",
            "summary",
            ("comercial", "admin"),
            "read",
            False,
            ("customer_id",),
            "medium",
            "Consultar cupo y cartera",
        ),
        (
            "payments",
            "register_support_event",
            ("cliente", "admin"),
            "write",
            True,
            ("customer_id",),
            "high",
            "Registrar soporte de pago para revision",
        ),
        (
            "logistics",
            "register_tracking_event",
            ("admin",),
            "write",
            True,
            (),
            "high",
            "Registrar guia o evento logistico para revision",
        ),
        (
            "visits",
            "agenda",
            ("comercial",),
            "read",
            False,
            (),
            "low",
            "Consultar agenda comercial",
        ),
        (
            "expenses",
            "create_expense_draft",
            ("comercial",),
            "write",
            True,
            ("expense_date", "category", "amount", "description"),
            "medium",
            "Preparar gasto comercial para revision",
        ),
        (
            "dashboard",
            "sales_summary",
            ("comercial", "admin"),
            "read",
            False,
            (),
            "low",
            "Consultar resumen de ventas",
        ),
        (
            "whatsapp",
            "summarize_conversation",
            ("admin",),
            "read",
            False,
            (),
            "low",
            "Resumir conversacion de WhatsApp",
        ),
    )

    assert len(capabilities) == len(expected)

    for capability, expected_item in zip(capabilities, expected, strict=True):
        assert (
            capability.domain,
            capability.action,
            capability.modes,
            capability.kind,
            capability.requires_human_review,
            capability.required_fields,
            capability.risk_level,
            capability.summary,
        ) == expected_item


def test_lists_core_commercial_capabilities():
    capabilities = list_capabilities()

    assert any(cap.domain == "orders" and cap.action == "create_draft" for cap in capabilities)
    assert any(cap.domain == "credit" and cap.action == "summary" for cap in capabilities)
    assert any(cap.domain == "whatsapp" and cap.action == "summarize_conversation" for cap in capabilities)


def test_order_draft_requires_human_review_and_core_fields():
    capability = get_capability("orders", "create_draft")

    assert capability is not None
    assert capability.requires_human_review is True
    assert capability.required_fields == ("customer_id", "company_id", "items")
    assert capability.risk_level == "high"


def test_unsupported_capability_returns_none():
    assert get_capability("orders", "bulk_delete") is None

from src.whatsapp_router import route_whatsapp_message


def test_cliente_mode_extracts_order_intent():
    result = route_whatsapp_message(
        {
            "sender_type": "cliente",
            "message": "Necesito 10 bultos de producto A para la costa",
            "customer": {"id": "customer-1", "displayName": "Agro Norte"},
            "companies": [{"id": "company-nt", "name": "Nortech", "prefix": "NT"}],
        }
    )

    assert result["mode"] == "cliente"
    assert result["intent"] == "pedido"
    assert result["requires_human_review"] is True
    assert result["proposed_order"]["source"] == "whatsapp"


def test_comercial_mode_limits_to_sales_context():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "Como van mis pedidos pendientes?",
        }
    )

    assert result["mode"] == "comercial"
    assert result["intent"] == "consulta_pedidos"


def test_cliente_order_response_includes_structured_proposal_list():
    result = route_whatsapp_message(
        {
            "sender_type": "cliente",
            "message": "Necesito 10 bultos de producto A para la costa",
            "conversation_id": "conversation-1",
            "customer": {"id": "customer-1", "displayName": "Agro Norte"},
            "companies": [{"id": "company-nt", "name": "Nortech", "prefix": "NT"}],
            "customer_zones": [{"id": "zone-costa", "name": "Costa"}],
        }
    )

    assert result["mode"] == "cliente"
    assert result["intent"] == "pedido"
    assert result["risk_level"] == "high"
    assert result["requires_human_review"] is True
    assert result["proposals"][0]["type"] == "order_draft"
    assert result["proposals"][0]["payload"]["customerId"] == "customer-1"
    assert result["proposals"][0]["payload"]["companyId"] == "company-nt"
    assert result["proposals"][0]["payload"]["customerZoneId"] == "zone-costa"
    assert result["proposals"][0]["payload"]["sourceConversationId"] == "conversation-1"


def test_cliente_order_missing_company_asks_one_clarification():
    result = route_whatsapp_message(
        {
            "sender_type": "cliente",
            "message": "Necesito 10 bultos de producto A para la costa",
            "conversation_id": "conversation-1",
            "customer": {"id": "customer-1", "displayName": "Agro Norte"},
            "companies": [
                {"id": "company-nt", "name": "Nortech", "prefix": "NT"},
                {"id": "company-nn", "name": "Nanonutricion", "prefix": "NN"},
            ],
            "customer_zones": [{"id": "zone-costa", "name": "Costa"}],
        }
    )

    assert result["intent"] == "clarification"
    assert result["missing_fields"] == ["company_id"]
    assert "empresa" in result["suggested_reply"].lower()
    assert result["proposals"] == []


def test_credit_query_without_customer_context_requests_clarification():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "Necesito revisar el cupo y la cartera",
        }
    )

    assert result["intent"] == "clarification"
    assert result["missing_fields"] == ["customer_id"]


def test_payment_support_without_customer_context_requests_clarification():
    result = route_whatsapp_message(
        {
            "sender_type": "cliente",
            "message": "Adjunto soporte de pago por transferencia",
        }
    )

    assert result["intent"] == "clarification"
    assert result["missing_fields"] == ["customer_id"]


def test_comercial_expense_message_builds_expense_draft_proposal():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "Gasto de almuerzo por 45000 con cliente",
        }
    )

    assert result["intent"] == "gasto"
    assert result["proposals"][0]["type"] == "expense_draft"
    assert result["proposals"][0]["payload"]["amount"] == 45000
    assert result["proposals"][0]["payload"]["category"] == "alimentacion"
    assert (
        result["proposals"][0]["payload"]["description"]
        == "Gasto de almuerzo por 45000 con cliente"
    )


def test_overlapping_zones_require_clarification_instead_of_first_match():
    result = route_whatsapp_message(
        {
            "sender_type": "cliente",
            "message": "Necesito 10 bultos para centro norte",
            "conversation_id": "conversation-2",
            "customer": {"id": "customer-1", "displayName": "Agro Norte"},
            "companies": [{"id": "company-nt", "name": "Nortech", "prefix": "NT"}],
            "customer_zones": [
                {"id": "zone-centro", "name": "Centro"},
                {"id": "zone-centro-norte", "name": "Centro Norte"},
            ],
        }
    )

    assert result["intent"] == "clarification"
    assert result["missing_fields"] == ["customer_zone_id"]


def test_short_company_prefix_does_not_match_inside_word():
    result = route_whatsapp_message(
        {
            "sender_type": "cliente",
            "message": "Necesito pasar 10 bultos hoy",
            "conversation_id": "conversation-3",
            "customer": {"id": "customer-1", "displayName": "Agro Norte"},
            "companies": [
                {"id": "company-sa", "name": "Solla Agro", "prefix": "SA"},
                {"id": "company-nt", "name": "Nortech", "prefix": "NT"},
            ],
            "customer_zones": [{"id": "zone-costa", "name": "Costa"}],
        }
    )

    assert result["intent"] == "clarification"
    assert result["missing_fields"] == ["company_id"]


def test_small_plain_expense_amount_builds_expense_draft():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "Gasto de peaje por 500",
        }
    )

    assert result["intent"] == "gasto"
    assert result["proposals"][0]["type"] == "expense_draft"
    assert result["proposals"][0]["payload"]["amount"] == 500
    assert result["proposals"][0]["payload"]["category"] == "peajes"


def test_payment_support_with_customer_context_returns_proposal():
    result = route_whatsapp_message(
        {
            "sender_type": "cliente",
            "message": "Adjunto soporte de pago por transferencia",
            "customer": {"id": "customer-1", "displayName": "Agro Norte"},
        }
    )

    assert result["intent"] == "soporte_pago"
    assert result["risk_level"] == "high"
    assert result["requires_human_review"] is True
    assert result["proposals"][0]["type"] == "payment_support"
    assert result["proposals"][0]["payload"]["customerId"] == "customer-1"


def test_admin_logistics_message_returns_logistics_event_proposal():
    result = route_whatsapp_message(
        {
            "sender_type": "admin",
            "message": "Comparto guia de despacho para entrega de hoy",
        }
    )

    assert result["intent"] == "guia_logistica"
    assert result["risk_level"] == "high"
    assert result["requires_human_review"] is True
    assert result["proposals"][0]["type"] == "logistics_event"


def test_expense_amount_prefers_value_after_por_over_date_tokens():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "Gasto de peaje 12/06 por 500",
        }
    )

    assert result["intent"] == "gasto"
    assert result["proposals"][0]["type"] == "expense_draft"
    assert result["proposals"][0]["payload"]["amount"] == 500
    assert result["proposals"][0]["payload"]["category"] == "peajes"


def test_expense_amount_prefers_money_over_headcount():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "Gasto de almuerzo 2 personas por 45.000",
        }
    )

    assert result["intent"] == "gasto"
    assert result["proposals"][0]["type"] == "expense_draft"
    assert result["proposals"][0]["payload"]["amount"] == 45000
    assert result["proposals"][0]["payload"]["category"] == "alimentacion"


def test_expense_amount_keeps_first_money_value_when_headcount_appears_later():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "Gasto de peaje 500 con 2 personas",
        }
    )

    assert result["intent"] == "gasto"
    assert result["proposals"][0]["type"] == "expense_draft"
    assert result["proposals"][0]["payload"]["amount"] == 500
    assert result["proposals"][0]["payload"]["category"] == "peajes"


def test_expense_amount_without_money_clarifies_when_only_headcount_is_present():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "Gasto de almuerzo 2 personas",
        }
    )

    assert result["intent"] == "clarification"
    assert result["missing_fields"] == ["amount"]
    assert "valor del gasto" in result["suggested_reply"].lower()
    assert result["proposals"] == []


def test_expense_amount_ignores_date_like_tokens_without_money_value():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "Gasto de peaje 12/06",
        }
    )

    assert result["intent"] == "clarification"
    assert result["missing_fields"] == ["amount"]
    assert "valor del gasto" in result["suggested_reply"].lower()
    assert result["proposals"] == []

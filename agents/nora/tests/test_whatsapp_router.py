from src.whatsapp_router import route_whatsapp_message


def test_cliente_mode_extracts_order_intent():
    result = route_whatsapp_message(
        {
            "sender_type": "cliente",
            "message": "Necesito 10 bultos de producto A para la costa",
            "customer": {"displayName": "Agro Norte"},
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

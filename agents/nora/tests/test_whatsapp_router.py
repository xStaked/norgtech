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

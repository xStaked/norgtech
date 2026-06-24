from langchain_core.messages import ToolMessage

from src.main import _extract_order_data_from_messages


def test_extract_order_data_includes_company_and_zone():
    detail = {
        "id": "ord_1",
        "customerId": "cus_1",
        "companyId": "co_1",
        "customerZoneId": "cz_1",
        "items": [{"productId": "p_1", "quantity": 2, "unitPrice": 1000, "notes": None}],
    }
    msg = ToolMessage(
        content="Pedido creado. Detalle completo: " + __import__("json").dumps(detail),
        name="create_order",
        tool_call_id="tc_1",
    )

    data = _extract_order_data_from_messages([msg])

    assert data["companyId"] == "co_1"
    assert data["customerZoneId"] == "cz_1"
    assert data["id"] == "ord_1"

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
    assert result["requires_human_review"] is False
    assert result["proposed_order"]["source"] == "whatsapp"


def test_comercial_mode_limits_to_sales_context():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "Como van mis pedidos pendientes?",
            "user": {
                "id": "sales-user-id",
                "role": "comercial",
                "name": "Sales",
                "email": "sales@norgtech.local",
            },
        }
    )

    assert result["mode"] == "comercial"
    assert result["intent"] == "consulta_pedidos"


def test_internal_user_order_request_asks_for_customer_instead_of_unsupported():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "necesito 10 bultos de FERT-001 por NOR para la zona Costa",
            "conversation_id": "conversation-sergio",
            "user": {
                "id": "sergio-user-id",
                "role": "comercial",
                "name": "Sergio",
                "email": "sergio@norgtech.local",
            },
            "companies": [{"id": "company-nor", "name": "Norgtech", "prefix": "NOR"}],
            "customer_zones": [{"id": "zone-costa", "name": "Costa"}],
        }
    )

    assert result["mode"] == "comercial"
    assert result["intent"] == "clarification"
    assert result["requires_human_review"] is False
    assert result["missing_fields"] == ["customer_id"]
    assert "cliente" in result["suggested_reply"].lower()
    assert result["blocked_reason"] is None


def test_comercial_user_can_query_today_agenda():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "Que tengo pendiente hoy?",
            "user": {
                "id": "sales-user-id",
                "role": "comercial",
                "name": "Sales",
                "email": "sales@norgtech.local",
            },
        }
    )

    assert result["mode"] == "comercial"
    assert result["intent"] == "agenda"
    assert result["risk_level"] == "low"
    assert result["requires_human_review"] is False
    assert result["proposals"] == []


def test_comercial_greeting_auto_replies_without_human_review():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "hola nora",
            "user": {
                "id": "sales-user-id",
                "role": "comercial",
                "name": "Sales",
                "email": "sales@norgtech.local",
            },
        }
    )

    assert result["mode"] == "comercial"
    assert result["intent"] == "clasificacion"
    assert result["requires_human_review"] is False
    assert result["proposals"] == []
    assert result["suggested_reply"]


def test_comercial_new_customer_request_starts_case_instead_of_general_classification():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "necesito crear un cliente",
            "conversation_id": "conversation-sergio",
            "user": {
                "id": "sales-user-id",
                "role": "comercial",
                "name": "Sergio",
                "email": "sergio@norgtech.local",
            },
        }
    )

    assert result["intent"] == "crear_cliente"
    assert result["requires_human_review"] is False
    assert result["case_transition"]["action"] == "start_case"
    assert result["case_transition"]["type"] == "new_customer"
    assert result["case_transition"]["missingFields"] == [
        "displayName",
        "taxId",
        "city",
        "phone",
    ]
    assert "nombre" in result["suggested_reply"].lower()
    assert "nit" in result["suggested_reply"].lower()


def test_comercial_visit_creation_start_does_not_route_to_expense():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "vamos a crear una visita",
            "conversation_id": "conversation-sergio",
            "user": {
                "id": "sales-user-id",
                "role": "comercial",
                "name": "Sergio",
                "email": "sergio@norgtech.local",
            },
        }
    )

    assert result["intent"] == "crear_visita"
    assert result["requires_human_review"] is False
    assert result["proposals"] == []
    assert result["case_transition"]["action"] == "start_case"
    assert result["case_transition"]["type"] == "visit"
    assert result["case_transition"]["missingFields"] == [
        "customerRef",
        "scheduledAt",
        "summary",
    ]
    assert "cliente" in result["suggested_reply"].lower()
    assert "fecha" in result["suggested_reply"].lower()
    assert "gasto" not in result["suggested_reply"].lower()


def test_comercial_necesito_una_visita_starts_visit_case():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "necesito una visita",
            "conversation_id": "conversation-sergio",
            "user": {
                "id": "sales-user-id",
                "role": "comercial",
                "name": "Sergio",
                "email": "sergio@norgtech.local",
            },
        }
    )

    assert result["intent"] == "crear_visita"
    assert result["case_transition"]["action"] == "start_case"
    assert result["case_transition"]["type"] == "visit"
    assert "gasto" not in result["suggested_reply"].lower()


def test_visit_case_collects_customer_date_and_summary_before_confirmation():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": (
                "para porcicola caribe sas los voy a visitar el 29 de junio a las 12:00 PM, "
                "es una visita de seguimiento con el producto no mas algo breve"
            ),
            "conversation_id": "conversation-sergio",
            "user": {
                "id": "sales-user-id",
                "role": "comercial",
                "name": "Sergio",
                "email": "sergio@norgtech.local",
            },
            "open_case": {
                "id": "case-visit-1",
                "type": "visit",
                "status": "collecting_info",
                "extractedData": {},
                "missingFields": ["customerRef", "scheduledAt", "summary"],
            },
        }
    )

    assert result["intent"] == "continuar_caso"
    assert result["case_transition"]["action"] == "update_case"
    assert result["case_transition"]["type"] == "visit"
    assert result["case_transition"]["extractedData"]["customerRef"] == "porcicola caribe sas"
    assert result["case_transition"]["extractedData"]["scheduledAt"].endswith("-06-29T12:00:00")
    assert result["case_transition"]["extractedData"]["summary"] == (
        "Visita de seguimiento con el producto no mas algo breve"
    )
    assert result["case_transition"]["missingFields"] == []
    assert "confirmación" in result["suggested_reply"].lower()


def test_visit_case_accepts_corrected_customer_name():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "Porcicultura Caribe SAS",
            "conversation_id": "conversation-sergio",
            "user": {"id": "sales-user-id", "role": "comercial", "name": "Sergio"},
            "open_case": {
                "id": "case-visit-1",
                "type": "visit",
                "status": "collecting_info",
                "extractedData": {
                    "customerRef": "porcicola caribe sas",
                    "scheduledAt": "2026-06-29T12:00:00",
                    "summary": "Visita de seguimiento con el producto no mas algo breve",
                },
                "missingFields": ["customerRef"],
            },
        }
    )

    assert result["case_transition"]["extractedData"]["customerRef"] == "Porcicultura Caribe SAS"
    assert result["case_transition"]["missingFields"] == []
    assert "confirmación" in result["suggested_reply"].lower()


def test_new_customer_case_collects_name_and_tax_id_then_asks_city_phone():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "Nombre: Porcicultura Caribe SAS\nNIT: 3948192-0",
            "conversation_id": "conversation-sergio",
            "user": {"id": "sales-user-id", "role": "comercial", "name": "Sergio"},
            "open_case": {
                "id": "case-customer-1",
                "type": "new_customer",
                "status": "collecting_info",
                "extractedData": {},
                "missingFields": ["displayName", "taxId", "city", "phone"],
            },
        }
    )

    assert result["intent"] == "continuar_caso"
    assert result["case_transition"]["action"] == "update_case"
    assert result["case_transition"]["caseId"] == "case-customer-1"
    assert result["case_transition"]["extractedData"]["legalName"] == "Porcicultura Caribe SAS"
    assert result["case_transition"]["extractedData"]["taxId"] == "3948192-0"
    assert result["case_transition"]["missingFields"] == ["city", "phone"]
    assert "ciudad" in result["suggested_reply"].lower()
    assert "tel" in result["suggested_reply"].lower()


def test_new_customer_case_collects_city_and_phone_without_switching_to_expense():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "ciudad: Monteria\ntelefono: 329768969",
            "conversation_id": "conversation-sergio",
            "user": {"id": "sales-user-id", "role": "comercial", "name": "Sergio"},
            "open_case": {
                "id": "case-customer-1",
                "type": "new_customer",
                "status": "collecting_info",
                "extractedData": {
                    "legalName": "Porcicultura Caribe SAS",
                    "displayName": "Porcicultura Caribe SAS",
                    "taxId": "3948192-0",
                },
                "missingFields": ["city", "phone"],
            },
        }
    )

    assert result["intent"] == "continuar_caso"
    assert result["case_transition"]["action"] == "update_case"
    assert result["case_transition"]["extractedData"]["city"] == "Monteria"
    assert result["case_transition"]["extractedData"]["phone"] == "329768969"
    assert result["case_transition"]["missingFields"] == []
    assert "crear el cliente" in result["suggested_reply"].lower()
    assert not result["proposals"]


def test_new_customer_case_accepts_unlabeled_city_and_phone():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "Monteria y 329768969",
            "conversation_id": "conversation-sergio",
            "user": {"id": "sales-user-id", "role": "comercial", "name": "Sergio"},
            "open_case": {
                "id": "case-customer-1",
                "type": "new_customer",
                "status": "collecting_info",
                "extractedData": {
                    "legalName": "Porcicultura Caribe SAS",
                    "displayName": "Porcicultura Caribe SAS",
                    "taxId": "3948192-0",
                },
                "missingFields": ["city", "phone"],
            },
        }
    )

    assert result["case_transition"]["extractedData"]["city"] == "Monteria"
    assert result["case_transition"]["extractedData"]["phone"] == "329768969"
    assert result["case_transition"]["missingFields"] == []


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
    assert result["requires_human_review"] is False
    assert result["proposals"][0]["type"] == "order_draft"
    assert result["proposals"][0]["requires_human_review"] is True
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
    assert result["missing_fields"] == ["company_ref"]
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


def test_order_without_product_marks_items_missing():
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
    assert result["missing_fields"] == ["items"]


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
    assert result["missing_fields"] == ["company_ref"]


def test_small_plain_expense_amount_builds_expense_draft():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "Gasto de peaje por 500",
            "user": {"id": "sales-user-id", "role": "comercial"},
        }
    )

    assert result["intent"] == "gasto"
    assert result["proposals"][0]["type"] == "expense_draft"
    assert result["proposals"][0]["payload"]["amount"] == 500
    assert result["proposals"][0]["payload"]["category"] == "peajes"


def test_unknown_unregistered_sender_gets_first_contact_response_without_tools():
    result = route_whatsapp_message(
        {
            "sender_type": "desconocido",
            "message": "Gasto de peaje por 500",
        }
    )

    assert result["mode"] == "cliente"
    assert result["intent"] == "primer_contacto"
    assert result["requires_human_review"] is False
    assert result["proposals"] == []
    assert "nombre" in result["suggested_reply"].lower()


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


def test_expense_photo_question_keeps_expense_context_instead_of_greeting():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "te puedo pasar la foto?",
            "user": {"id": "sales-user-id", "role": "comercial", "name": "Sergio"},
            "recent_messages": [
                {"role": "user", "body": "registrar gastos"},
                {
                    "role": "assistant",
                    "body": "Necesito el valor del gasto para dejarlo registrado.",
                },
            ],
        }
    )

    assert result["mode"] == "comercial"
    assert result["intent"] == "gasto"
    assert result["requires_human_review"] is False
    assert result["proposals"] == []
    assert "foto" in result["suggested_reply"].lower()
    assert "hola" not in result["suggested_reply"].lower()


def test_expense_image_keeps_expense_context_and_asks_for_amount():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "[Imagen]",
            "user": {"id": "sales-user-id", "role": "comercial", "name": "Sergio"},
            "recent_messages": [
                {"role": "user", "body": "registrar gastos"},
                {
                    "role": "assistant",
                    "body": "Necesito el valor del gasto para dejarlo registrado.",
                },
            ],
        }
    )

    assert result["mode"] == "comercial"
    assert result["intent"] == "clarification"
    assert result["missing_fields"] == ["amount"]
    assert "foto" in result["suggested_reply"].lower()
    assert "valor" in result["suggested_reply"].lower()
    assert result["proposals"] == []


def test_cliente_order_returns_order_candidate_refs_and_items():
    # order_candidate is only emitted on a confirmation turn (open order case in ready_for_review)
    result = route_whatsapp_message(
        {
            "sender_type": "cliente",
            "message": "si confirmo",
            "conversation_id": "conversation-1",
            "customer": {"id": "customer-1", "displayName": "Agro Norte"},
            "companies": [
                {"id": "company-nt", "name": "Nortech", "prefix": "NT"},
                {"id": "company-nn", "name": "Nanonutricion", "prefix": "NN"},
            ],
            "customer_zones": [{"id": "cz-costa", "name": "Costa"}],
            "open_case": {
                "id": "case-order-refs",
                "type": "order",
                "status": "ready_for_review",
                "extractedData": {
                    "customerId": "customer-1",
                    "companyRef": "Nanonutricion",
                    "companyId": "company-nn",
                    "customerZoneId": "cz-costa",
                    "zoneRef": "Costa",
                    "items": [
                        {
                            "productRef": "Fertilizante FERT-001",
                            "quantity": 10,
                            "presentation": "bultos",
                            "notes": "Necesito 10 bultos de Fertilizante FERT-001 por Nanonutricion para Costa",
                        }
                    ],
                },
                "missingFields": [],
            },
        }
    )

    assert result["intent"] == "pedido"
    assert result["order_candidate"]["customerId"] == "customer-1"
    assert result["order_candidate"]["companyRef"] == "Nanonutricion"
    assert result["order_candidate"]["zoneRef"] == "Costa"
    assert result["order_candidate"]["items"] == [
        {
            "productRef": "Fertilizante FERT-001",
            "quantity": 10.0,
            "presentation": "bultos",
            "notes": "Necesito 10 bultos de Fertilizante FERT-001 por Nanonutricion para Costa",
        }
    ]
    # On a confirmation turn the planner still emits the order_draft proposal
    # (proposals are not gated; only order_candidate is gated behind confirmation)
    assert result["proposals"][0]["type"] == "order_draft"


def test_cliente_first_order_proposal_carries_product_ref():
    # Restores coverage of the proposals/proposal-pipeline path dropped when the
    # confirmation-turn test was adapted for Task 8.  On FIRST detection (no open_case)
    # order_candidate MUST be None (gated) but proposals IS populated with the draft.
    result = route_whatsapp_message(
        {
            "sender_type": "cliente",
            "message": "Necesito 10 bultos de Fertilizante FERT-001 por Nanonutricion para Costa",
            "conversation_id": "conversation-1",
            "customer": {"id": "customer-1", "displayName": "Agro Norte"},
            "companies": [
                {"id": "company-nt", "name": "Nortech", "prefix": "NT"},
                {"id": "company-nn", "name": "Nanonutricion", "prefix": "NN"},
            ],
            "customer_zones": [{"id": "cz-costa", "name": "Costa"}],
        }
    )

    assert result["intent"] == "pedido"
    # Gating: order_candidate is withheld until the customer confirms
    assert result["order_candidate"] is None
    # Proposals pipeline: the draft carries the extracted productRef
    assert result["proposals"][0]["payload"]["items"][0]["productRef"] == "Fertilizante FERT-001"


def test_cliente_order_without_quantity_marks_items_missing():
    result = route_whatsapp_message(
        {
            "sender_type": "cliente",
            "message": "Necesito Fertilizante para Costa por Nanonutricion",
            "conversation_id": "conversation-1",
            "customer": {"id": "customer-1", "displayName": "Agro Norte"},
            "companies": [
                {"id": "company-nt", "name": "Nortech", "prefix": "NT"},
                {"id": "company-nn", "name": "Nanonutricion", "prefix": "NN"},
            ],
            "customer_zones": [{"id": "cz-costa", "name": "Costa"}],
        }
    )

    assert result["intent"] == "clarification"
    assert result["missing_fields"] == ["items"]
    assert "cantidad" in result["suggested_reply"].lower()


def test_order_open_case_create_new_customer_continues_instead_of_greeting():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "crea uno nuevo",
            "conversation_id": "conversation-sergio",
            "user": {"id": "sales-user-id", "role": "comercial", "name": "Sergio"},
            "open_case": {
                "id": "case-order-1",
                "type": "order",
                "status": "collecting_info",
                "extractedData": {"customerRef": "Agro Costa"},
                "missingFields": ["customer_id"],
                "lastQuestion": "Necesito identificar el cliente antes de continuar.",
            },
        }
    )

    assert result["intent"] == "continuar_caso"
    assert result["case_transition"]["action"] == "create_new_customer_subcase"
    assert result["case_transition"]["caseId"] == "case-order-1"
    assert "razon social" in result["suggested_reply"].lower()
    assert "hola" not in result["suggested_reply"].lower()


def test_expense_image_without_context_starts_expense_case():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "[Imagen]",
            "conversation_id": "conversation-sergio",
            "user": {"id": "sales-user-id", "role": "comercial", "name": "Sergio"},
            "media": {"kind": "image", "providerMediaId": "media-1"},
        }
    )

    assert result["intent"] == "gasto"
    assert result["case_transition"]["action"] == "start_case"
    assert result["case_transition"]["type"] == "expense"
    assert "soporte" in result["suggested_reply"].lower()
    assert "hola" not in result["suggested_reply"].lower()


def test_expense_open_case_ack_continues_form_instead_of_greeting():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "Dale",
            "conversation_id": "conversation-sergio",
            "user": {"id": "sales-user-id", "role": "comercial", "name": "Sergio"},
            "open_case": {
                "id": "case-expense-1",
                "type": "expense",
                "status": "collecting_info",
                "extractedData": {},
                "missingFields": ["amount", "expenseDate", "category", "description"],
                "lastQuestion": (
                    "Recibi el soporte. Voy a extraer los datos; si falta cliente o "
                    "valor, te lo pido enseguida."
                ),
            },
        }
    )

    assert result["mode"] == "comercial"
    assert result["intent"] == "continuar_caso"
    assert result["requires_human_review"] is False
    assert result["case_transition"]["action"] == "update_case"
    assert result["case_transition"]["caseId"] == "case-expense-1"
    assert result["case_transition"]["type"] == "expense"
    assert "valor" in result["suggested_reply"].lower()
    assert "cliente" in result["suggested_reply"].lower()
    assert "hola" not in result["suggested_reply"].lower()


def test_expense_open_case_bueno_continues_form_instead_of_greeting():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "bueno",
            "conversation_id": "conversation-sergio",
            "user": {"id": "sales-user-id", "role": "comercial", "name": "Sergio"},
            "open_case": {
                "id": "case-expense-1",
                "type": "expense",
                "status": "collecting_info",
                "extractedData": {},
                "missingFields": ["amount", "expenseDate", "category", "description"],
                "lastQuestion": (
                    "Recibi el soporte. Voy a extraer los datos; si falta cliente o "
                    "valor, te lo pido enseguida."
                ),
            },
        }
    )

    assert result["intent"] == "continuar_caso"
    assert result["case_transition"]["action"] == "update_case"
    assert result["case_transition"]["caseId"] == "case-expense-1"
    assert "hola" not in result["suggested_reply"].lower()


def test_expense_open_case_ack_after_ocr_does_not_reask_for_value():
    # OCR already filled the expense from the support image: amount/date/category
    # are known and no required fields remain. When the comercial acknowledges,
    # Nora must NOT ask again for the value she already extracted.
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "ok",
            "conversation_id": "conversation-sergio",
            "user": {"id": "sales-user-id", "role": "comercial", "name": "Sergio"},
            "open_case": {
                "id": "case-expense-1",
                "type": "expense",
                "status": "collecting_info",
                "extractedData": {
                    "amount": 25000,
                    "expenseDate": "2026-04-24",
                    "category": "alimentacion",
                    "description": "INVERSIONES ARIAS SERNA S.A.S.",
                    "supplierName": "INVERSIONES ARIAS SERNA S.A.S.",
                },
                "missingFields": [],
                "lastQuestion": (
                    "Lei el soporte: valor $25.000, fecha 2026-04-24, categoria "
                    "alimentacion, proveedor INVERSIONES ARIAS SERNA S.A.S. Dejo "
                    "el gasto listo para revision."
                ),
            },
        }
    )

    assert result["intent"] == "continuar_caso"
    reply = result["suggested_reply"].lower()
    last_question = (result["case_transition"]["lastQuestion"] or "").lower()
    # The bug: re-asking "Necesito el valor del gasto..." even though it was read.
    assert "necesito el valor del gasto" not in reply
    assert "necesito el valor del gasto" not in last_question
    # It should acknowledge the value it already has.
    assert "25.000" in reply or "ya tengo el valor" in reply


def test_expense_open_case_ack_with_amount_missing_still_asks_for_value():
    # When the OCR could not read the amount, asking for the value is correct.
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "ok",
            "conversation_id": "conversation-sergio",
            "user": {"id": "sales-user-id", "role": "comercial", "name": "Sergio"},
            "open_case": {
                "id": "case-expense-1",
                "type": "expense",
                "status": "collecting_info",
                "extractedData": {},
                "missingFields": ["amount", "expenseDate", "category", "description"],
                "lastQuestion": "Recibi el soporte. Voy a extraer los datos.",
            },
        }
    )

    assert result["intent"] == "continuar_caso"
    assert "valor del gasto" in result["suggested_reply"].lower()


def test_expense_text_starts_case_when_no_open_case():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "Voy a registrar un gasto de almuerzo",
            "conversation_id": "conversation-sergio",
            "user": {"id": "sales-user-id", "role": "comercial", "name": "Sergio"},
        }
    )

    assert result["intent"] == "gasto"
    assert result["case_transition"]["action"] == "start_case"
    assert result["case_transition"]["type"] == "expense"
    assert result["case_transition"]["extractedData"]["description"] == (
        "Voy a registrar un gasto de almuerzo"
    )
    assert "valor" in result["suggested_reply"].lower()


def test_first_order_message_starts_case_and_asks_confirmation():
    result = route_whatsapp_message(
        {
            "sender_type": "cliente",
            "message": "Necesito 10 bultos de FERT-001",
            "conversation_id": "conv-1",
            "customer": {"id": "customer-1", "displayName": "Agro Norte"},
            "companies": [{"id": "company-nt", "name": "Nortech", "prefix": "NT"}],
        }
    )
    assert result["intent"] == "pedido"
    assert result["order_candidate"] is None
    assert result["case_transition"]["action"] == "start_case"
    assert result["case_transition"]["type"] == "order"
    assert "confirm" in result["suggested_reply"].lower()


def test_confirmation_on_open_order_case_emits_candidate():
    result = route_whatsapp_message(
        {
            "sender_type": "cliente",
            "message": "si, confirmo",
            "conversation_id": "conv-1",
            "customer": {"id": "customer-1", "displayName": "Agro Norte"},
            "companies": [{"id": "company-nt", "name": "Nortech", "prefix": "NT"}],
            "open_case": {
                "id": "case-1",
                "type": "order",
                "status": "ready_for_review",
                "extractedData": {
                    "customerId": "customer-1",
                    "companyRef": "Nortech",
                    "items": [{"productRef": "FERT-001", "quantity": 10}],
                },
                "missingFields": [],
            },
        }
    )
    assert result["intent"] == "pedido"
    assert result["order_candidate"] is not None
    assert result["order_candidate"]["items"][0]["productRef"] == "FERT-001"
    assert result["order_candidate"]["customerId"] == "customer-1"


def test_comercial_order_without_customer_starts_case_asking_customer():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "necesito 10 bultos de FERT-001 por Nortech",
            "conversation_id": "conv-2",
            "user": {"id": "sergio", "role": "comercial", "name": "Sergio", "email": "s@n.local"},
            "companies": [{"id": "company-nt", "name": "Nortech", "prefix": "NT"}],
        }
    )
    assert result["case_transition"]["action"] == "start_case"
    assert result["case_transition"]["type"] == "order"
    assert result["case_transition"]["missingFields"] == ["customerRef"]
    assert "cliente" in result["suggested_reply"].lower()


def test_comercial_replies_customer_updates_order_case():
    result = route_whatsapp_message(
        {
            "sender_type": "comercial",
            "message": "Es para Agro Norte",
            "conversation_id": "conv-2",
            "user": {"id": "sergio", "role": "comercial", "name": "Sergio", "email": "s@n.local"},
            "companies": [{"id": "company-nt", "name": "Nortech", "prefix": "NT"}],
            "open_case": {
                "id": "case-2",
                "type": "order",
                "status": "collecting_info",
                "extractedData": {"companyRef": "Nortech", "items": [{"productRef": "FERT-001", "quantity": 10}]},
                "missingFields": ["customerRef"],
            },
        }
    )
    assert result["case_transition"]["action"] == "update_case"
    assert result["case_transition"]["caseId"] == "case-2"
    assert result["case_transition"]["extractedData"]["customerRef"] == "Es para Agro Norte"
    assert "confirm" in result["suggested_reply"].lower()

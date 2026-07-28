"""El rol sale del JWT y recorta las tools. Sin esto, un tecnico pedia un
pedido, Nora lo intentaba y el API devolvia 403 disfrazado de 'Error al crear'."""

import base64
import json

from src.agent import ALL_TOOLS
from src.roles import role_from_token, role_prompt, tools_for_role


def _token(claims: dict) -> str:
    def seg(obj: dict) -> str:
        raw = base64.urlsafe_b64encode(json.dumps(obj).encode()).decode()
        return raw.rstrip("=")  # el JWT real viene sin padding

    return f"Bearer {seg({'alg': 'HS256'})}.{seg(claims)}.firma"


def test_lee_el_rol_del_jwt():
    assert role_from_token(_token({"sub": "u1", "role": "comercial"})) == "comercial"


def test_token_invalido_no_revienta():
    assert role_from_token(None) is None
    assert role_from_token("Bearer no-es-un-jwt") is None
    assert role_from_token(_token({"sub": "u1"})) is None  # sin claim role


def test_direccion_conserva_todas_las_tools():
    for role in ("administrador", "director_comercial"):
        assert len(tools_for_role(role, ALL_TOOLS)) == len(ALL_TOOLS)


def test_comercial_tiene_todo_menos_metas_del_equipo_y_reportes():
    names = {t.name for t in tools_for_role("comercial", ALL_TOOLS)}
    # Su propia operacion, si: pedidos, gastos, cartera y ventas (ya filtradas
    # a el por el API).
    assert {"create_order", "create_expense", "get_cartera", "get_sales_summary"} <= names
    # La analitica tambien: el API le fuerza `sellerUserId` a su propio id, asi
    # que ve su gestion y no la del equipo (docs/analytics-spec.md §2.4).
    assert "get_analytics" in names
    # Reportes ejecutivos, no: el API responde 403.
    assert "list_reports" not in names
    assert "generate_report_from_visit" not in names
    # Metas del equipo completo: DashboardController las da solo a direccion.
    assert "get_team_goals" not in names
    # La suya si, y el API le deja consultar solo la propia.
    assert "get_seller_goal_progress" in names


def test_comercial_cotiza_factura_y_devuelve():
    names = {t.name for t in tools_for_role("comercial", ALL_TOOLS)}
    assert {"preview_quote", "create_quote", "request_billing_for_quote"} <= names
    assert {"list_invoices", "list_overdue_invoices"} <= names
    assert {"list_returns", "create_return"} <= names


def test_tecnico_no_toca_plata_pero_si_busca():
    names = {t.name for t in tools_for_role("tecnico", ALL_TOOLS)}
    # SearchController deja entrar a los seis roles.
    assert "global_search" in names
    for forbidden in ("preview_quote", "create_quote", "list_invoices",
                      "list_returns", "create_return"):
        assert forbidden not in names


def test_tecnico_si_genera_reportes_ejecutivos():
    names = {t.name for t in tools_for_role("tecnico", ALL_TOOLS)}
    assert {"list_reports", "generate_report_from_visit"} <= names
    assert "get_analytics" not in names


def test_tecnico_no_ve_pedidos_gastos_ni_cartera():
    names = {t.name for t in tools_for_role("tecnico", ALL_TOOLS)}
    assert "create_visit" in names and "create_follow_up" in names
    # Cierra su propia operacion del dia: los @Roles de visits y follow-up-tasks
    # si lo incluyen.
    assert {"list_visits", "complete_visit", "list_follow_ups", "complete_follow_up"} <= names
    for forbidden in ("create_order", "preview_order", "create_expense", "get_cartera",
                      "get_sales_summary", "create_customer", "create_opportunity",
                      "get_customer_credit", "get_price_for_customer", "get_team_goals"):
        assert forbidden not in names


def test_rol_desconocido_cae_a_solo_lectura():
    names = {t.name for t in tools_for_role("facturacion", ALL_TOOLS)}
    assert names == {"search_customers", "get_customer_summary", "get_agenda"}
    assert names == {t.name for t in tools_for_role(None, ALL_TOOLS)}


def test_el_prompt_cambia_el_alcance_segun_rol():
    assert "COMERCIAL" in role_prompt("comercial")
    assert "DIRECTOR COMERCIAL" in role_prompt("director_comercial")
    assert role_prompt("tecnico") != role_prompt("comercial")

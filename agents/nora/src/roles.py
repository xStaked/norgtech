"""Rol del usuario, leido del JWT que ya viaja en cada request.

NO verificamos la firma a proposito: quien decide de verdad es el API de NestJS
(`@Roles` + filtros por vendedor en cada servicio). Esto solo existe para que
Nora deje de ofrecer —y de intentar— lo que el API va a rechazar con 403, y
para que narre las cifras con el alcance correcto ("tus ventas" vs "las del
equipo").

Espeja `apps/web/src/lib/auth.ts` (moduleAccess / createAccess). Si alla cambia
un rol, aqui tambien.
"""

import base64
import json
from typing import Optional

# Roles que usan el toolset completo. Entre ellos la diferencia es el ALCANCE de
# los datos, y eso ya lo aplica el API (dashboard.service isSellerScoped,
# invoices where assignedToUserId, etc.), no la lista de tools.
_FULL_ROLES = {"administrador", "director_comercial", "comercial"}

# Roles que solo ven un subconjunto. Tecnico entra a /nora, pero no a pedidos,
# gastos, oportunidades ni productos: clientes (lectura), visitas, seguimientos
# y reportes ejecutivos.
_ROLE_ALLOWLIST: dict[str, set[str]] = {
    "tecnico": {
        "search_customers",
        "get_customer_summary",
        "get_customer_segments",
        "get_customer_visits",
        "get_agenda",
        "create_visit",
        "update_visit",
        "delete_visit",
        "create_follow_up",
        "list_follow_ups",
        "complete_follow_up",
        "list_visits",
        "complete_visit",
        "list_reports",
        "generate_report_from_visit",
        # SearchController deja entrar a los seis roles; el service recorta por
        # tipo, asi que un tecnico solo recibe clientes. No da 403.
        "global_search",
    },
}

# Tools que NO son para todos los roles del toolset completo. Espeja el @Roles
# del controller correspondiente: si aqui se abre y alla no, Nora ofrece algo
# que termina en 403.
_RESTRICTED: dict[str, set[str]] = {
    # AnalyticsController: direccion ve la operacion completa; un comercial
    # entra pero el API le fuerza `sellerUserId` a su propio id.
    "get_analytics": {"administrador", "director_comercial", "comercial"},
    # ReportsController.
    "list_reports": {"administrador", "director_comercial", "tecnico"},
    "generate_report_from_visit": {"administrador", "director_comercial", "tecnico"},
    # DashboardController.getSellerGoals: metas de TODO el equipo.
    "get_team_goals": {"administrador", "director_comercial"},
}

# Roles sin acceso a /nora en el portal (facturacion, logistica) y token sin rol
# legible: solo lectura basica. No deberian llegar aqui; si llegan, no rompen.
_FALLBACK_TOOLS = {"search_customers", "get_customer_summary", "get_agenda"}

_PROMPT_BY_ROLE: dict[str, str] = {
    "administrador": (
        "El usuario es ADMINISTRADOR. Ve las cifras consolidadas de toda la "
        "operacion y de todos los vendedores. No hables de 'tus ventas' ni 'tu "
        "cartera': son del equipo completo. Puedes usar todas tus herramientas."
    ),
    "director_comercial": (
        "El usuario es DIRECTOR COMERCIAL. Ve las cifras consolidadas de toda la "
        "operacion y de todos los vendedores. No hables de 'tus ventas' ni 'tu "
        "cartera': son del equipo completo. Puedes usar todas tus herramientas. "
        "Ojo: get_goal_progress es SOLO la meta propia. Para la meta de otro "
        "vendedor o del equipo usa get_team_goals y get_seller_goal_progress."
    ),
    "comercial": (
        "El usuario es COMERCIAL. Todo lo que consultes viene filtrado a SUS "
        "clientes, SUS pedidos y SU cartera: habla en primera persona ('tus "
        "ventas', 'tu meta'). Eso incluye la analitica (get_analytics): ve su "
        "propia gestion mes a mes —ventas, cartera, embudo y desempeño— y le "
        "sirve para armar su informe semanal. Lo que NO ve es al resto del "
        "equipo: si pregunta por cifras de otros vendedores o consolidadas de "
        "toda la empresa, dile que eso lo ve direccion comercial."
    ),
    "tecnico": (
        "El usuario es TECNICO. Solo puede consultar clientes y registrar "
        "visitas y seguimientos. NO puede crear clientes, pedidos, gastos ni "
        "oportunidades, y no ve ventas, metas ni cartera. Si te pide algo de "
        "eso, no lo intentes: dilo en una frase y sugiere pedirselo a su "
        "comercial o a direccion comercial."
    ),
}

_FALLBACK_PROMPT = (
    "No pude determinar el rol del usuario. Limitate a consultar clientes y su "
    "agenda; para cualquier otra cosa, pidele que lo haga desde el portal."
)


def _claims_from_token(auth_token: Optional[str]) -> dict:
    """Payload del JWT ('Bearer <jwt>') sin verificar firma. {} si no se puede."""
    if not auth_token:
        return {}
    token = auth_token.split(" ", 1)[-1]
    parts = token.split(".")
    if len(parts) != 3:
        return {}
    try:
        payload = parts[1]
        # base64url sin padding: el JWT lo omite, `b64decode` lo exige.
        payload += "=" * (-len(payload) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload))
    except Exception:
        return {}
    return claims if isinstance(claims, dict) else {}


def role_from_token(auth_token: Optional[str]) -> Optional[str]:
    """Extrae el `role` del payload del JWT ('Bearer <jwt>'). None si no se puede."""
    role = _claims_from_token(auth_token).get("role")
    return role if isinstance(role, str) else None


def user_id_from_token(auth_token: Optional[str]) -> Optional[str]:
    """Extrae el id del usuario (claim `sub`) del JWT. None si no se puede.

    El API de NestJS firma `{ sub, role, email }` tanto en el login como en
    `mintScopedToken` (apps/api/src/modules/auth/auth.service.ts).
    """
    sub = _claims_from_token(auth_token).get("sub")
    return sub if isinstance(sub, str) and sub else None


def _allows(role: Optional[str], tool_name: str) -> bool:
    if tool_name in _RESTRICTED and role not in _RESTRICTED[tool_name]:
        return False
    if role in _FULL_ROLES:
        return True
    return tool_name in _ROLE_ALLOWLIST.get(role or "", _FALLBACK_TOOLS)


def tools_for_role(role: Optional[str], all_tools: list) -> list:
    """Subconjunto de `all_tools` que el rol puede usar."""
    return [t for t in all_tools if _allows(role, t.name)]


def role_prompt(role: Optional[str]) -> str:
    """Bloque que se añade al system prompt para el rol dado."""
    body = _PROMPT_BY_ROLE.get(role or "", _FALLBACK_PROMPT)
    return f"\n\n## Rol del usuario actual\n{body}"

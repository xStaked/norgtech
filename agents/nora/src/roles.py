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

# Herramientas que ve cada rol. `None` = todas.
# comercial y director/admin comparten toolset: la diferencia es el ALCANCE de
# los datos, y eso ya lo aplica el API (dashboard.service isSellerScoped,
# invoices where assignedToUserId, etc.), no la lista de tools.
_TOOLS_BY_ROLE: dict[str, Optional[set[str]]] = {
    "administrador": None,
    "director_comercial": None,
    "comercial": None,
    # Tecnico: entra a /nora, pero no a pedidos, gastos, oportunidades ni
    # productos. Solo clientes (lectura), visitas y seguimientos.
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
    },
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
        "Ojo: get_goal_progress devuelve SOLO la meta del propio usuario, no la "
        "de otro vendedor; si te preguntan por la meta de alguien mas, dilo."
    ),
    "comercial": (
        "El usuario es COMERCIAL. Todo lo que consultes viene filtrado a SUS "
        "clientes, SUS pedidos y SU cartera: habla en primera persona ('tus "
        "ventas', 'tu meta'). No tiene visibilidad del resto del equipo; si "
        "pregunta por cifras de otros vendedores o de toda la empresa, dile que "
        "eso lo ve direccion comercial."
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


def role_from_token(auth_token: Optional[str]) -> Optional[str]:
    """Extrae el `role` del payload del JWT ('Bearer <jwt>'). None si no se puede."""
    if not auth_token:
        return None
    token = auth_token.split(" ", 1)[-1]
    parts = token.split(".")
    if len(parts) != 3:
        return None
    try:
        payload = parts[1]
        # base64url sin padding: el JWT lo omite, `b64decode` lo exige.
        payload += "=" * (-len(payload) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload))
    except Exception:
        return None
    role = claims.get("role")
    return role if isinstance(role, str) else None


def tools_for_role(role: Optional[str], all_tools: list) -> list:
    """Subconjunto de `all_tools` que el rol puede usar."""
    allowed = _TOOLS_BY_ROLE.get(role, _FALLBACK_TOOLS) if role else _FALLBACK_TOOLS
    if allowed is None:
        return all_tools
    return [t for t in all_tools if t.name in allowed]


def role_prompt(role: Optional[str]) -> str:
    """Bloque que se añade al system prompt para el rol dado."""
    body = _PROMPT_BY_ROLE.get(role or "", _FALLBACK_PROMPT)
    return f"\n\n## Rol del usuario actual\n{body}"

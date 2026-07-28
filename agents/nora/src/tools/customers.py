import asyncio
import json
from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from .nestjs_client import NestJSClient, NestJSAPIError
from typing import Annotated, Optional


@tool
async def search_customers(
    query: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
) -> str:
    """
    Busca clientes en el CRM por nombre, razón social, o NIT.
    Usa esta herramienta cuando necesites encontrar un cliente existente
    antes de crear uno nuevo. Siempre busca primero antes de crear.

    Incluye clientes INACTIVOS (campo "activo": false). Si el cliente ya existe
    aunque esté inactivo, NO lo crees de nuevo: dile al usuario que ya existe
    pero está inactivo y ofrécele reactivarlo.

    Args:
        query: Texto de búsqueda (nombre, razón social, o NIT del cliente)

    Returns:
        Lista de clientes encontrados en formato JSON con id, nombre, razonSocial, nit, ciudad, telefono, activo
    """
    try:
        nestjs_client = NestJSClient(auth_token)
        # includeInactive: el NIT es único global e ignora `active`, así que si
        # no vemos los inactivos decimos "no existe" y al crearlo el API responde
        # "ya existe con ese NIT".
        result = await nestjs_client.get(
            "/customers", params={"search": query, "includeInactive": "true"}
        )
        customers = result if isinstance(result, list) else result.get("data", [])
        if not customers:
            return "No se encontraron clientes con ese criterio de búsqueda."

        # Retornar solo campos relevantes para que el LLM pueda elegir
        simplified = [
            {
                "id": c["id"],
                "nombre": c.get("displayName") or c.get("legalName"),
                "razonSocial": c.get("legalName"),
                "nit": c.get("taxId"),
                "ciudad": c.get("city"),
                "telefono": c.get("phone"),
                "activo": c.get("active", True),
            }
            for c in customers[:10]
        ]
        return f"Clientes encontrados: {json.dumps(simplified, ensure_ascii=False)}"
    except NestJSAPIError as e:
        return f"Error al buscar clientes: {e.detail}"
    except Exception as e:
        return f"Error inesperado al buscar clientes: {str(e)}"


def _unwrap(result):
    """Devuelve el valor de un asyncio.gather(return_exceptions=True), o relanza
    su excepción para que la maneje el try/except del bloque que la pidió."""
    if isinstance(result, BaseException):
        raise result
    return result


@tool
async def get_customer_summary(
    customer_id: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
) -> str:
    """
    Arma un resumen 360 de UN cliente combinando datos que ya existen en el CRM:
    datos básicos, estado de cartera (saldo y facturas vencidas), últimas visitas
    y oportunidades abiertas. Úsala cuando el usuario pida el "resumen del cliente",
    "¿cómo va X?", "cuéntame de X" o similar.

    IMPORTANTE: necesitas el customer_id real. Si el usuario solo da el nombre,
    primero usa search_customers para obtener el ID y luego llama esta herramienta.

    Args:
        customer_id: ID del cliente a resumir (obtenido con search_customers).

    Returns:
        Un resumen conciso en español con lo más relevante del cliente.
    """
    try:
        nestjs_client = NestJSClient(auth_token)

        # Las 5 lecturas son independientes: en serie el resumen tardaba la suma
        # de las 5. return_exceptions=True para que el fallo de una NO cancele
        # las otras; cada bloque de abajo sigue reportando su propio error.
        customer, cartera_res, overdue_res, visits_res, opps_res = await asyncio.gather(
            nestjs_client.get(f"/customers/{customer_id}"),
            nestjs_client.get("/invoices/summary", params={"customerId": customer_id}),
            nestjs_client.get("/invoices/overdue"),
            nestjs_client.get("/visits", params={"customerId": customer_id}),
            nestjs_client.get("/opportunities", params={"customerId": customer_id}),
            return_exceptions=True,
        )

        # Datos básicos del cliente: si esto falla no hay resumen que armar y el
        # error sale por el except de abajo, igual que cuando era secuencial.
        customer = _unwrap(customer)
        nombre = customer.get("displayName") or customer.get("legalName") or "Cliente"
        partes: list[str] = [f"Resumen de {nombre}:"]
        basics: list[str] = []
        if customer.get("legalName"):
            basics.append(f"razón social {customer['legalName']}")
        if customer.get("taxId"):
            basics.append(f"NIT {customer['taxId']}")
        if customer.get("city"):
            basics.append(f"ciudad {customer['city']}")
        if customer.get("phone"):
            basics.append(f"tel {customer['phone']}")
        segment = customer.get("segment") or {}
        if isinstance(segment, dict) and segment.get("name"):
            basics.append(f"segmento {segment['name']}")
        if basics:
            partes.append("Datos: " + ", ".join(basics) + ".")

        # Cartera enfocada en el cliente (/invoices/summary + /invoices/overdue).
        try:
            cartera = _unwrap(cartera_res)
            saldo = cartera.get("totalBalance")
            if saldo is not None:
                partes.append(f"Cartera: saldo pendiente ${saldo:,.0f}.".replace(",", "."))
            else:
                partes.append("Cartera: sin saldo pendiente.")
            overdue = _unwrap(overdue_res)
            overdue_list = overdue if isinstance(overdue, list) else overdue.get("data", [])
            vencidas = [
                i for i in overdue_list
                if (i.get("customer") or {}).get("id") == customer_id
            ]
            if vencidas:
                partes.append(f"Tiene {len(vencidas)} factura(s) vencida(s).")
        except NestJSAPIError as e:
            partes.append(f"(No pude leer la cartera: {e.detail})")

        # Últimas visitas (/visits?customerId).
        try:
            visits_res = _unwrap(visits_res)
            visits = visits_res if isinstance(visits_res, list) else visits_res.get("data", [])
            if visits:
                ultima = visits[0]
                partes.append(
                    f"Visitas: {len(visits)} registrada(s); la más reciente "
                    f"({ultima.get('scheduledAt', 'sin fecha')}): "
                    f"{ultima.get('summary') or 'sin resumen'}."
                )
            else:
                partes.append("Visitas: ninguna registrada.")
        except NestJSAPIError as e:
            partes.append(f"(No pude leer las visitas: {e.detail})")

        # Oportunidades abiertas (/opportunities?customerId).
        try:
            opps_res = _unwrap(opps_res)
            opps = opps_res if isinstance(opps_res, list) else opps_res.get("data", [])
            if opps:
                detalle = "; ".join(
                    f"{o.get('title') or 'sin título'} (etapa {o.get('stage', '?')})"
                    for o in opps[:5]
                )
                partes.append(f"Oportunidades: {len(opps)} abierta(s) — {detalle}.")
            else:
                partes.append("Oportunidades: ninguna abierta.")
        except NestJSAPIError as e:
            partes.append(f"(No pude leer las oportunidades: {e.detail})")

        return " ".join(partes)
    except NestJSAPIError as e:
        return f"Error al obtener el resumen del cliente: {e.detail}"
    except Exception as e:
        return f"Error inesperado al obtener el resumen del cliente: {str(e)}"


async def _resolve_company_id(nestjs_client: NestJSClient, company: Optional[str]) -> str:
    """Resolve the invoicing company id from an id, a name, or nothing.

    The API requires companyId to create a customer, but the LLM only ever has
    the name the user said ("Norgtech"), so we resolve it here. With a single
    company configured it's implicit; with several, we raise listing the names
    so the LLM can ask instead of guessing an id that doesn't exist.
    """
    result = await nestjs_client.get("/companies")
    companies = result if isinstance(result, list) else result.get("data", [])
    if not companies:
        raise NestJSAPIError(
            status_code=404,
            detail="No hay empresas configuradas en el CRM.",
        )

    if company:
        needle = company.strip().lower()
        match = next(
            (
                c
                for c in companies
                if c["id"] == company or needle in (c.get("name") or "").lower()
            ),
            None,
        )
        if match:
            return match["id"]

    if len(companies) == 1:
        return companies[0]["id"]

    names = ", ".join(c.get("name") or c["id"] for c in companies)
    raise NestJSAPIError(
        status_code=400,
        detail=f"Falta indicar la empresa que factura al cliente. Opciones: {names}.",
    )


def _normalize_tax_id(tax_id: Optional[str]) -> Optional[str]:
    """NIT al formato con el que se importó la base: "900923429-1".

    La gente lo dicta con puntos ("9.009.234.291") o pegado; guardarlo tal cual
    crea duplicados con el mismo NIT escrito distinto, o choca contra el índice
    único sin que la búsqueda por NIT lo encuentre.
    """
    if not tax_id:
        return tax_id
    compact = "".join(ch for ch in tax_id if ch.isalnum())
    if compact.isdigit() and len(compact) >= 9:
        return f"{compact[:-1]}-{compact[-1]}"
    return tax_id


@tool
async def create_customer(
    legal_name: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
    display_name: Optional[str] = None,
    company: Optional[str] = None,
    tax_id: Optional[str] = None,
    phone: Optional[str] = None,
    email: Optional[str] = None,
    address: Optional[str] = None,
    city: Optional[str] = None,
    department: Optional[str] = None,
    contact_name: Optional[str] = None,
    contact_phone: Optional[str] = None,
    contact_email: Optional[str] = None,
    notes: Optional[str] = None,
) -> str:
    """
    Crea un nuevo cliente (empresa) en el CRM con su contacto primario.

    ANTES de crear, busca con search_customers por NOMBRE y también por NIT.
    Si aparece (aunque sea con "activo": false) NO lo crees: es el mismo cliente.
    Si el API responde que ya existe un cliente con ese NIT, NO vuelvas a
    ofrecer crearlo: el mensaje trae el nombre del cliente existente, dilo. Si
    está inactivo, intenta reactivarlo con update_customer(active=True): si el
    API responde que no tienes permiso, avisa que dirección tiene que
    reactivarlo y asignarlo.

    IMPORTANTE: Un CLIENTE es una empresa/organización (razón social, NIT).
    Un CONTACTO es una persona que trabaja en ese cliente.
    NO crees un cliente para una persona individual a menos que sea un negocio unipersonal.

    Para dar de alta un cliente SOLO necesitas: razón social o nombre, NIT,
    la empresa que le factura y el teléfono. NO pidas correo, dirección,
    ciudad, departamento ni notas: mándalos solo si el usuario ya los dijo.
    El segmento lo asigna el CRM solo; no existe ni se pregunta.

    Args:
        legal_name: Razón social o nombre legal de la empresa
        company: Nombre de la empresa del grupo que le factura a este cliente
            (ej. "Norgtech"). Pasa el nombre tal cual lo dijo el usuario; si solo
            hay una empresa configurada se toma esa automáticamente.
        tax_id: NIT o identificador tributario
        phone: Teléfono de la empresa
        display_name: Nombre comercial (opcional; si falta se usa legal_name)
        email: Email corporativo (opcional, no lo pidas)
        address: Dirección física (opcional, no lo pidas)
        city: Ciudad (opcional, no lo pidas)
        department: Departamento/estado (opcional, no lo pidas)
        contact_name: Nombre completo del contacto principal (si no se provee, se usa "Contacto Principal")
        contact_phone: Teléfono del contacto principal (opcional)
        contact_email: Email del contacto principal (opcional)
        notes: Notas adicionales (opcional)

    Returns:
        Datos del cliente creado en formato JSON con id, legalName, displayName, taxId
    """
    try:
        nestjs_client = NestJSClient(auth_token)
        resolved_company_id = await _resolve_company_id(nestjs_client, company)

        # Auto-generar contacto primario
        primary_contact_name = contact_name or "Contacto Principal"
        contact_payload = {
            "fullName": primary_contact_name,
            "isPrimary": True,
        }
        if contact_phone or phone:
            contact_payload["phone"] = contact_phone or phone
        if contact_email or email:
            contact_payload["email"] = contact_email or email

        normalized_tax_id = _normalize_tax_id(tax_id)

        payload = {
            "legalName": legal_name,
            "displayName": display_name or legal_name,
            "companyId": resolved_company_id,
            "contacts": [contact_payload],
        }
        if normalized_tax_id:
            payload["taxId"] = normalized_tax_id
        if phone:
            payload["phone"] = phone
        if email:
            payload["email"] = email
        if address:
            payload["address"] = address
        if city:
            payload["city"] = city
        if department:
            payload["department"] = department
        if notes:
            payload["notes"] = notes

        result = await nestjs_client.post("/customers", payload)
        return f"Cliente creado exitosamente: {json.dumps(result, ensure_ascii=False)}"
    except NestJSAPIError as e:
        return f"Error al crear cliente: {e.detail}"
    except Exception as e:
        return f"Error inesperado al crear cliente: {str(e)}"


@tool
async def update_customer(
    customer_id: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
    legal_name: Optional[str] = None,
    display_name: Optional[str] = None,
    tax_id: Optional[str] = None,
    phone: Optional[str] = None,
    email: Optional[str] = None,
    address: Optional[str] = None,
    city: Optional[str] = None,
    department: Optional[str] = None,
    notes: Optional[str] = None,
    segment_id: Optional[str] = None,
    active: Optional[bool] = None,
) -> str:
    """
    Edita/actualiza un cliente (empresa) existente en el CRM.

    Es una actualización parcial: solo se modifican los campos que envíes;
    los demás se mantienen igual. NO necesitas pasar todos los campos, solo
    los que el usuario quiere cambiar.

    IMPORTANTE:
    - Primero usa search_customers para encontrar el cliente y obtener su
      customer_id real. NUNCA inventes el customer_id.
    - Confirma con el usuario los cambios antes de aplicarlos.

    Args:
        customer_id: ID del cliente a actualizar (obtenido con search_customers)
        legal_name: Nueva razón social o nombre legal (opcional)
        display_name: Nuevo nombre comercial o de display (opcional)
        tax_id: Nuevo NIT o identificador tributario (opcional)
        phone: Nuevo teléfono (opcional)
        email: Nuevo email (opcional)
        address: Nueva dirección física (opcional)
        city: Nueva ciudad (opcional)
        department: Nuevo departamento/estado (opcional)
        notes: Nuevas notas (opcional)
        segment_id: Nuevo ID de segmento (opcional)
        active: True para reactivar un cliente inactivo, False para desactivarlo
            (opcional). Solo un administrador o el director comercial puede
            hacerlo: si el usuario es comercial el API responde que no tiene
            permiso, y ahí le dices que dirección tiene que reactivar y asignar
            el cliente. Reactivar NUNCA cambia a quién está asignado.

    Returns:
        Datos del cliente actualizado en formato JSON
    """
    try:
        nestjs_client = NestJSClient(auth_token)

        normalized_tax_id = _normalize_tax_id(tax_id)

        payload = {}
        if legal_name is not None:
            payload["legalName"] = legal_name
        if display_name is not None:
            payload["displayName"] = display_name
        if normalized_tax_id is not None:
            payload["taxId"] = normalized_tax_id
        if phone is not None:
            payload["phone"] = phone
        if email is not None:
            payload["email"] = email
        if address is not None:
            payload["address"] = address
        if city is not None:
            payload["city"] = city
        if department is not None:
            payload["department"] = department
        if notes is not None:
            payload["notes"] = notes
        if segment_id is not None:
            payload["segmentId"] = segment_id
        if active is not None:
            payload["active"] = active

        if not payload:
            return "No se especificó ningún campo para actualizar."

        result = await nestjs_client.patch(f"/customers/{customer_id}", payload)
        return f"Cliente actualizado exitosamente: {json.dumps(result, ensure_ascii=False)}"
    except NestJSAPIError as e:
        return f"Error al actualizar cliente: {e.detail}"
    except Exception as e:
        return f"Error inesperado al actualizar cliente: {str(e)}"

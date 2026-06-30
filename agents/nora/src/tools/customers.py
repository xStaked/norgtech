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

    Args:
        query: Texto de búsqueda (nombre, razón social, o NIT del cliente)

    Returns:
        Lista de clientes encontrados en formato JSON con id, nombre, razonSocial, nit, ciudad, telefono
    """
    try:
        nestjs_client = NestJSClient(auth_token)
        result = await nestjs_client.get("/customers", params={"search": query})
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
            }
            for c in customers[:10]
        ]
        return f"Clientes encontrados: {json.dumps(simplified, ensure_ascii=False, indent=2)}"
    except NestJSAPIError as e:
        return f"Error al buscar clientes: {e.detail}"
    except Exception as e:
        return f"Error inesperado al buscar clientes: {str(e)}"


async def _resolve_segment_id(nestjs_client: NestJSClient, segment_id: Optional[str]) -> str:
    """Resolve a valid customer segment id.

    The LLM is unreliable at fetching and passing a real segment_id (it tends to
    hallucinate one, which the API rejects with "Customer segment not found"). So
    we resolve it here: keep the LLM's id only if it actually exists, otherwise
    default to "Bronce" (the segment for new customers) or the first available.
    """
    result = await nestjs_client.get("/customer-segments")
    segments = result if isinstance(result, list) else result.get("data", [])
    if not segments:
        raise NestJSAPIError(
            status_code=404,
            detail="No hay segmentos de cliente configurados en el CRM.",
        )

    ids = {s["id"] for s in segments}
    if segment_id and segment_id in ids:
        return segment_id

    bronce = next((s for s in segments if (s.get("name") or "").strip().lower() == "bronce"), None)
    return (bronce or segments[0])["id"]


@tool
async def create_customer(
    legal_name: str,
    display_name: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
    segment_id: Optional[str] = None,
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

    IMPORTANTE: Un CLIENTE es una empresa/organización (razón social, NIT).
    Un CONTACTO es una persona que trabaja en ese cliente.
    NO crees un cliente para una persona individual a menos que sea un negocio unipersonal.

    El segmento se resuelve automáticamente (por defecto "Bronce" para clientes
    nuevos), así que NO necesitas llamar get_customer_segments antes: deja
    segment_id vacío salvo que el usuario pida un segmento específico.

    Args:
        legal_name: Razón social o nombre legal de la empresa
        display_name: Nombre comercial o de display (cómo se conoce la empresa)
        segment_id: ID del segmento (opcional; si se omite se usa "Bronce")
        tax_id: NIT o identificador tributario (opcional)
        phone: Teléfono de la empresa (opcional)
        email: Email corporativo (opcional)
        address: Dirección física (opcional)
        city: Ciudad (opcional)
        department: Departamento/estado (opcional)
        contact_name: Nombre completo del contacto principal (si no se provee, se usa "Contacto Principal")
        contact_phone: Teléfono del contacto principal (opcional)
        contact_email: Email del contacto principal (opcional)
        notes: Notas adicionales (opcional)

    Returns:
        Datos del cliente creado en formato JSON con id, legalName, displayName, taxId
    """
    try:
        nestjs_client = NestJSClient(auth_token)
        resolved_segment_id = await _resolve_segment_id(nestjs_client, segment_id)

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

        # Normalizar NIT: si es solo dígitos sin guión, agregar formato colombiano básico
        normalized_tax_id = tax_id
        if tax_id and tax_id.isdigit() and "-" not in tax_id:
            # Si tiene 9+ dígitos, formato XXXXXXXX-X
            if len(tax_id) >= 9:
                normalized_tax_id = f"{tax_id[:-1]}-{tax_id[-1]}"

        payload = {
            "legalName": legal_name,
            "displayName": display_name,
            "segmentId": resolved_segment_id,
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
        return f"Cliente creado exitosamente: {json.dumps(result, ensure_ascii=False, indent=2)}"
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

    Returns:
        Datos del cliente actualizado en formato JSON
    """
    try:
        nestjs_client = NestJSClient(auth_token)

        # Normalizar NIT igual que en create_customer
        normalized_tax_id = tax_id
        if tax_id and tax_id.isdigit() and "-" not in tax_id:
            if len(tax_id) >= 9:
                normalized_tax_id = f"{tax_id[:-1]}-{tax_id[-1]}"

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

        if not payload:
            return "No se especificó ningún campo para actualizar."

        result = await nestjs_client.patch(f"/customers/{customer_id}", payload)
        return f"Cliente actualizado exitosamente: {json.dumps(result, ensure_ascii=False, indent=2)}"
    except NestJSAPIError as e:
        return f"Error al actualizar cliente: {e.detail}"
    except Exception as e:
        return f"Error inesperado al actualizar cliente: {str(e)}"

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

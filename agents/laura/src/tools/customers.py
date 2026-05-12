import json
from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from .nestjs_client import NestJSClient
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
        Lista de clientes encontrados en formato JSON con id, displayName, legalName, taxId, city, phone, segment
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
    except Exception as e:
        return f"Error al buscar clientes: {str(e)}"

@tool
async def create_customer(
    legal_name: str,
    display_name: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
    tax_id: Optional[str] = None,
    phone: Optional[str] = None,
    email: Optional[str] = None,
    address: Optional[str] = None,
    city: Optional[str] = None,
    department: Optional[str] = None,
    segment_id: Optional[str] = None,
    notes: Optional[str] = None,
) -> str:
    """
    Crea un nuevo cliente en el CRM.
    IMPORTANTE: Un CLIENTE es una empresa/organización (razón social, NIT).
    Un CONTACTO es una persona que trabaja en ese cliente.
    NO crees un cliente para una persona individual a menos que sea un negocio unipersonal.
    
    Args:
        legal_name: Razón social o nombre legal de la empresa
        display_name: Nombre comercial o de display
        tax_id: NIT o identificador tributario (opcional)
        phone: Teléfono de la empresa (opcional)
        email: Email corporativo (opcional)
        address: Dirección física (opcional)
        city: Ciudad (opcional)
        department: Departamento/estado (opcional)
        segment_id: ID del segmento de cliente (si no se especifica, la API usa default)
        notes: Notas adicionales (opcional)
    
    Returns:
        Datos del cliente creado en formato JSON
    """
    try:
        nestjs_client = NestJSClient(auth_token)
        payload = {
            "legalName": legal_name,
            "displayName": display_name,
        }
        if tax_id: payload["taxId"] = tax_id
        if phone: payload["phone"] = phone
        if email: payload["email"] = email
        if address: payload["address"] = address
        if city: payload["city"] = city
        if department: payload["department"] = department
        if segment_id: payload["segmentId"] = segment_id
        if notes: payload["notes"] = notes

        result = await nestjs_client.post("/customers", payload)
        return f"Cliente creado exitosamente: {json.dumps(result, ensure_ascii=False, indent=2)}"
    except Exception as e:
        return f"Error al crear cliente: {str(e)}"

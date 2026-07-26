import json
from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from .nestjs_client import NestJSClient
from typing import Annotated, Optional

# Etapas validas, EXACTAS al enum OpportunityStage del API (apps/api/prisma/
# schema.prisma). El API valida con @IsEnum, asi que cualquier otro valor da 400.
# Antes las docstrings anunciaban un vocabulario inventado (prospeccion,
# contacto_inicial, diagnostico, propuesta, cerrada_ganada...) que el LLM copiaba
# literal y reventaba cada cambio de etapa (AI-02). Fuente unica aqui.
OPPORTUNITY_STAGES = (
    "prospecto",
    "contacto",
    "visita",
    "cotizacion",
    "negociacion",
    "orden_facturacion",
    "venta_cerrada",  # ganada
    "perdida",
)
_STAGES_DOC = ", ".join(OPPORTUNITY_STAGES)

@tool
async def get_customer_opportunities(
    customer_id: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
) -> str:
    """
    Obtiene las oportunidades comerciales de un cliente.
    Usa esta herramienta cuando necesites saber qué oportunidades existen
    para un cliente antes de crear una nueva o actualizar una existente.
    """
    try:
        nestjs_client = NestJSClient(auth_token)
        result = await nestjs_client.get("/opportunities", params={"customerId": customer_id})
        opportunities = result if isinstance(result, list) else result.get("data", [])
        if not opportunities:
            return f"El cliente {customer_id} no tiene oportunidades abiertas."
        
        simplified = [
            {
                "id": o["id"],
                "title": o.get("title"),
                "stage": o.get("stage"),
                "estimatedValue": o.get("estimatedValue"),
                "expectedCloseDate": o.get("expectedCloseDate"),
            }
            for o in opportunities[:10]
        ]
        return json.dumps(simplified, ensure_ascii=False)
    except Exception as e:
        return f"Error al obtener oportunidades: {str(e)}"

@tool
async def create_opportunity(
    customer_id: str,
    title: str,
    stage: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
    description: Optional[str] = None,
    estimated_value: Optional[float] = None,
) -> str:
    """
    Crea una nueva oportunidad comercial para un cliente.
    
    Args:
        customer_id: ID del cliente
        title: Título descriptivo de la oportunidad
        stage: Etapa inicial. Valores validos: prospecto, contacto, visita, cotizacion, negociacion, orden_facturacion, venta_cerrada (ganada), perdida
        description: Descripción detallada (opcional)
        estimated_value: Valor estimado en pesos (opcional)
    """
    if stage not in OPPORTUNITY_STAGES:
        return f"Etapa invalida '{stage}'. Usa una de: {_STAGES_DOC}"
    try:
        nestjs_client = NestJSClient(auth_token)
        payload = {
            "customerId": customer_id,
            "title": title,
            "stage": stage,
        }
        if description: payload["description"] = description
        if estimated_value: payload["estimatedValue"] = estimated_value
        
        result = await nestjs_client.post("/opportunities", payload)
        return f"Oportunidad creada: {json.dumps(result, ensure_ascii=False)}"
    except Exception as e:
        return f"Error al crear oportunidad: {str(e)}"

@tool
async def update_opportunity_stage(
    opportunity_id: str,
    new_stage: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
) -> str:
    """
    Actualiza la etapa de una oportunidad existente.
    Usa esta herramienta cuando el usuario indique que una oportunidad avanzó
    o cambió de estado.
    
    Args:
        opportunity_id: ID de la oportunidad
        new_stage: Nueva etapa. Valores validos: prospecto, contacto, visita, cotizacion, negociacion, orden_facturacion, venta_cerrada (ganada), perdida
    """
    if new_stage not in OPPORTUNITY_STAGES:
        return f"Etapa invalida '{new_stage}'. Usa una de: {_STAGES_DOC}"
    try:
        nestjs_client = NestJSClient(auth_token)
        result = await nestjs_client.patch(f"/opportunities/{opportunity_id}/stage", {"stage": new_stage})
        return f"Etapa actualizada a '{new_stage}': {json.dumps(result, ensure_ascii=False)}"
    except Exception as e:
        return f"Error al actualizar etapa: {str(e)}"

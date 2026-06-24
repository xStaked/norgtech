import json
import logging
from typing import Annotated, Optional

from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState

from .customers import search_customers
from .nestjs_client import NestJSClient, NestJSAPIError

logger = logging.getLogger("nora.expenses")

# Reuse the existing customer search as the association lookup tool.
lookup_customer = search_customers


@tool
async def create_expense(
    expense_date: str,
    category: str,
    amount: float,
    description: str,
    conversation_id: Annotated[str, InjectedState("conversation_id")],
    auth_token: Annotated[str, InjectedState("auth_token")],
    supplier_name: Optional[str] = None,
    supplier_nit: Optional[str] = None,
    invoice_number: Optional[str] = None,
    payment_method: Optional[str] = None,
    customer_id: Optional[str] = None,
    visit_id: Optional[str] = None,
    extraction_confidence: Optional[float] = None,
    extraction_model: Optional[str] = None,
) -> str:
    """
    Registra el gasto comercial en el CRM usando el soporte (imagen) que ya
    fue recibido por WhatsApp. Llama esta herramienta SOLO cuando el usuario
    haya confirmado los datos del gasto.

    Args:
        expense_date: Fecha del gasto en formato YYYY-MM-DD.
        category: Categoria del gasto. Debe ser exactamente uno de (minúsculas, sin tildes):
            alimentacion, transporte, hospedaje, combustible, peajes, parqueadero,
            atencion_comercial, otros.
        amount: Valor total del gasto en pesos (numero, sin separadores).
        description: Descripcion corta del gasto.
        supplier_name / supplier_nit / invoice_number / payment_method: datos del soporte (opcionales).
        customer_id: Cliente a asociar (opcional; usa lookup_customer si el usuario lo menciona).
        visit_id: Visita a asociar (opcional).
        extraction_confidence / extraction_model: metadatos de la lectura OCR (opcionales).

    Returns:
        Confirmacion con el ID del gasto creado y su estado.
    """
    payload: dict = {
        "conversationId": conversation_id,
        "expenseDate": expense_date,
        "category": category,
        "amount": amount,
        "description": description,
    }
    optional = {
        "supplierName": supplier_name,
        "supplierNit": supplier_nit,
        "invoiceNumber": invoice_number,
        "paymentMethod": payment_method,
        "customerId": customer_id,
        "visitId": visit_id,
        "extractionConfidence": extraction_confidence,
        "extractionModel": extraction_model,
    }
    for key, value in optional.items():
        if value is not None:
            payload[key] = value

    client = NestJSClient(auth_token)
    try:
        result = await client.post("/whatsapp/agent/expenses", payload)
        expense_id = result.get("id", "desconocido")
        if result.get("alreadyExisted"):
            return f"Ese gasto ya estaba registrado (ID: {expense_id})."
        status = result.get("status", "pendiente")
        return (
            f"Gasto registrado exitosamente. ID: {expense_id}, estado: {status}. "
            f"Queda en revision. Detalle: {json.dumps(result, ensure_ascii=False)}"
        )
    except NestJSAPIError as e:
        # The API responded with an error (4xx/5xx) — surface status + detail.
        msg = f"Error al registrar el gasto [HTTP {e.status_code}]: {e.detail}"
        logger.error("create_expense API error: %s", msg)
        return msg
    except Exception as e:
        # The request never got a valid response (e.g. wrong NESTJS_API_URL,
        # connection refused). Include the target so we can diagnose from chat.
        msg = (
            f"Error inesperado al registrar el gasto (destino {client.base_url}): "
            f"{type(e).__name__}: {str(e)}"
        )
        logger.error("create_expense unexpected error: %s", msg)
        return msg


@tool
async def update_expense(
    expense_id: str,
    conversation_id: Annotated[str, InjectedState("conversation_id")],
    auth_token: Annotated[str, InjectedState("auth_token")],
    expense_date: Optional[str] = None,
    category: Optional[str] = None,
    amount: Optional[float] = None,
    description: Optional[str] = None,
    supplier_name: Optional[str] = None,
    supplier_nit: Optional[str] = None,
    invoice_number: Optional[str] = None,
    payment_method: Optional[str] = None,
    customer_id: Optional[str] = None,
    visit_id: Optional[str] = None,
) -> str:
    """
    Corrige un gasto existente que está en estado 'requiere_correccion' y lo
    reenvía a revisión. Llama esta herramienta UNA sola vez, cuando el comercial
    haya confirmado todos los cambios. Pasa SOLO los campos que cambian.

    Args:
        expense_id: ID del gasto a corregir (viene en el [CASO DE GASTO]).
        Resto de campos: mismos valores válidos que create_expense; opcionales.
    """
    payload: dict = {"conversationId": conversation_id}
    optional = {
        "expenseDate": expense_date,
        "category": category,
        "amount": amount,
        "description": description,
        "supplierName": supplier_name,
        "supplierNit": supplier_nit,
        "invoiceNumber": invoice_number,
        "paymentMethod": payment_method,
        "customerId": customer_id,
        "visitId": visit_id,
    }
    for key, value in optional.items():
        if value is not None:
            payload[key] = value

    client = NestJSClient(auth_token)
    try:
        result = await client.patch(f"/whatsapp/agent/expenses/{expense_id}", payload)
        status = result.get("status", "pendiente")
        return f"Gasto corregido y reenviado a revisión. Estado: {status}."
    except NestJSAPIError as e:
        msg = f"Error al corregir el gasto [HTTP {e.status_code}]: {e.detail}"
        logger.error("update_expense API error: %s", msg)
        return msg
    except Exception as e:
        msg = (
            f"Error inesperado al corregir el gasto (destino {client.base_url}): "
            f"{type(e).__name__}: {str(e)}"
        )
        logger.error("update_expense unexpected error: %s", msg)
        return msg

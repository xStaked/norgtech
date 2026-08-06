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

# El CRM exige la foto del soporte para TODO gasto (assertSupportFile en
# commercial-expenses.service.ts): un gasto dictado por texto no existe. El
# endpoint del agente responde 404 (no hay caso abierto para la conversacion) o
# 400 (el caso no tiene adjunto). Volcarle esos codigos al modelo hacia que
# Nora improvisara; lo unico accionable es pedir la foto.
_NEEDS_SUPPORT_REPLY = (
    "No puedo registrar el gasto sin la foto del soporte: el CRM la exige "
    "siempre. Pidele al usuario que mande la foto del recibo por WhatsApp y "
    "con eso queda registrado. NO reintentes esta herramienta hasta que la "
    "haya enviado."
)
# Un 400 de validacion ("amount must not be less than 1") si tiene que llegar
# con su detalle: el modelo puede corregirlo. Solo los que hablan del soporte
# se traducen a "manda la foto".
_MISSING_SUPPORT_MARKERS = ("support", "attachment", "soporte", "adjunto")


def _is_missing_support(status_code: int, detail: str) -> bool:
    if status_code == 404:
        return True
    lowered = (detail or "").lower()
    return status_code == 400 and any(m in lowered for m in _MISSING_SUPPORT_MARKERS)


@tool
async def create_expense(
    expense_date: str,
    category: str,
    amount: float,
    description: str,
    conversation_id: Annotated[Optional[str], InjectedState("conversation_id")],
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

    REQUISITO: el CRM no acepta un gasto sin la foto del soporte. Si el usuario
    te dicta un gasto por texto y NO ha mandado la foto del recibo en esta
    conversacion, no le ofrezcas registrarlo ni llames esta herramienta:
    pidele la foto primero.

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
    # El chat web no tiene conversacion de WhatsApp y este endpoint la exige:
    # sin ella el API responde un 400 de validacion que al modelo no le dice
    # nada. El gasto se registra con su foto (por WhatsApp o desde el portal).
    if not conversation_id:
        return _NEEDS_SUPPORT_REPLY

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
        if _is_missing_support(e.status_code, e.detail):
            logger.info("create_expense sin soporte [HTTP %s]: %s", e.status_code, e.detail)
            return _NEEDS_SUPPORT_REPLY
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
async def get_expenses(
    auth_token: Annotated[str, InjectedState("auth_token")],
    status: Optional[str] = None,
    category: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> str:
    """
    Lista los gastos comerciales del usuario actual (los más recientes primero),
    con su ID, fecha, monto, categoría, descripción y estado.

    Úsala para ENCONTRAR el gasto que el usuario quiere editar/corregir o
    consultar, y así obtener su ID para usarlo con update_expense.

    Args:
        status: Filtra por estado (opcional), p.ej. 'pendiente',
            'requiere_correccion', 'aprobado', 'rechazado'.
        category: Filtra por categoría (opcional); mismos valores que create_expense.
        date_from: Fecha mínima del gasto en formato YYYY-MM-DD (opcional).
        date_to: Fecha máxima del gasto en formato YYYY-MM-DD (opcional).
    """
    params: dict = {}
    if status is not None:
        params["status"] = status
    if category is not None:
        params["category"] = category
    if date_from is not None:
        params["from"] = date_from
    if date_to is not None:
        params["to"] = date_to

    client = NestJSClient(auth_token)
    try:
        result = await client.get("/commercial-expenses", params=params)
        expenses = result if isinstance(result, list) else result.get("data", [])
        if not expenses:
            return "No tienes gastos registrados con esos criterios."
        simplified = [
            {
                "id": e["id"],
                "fecha": e.get("expenseDate"),
                "monto": e.get("amount"),
                "categoria": e.get("category"),
                "descripcion": e.get("description"),
                "estado": e.get("status"),
            }
            for e in expenses[:15]
        ]
        return f"Gastos del usuario: {json.dumps(simplified, ensure_ascii=False)}"
    except NestJSAPIError as e:
        msg = f"Error al obtener los gastos [HTTP {e.status_code}]: {e.detail}"
        logger.error("get_expenses API error: %s", msg)
        return msg
    except Exception as e:
        msg = (
            f"Error inesperado al obtener los gastos (destino {client.base_url}): "
            f"{type(e).__name__}: {str(e)}"
        )
        logger.error("get_expenses unexpected error: %s", msg)
        return msg


@tool
async def update_expense(
    expense_id: str,
    conversation_id: Annotated[Optional[str], InjectedState("conversation_id")],
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
    Edita/corrige un gasto comercial existente y lo (re)envía a revisión.
    Sirve tanto para corregir un gasto en estado 'requiere_correccion' (caso
    admin) como para que el comercial EDITE LIBREMENTE cualquiera de sus gastos
    editables (estado 'pendiente' o 'requiere_correccion').

    Para editar un gasto cualquiera:
      1. Usa get_expenses para listar los gastos del usuario y obtener el ID
         del gasto que quiere modificar (a menos que el ID ya venga en un
         [CASO DE GASTO]).
      2. Confirma con el usuario los cambios exactos antes de aplicarlos.
      3. Llama esta herramienta UNA sola vez, pasando SOLO los campos que cambian.

    Args:
        expense_id: ID del gasto a editar (de get_expenses o del [CASO DE GASTO]).
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

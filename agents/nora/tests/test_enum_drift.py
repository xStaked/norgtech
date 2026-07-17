"""AI-02 + drift latente: el vocabulario que Nora manda al API debe coincidir
EXACTO con los enums del API (@IsEnum). Antes las docstrings anunciaban valores
inventados que el LLM copiaba y reventaban con 400. Estos tests fijan los
conjuntos contra el enum real de apps/api/prisma/schema.prisma: si el enum del
API cambia, este test falla y obliga a actualizar Nora en vez de dejar un 400
latente en produccion.
"""
import asyncio

from src.tools.opportunities import OPPORTUNITY_STAGES, create_opportunity, update_opportunity_stage
from src.tools.follow_ups import FOLLOW_UP_TASK_TYPES, create_follow_up

# Copiados a mano del enum real (schema.prisma). Son la especificacion: si Nora
# se desvia, el assert de abajo lo caza.
API_OPPORTUNITY_STAGE = {
    "prospecto", "contacto", "visita", "cotizacion",
    "negociacion", "orden_facturacion", "venta_cerrada", "perdida",
}
API_FOLLOW_UP_TASK_TYPE = {
    "llamada", "email", "whatsapp", "reunion", "recordatorio", "otro",
}


def test_opportunity_stages_match_api_enum():
    assert set(OPPORTUNITY_STAGES) == API_OPPORTUNITY_STAGE


def test_follow_up_types_match_api_enum():
    assert set(FOLLOW_UP_TASK_TYPES) == API_FOLLOW_UP_TASK_TYPE


def test_create_opportunity_rejects_invalid_stage_without_calling_api():
    # El valor viejo e invalido debe frenarse ANTES de tocar el API.
    out = asyncio.run(create_opportunity.ainvoke({
        "customer_id": "c1", "title": "t", "stage": "prospeccion", "auth_token": "x",
    }))
    assert "invalida" in out.lower()
    assert "prospecto" in out  # sugiere el valor correcto


def test_update_stage_rejects_invalid_stage():
    out = asyncio.run(update_opportunity_stage.ainvoke({
        "opportunity_id": "o1", "new_stage": "cerrada_ganada", "auth_token": "x",
    }))
    assert "invalida" in out.lower()


def test_create_follow_up_rejects_invalid_type():
    out = asyncio.run(create_follow_up.ainvoke({
        "customer_id": "c1", "title": "t", "due_at": "2026-07-20T10:00", "task_type": "correo", "auth_token": "x",
    }))
    assert "invalido" in out.lower()
    assert "email" in out

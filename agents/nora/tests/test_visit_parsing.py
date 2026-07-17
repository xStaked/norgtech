"""AI-07: parser de fecha/hora de visitas. `today` inyectable para que los tests
no dependan del dia real. La cadena es SIN offset (el API la lee como Colombia).
"""
from datetime import date

from src.visit_parsing import resolve_visit_datetime

REF = date(2026, 7, 17)  # viernes


def test_absolute_date_backward_compatible():
    # Comportamiento previo intacto: "DD de <mes>" con hora "a las".
    assert resolve_visit_datetime("visita el 20 de junio a las 3pm", today=REF) == "2026-06-20T15:00:00"
    assert resolve_visit_datetime("el 5 de agosto", today=REF) == "2026-08-05T09:00:00"


def test_manana_relative_colombia():
    assert resolve_visit_datetime("agenda la visita mañana", today=REF) == "2026-07-18T09:00:00"
    assert resolve_visit_datetime("manana a las 10am", today=REF) == "2026-07-18T10:00:00"


def test_hoy_and_pasado_manana():
    assert resolve_visit_datetime("hoy a las 2 pm", today=REF) == "2026-07-17T14:00:00"
    assert resolve_visit_datetime("pasado mañana", today=REF) == "2026-07-19T09:00:00"


def test_dia_de_semana_next_occurrence():
    # REF es viernes 17. "el lunes" -> proximo lunes = 20.
    assert resolve_visit_datetime("el lunes a las 8am", today=REF) == "2026-07-20T08:00:00"
    # "el viernes" siendo hoy viernes -> la semana que viene (24), no hoy.
    assert resolve_visit_datetime("el viernes", today=REF) == "2026-07-24T09:00:00"


def test_no_date_returns_none():
    assert resolve_visit_datetime("hola, cómo estás", today=REF) is None
    # Un numero suelto sin fecha ni "a las" no debe inventar una hora/fecha.
    assert resolve_visit_datetime("son 3 clientes", today=REF) is None


def test_bare_time_without_ampm_uses_a_las():
    assert resolve_visit_datetime("mañana a las 14:30", today=REF) == "2026-07-18T14:30:00"

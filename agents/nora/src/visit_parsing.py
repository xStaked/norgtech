"""Parseo compartido de fecha/hora de visitas (AI-07).

Antes cada camino (planner en whatsapp_router y agente general) tenia su propia
copia del parser, y ambas SOLO entendian "el DD de <mes>". "manana", "hoy", "el
viernes" o una hora suelta ("a las 3pm") no se parseaban y la visita quedaba sin
fecha. Aqui hay una sola implementacion, que ademas resuelve fechas relativas.

IMPORTANTE (zona horaria): las fechas relativas se resuelven contra el dia de
HOY EN COLOMBIA (UTC-5, sin DST), no contra la hora del proceso. En un host UTC,
`date.today()` a las 19:00 de Colombia ya seria "manana", asi que "manana"
saldria corrido un dia. `bogota_today()` fija eso. La cadena devuelta es SIN
offset a proposito: el API la interpreta como hora de pared de Colombia
(ver apps/api/src/shared/instant.ts / parseInstant).
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone

BOGOTA_TZ = timezone(timedelta(hours=-5))

_MONTHS = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
}

# lunes=0 … domingo=6 (igual que date.weekday())
_WEEKDAYS = {
    "lunes": 0, "martes": 1, "miercoles": 2, "miércoles": 2, "jueves": 3,
    "viernes": 4, "sabado": 5, "sábado": 5, "domingo": 6,
}

_ABSOLUTE = re.compile(
    r"\b(?:el\s+)?(?P<day>\d{1,2})\s+de\s+"
    r"(?P<month>enero|febrero|marzo|abril|mayo|junio|julio|agosto|"
    r"septiembre|setiembre|octubre|noviembre|diciembre)"
    r"(?:\s+(?:de\s+)?(?P<year>\d{4}))?",
    flags=re.IGNORECASE,
)

# Hora: "a las 3", "a las 3:30 pm", "3pm", "3 p.m." — captura opcional.
_TIME = re.compile(
    r"(?:a\s+las\s+)?(?P<hour>\d{1,2})(?::(?P<minute>\d{2}))?\s*"
    r"(?P<ampm>a\.?\s?m\.?|p\.?\s?m\.?)",
    flags=re.IGNORECASE,
)
_TIME_A_LAS = re.compile(
    r"a\s+las\s+(?P<hour>\d{1,2})(?::(?P<minute>\d{2}))?",
    flags=re.IGNORECASE,
)


def bogota_today() -> date:
    return datetime.now(timezone.utc).astimezone(BOGOTA_TZ).date()


def _parse_time(text: str) -> tuple[int, int]:
    """Devuelve (hour24, minute); default 09:00 si no hay hora."""
    m = _TIME.search(text)
    if m:
        hour = int(m.group("hour"))
        minute = int(m.group("minute") or 0)
        ampm = m.group("ampm").lower().replace(".", "").replace(" ", "")
        if ampm == "pm" and hour < 12:
            hour += 12
        if ampm == "am" and hour == 12:
            hour = 0
        return hour, minute
    m = _TIME_A_LAS.search(text)
    if m:
        return int(m.group("hour")), int(m.group("minute") or 0)
    return 9, 0


def _relative_date(text: str, today: date) -> date | None:
    lowered = text.lower()
    if "pasado manana" in lowered or "pasado mañana" in lowered:
        return today + timedelta(days=2)
    if "manana" in lowered or "mañana" in lowered:
        return today + timedelta(days=1)
    if re.search(r"\bhoy\b", lowered):
        return today
    for name, wd in _WEEKDAYS.items():
        if re.search(rf"\b{name}\b", lowered):
            # Proximo dia con ese nombre; si es hoy mismo, se toma la semana que viene.
            delta = (wd - today.weekday()) % 7
            return today + timedelta(days=delta or 7)
    return None


def resolve_visit_datetime(text: str, today: date | None = None) -> str | None:
    """ISO sin offset 'YYYY-MM-DDTHH:MM:00' o None. today inyectable para tests."""
    if today is None:
        today = bogota_today()

    abs_matches = list(_ABSOLUTE.finditer(text))
    if abs_matches:
        m = abs_matches[-1]
        day = int(m.group("day"))
        month = _MONTHS[m.group("month").lower()]
        year = int(m.group("year") or today.year)
        hour, minute = _parse_time(text)
        return f"{year:04d}-{month:02d}-{day:02d}T{hour:02d}:{minute:02d}:00"

    rel = _relative_date(text, today)
    if rel is not None:
        hour, minute = _parse_time(text)
        return f"{rel.year:04d}-{rel.month:02d}-{rel.day:02d}T{hour:02d}:{minute:02d}:00"

    return None

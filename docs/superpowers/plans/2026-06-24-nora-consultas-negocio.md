# Nora — Consultas de negocio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Darle a Nora (agente web) tres tools de lectura para responder consultas de negocio (ventas/indicadores, cartera, progreso de meta) reutilizando endpoints existentes de la API NestJS.

**Architecture:** Un nuevo módulo `tools/analytics.py` con 3 tools `@tool` async que usan `NestJSClient` (forwardea el JWT) contra endpoints existentes auto-filtrados por rol. Se registran en `ALL_TOOLS` del agente web (`agent.py`) y se documentan en `NORA_SYSTEM_PROMPT`. No se tocan endpoints de NestJS ni `main.py`.

**Tech Stack:** Python 3.14, LangChain/LangGraph `@tool`, `httpx` (vía `NestJSClient`), `pytest` + `unittest.mock`.

## Global Constraints

- Las tools van SOLO en el agente web (`agent.py` → `ALL_TOOLS`). NO tocar `whatsapp_agent.py` ni `EXPENSE_TOOLS`.
- Patrón obligatorio de cada tool: `@tool` async, parámetro `auth_token: Annotated[str, InjectedState("auth_token")]`, instancia `NestJSClient(auth_token)`, `try/except NestJSAPIError` → `f"Error ...: {e.detail}"`, `except Exception as e` → `f"Error inesperado ...: {str(e)}"`. Nunca exponer stack traces.
- Las tools devuelven texto: un prefijo en español + `json.dumps(<dict compacto>, ensure_ascii=False)` con números crudos (ya redondeados por la API). El formateo a pesos colombianos lo hace Nora vía prompt.
- Recortar listas a top 5.
- `NestJSClient.get(path, params=None)` ya existe. `NestJSAPIError` expone `.status_code` y `.detail`.
- Ejecutar tests con: `cd agents/nora && python -m pytest` (hay `.venv`; usar `source .venv/bin/activate` si hace falta).
- Sin prefijo global de rutas en la API (las rutas se llaman tal cual: `/dashboard/...`, `/invoices/...`, `/auth/me`, `/users/:id/seller-goals/progress`).

---

### Task 1: Tool `get_sales_summary`

**Files:**
- Create: `agents/nora/src/tools/analytics.py`
- Test: `agents/nora/tests/test_analytics_tools.py`

**Interfaces:**
- Consumes: `NestJSClient(auth_token).get("/dashboard/commercial-advanced", params={"days": days})`. Respuesta (campos usados): `window.days`; `totals` = `{orders, revenue, returns, netRevenue, units, customers, products}`; `byCustomer` = lista ordenada desc de `{customerName, netRevenue, orders}`; `byProduct` = lista ordenada desc de `{name, sku, quantity, revenue}`; `repurchase` = `{repurchaseRate, repeatCount, noRepurchaseCount}`; `dormantCustomers` = lista de `{customerName, daysSinceLastOrder}`; `lowRotationProducts` = lista de `{name, quantity}`.
- Produces: `get_sales_summary(days: int = 90, auth_token: str) -> str`.

- [ ] **Step 1: Write the failing test**

```python
import asyncio
from unittest.mock import AsyncMock, patch

import json
from src.tools.analytics import get_sales_summary
from src.tools.nestjs_client import NestJSAPIError


SALES_PAYLOAD = {
    "window": {"days": 30, "from": "x", "to": "y"},
    "totals": {"orders": 12, "revenue": 5000000, "returns": 200000,
               "netRevenue": 4800000, "units": 340, "customers": 7, "products": 9},
    "byCustomer": [
        {"customerName": f"Cliente {i}", "netRevenue": 1000 - i, "orders": i}
        for i in range(8)
    ],
    "byProduct": [
        {"name": f"Prod {i}", "sku": f"SKU{i}", "quantity": i, "revenue": 100 - i}
        for i in range(8)
    ],
    "repurchase": {"repurchaseRate": 42.5, "repeatCount": 3, "noRepurchaseCount": 4},
    "dormantCustomers": [{"customerName": f"Dorm {i}", "daysSinceLastOrder": i} for i in range(8)],
    "lowRotationProducts": [{"name": f"Low {i}", "quantity": i} for i in range(8)],
}


def test_get_sales_summary_compacts_and_limits_top5():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=SALES_PAYLOAD)

    with patch("src.tools.analytics.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_sales_summary.ainvoke({"days": 30, "auth_token": "Bearer scoped"})
        )

    # llamó al endpoint correcto con days
    path = fake_client.get.await_args.args[0]
    assert path == "/dashboard/commercial-advanced"
    assert fake_client.get.await_args.kwargs["params"] == {"days": 30}

    # el JSON embebido trae totales y recorta a 5
    payload = json.loads(result[result.index("{"):])
    assert payload["totales"]["ventas"] == 5000000
    assert payload["totales"]["neto"] == 4800000
    assert payload["recompra"]["tasa_pct"] == 42.5
    assert len(payload["top_clientes"]) == 5
    assert len(payload["top_productos"]) == 5
    assert len(payload["clientes_dormidos"]) == 5
    assert len(payload["productos_baja_rotacion"]) == 5


def test_get_sales_summary_surfaces_api_error_detail():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(side_effect=NestJSAPIError(403, "Insufficient permissions"))

    with patch("src.tools.analytics.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_sales_summary.ainvoke({"auth_token": "Bearer scoped"})
        )

    assert result.startswith("Error")
    assert "Insufficient permissions" in result
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents/nora && python -m pytest tests/test_analytics_tools.py -k get_sales_summary -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'src.tools.analytics'`.

- [ ] **Step 3: Write minimal implementation**

```python
import json
from typing import Annotated, Optional

from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState

from .nestjs_client import NestJSClient, NestJSAPIError


@tool
async def get_sales_summary(
    auth_token: Annotated[str, InjectedState("auth_token")],
    days: int = 90,
) -> str:
    """
    Resumen de ventas e indicadores del comercial en una ventana de días.
    Úsala para: '¿cuánto llevo en ventas?', top clientes, top productos,
    recompra, devoluciones, clientes dormidos / a quién no le he vendido,
    productos de baja rotación. Los datos vienen filtrados al usuario actual.

    Args:
        days: Tamaño de la ventana en días (por defecto 90).
    """
    try:
        client = NestJSClient(auth_token)
        data = await client.get(
            "/dashboard/commercial-advanced", params={"days": days}
        )
        totals = data.get("totals", {}) or {}
        repurchase = data.get("repurchase", {}) or {}
        summary = {
            "ventana_dias": (data.get("window", {}) or {}).get("days", days),
            "totales": {
                "pedidos": totals.get("orders"),
                "ventas": totals.get("revenue"),
                "devoluciones": totals.get("returns"),
                "neto": totals.get("netRevenue"),
                "unidades": totals.get("units"),
                "clientes": totals.get("customers"),
                "productos": totals.get("products"),
            },
            "top_clientes": [
                {
                    "cliente": c.get("customerName"),
                    "neto": c.get("netRevenue"),
                    "pedidos": c.get("orders"),
                }
                for c in (data.get("byCustomer") or [])[:5]
            ],
            "top_productos": [
                {
                    "producto": p.get("name"),
                    "sku": p.get("sku"),
                    "cantidad": p.get("quantity"),
                    "ventas": p.get("revenue"),
                }
                for p in (data.get("byProduct") or [])[:5]
            ],
            "recompra": {
                "tasa_pct": repurchase.get("repurchaseRate"),
                "recompraron": repurchase.get("repeatCount"),
                "no_recompraron": repurchase.get("noRepurchaseCount"),
            },
            "clientes_dormidos": [
                {
                    "cliente": d.get("customerName"),
                    "dias_sin_comprar": d.get("daysSinceLastOrder"),
                }
                for d in (data.get("dormantCustomers") or [])[:5]
            ],
            "productos_baja_rotacion": [
                {"producto": p.get("name"), "cantidad": p.get("quantity")}
                for p in (data.get("lowRotationProducts") or [])[:5]
            ],
        }
        return (
            f"Resumen de ventas (últimos {summary['ventana_dias']} días): "
            f"{json.dumps(summary, ensure_ascii=False)}"
        )
    except NestJSAPIError as e:
        return f"Error al obtener el resumen de ventas: {e.detail}"
    except Exception as e:
        return f"Error inesperado al obtener el resumen de ventas: {str(e)}"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agents/nora && python -m pytest tests/test_analytics_tools.py -k get_sales_summary -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add agents/nora/src/tools/analytics.py agents/nora/tests/test_analytics_tools.py
git commit -m "feat(nora): get_sales_summary read tool"
```

---

### Task 2: Tool `get_cartera`

**Files:**
- Modify: `agents/nora/src/tools/analytics.py`
- Test: `agents/nora/tests/test_analytics_tools.py`

**Interfaces:**
- Consumes:
  - `client.get("/invoices/summary", params=None | {"customerId": customer_id})`. Respuesta: `{totalBalance, totalAmount, totalPaid, totalCreditNotes, byStatus, byCustomer: [{name, total, paid}], aging: {current, days1to30, days31to60, days61to90, over90}}`.
  - `client.get("/invoices/overdue")` → lista de `{invoiceNumber, dueDate, totalAmount, totalPaid, customer: {id, ...}}`.
- Produces: `get_cartera(customer_id: Optional[str] = None, auth_token: str) -> str`.

- [ ] **Step 1: Write the failing test**

```python
SUMMARY_PAYLOAD = {
    "totalInvoices": 10, "totalAmount": 9000000, "totalPaid": 4000000,
    "totalCreditNotes": 100000, "totalBalance": 5000000,
    "byStatus": {"emitida": 5000000},
    "byCustomer": [
        {"name": f"Cli {i}", "total": 1000 * i, "paid": 100 * i} for i in range(8)
    ],
    "aging": {"current": 1000000, "days1to30": 2000000, "days31to60": 1000000,
              "days61to90": 500000, "over90": 500000},
}

OVERDUE_PAYLOAD = [
    {"invoiceNumber": "F-1", "dueDate": "2026-06-01", "totalAmount": 300000,
     "totalPaid": 100000, "customer": {"id": "cus_1"}},
    {"invoiceNumber": "F-2", "dueDate": "2026-06-02", "totalAmount": 200000,
     "totalPaid": 0, "customer": {"id": "cus_OTHER"}},
]


def test_get_cartera_global_aging_and_top_deudores():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=SUMMARY_PAYLOAD)

    with patch("src.tools.analytics.NestJSClient", return_value=fake_client):
        result = asyncio.run(get_cartera.ainvoke({"auth_token": "Bearer scoped"}))

    assert fake_client.get.await_args.args[0] == "/invoices/summary"
    payload = json.loads(result[result.index("{"):])
    assert payload["saldo_total"] == 5000000
    assert payload["aging"]["mas_90"] == 500000
    # top deudores ordenados por saldo (total - paid) desc, máx 5
    assert len(payload["top_deudores"]) == 5
    assert payload["top_deudores"][0]["saldo"] >= payload["top_deudores"][1]["saldo"]
    assert "facturas_vencidas" not in payload


def test_get_cartera_with_customer_includes_overdue_filtered():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(side_effect=[SUMMARY_PAYLOAD, OVERDUE_PAYLOAD])

    with patch("src.tools.analytics.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_cartera.ainvoke({"customer_id": "cus_1", "auth_token": "Bearer scoped"})
        )

    # summary pedido con el filtro de cliente
    first_call = fake_client.get.await_args_list[0]
    assert first_call.args[0] == "/invoices/summary"
    assert first_call.kwargs["params"] == {"customerId": "cus_1"}
    # segunda llamada a overdue
    assert fake_client.get.await_args_list[1].args[0] == "/invoices/overdue"

    payload = json.loads(result[result.index("{"):])
    vencidas = payload["facturas_vencidas"]
    assert len(vencidas) == 1
    assert vencidas[0]["factura"] == "F-1"
    assert vencidas[0]["saldo"] == 200000
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents/nora && python -m pytest tests/test_analytics_tools.py -k get_cartera -v`
Expected: FAIL con `ImportError: cannot import name 'get_cartera'`.

- [ ] **Step 3: Write minimal implementation** (añadir al final de `analytics.py`)

```python
@tool
async def get_cartera(
    auth_token: Annotated[str, InjectedState("auth_token")],
    customer_id: Optional[str] = None,
) -> str:
    """
    Estado de la cartera (cuentas por cobrar): saldo total, aging por antigüedad
    y mayores deudores. Úsala para '¿cómo está la cartera?', '¿quién me debe?',
    'facturas vencidas'. Si pasas customer_id, se enfoca en ese cliente e incluye
    sus facturas vencidas. Datos filtrados al usuario actual.

    Args:
        customer_id: ID del cliente para enfocar la cartera (opcional).
    """
    try:
        client = NestJSClient(auth_token)
        params = {"customerId": customer_id} if customer_id else None
        data = await client.get("/invoices/summary", params=params)
        aging = data.get("aging", {}) or {}
        deudores = sorted(
            (
                {
                    "cliente": c.get("name"),
                    "facturado": c.get("total"),
                    "pagado": c.get("paid"),
                    "saldo": (c.get("total") or 0) - (c.get("paid") or 0),
                }
                for c in (data.get("byCustomer") or [])
            ),
            key=lambda x: x["saldo"],
            reverse=True,
        )
        summary = {
            "saldo_total": data.get("totalBalance"),
            "facturado_total": data.get("totalAmount"),
            "pagado_total": data.get("totalPaid"),
            "notas_credito": data.get("totalCreditNotes"),
            "aging": {
                "corriente": aging.get("current"),
                "1_30": aging.get("days1to30"),
                "31_60": aging.get("days31to60"),
                "61_90": aging.get("days61to90"),
                "mas_90": aging.get("over90"),
            },
            "top_deudores": deudores[:5],
        }
        if customer_id:
            overdue = await client.get("/invoices/overdue")
            overdue_list = overdue if isinstance(overdue, list) else overdue.get("data", [])
            summary["facturas_vencidas"] = [
                {
                    "factura": i.get("invoiceNumber"),
                    "vence": i.get("dueDate"),
                    "saldo": (i.get("totalAmount") or 0) - (i.get("totalPaid") or 0),
                }
                for i in overdue_list
                if (i.get("customer") or {}).get("id") == customer_id
            ]
        return f"Estado de cartera: {json.dumps(summary, ensure_ascii=False)}"
    except NestJSAPIError as e:
        return f"Error al obtener la cartera: {e.detail}"
    except Exception as e:
        return f"Error inesperado al obtener la cartera: {str(e)}"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agents/nora && python -m pytest tests/test_analytics_tools.py -k get_cartera -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add agents/nora/src/tools/analytics.py agents/nora/tests/test_analytics_tools.py
git commit -m "feat(nora): get_cartera read tool"
```

---

### Task 3: Tool `get_goal_progress`

**Files:**
- Modify: `agents/nora/src/tools/analytics.py`
- Test: `agents/nora/tests/test_analytics_tools.py`

**Interfaces:**
- Consumes:
  - `client.get("/auth/me")` → `{id, email, role}`.
  - `client.get(f"/users/{user_id}/seller-goals/progress")` (sin params → meta más reciente) → `{periodType, periodValue, targetAmount, soldAmount, remainingAmount, percentage, ordersCount}`. Lanza `NestJSAPIError` 404 si no hay metas.
- Produces: `get_goal_progress(auth_token: str) -> str`.

- [ ] **Step 1: Write the failing test**

```python
def test_get_goal_progress_happy_path():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(side_effect=[
        {"id": "user_1", "email": "a@b.co", "role": "comercial"},
        {"periodType": "mensual", "periodValue": "2026-06", "targetAmount": 300000000,
         "soldAmount": 100000000, "remainingAmount": 200000000, "percentage": 33.33,
         "ordersCount": 5},
    ])

    with patch("src.tools.analytics.NestJSClient", return_value=fake_client):
        result = asyncio.run(get_goal_progress.ainvoke({"auth_token": "Bearer scoped"}))

    assert fake_client.get.await_args_list[0].args[0] == "/auth/me"
    assert fake_client.get.await_args_list[1].args[0] == "/users/user_1/seller-goals/progress"
    payload = json.loads(result[result.index("{"):])
    assert payload["meta"] == 300000000
    assert payload["vendido"] == 100000000
    assert payload["porcentaje"] == 33.33


def test_get_goal_progress_no_goal_returns_friendly_message():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(side_effect=[
        {"id": "user_1"},
        NestJSAPIError(404, "No seller goals found"),
    ])

    with patch("src.tools.analytics.NestJSClient", return_value=fake_client):
        result = asyncio.run(get_goal_progress.ainvoke({"auth_token": "Bearer scoped"}))

    assert "meta" in result.lower()
    assert "{" not in result  # mensaje plano, sin JSON
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents/nora && python -m pytest tests/test_analytics_tools.py -k get_goal_progress -v`
Expected: FAIL con `ImportError: cannot import name 'get_goal_progress'`.

- [ ] **Step 3: Write minimal implementation** (añadir al final de `analytics.py`)

```python
@tool
async def get_goal_progress(
    auth_token: Annotated[str, InjectedState("auth_token")],
) -> str:
    """
    Progreso del comercial actual frente a su meta de ventas del periodo más
    reciente. Úsala para '¿cuánto llevo de mi meta?', '¿cuánto me falta?'.

    Returns:
        Meta, vendido, faltante, porcentaje y periodo; o un mensaje claro si no
        hay meta asignada.
    """
    try:
        client = NestJSClient(auth_token)
        me = await client.get("/auth/me")
        user_id = me.get("id")
        if not user_id:
            return "No pude identificar tu usuario para consultar la meta."
        try:
            prog = await client.get(f"/users/{user_id}/seller-goals/progress")
        except NestJSAPIError as e:
            if e.status_code == 404:
                return "Aún no tienes una meta de ventas asignada para este periodo."
            raise
        summary = {
            "periodo": f"{prog.get('periodType')} {prog.get('periodValue')}",
            "meta": prog.get("targetAmount"),
            "vendido": prog.get("soldAmount"),
            "falta": prog.get("remainingAmount"),
            "porcentaje": prog.get("percentage"),
            "pedidos": prog.get("ordersCount"),
        }
        return f"Progreso de meta: {json.dumps(summary, ensure_ascii=False)}"
    except NestJSAPIError as e:
        return f"Error al obtener el progreso de meta: {e.detail}"
    except Exception as e:
        return f"Error inesperado al obtener el progreso de meta: {str(e)}"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agents/nora && python -m pytest tests/test_analytics_tools.py -k get_goal_progress -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add agents/nora/src/tools/analytics.py agents/nora/tests/test_analytics_tools.py
git commit -m "feat(nora): get_goal_progress read tool"
```

---

### Task 4: Registrar tools en el agente web y actualizar el prompt

**Files:**
- Modify: `agents/nora/src/agent.py:11-34` (imports y `ALL_TOOLS`)
- Modify: `agents/nora/src/prompts/system.py` (sección de consultas de negocio)
- Test: `agents/nora/tests/test_analytics_tools.py`

**Interfaces:**
- Consumes: `get_sales_summary`, `get_cartera`, `get_goal_progress` de `tools/analytics.py`.
- Produces: las 3 tools quedan en `agent.ALL_TOOLS`.

- [ ] **Step 1: Write the failing test**

```python
def test_analytics_tools_registered_in_web_agent():
    from src.agent import ALL_TOOLS

    names = {t.name for t in ALL_TOOLS}
    assert {"get_sales_summary", "get_cartera", "get_goal_progress"} <= names
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents/nora && python -m pytest tests/test_analytics_tools.py -k registered -v`
Expected: FAIL (assert: faltan los nombres en `ALL_TOOLS`).

- [ ] **Step 3: Registrar en `agent.py`**

Añadir el import junto a los otros imports de tools (después de la línea `from .tools.orders import ...`):

```python
from .tools.analytics import get_sales_summary, get_cartera, get_goal_progress
```

Y añadir las tres al final de la lista `ALL_TOOLS` (antes del `]` de cierre):

```python
    search_products,
    get_customer_quotes,
    create_order,
    get_sales_summary,
    get_cartera,
    get_goal_progress,
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agents/nora && python -m pytest tests/test_analytics_tools.py -k registered -v`
Expected: PASS.

- [ ] **Step 5: Actualizar el system prompt**

En `agents/nora/src/prompts/system.py`, dentro de la sección "## Capacidades (tools disponibles)" añadir estas líneas a la lista:

```
- **get_sales_summary**: Resumen de ventas e indicadores (top clientes/productos, recompra, devoluciones, clientes dormidos, baja rotación)
- **get_cartera**: Estado de cartera — saldo, antigüedad (aging) y mayores deudores; opcional por cliente
- **get_goal_progress**: Progreso del comercial frente a su meta de ventas del periodo
```

Y agregar esta sección nueva justo antes de "## Formato de respuesta":

```
### Consultas de negocio
Cuando el usuario pregunte por su desempeño o el estado del negocio, usa las tools de lectura:
- "¿cuánto llevo de la meta?", "¿cuánto me falta?" → `get_goal_progress` (si quieren el detalle de ventas, complementa con `get_sales_summary`).
- "¿cómo está la cartera?", "¿quién me debe?", "facturas vencidas" → `get_cartera` (usa customer_id si la pregunta es sobre un cliente puntual; búscalo antes con `search_customers` si solo dan el nombre).
- "¿cuánto he vendido?", "top clientes", "qué producto se vende más", "recompra", "devoluciones", "¿a quién no le he vendido?" → `get_sales_summary`.

Reglas al responder consultas de negocio:
- Los montos vienen como números crudos; preséntalos en pesos colombianos (ej: 12000000 → $12.000.000).
- Resume en lenguaje natural y conciso. NO muestres el JSON crudo.
- Si una tool devuelve un mensaje de error o "sin meta", explícalo con naturalidad en vez de inventar cifras.
```

- [ ] **Step 6: Full test run + commit**

Run: `cd agents/nora && python -m pytest -q`
Expected: toda la suite pasa (incluye los tests previos de gastos/whatsapp).

```bash
git add agents/nora/src/agent.py agents/nora/src/prompts/system.py agents/nora/tests/test_analytics_tools.py
git commit -m "feat(nora): wire business-query tools into web agent + prompt"
```

---

## Self-Review

**Spec coverage:**
- `get_sales_summary` (commercial-advanced) → Task 1 ✓ (ventas, top clientes/productos, recompra, devoluciones, dormidos, baja rotación).
- `get_cartera` (invoices/summary + overdue) → Task 2 ✓ (aging, saldo, deudores, vencidas por cliente).
- `get_goal_progress` (auth/me + seller-goals/progress) → Task 3 ✓ (meta, vendido, %, faltante, sin-meta).
- Registro en `ALL_TOOLS` + prompt de consultas de negocio + formato COP → Task 4 ✓.
- "Sin cambios en main.py / endpoints NestJS" → respetado (ninguna tarea los toca).
- Fuera de alcance (WhatsApp, gráficas, filtros empresa/zona) → no incluido ✓.

**Placeholder scan:** sin TBD/TODO; todo el código de cada step está completo.

**Type consistency:** nombres de tool (`get_sales_summary`, `get_cartera`, `get_goal_progress`) y firmas consistentes entre tasks, tests y registro. `NestJSAPIError.status_code`/`.detail` usados como existen en `nestjs_client.py`. `NestJSClient.get(path, params=...)` coincide con la firma real.

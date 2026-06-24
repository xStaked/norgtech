# Nora — Pedidos por chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arreglar la creación de pedidos vía Nora (agente web) enviando el `companyId` requerido, permitiendo elegir empresa y zona de despacho, y dejando el pedido `en_revision`.

**Architecture:** Dos tools de lectura nuevas (`get_companies`, `get_customer_zones`) y la modificación de `create_order` en `agents/nora/src/tools/orders.py`, reutilizando endpoints existentes (JWT forwardeado por `NestJSClient`). Se registran en `ALL_TOOLS`, se actualiza el prompt de pedidos, y se reflejan empresa/zona en la propuesta de display. Cero cambios de esquema/API.

**Tech Stack:** Python 3.14, LangChain/LangGraph `@tool`, `httpx` (vía `NestJSClient`), Pydantic (FastAPI models), `pytest` + `unittest.mock`.

## Global Constraints

- Cambios SOLO en el agente web de Nora. NO tocar `whatsapp_agent.py` / `EXPENSE_TOOLS` / la API NestJS / el esquema Prisma / `apps/web`.
- Patrón de tools (ver `tools/segments.py` y `tools/orders.py`): `@tool` async, `auth_token: Annotated[str, InjectedState("auth_token")]`, `NestJSClient(auth_token)`, `try/except NestJSAPIError` → `f"Error ...: {e.detail}"`, `except Exception as e` → `f"Error inesperado ...: {str(e)}"`. Nunca exponer stack traces.
- Las tools de lectura devuelven texto: prefijo en español + `json.dumps(..., ensure_ascii=False, indent=2)`. Normalizar respuesta lista-o-`{data:[]}` con `result if isinstance(result, list) else result.get("data", [])`.
- `create_order` debe enviar SIEMPRE `companyId` y `approvalStatus: "en_revision"`. `customerZoneId` solo si se proporciona.
- Sin prefijo global de rutas: `/companies`, `/customers/:id/zones`, `/orders`.
- Tests: `cd agents/nora && python -m pytest` (existe `.venv`; usar `source .venv/bin/activate` si los imports fallan).

---

### Task 1: Tool `get_companies`

**Files:**
- Modify: `agents/nora/src/tools/orders.py` (añadir al inicio, tras los imports)
- Test: `agents/nora/tests/test_orders_tool.py` (crear)

**Interfaces:**
- Consumes: `NestJSClient(auth_token).get("/companies")` → lista de `{id, name, prefix, isActive, legalName, nit}` (la API ya filtra a activas, pero filtramos por `isActive` defensivamente).
- Produces: `get_companies(auth_token: str) -> str`.

- [ ] **Step 1: Write the failing test**

```python
import asyncio
import json
from unittest.mock import AsyncMock, patch

from src.tools.orders import get_companies
from src.tools.nestjs_client import NestJSAPIError


def test_get_companies_lists_active_with_id_name_prefix():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=[
        {"id": "co_1", "name": "Nortech", "prefix": "NT", "isActive": True},
        {"id": "co_2", "name": "Nanonutricion", "prefix": "NN", "isActive": True},
        {"id": "co_3", "name": "Vieja", "prefix": "VJ", "isActive": False},
    ])

    with patch("src.tools.orders.NestJSClient", return_value=fake_client):
        result = asyncio.run(get_companies.ainvoke({"auth_token": "Bearer scoped"}))

    assert fake_client.get.await_args.args[0] == "/companies"
    payload = json.loads(result[result.index("["):])
    assert {c["nombre"] for c in payload} == {"Nortech", "Nanonutricion"}
    assert payload[0]["id"] == "co_1"
    assert payload[0]["prefix"] == "NT"


def test_get_companies_surfaces_api_error_detail():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(side_effect=NestJSAPIError(401, "Unauthorized"))

    with patch("src.tools.orders.NestJSClient", return_value=fake_client):
        result = asyncio.run(get_companies.ainvoke({"auth_token": "Bearer scoped"}))

    assert result.startswith("Error")
    assert "Unauthorized" in result
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents/nora && python -m pytest tests/test_orders_tool.py -k get_companies -v`
Expected: FAIL con `ImportError: cannot import name 'get_companies'`.

- [ ] **Step 3: Write minimal implementation**

Añadir esta tool en `agents/nora/src/tools/orders.py` justo después de los imports existentes (que ya incluyen `json`, `tool`, `InjectedState`, `NestJSClient`, `NestJSAPIError`, `Annotated`, `Optional`):

```python
@tool
async def get_companies(
    auth_token: Annotated[str, InjectedState("auth_token")],
) -> str:
    """
    Obtiene las empresas que pueden facturar un pedido (ej: Nortech, Nanonutrición).
    Úsala antes de crear un pedido para determinar el companyId. Si el usuario nombró
    la empresa, escoge la que coincida; si solo hay una, úsala; si hay varias y no la
    dijo, pregúntale cuál.

    Returns:
        Lista de empresas activas en JSON con id, nombre y prefix.
    """
    try:
        nestjs_client = NestJSClient(auth_token)
        result = await nestjs_client.get("/companies")
        companies = result if isinstance(result, list) else result.get("data", [])
        simplified = [
            {"id": c["id"], "nombre": c.get("name"), "prefix": c.get("prefix")}
            for c in companies
            if c.get("isActive", True)
        ]
        if not simplified:
            return "No hay empresas activas configuradas."
        return f"Empresas disponibles: {json.dumps(simplified, ensure_ascii=False, indent=2)}"
    except NestJSAPIError as e:
        return f"Error al obtener empresas: {e.detail}"
    except Exception as e:
        return f"Error inesperado al obtener empresas: {str(e)}"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agents/nora && python -m pytest tests/test_orders_tool.py -k get_companies -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add agents/nora/src/tools/orders.py agents/nora/tests/test_orders_tool.py
git commit -m "feat(nora): get_companies tool"
```

---

### Task 2: Tool `get_customer_zones`

**Files:**
- Modify: `agents/nora/src/tools/orders.py`
- Test: `agents/nora/tests/test_orders_tool.py`

**Interfaces:**
- Consumes: `client.get(f"/customers/{customer_id}/zones")` → lista de `CustomerZone`: `{id, address, zone: {id, name, department}}`. El `id` del CustomerZone ES el `customerZoneId` que espera `POST /orders`.
- Produces: `get_customer_zones(customer_id: str, auth_token: str) -> str`.

- [ ] **Step 1: Write the failing test**

```python
def test_get_customer_zones_maps_customer_zone_id_and_flattens_zone():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=[
        {"id": "cz_1", "address": "Calle 1", "zone": {"id": "z_1", "name": "Costa", "department": "Atlantico"}},
        {"id": "cz_2", "address": None, "zone": {"id": "z_2", "name": "Centro", "department": "Cundinamarca"}},
    ])

    with patch("src.tools.orders.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_customer_zones.ainvoke({"customer_id": "cus_1", "auth_token": "Bearer scoped"})
        )

    assert fake_client.get.await_args.args[0] == "/customers/cus_1/zones"
    payload = json.loads(result[result.index("["):])
    assert payload[0]["customerZoneId"] == "cz_1"
    assert payload[0]["zona"] == "Costa"
    assert payload[0]["departamento"] == "Atlantico"
    assert payload[0]["direccion"] == "Calle 1"


def test_get_customer_zones_handles_no_zones():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=[])

    with patch("src.tools.orders.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            get_customer_zones.ainvoke({"customer_id": "cus_1", "auth_token": "Bearer scoped"})
        )

    assert "no tiene zonas" in result.lower()
    assert "[" not in result
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents/nora && python -m pytest tests/test_orders_tool.py -k get_customer_zones -v`
Expected: FAIL con `ImportError: cannot import name 'get_customer_zones'`. (Añadir `get_customer_zones` al import de `src.tools.orders` en el test.)

- [ ] **Step 3: Write minimal implementation** (añadir a `orders.py`)

```python
@tool
async def get_customer_zones(
    customer_id: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
) -> str:
    """
    Obtiene las zonas de despacho registradas para un cliente. Úsala al crear un
    pedido: si el cliente tiene más de una zona, pregunta a cuál se despacha; si
    tiene una sola, úsala; si no tiene, omite la zona.

    Args:
        customer_id: ID del cliente.

    Returns:
        Lista de zonas en JSON con customerZoneId (úsalo en create_order), zona,
        departamento y direccion.
    """
    try:
        nestjs_client = NestJSClient(auth_token)
        result = await nestjs_client.get(f"/customers/{customer_id}/zones")
        zones = result if isinstance(result, list) else result.get("data", [])
        if not zones:
            return "Este cliente no tiene zonas de despacho registradas."
        simplified = [
            {
                "customerZoneId": z["id"],
                "zona": (z.get("zone") or {}).get("name"),
                "departamento": (z.get("zone") or {}).get("department"),
                "direccion": z.get("address"),
            }
            for z in zones
        ]
        return f"Zonas del cliente: {json.dumps(simplified, ensure_ascii=False, indent=2)}"
    except NestJSAPIError as e:
        return f"Error al obtener zonas del cliente: {e.detail}"
    except Exception as e:
        return f"Error inesperado al obtener zonas del cliente: {str(e)}"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agents/nora && python -m pytest tests/test_orders_tool.py -k get_customer_zones -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add agents/nora/src/tools/orders.py agents/nora/tests/test_orders_tool.py
git commit -m "feat(nora): get_customer_zones tool"
```

---

### Task 3: `create_order` — companyId requerido + zona + en_revision

**Files:**
- Modify: `agents/nora/src/tools/orders.py` (función `create_order`, líneas ~124-207)
- Test: `agents/nora/tests/test_orders_tool.py`

**Interfaces:**
- Consumes: `client.post("/orders", payload)`.
- Produces: nueva firma
  `create_order(customer_id: str, items: list[dict], company_id: str, auth_token: str, customer_zone_id: Optional[str] = None, opportunity_id: Optional[str] = None, source_quote_id: Optional[str] = None, notes: Optional[str] = None) -> str`.
- Payload incluye SIEMPRE `companyId` y `approvalStatus: "en_revision"`; `customerZoneId` solo si viene.

- [ ] **Step 1: Write the failing test**

```python
def _order_items():
    return [{"product_id": "p_1", "quantity": 2, "unit_price": 1000}]


def test_create_order_sends_company_and_en_revision():
    fake_client = AsyncMock()
    fake_client.post = AsyncMock(return_value={"id": "ord_1", "status": "recibido", "total": 2000})

    with patch("src.tools.orders.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            create_order.ainvoke({
                "customer_id": "cus_1",
                "items": _order_items(),
                "company_id": "co_1",
                "auth_token": "Bearer scoped",
            })
        )

    path, payload = fake_client.post.await_args.args
    assert path == "/orders"
    assert payload["companyId"] == "co_1"
    assert payload["approvalStatus"] == "en_revision"
    assert "customerZoneId" not in payload  # no se pasó zona
    assert payload["items"][0] == {"productId": "p_1", "quantity": 2.0, "unitPrice": 1000.0}
    assert "ord_1" in result


def test_create_order_includes_zone_when_provided():
    fake_client = AsyncMock()
    fake_client.post = AsyncMock(return_value={"id": "ord_2", "status": "recibido", "total": 2000})

    with patch("src.tools.orders.NestJSClient", return_value=fake_client):
        asyncio.run(
            create_order.ainvoke({
                "customer_id": "cus_1",
                "items": _order_items(),
                "company_id": "co_1",
                "customer_zone_id": "cz_1",
                "auth_token": "Bearer scoped",
            })
        )

    _, payload = fake_client.post.await_args.args
    assert payload["customerZoneId"] == "cz_1"


def test_create_order_requires_company_id():
    fake_client = AsyncMock()
    fake_client.post = AsyncMock()

    with patch("src.tools.orders.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            create_order.ainvoke({
                "customer_id": "cus_1",
                "items": _order_items(),
                "company_id": "",
                "auth_token": "Bearer scoped",
            })
        )

    assert result.startswith("Error")
    assert "empresa" in result.lower()
    fake_client.post.assert_not_awaited()
```

(Añadir `create_order` al import de `src.tools.orders` en el test.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents/nora && python -m pytest tests/test_orders_tool.py -k create_order -v`
Expected: FAIL — `create_order` aún no acepta `company_id` (TypeError o falta de aserciones).

- [ ] **Step 3: Write minimal implementation**

Reemplazar la firma y el cuerpo de `create_order` en `agents/nora/src/tools/orders.py`. La firma nueva (nota: `company_id` va antes de `auth_token` porque `auth_token` se inyecta; los args sin default deben ir antes que los que tienen default):

```python
@tool
async def create_order(
    customer_id: str,
    items: list[dict],
    company_id: str,
    auth_token: Annotated[str, InjectedState("auth_token")],
    customer_zone_id: Optional[str] = None,
    opportunity_id: Optional[str] = None,
    source_quote_id: Optional[str] = None,
    notes: Optional[str] = None,
) -> str:
    """
    Crea un nuevo pedido en el CRM. El pedido queda en revisión (en_revision) para
    que lo valide la persona encargada antes de facturación.

    IMPORTANTE: Antes de llamar esta herramienta DEBES:
    1. Identificar el cliente con search_customers
    2. Identificar los productos con search_products
    3. Determinar la empresa con get_companies (companyId es obligatorio)
    4. Determinar la zona de despacho con get_customer_zones (si el cliente tiene zonas)

    Args:
        customer_id: ID del cliente (obligatorio)
        items: Lista de items, cada uno con product_id, quantity, unit_price, notes (opc)
        company_id: ID de la empresa que factura (obligatorio; usa get_companies)
        customer_zone_id: ID de la zona de despacho del cliente (opcional; usa get_customer_zones)
        opportunity_id: ID de oportunidad relacionada (opcional)
        source_quote_id: ID de cotización origen (opcional)
        notes: Notas generales del pedido (opcional)

    Returns:
        Datos del pedido creado con su ID, estado y total. El total final lo calcula
        el servidor según el precio base y el descuento del segmento del cliente.
    """
    if not company_id:
        return "Error: Debes indicar la empresa que factura el pedido. Usa get_companies y elige una."
    if not items or len(items) == 0:
        return "Error: Un pedido debe tener al menos un item."

    normalized_items = []
    for idx, item in enumerate(items):
        product_id = item.get("product_id") or item.get("productId")
        quantity = item.get("quantity")
        unit_price = item.get("unit_price") or item.get("unitPrice")
        item_notes = item.get("notes")

        if not product_id:
            return f"Error: El item #{idx + 1} no tiene product_id."
        if quantity is None or quantity == "":
            return f"Error: El item #{idx + 1} no tiene cantidad."
        if unit_price is None or unit_price == "":
            return f"Error: El item #{idx + 1} no tiene precio unitario."

        normalized_item = {
            "productId": product_id,
            "quantity": float(quantity),
            "unitPrice": float(unit_price),
        }
        if item_notes:
            normalized_item["notes"] = str(item_notes)
        normalized_items.append(normalized_item)

    payload = {
        "customerId": customer_id,
        "companyId": company_id,
        "items": normalized_items,
        "approvalStatus": "en_revision",
    }
    if customer_zone_id:
        payload["customerZoneId"] = customer_zone_id
    if opportunity_id:
        payload["opportunityId"] = opportunity_id
    if source_quote_id:
        payload["sourceQuoteId"] = source_quote_id
    if notes:
        payload["notes"] = notes

    try:
        nestjs_client = NestJSClient(auth_token)
        result = await nestjs_client.post("/orders", payload)
        order_id = result.get("id", "desconocido")
        total = result.get("total", "desconocido")
        status = result.get("status", "recibido")
        return (
            f"Pedido creado exitosamente y enviado a revisión. "
            f"ID: {order_id}, Estado: {status}, Total: ${total}. "
            f"Detalle completo: {json.dumps(result, ensure_ascii=False, indent=2)}"
        )
    except NestJSAPIError as e:
        return f"Error al crear pedido: {e.detail}"
    except Exception as e:
        return f"Error inesperado al crear pedido: {str(e)}"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agents/nora && python -m pytest tests/test_orders_tool.py -k create_order -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add agents/nora/src/tools/orders.py agents/nora/tests/test_orders_tool.py
git commit -m "feat(nora): create_order sends companyId, zone, en_revision"
```

---

### Task 4: Registrar tools y actualizar el prompt de pedidos

**Files:**
- Modify: `agents/nora/src/agent.py:17` (import de orders) y `ALL_TOOLS`
- Modify: `agents/nora/src/prompts/system.py` (sección Capacidades + sección Pedidos)
- Test: `agents/nora/tests/test_orders_tool.py`

**Interfaces:**
- Consumes: `get_companies`, `get_customer_zones` de `tools/orders.py`.
- Produces: ambas quedan en `agent.ALL_TOOLS`.

- [ ] **Step 1: Write the failing test**

```python
def test_order_tools_registered_in_web_agent():
    from src.agent import ALL_TOOLS

    names = {t.name for t in ALL_TOOLS}
    assert {"get_companies", "get_customer_zones"} <= names
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents/nora && python -m pytest tests/test_orders_tool.py -k registered -v`
Expected: FAIL (faltan los nombres en `ALL_TOOLS`).

- [ ] **Step 3: Registrar en `agent.py`**

Cambiar la línea de import de orders (actualmente línea 17):

```python
from .tools.orders import search_products, get_customer_quotes, create_order, get_companies, get_customer_zones
```

Y añadir ambas a la lista `ALL_TOOLS` (después de `create_order,`):

```python
    search_products,
    get_customer_quotes,
    create_order,
    get_companies,
    get_customer_zones,
```

(Mantener las tools de analytics que ya están registradas; no quitar nada.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agents/nora && python -m pytest tests/test_orders_tool.py -k registered -v`
Expected: PASS.

- [ ] **Step 5: Actualizar el system prompt**

En `agents/nora/src/prompts/system.py`, en la lista "## Capacidades (tools disponibles)" añadir:

```
- **get_companies**: Obtener las empresas que facturan (Nortech, Nanonutrición) — necesario para crear pedidos
- **get_customer_zones**: Obtener las zonas de despacho de un cliente
```

Y REEMPLAZAR el bloque del flujo de pedidos (actualmente "Flujo obligatorio para crear un pedido" y sus reglas) por:

```
Flujo obligatorio para crear un pedido:
1. Identificar el cliente con `search_customers`.
2. Identificar los productos con `search_products`. Si el usuario no especifica IDs, busca por nombre o descripción.
3. Determinar la EMPRESA que factura con `get_companies`. Si el usuario la nombró (ej: "para Nanonutrición"), usa la que coincida; si solo hay una activa, úsala; si hay varias y no la mencionó, pregúntale a cuál empresa va el pedido.
4. Determinar la ZONA de despacho con `get_customer_zones`. Si el cliente tiene más de una zona, pregunta a cuál se despacha; si tiene una sola, úsala; si no tiene, omite la zona.
5. Si el usuario menciona una cotización previa, obtén las cotizaciones del cliente con `get_customer_quotes` y usa `source_quote_id`.
6. Crear el pedido con `create_order` (company_id obligatorio; customer_zone_id si aplica).

Reglas de pedidos:
- Un pedido SIEMPRE debe tener al menos 1 item con product_id, quantity y unit_price.
- companyId es OBLIGATORIO; nunca crees el pedido sin empresa.
- Si el usuario no menciona precio unitario, usa el precio base del producto (basePrice).
- El TOTAL final lo calcula el servidor (precio base × descuento del segmento del cliente); informa el resumen pero aclara que el total puede ajustarse.
- Si un producto no existe en el catálogo, informa al usuario y NO crees el pedido.
- El pedido queda EN REVISIÓN para que lo valide la persona encargada antes de facturación; menciónalo al confirmar.
- Después de crear el pedido, resume al usuario: empresa, cliente, zona (si aplica), productos, cantidades y total.
- Si el usuario menciona una oportunidad relacionada, incluye opportunity_id.
```

- [ ] **Step 6: Full test run + commit**

Run: `cd agents/nora && python -m pytest -q`
Expected: toda la suite pasa.

```bash
git add agents/nora/src/agent.py agents/nora/src/prompts/system.py agents/nora/tests/test_orders_tool.py
git commit -m "feat(nora): register order tools + update pedidos prompt"
```

---

### Task 5: Reflejar empresa/zona en la propuesta de display

**Files:**
- Modify: `agents/nora/src/models/api_models.py:53-62` (`NoraOrderBlock`)
- Modify: `agents/nora/src/main.py` (`_extract_order_data_from_messages` y `build_proposal_from_tool_outputs`)
- Test: `agents/nora/tests/test_order_proposal.py` (crear)

**Interfaces:**
- Consumes: el JSON del output de `create_order` (tras "Detalle completo:"), que ahora incluye `companyId` y `customerZoneId` en el objeto del pedido devuelto por la API.
- Produces: `NoraOrderBlock` con `companyId` y `customerZoneId`; `_extract_order_data_from_messages` devuelve esas claves.

- [ ] **Step 1: Write the failing test**

```python
from langchain_core.messages import ToolMessage

from src.main import _extract_order_data_from_messages


def test_extract_order_data_includes_company_and_zone():
    detail = {
        "id": "ord_1",
        "customerId": "cus_1",
        "companyId": "co_1",
        "customerZoneId": "cz_1",
        "items": [{"productId": "p_1", "quantity": 2, "unitPrice": 1000, "notes": None}],
    }
    msg = ToolMessage(
        content="Pedido creado. Detalle completo: " + __import__("json").dumps(detail),
        name="create_order",
        tool_call_id="tc_1",
    )

    data = _extract_order_data_from_messages([msg])

    assert data["companyId"] == "co_1"
    assert data["customerZoneId"] == "cz_1"
    assert data["id"] == "ord_1"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents/nora && python -m pytest tests/test_order_proposal.py -v`
Expected: FAIL — `_extract_order_data_from_messages` no devuelve `companyId`/`customerZoneId` (KeyError en la aserción).

- [ ] **Step 3: Implement**

En `agents/nora/src/models/api_models.py`, añadir dos campos a `NoraOrderBlock` (tras `customerId`):

```python
class NoraOrderBlock(BaseModel):
    enabled: bool
    action: Literal["create", "update", "delete"] = "create"
    customerId: Optional[str] = None
    companyId: Optional[str] = None
    customerZoneId: Optional[str] = None
    opportunityId: Optional[str] = None
    sourceQuoteId: Optional[str] = None
    notes: Optional[str] = None
    items: Optional[list[dict]] = None
    id: Optional[str] = None
    relatedTo: Optional[str] = None
```

En `agents/nora/src/main.py`, dentro de `_extract_order_data_from_messages`, en el `return` que arma el dict, añadir las dos claves (junto a `customerId`):

```python
                    return {
                        "id": data.get("id"),
                        "customerId": data.get("customerId"),
                        "companyId": data.get("companyId"),
                        "customerZoneId": data.get("customerZoneId"),
                        "opportunityId": data.get("opportunityId"),
                        "sourceQuoteId": data.get("sourceQuoteId"),
                        "notes": data.get("notes"),
                        "items": [
                            {
                                "productId": i.get("productId"),
                                "quantity": i.get("quantity"),
                                "unitPrice": i.get("unitPrice"),
                                "notes": i.get("notes"),
                            }
                            for i in data.get("items", [])
                        ] if data.get("items") else None,
                    }
```

Y en `build_proposal_from_tool_outputs`, donde se construye `NoraOrderBlock(...)` para `create_order`, añadir los dos campos:

```python
        blocks.order = NoraOrderBlock(
            enabled=True,
            action="create",
            customerId=order_data.get("customerId"),
            companyId=order_data.get("companyId"),
            customerZoneId=order_data.get("customerZoneId"),
            opportunityId=order_data.get("opportunityId"),
            sourceQuoteId=order_data.get("sourceQuoteId"),
            notes=order_data.get("notes"),
            items=order_data.get("items"),
            id=order_data.get("id"),
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agents/nora && python -m pytest tests/test_order_proposal.py -v`
Expected: PASS.

- [ ] **Step 5: Full suite + commit**

Run: `cd agents/nora && python -m pytest -q`
Expected: toda la suite pasa.

```bash
git add agents/nora/src/models/api_models.py agents/nora/src/main.py agents/nora/tests/test_order_proposal.py
git commit -m "feat(nora): surface company/zone in order proposal display"
```

---

## Self-Review

**Spec coverage:**
- `get_companies` (GET /companies) → Task 1 ✓
- `get_customer_zones` (GET /customers/:id/zones) → Task 2 ✓
- `create_order` con companyId requerido + customerZoneId + approvalStatus en_revision → Task 3 ✓
- Registro en ALL_TOOLS + prompt de pedidos (flujo empresa/zona, total server-side, en revisión) → Task 4 ✓
- Display: NoraOrderBlock companyId/customerZoneId + extracción → Task 5 ✓
- Fuera de alcance (migración empresa-por-cliente, order-draft-panel web, totales server) → no incluido ✓.

**Placeholder scan:** sin TBD/TODO; todo el código de cada step está completo.

**Type consistency:** nombres y firmas consistentes — `get_companies`, `get_customer_zones`, `create_order(customer_id, items, company_id, auth_token, customer_zone_id=None, ...)`; payload keys `companyId`/`customerZoneId`/`approvalStatus` coinciden entre Task 3, tests y Task 5; `NestJSClient.get/post` usados como existen. El test de Task 2 requiere añadir `get_customer_zones` al import; el de Task 3 añadir `create_order` — notado en cada task.

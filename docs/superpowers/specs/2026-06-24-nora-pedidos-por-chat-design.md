# Nora — Pedidos por chat (arreglo + empresa + zona)

**Fecha:** 2026-06-24
**Estado:** Aprobado, pendiente de plan de implementación

## Contexto

En la reunión del 2026-05-22 el cliente reportó que crear pedidos por el asistente
(Nora) **no funcionaba**. Causa raíz confirmada en el código:

- `agents/nora/src/tools/orders.py` → `create_order` arma el payload solo con
  `customerId`, `items` (+ opcionales `opportunityId`, `sourceQuoteId`, `notes`).
- La API `POST /orders` (`CreateOrderDto`) exige `companyId` (`@IsString @IsNotEmpty`,
  no opcional). El servicio además valida que la empresa exista y esté activa.
- Resultado: el POST falla con 400 y el pedido nunca se crea.

Además la reunión pidió dos cosas para el pedido:
1. Elegir **empresa** que factura: Nortech (Tecnología de Nutrición Orgánica) vs
   Nanonutrición. Las ventas suman igual para el comercial sin importar la empresa.
2. Elegir **zona de despacho** del cliente (un cliente puede tener varias zonas).
3. Que el pedido pase por un **filtro de revisión** en oficina antes de facturación.

## Decisión de diseño

Arreglar y completar el flujo **solo en el agente web de Nora**, reutilizando
endpoints que ya existen. **Sin cambios de esquema ni de la API.** Se sigue el
patrón actual del agente (p.ej. `get_customer_segments` → `create_customer`).

Decisiones tomadas (ver brainstorming):
- **Empresa:** Nora la pregunta/infiere por pedido (no se añade empresa por defecto
  al cliente; eso sería una migración, queda para después).
- **Zona:** se incluye en esta iteración (Nora consulta las zonas del cliente).
- **Revisión:** los pedidos creados por Nora entran como `approvalStatus = "en_revision"`
  para que caigan en la cola de revisión, igual que ya hace el front web.

## Endpoints reutilizados (sin prefijo global; JWT forwardeado por `NestJSClient`)

| Endpoint | Uso | Respuesta (campos usados) |
|---|---|---|
| `GET /companies` | `get_companies` | lista de `{id, name, prefix, isActive, legalName, nit}` (solo activas) |
| `GET /customers/:id/zones` | `get_customer_zones` | lista de `CustomerZone`: `{id, address, zone: {id, name, department}}` — el `id` es el `customerZoneId` |
| `POST /orders` | `create_order` | requiere `customerId`, `items[]`, `companyId`; opcionales `customerZoneId`, `opportunityId`, `sourceQuoteId`, `notes`, `approvalStatus` |

`CreateOrderItemDto`: `quantity` (>0, req), `unitPrice` (>=0, req), `productId` (opc),
`notes` (opc), `taxPercent` (opc, default 19 en servicio). **El servidor recalcula
precio/total**: si el item trae `productId`, usa `basePrice × (1 - descuento del
segmento)` y aplica impuesto; el `unitPrice` enviado puede ser sobrescrito.

## Cambios

### 1. `agents/nora/src/tools/orders.py`

**Nueva tool `get_companies`** (mismo patrón que `get_customer_segments`):
- `GET /companies`; normaliza la respuesta (lista o `{data:[]}`); devuelve
  `json.dumps` de `[{id, nombre, prefix}]` de las activas.

**Nueva tool `get_customer_zones(customer_id)`**:
- `GET /customers/{customer_id}/zones`; devuelve `json.dumps` de
  `[{customerZoneId: cz.id, zona: cz.zone.name, departamento: cz.zone.department, direccion: cz.address}]`.
- Si el cliente no tiene zonas, mensaje claro ("este cliente no tiene zonas
  registradas").

**`create_order` modificada:**
- Firma: agrega `company_id: str` (obligatorio) y `customer_zone_id: Optional[str] = None`.
- Validación: si falta `company_id`, devuelve error pidiendo elegir empresa
  (no llama a la API).
- Payload: agrega `"companyId": company_id`, `"customerZoneId": customer_zone_id`
  (solo si viene), y `"approvalStatus": "en_revision"`.
- Resto igual (normalización de items, manejo de errores `NestJSAPIError`).

### 2. `agents/nora/src/agent.py`
- Registrar `get_companies` y `get_customer_zones` en `ALL_TOOLS`.

### 3. `agents/nora/src/prompts/system.py`
- Reescribir la sección "### Pedidos". Nuevo flujo obligatorio:
  1. Identificar el cliente (`search_customers`).
  2. Identificar los productos (`search_products`).
  3. Determinar la **empresa**: `get_companies`. Si el usuario la nombró, úsala;
     si solo hay una activa, úsala; si hay varias y no la dijo, pregunta cuál.
  4. Determinar la **zona** de despacho: `get_customer_zones`. Si hay >1, pregunta
     a cuál despachar; si hay 0 o 1, úsala u omítela.
  5. `create_order` con `company_id` y (si aplica) `customer_zone_id`.
- Aclarar: el **total final lo calcula el servidor** (precio base × descuento del
  segmento); Nora informa el resumen pero no promete el total exacto.
- Aclarar: el pedido queda **en revisión** para que lo valide la persona encargada
  antes de facturación.

### 4. Propuesta de display (`main.py` + `models/api_models.py`)
- `NoraOrderBlock`: agregar `companyId: Optional[str]` y `customerZoneId: Optional[str]`.
- `_extract_order_data_from_messages`: extraer también `companyId`/`customerZoneId`
  del output de `create_order`. (Display-only; `confirm` sigue siendo no-op.)

## Manejo de errores

Igual que las tools existentes: `try/except NestJSAPIError` → `f"Error ...: {e.detail}"`;
`except Exception` → mensaje genérico. Sin stack traces. Si la API rechaza por
empresa/zona inválida, el `e.detail` de NestJS llega al usuario.

## Tests (patrón `tests/test_expenses_tool.py`, mock de `NestJSClient`)

- `get_companies`: normaliza y devuelve solo activas con id/nombre/prefix.
- `get_customer_zones`: mapea `cz.id` → `customerZoneId` y aplana `zone.name`/`department`;
  rama "sin zonas".
- `create_order`:
  - happy path: el payload incluye `companyId`, `approvalStatus="en_revision"`, y
    `customerZoneId` cuando se pasa.
  - sin `company_id` → error sin llamar a la API.
  - `customerZoneId` ausente del payload cuando no se pasa.
- registro: `get_companies` y `get_customer_zones` están en `agent.ALL_TOOLS`.

## Fuera de alcance (pulir después)

- Empresa por defecto por cliente (migración en `Customer` + API).
- Arreglar `apps/web/.../order-draft-panel.tsx` (ruta de WhatsApp, no del agente web).
- Cambiar la lógica de cálculo de totales del servidor.

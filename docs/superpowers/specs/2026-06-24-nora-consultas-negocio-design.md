# Nora — Consultas de negocio (tools de lectura)

**Fecha:** 2026-06-24
**Estado:** Aprobado, pendiente de plan de implementación

## Contexto

En la reunión del 2026-05-22 se pidió que Nora (el asistente comercial) responda
consultas de negocio en lenguaje natural, sin entrar a la plataforma:

- "¿Cuánto llevo en ventas hoy / este mes?" y "¿cuánto me falta para la meta?"
- "¿Cómo está la cartera?" (saldos, vencidos)
- Indicadores: top clientes, top productos, recompra, devoluciones, clientes dormidos.

Hoy el agente web de Nora (`agents/nora/src/agent.py` + `prompts/system.py`,
endpoint `/messages`) solo tiene tools de escritura/registro (clientes, visitas,
oportunidades, seguimientos, pedidos) y lectura puntual (agenda, cotizaciones).
No puede responder consultas de negocio agregadas.

## Decisión de diseño

Agregar **tools de lectura** al agente web existente que envuelven endpoints que
**ya existen** en la API NestJS y están **auto-filtrados por el JWT** del comercial
(el servicio filtra por `assignedToUserId` cuando el rol es `comercial`).

- **Sin endpoints nuevos** en NestJS.
- **Sin cambios en `main.py`**: estas tools devuelven texto; el agente lo resume y
  cae en la respuesta conversacional normal (`GreetingResponse`). No están en la
  lista `crm_tools` de `detect_response_mode`, así que no disparan modo propuesta.
- Reutilizan el patrón existente de tools (`@tool` async, `InjectedState("auth_token")`,
  `NestJSClient`, manejo de `NestJSAPIError`) — ver `tools/orders.py` como referencia.

Alternativas descartadas:
- Sub-agente/grafo de analítica aparte: sobra para 3 lecturas.
- Endpoints nuevos en la API: innecesario, ya existen.

## Endpoints reutilizados

Sin prefijo global de rutas (se llaman directo, p.ej. `/dashboard/commercial-advanced`).
Todos con `JwtAuthGuard` + `RolesGuard`; Nora ya forwardea el `Bearer <jwt>`.

| Endpoint | Scoping | Usa |
|---|---|---|
| `GET /dashboard/commercial-advanced?days=N` | auto por JWT (rol comercial → solo sus clientes) | `get_sales_summary` |
| `GET /invoices/summary` | auto por JWT | `get_cartera` |
| `GET /invoices/overdue` | auto por JWT | `get_cartera` (vencidas) |
| `GET /auth/me` | usuario actual | `get_goal_progress` |
| `GET /users/:userId/seller-goals/progress?periodType&periodValue` | comercial ve lo propio | `get_goal_progress` |

## Tools nuevas (archivo: `agents/nora/src/tools/analytics.py`)

Las tres se registran en `ALL_TOOLS` (`agent.py`) y solo en ese agente (no WhatsApp).

### 1. `get_sales_summary(days: int = 90)`
Llama `GET /dashboard/commercial-advanced?days={days}`.
Compacta la respuesta a un resumen legible (no JSON crudo):
- `totals`: pedidos, ventas (revenue), devoluciones (returns), neto (netRevenue),
  unidades, clientes, productos.
- top 5 clientes (`byCustomer`/`customerRanking`): nombre, neto, # pedidos.
- top 5 productos (`byProduct`): nombre/sku, cantidad, revenue.
- recompra (`repurchase`): tasa, # que recompró, # que no.
- hasta 5 clientes dormidos (`dormantCustomers`) y 5 de baja rotación
  (`lowRotationProducts`) — útiles para "¿a quién no he llamado?".

Responde la mayoría de las preguntas de la reunión (secciones 9 y 24).

### 2. `get_cartera(customer_id: str | None = None)`
Llama `GET /invoices/summary`. Devuelve aging
(`current`, `days1to30`, `days31to60`, `days61to90`, `over90`), saldo total
(`totalBalance`), pagado vs facturado, y top deudores (`byCustomer`).
Si `customer_id` viene, filtra el resumen a ese cliente y además consulta
`GET /invoices/overdue` para listar facturas vencidas de ese cliente.

### 3. `get_goal_progress()`
1. `GET /auth/me` → obtiene `id` del usuario actual.
2. `GET /users/{id}/seller-goals/progress` con `periodType=mensual` y
   `periodValue` = mes actual (formato según lo que espere la API; el plan
   confirmará el formato exacto leyendo el controller/service).
Devuelve: meta (targetAmount), vendido (soldAmount), porcentaje, y cuánto falta.
Si el usuario no tiene meta configurada, lo dice claramente en vez de fallar.

## Prompt

Agregar a `NORA_SYSTEM_PROMPT` (`prompts/system.py`) una sección
"Consultas de negocio":
- Listar las 3 tools y cuándo usar cada una.
- "¿cuánto llevo / vs meta?" → `get_goal_progress` (+ `get_sales_summary` para detalle).
- "¿cómo está la cartera / quién me debe / vencidas?" → `get_cartera`.
- "top clientes/productos, recompra, devoluciones, a quién no he visitado" → `get_sales_summary`.
- Formatear montos en pesos colombianos (p.ej. `$12.000.000`), responder conciso,
  no volcar JSON.

## Manejo de errores

Igual que las tools existentes: `try/except NestJSAPIError` → devuelve mensaje
con `e.detail`; `except Exception` → mensaje genérico. Nunca exponer stack traces.
Caso meta inexistente: mensaje claro ("aún no tienes una meta asignada para este periodo").

## Tests

Patrón de `tests/test_expenses_tool.py` (mock del `NestJSClient`/httpx). Un test
por tool no-trivial, enfocados en la **compactación**:
- `get_sales_summary`: dado un payload de `commercial-advanced`, el texto incluye
  totales y top N correctos y recorta a 5.
- `get_cartera`: aging y saldo correctos; rama con `customer_id`.
- `get_goal_progress`: calcula porcentaje y faltante; rama "sin meta".

## Fuera de alcance (a propósito)

- Exponer estas consultas por WhatsApp (otro flujo).
- Gráficas / visualizaciones.
- Filtros avanzados por empresa/zona (se suman luego vía params).

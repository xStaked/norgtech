# Módulo de Analítica — contrato

Estado: **implementado** (back y front). Este documento sigue siendo el contrato:
`apps/api/src/modules/analytics/` y `apps/web/src/app/(app)/analytics/` deben
seguir cumpliéndolo, y cualquier métrica nueva se agrega aquí primero.

Este archivo es un **contrato cerrado**: si una métrica, un campo o una pantalla
no está aquí, no existe y no se diseña. La razón está en §8 (lo que la base de
datos NO puede responder).

---

## 0. Reglas para quien diseña

1. **La lista de campos de cada respuesta es cerrada.** Cada pantalla trae el
   JSON exacto que devuelve el endpoint. No agregar KPIs, columnas ni gráficas
   que usen datos fuera de ese JSON.
2. **No inventar comparativos.** Solo existe el comparativo que está
   explícitamente en la respuesta (`previous`).
3. **Todo número de dinero viene en UNA moneda** (§2.1). No hay totales
   consolidados multimoneda.
4. **Ningún porcentaje viene calculado en el front.** Si un porcentaje no está
   en el JSON, no se muestra.
5. Alcance v1 = 4 pantallas (§3–§6). El resto está en §7 y **no se diseña
   ahora**.

---

## 1. Estructura del módulo

Ruta web: `/analytics`, con 4 sub-pantallas. Un solo módulo en el back:
`apps/api/src/modules/analytics/`.

| Pantalla | Ruta web | Endpoint |
|---|---|---|
| Ventas | `/analytics/ventas` | `GET /analytics/sales` |
| Cartera | `/analytics/cartera` | `GET /analytics/receivables` |
| Embudo | `/analytics/embudo` | `GET /analytics/funnel` |
| Desempeño comercial | `/analytics/comercial` | `GET /analytics/seller-performance` |

Las cuatro comparten la misma barra de filtros (§2) y la misma envoltura de
respuesta. **Se diseña la barra de filtros una vez.**

---

## 2. Contrato compartido

### 2.1 Query params (idénticos en los 4 endpoints)

| Param | Tipo | Default | Notas |
|---|---|---|---|
| `from` | `YYYY-MM-DD` | hoy − 90 días | Inclusive, hora de pared Bogotá |
| `to` | `YYYY-MM-DD` | hoy | Inclusive |
| `currency` | `COP` \| `USD` | `COP` | **Siempre aplica.** Ver abajo |
| `companyId` | cuid | — | Norgtech (NT) / Nanonutricion (NN) |
| `sellerUserId` | cuid | — | Ignorado y forzado para rol `comercial` (§2.4) |
| `zoneId` | cuid | — | |
| `segmentId` | cuid | — | |
| `granularity` | `day` \| `week` \| `month` | `month` | **Solo `/sales`** |
| `format` | `json` \| `csv` | `json` | Ver §2.5 |

`receivables` reemplaza `from`/`to` por **`asOf`** (`YYYY-MM-DD`, default hoy):
una cartera es una foto a una fecha, no un rango. Los sub-bloques que sí
necesitan rango (comportamiento de pago) usan los 90 días anteriores a `asOf`,
y el JSON lo dice en `paymentBehaviorWindowDays`.

**Sobre la moneda:** ni `Order` ni `Invoice` tienen columna de moneda. La moneda
la define `Customer.currency` (COP por defecto; hay clientes en USD —
Guatemala, Ecuador). Por eso `currency` filtra por la moneda del cliente y
**nunca se suman monedas distintas**. El front muestra el selector de moneda
como parte de la barra de filtros, al mismo nivel que los demás, no escondido.

### 2.2 Envoltura de respuesta

Las cuatro pantallas responden con esta forma:

```json
{
  "range":    { "from": "2026-04-26", "to": "2026-07-25", "granularity": "month" },
  "currency": "COP",
  "filters":  { "companyId": null, "sellerUserId": null, "zoneId": null, "segmentId": null },
  "totals":   { },
  "series":   [ ],
  "breakdowns": { }
}
```

`filters` devuelve lo que el back **realmente aplicó** (no lo que se pidió): para
un `comercial`, `sellerUserId` vuelve con su propio id aunque no lo haya mandado.
El front debe reflejar esos valores en la barra de filtros.

### 2.3 Reglas transversales de cálculo

Estas reglas ya rigen en el dashboard actual y los reportes deben respetarlas o
los números no van a cuadrar entre pantallas:

- **Fechas** en hora de pared de Colombia (`-05:00`), no en la zona del proceso.
- **Empresa de un pedido/factura**: columna `companyId` directa.
- **Empresa de una devolución**: se deriva de su pedido o su factura. Una
  devolución sin ninguno de los dos **no se cuenta** cuando hay empresa
  seleccionada, y sí se cuenta en la vista global.
- **Empresa de una oportunidad, cotización, visita o gasto**: se deriva de
  `customer.companyId`. Un gasto sin cliente no se cuenta con empresa
  seleccionada.
- **Vendedor de un pedido**: `Order.sellerUserId` (quien vendió), **no** el
  vendedor asignado al cliente.
- **Vendedor de una factura**: `invoice.order.sellerUserId`, y si la factura no
  tiene pedido, `customer.assignedToUserId`.
- **Vendedor de un gasto**: `CommercialExpense.submittedByUserId`.
- **"Vencido" se deriva en lectura**, nunca se lee de la columna `status`: no hay
  proceso que la actualice con el paso del tiempo.

### 2.4 Permisos por rol

**`administrador` y `director_comercial` ven la operación completa. Un
`comercial` entra a las mismas 4 pantallas, pero acotadas a su propia gestión**
(pidió el cliente poder armar su informe semanal). Ningún otro rol entra.

| Rol | Ventas | Cartera | Embudo | Desempeño |
|---|---|---|---|---|
| `administrador` | sí | sí | sí | sí |
| `director_comercial` | sí | sí | sí | sí |
| `comercial` | solo lo suyo | solo lo suyo | solo lo suyo | solo su fila |
| `facturacion`, `logistica`, `tecnico` | no | no | no | no |

Se aplica en tres sitios y los tres tienen que coincidir: el `@Roles` de
`AnalyticsController`, el `moduleAccess["/analytics"]` de `src/lib/auth.ts` y el
guard de ruta (`roleRestrictedRoutes`). En el menú lateral, `/analytics` aparece
para esos tres roles.

El acotado del comercial es **una sola regla**: `resolveFilters` le fuerza
`sellerUserId` a su propio id, ignorando lo que mande el query. De ahí sale el
`orderWhere` / `returnWhere` de ventas y desempeño, el `where` de facturas de
cartera (`invoice.order.sellerUserId`, o `customer.assignedToUserId` si la
factura no tiene pedido) y el `assignedToUserId` de oportunidades y
cotizaciones del embudo. En Desempeño eso deja **una sola fila** — la suya —, no
el ranking del equipo. En la barra de filtros el selector de "Vendedor" se
muestra deshabilitado: el back lo ignora de todos modos y ofrecerlo editable
sería engañoso.

### 2.5 Exportar a CSV

Mismo endpoint, `?format=csv`. Devuelve **un** breakdown por pantalla (el
principal), no el JSON entero:

| Endpoint | CSV exporta |
|---|---|
| `/analytics/sales` | `breakdowns.byCustomer` |
| `/analytics/receivables` | `breakdowns.byCustomer` |
| `/analytics/funnel` | `breakdowns.bySeller` |
| `/analytics/seller-performance` | `breakdowns.bySeller` |

En el diseño, un solo botón "Exportar CSV" en el encabezado de cada pantalla.

---

## 3. Pantalla 1 — Ventas

**Pregunta que responde:** cuánto vendimos, a quién, de qué, y cuánto se está
regalando en descuentos.

`GET /analytics/sales`

```json
{
  "range": { "from": "2026-01-01", "to": "2026-07-25", "granularity": "month" },
  "currency": "COP",
  "filters": { "companyId": null, "sellerUserId": null, "zoneId": null, "segmentId": null },
  "totals": {
    "grossRevenue": 1284500000,
    "returnsTotal": 32400000,
    "netRevenue": 1252100000,
    "orderCount": 412,
    "customerCount": 118,
    "unitCount": 8940.5,
    "avgTicket": 3117718.45,
    "avgDiscountPercent": 6.4,
    "discountAmount": 84200000
  },
  "previous": {
    "label": "mismo periodo del año anterior",
    "from": "2025-01-01",
    "to": "2025-07-25",
    "netRevenue": 981300000,
    "orderCount": 355,
    "changePercent": 27.6
  },
  "series": [
    { "bucket": "2026-01", "grossRevenue": 180200000, "netRevenue": 176100000,
      "orderCount": 58, "avgTicket": 3106896.55, "previousNetRevenue": 142000000 }
  ],
  "breakdowns": {
    "bySeller":   [{ "sellerId": "c...", "sellerName": "William Ríos", "netRevenue": 412000000, "orderCount": 130, "customerCount": 38, "sharePercent": 32.9 }],
    "byCustomer": [{ "customerId": "c...", "customerName": "AVSA", "netRevenue": 210000000, "orderCount": 22, "lastOrderDate": "2026-07-18", "sharePercent": 16.8 }],
    "byProduct":  [{ "productId": "c...", "sku": "CAT-ACETECH", "name": "ACE TECH", "presentation": "Bolsa x 500 g", "quantity": 1240, "revenue": 104000000, "orderCount": 61, "sharePercent": 8.3 }],
    "byZone":     [{ "zoneId": "c...", "zoneName": "Antioquia", "netRevenue": 380000000, "orderCount": 96, "sharePercent": 30.3 }],
    "bySegment":  [{ "segmentId": "c...", "segmentName": "Distribuidor", "netRevenue": 520000000, "orderCount": 140, "sharePercent": 41.5 }],
    "byCompany":  [{ "companyId": "c...", "companyName": "Norgtech", "prefix": "NT", "netRevenue": 900000000, "orderCount": 300, "sharePercent": 71.9 }],
    "byCity":     [{ "city": "Medellín", "department": "Antioquia", "netRevenue": 300000000, "orderCount": 80, "sharePercent": 24.0 }],
    "discountLeaks": [{ "sellerId": "c...", "sellerName": "William Ríos", "avgDiscountPercent": 11.2, "discountAmount": 38000000, "orderCount": 130, "worstCustomerName": "GUAMITO" }]
  }
}
```

### Definiciones (fórmula exacta)

| Campo | Cálculo |
|---|---|
| `grossRevenue` | Σ `Order.total` de pedidos con `orderDate` en el rango |
| `returnsTotal` | Σ `Return.amount` con `returnDate` en el rango, acotado por empresa/vendedor según §2.3 |
| `netRevenue` | `grossRevenue − returnsTotal` |
| `unitCount` | Σ `OrderItem.quantity` |
| `avgTicket` | `grossRevenue / orderCount` |
| `discountAmount` | Σ `(originalUnitPrice − unitPrice) × quantity`, solo ítems con `originalUnitPrice` no nulo |
| `avgDiscountPercent` | `discountAmount / (grossRevenue + discountAmount) × 100` |
| `sharePercent` | participación de la fila sobre `netRevenue` total |
| `previousNetRevenue` | mismo bucket, un año antes; `null` si no hay dato |

### Límites de tamaño

`byCustomer`, `byProduct` y `discountLeaks` vienen con **top 20**; el resto
completo. El JSON incluye `breakdowns.byCustomerTruncated: true|false` (y su
equivalente para los otros dos) para que el front pueda decir "mostrando 20 de
118" y ofrecer el CSV completo.

### Qué necesita el diseño

- 5 tarjetas de KPI: venta neta (con variación vs período anterior), pedidos,
  ticket promedio, clientes que compraron, descuento promedio.
- Una serie temporal con la línea del período anterior superpuesta.
- Tabs o acordeón para los 7 breakdowns (no 7 tablas apiladas).
- `discountLeaks` merece tratamiento visual propio: es el hallazgo, no una tabla
  más.
- Estado vacío por breakdown ("sin ventas en este período con estos filtros").

---

## 4. Pantalla 2 — Cartera

**Pregunta que responde:** cuánta plata está en la calle, hace cuánto, de quién
es, y quién paga tarde.

`GET /analytics/receivables?asOf=2026-07-25`

```json
{
  "asOf": "2026-07-25",
  "currency": "COP",
  "filters": { "companyId": null, "sellerUserId": null, "zoneId": null, "segmentId": null },
  "paymentBehaviorWindowDays": 90,
  "totals": {
    "outstandingTotal": 480000000,
    "overdueTotal": 132000000,
    "overduePercent": 27.5,
    "dso": 46.2,
    "invoiceCount": 214,
    "customerCount": 73,
    "customersOverCreditLimit": 4
  },
  "aging": [
    { "bucket": "por_vencer", "label": "Por vencer", "amount": 348000000, "invoiceCount": 150, "customerCount": 61, "sharePercent": 72.5 },
    { "bucket": "1-30",  "label": "1 a 30 días",  "amount": 62000000, "invoiceCount": 34, "customerCount": 22, "sharePercent": 12.9 },
    { "bucket": "31-60", "label": "31 a 60 días", "amount": 41000000, "invoiceCount": 18, "customerCount": 12, "sharePercent": 8.5 },
    { "bucket": "61-90", "label": "61 a 90 días", "amount": 18000000, "invoiceCount": 8,  "customerCount": 6,  "sharePercent": 3.8 },
    { "bucket": "90+",   "label": "Más de 90 días","amount": 11000000, "invoiceCount": 4, "customerCount": 3,  "sharePercent": 2.3 }
  ],
  "breakdowns": {
    "byCustomer": [{
      "customerId": "c...", "customerName": "GUAMITO", "sellerName": "William Ríos",
      "outstanding": 48000000, "overdue": 31000000,
      "oldestDueDate": "2026-03-12", "maxDaysPastDue": 135,
      "creditLimit": 40000000, "creditUsagePercent": 120.0, "overLimit": true,
      "paymentCondition": "credito_60"
    }],
    "bySeller": [{ "sellerId": "c...", "sellerName": "William Ríos", "outstanding": 210000000, "overdue": 62000000, "overduePercent": 29.5, "customerCount": 31 }],
    "byCompany": [{ "companyId": "c...", "companyName": "Norgtech", "prefix": "NT", "outstanding": 380000000, "overdue": 98000000, "overduePercent": 25.8 }],
    "paymentBehavior": [{
      "customerId": "c...", "customerName": "AVSA",
      "agreedDays": 30, "avgActualDays": 47.5, "deviationDays": 17.5,
      "invoicesPaid": 12, "onTimePercent": 33.3
    }]
  }
}
```

### Definiciones

| Campo | Cálculo |
|---|---|
| saldo de una factura | `totalAmount − totalPaid − creditNoteTotal` |
| factura viva | `status` ∉ (`pagada`, `anulada`) **y** saldo > 0 |
| `outstandingTotal` | Σ saldo de facturas vivas |
| factura vencida | factura viva con `dueDate < asOf` — **derivado, no la columna `status`** |
| `daysPastDue` | `asOf − dueDate` en días |
| bucket de aging | por `daysPastDue`; ≤ 0 → `por_vencer` |
| `dso` | `outstandingTotal / (Σ totalAmount facturado en los 90 días previos a asOf) × 90` |
| `creditUsagePercent` | `outstanding / Customer.creditLimit × 100`; `null` si no hay cupo definido |
| `agreedDays` | `Customer.paymentDays` |
| `avgActualDays` | promedio de (`InvoicePayment.paymentDate` del último pago − `Invoice.issueDate`) sobre facturas pagadas en la ventana |
| `onTimePercent` | % de esas facturas donde días reales ≤ `agreedDays` |

`byCustomer` viene top 30 ordenado por `overdue` desc, luego `outstanding` desc.
`paymentBehavior` top 30 por `deviationDays` desc; solo clientes con ≥ 3 facturas
pagadas en la ventana (con menos, el promedio no dice nada) — el JSON trae
`paymentBehaviorMinInvoices: 3` para que el front lo pueda explicar.

### Qué necesita el diseño

- 4 KPIs: cartera total, vencido (monto y %), DSO, clientes sobre el cupo.
- El aging es lo central: barra apilada o embudo horizontal, con los 5 buckets
  en orden y color escalando con la gravedad.
- Tabla de deudores con `overLimit` marcado visualmente.
- `paymentBehavior` es una tabla comparativa (pactado vs real): el diseño debe
  hacer legible la desviación, no solo listar dos números.
- Esta pantalla la usa `facturacion`, que no ve ninguna otra: tiene que
  sostenerse sola.

---

## 5. Pantalla 3 — Embudo

**Pregunta que responde:** cuánto hay en juego, dónde se traba y por qué se
pierde.

`GET /analytics/funnel`

```json
{
  "range": { "from": "2026-01-01", "to": "2026-07-25" },
  "currency": "COP",
  "filters": { "companyId": null, "sellerUserId": null, "zoneId": null, "segmentId": null },
  "totals": {
    "openCount": 64, "openValue": 720000000,
    "wonCount": 38, "wonValue": 410000000,
    "lostCount": 21, "lostValue": 190000000,
    "winRate": 64.4,
    "avgCycleDays": 52.3
  },
  "stages": [
    { "stage": "prospecto",         "label": "Prospecto",          "count": 18, "value": 140000000 },
    { "stage": "contacto",          "label": "Contacto",           "count": 12, "value": 110000000 },
    { "stage": "visita",            "label": "Visita",             "count": 14, "value": 180000000 },
    { "stage": "cotizacion",        "label": "Cotización",         "count": 11, "value": 160000000 },
    { "stage": "negociacion",       "label": "Negociación",        "count": 6,  "value": 90000000 },
    { "stage": "orden_facturacion", "label": "Orden de facturación","count": 3, "value": 40000000 },
    { "stage": "venta_cerrada",     "label": "Venta cerrada",      "count": 38, "value": 410000000 },
    { "stage": "perdida",           "label": "Perdida",            "count": 21, "value": 190000000 }
  ],
  "quotes": {
    "total": 96, "totalValue": 640000000,
    "byStatus": [{ "status": "abierta", "label": "Abierta", "count": 41, "value": 280000000 }],
    "convertedCount": 44, "conversionRate": 45.8, "avgDaysToOrder": 11.4
  },
  "lostReasons": [{ "reason": "Precio", "count": 9, "value": 82000000, "sharePercent": 42.9 }],
  "breakdowns": {
    "bySeller": [{
      "sellerId": "c...", "sellerName": "William Ríos",
      "openCount": 22, "openValue": 260000000,
      "wonCount": 15, "wonValue": 180000000,
      "lostCount": 7, "winRate": 68.2, "avgCycleDays": 44.1
    }]
  }
}
```

### Definiciones

| Campo | Cálculo |
|---|---|
| oportunidad abierta | `stage` ∉ (`venta_cerrada`, `perdida`) |
| valor | `Opportunity.estimatedValue`; las nulas cuentan en `count` pero suman 0 en `value` |
| `winRate` | `wonCount / (wonCount + lostCount) × 100` |
| `avgCycleDays` | promedio de `closedAt − createdAt` sobre oportunidades cerradas (ganadas o perdidas) en el rango |
| `convertedCount` | cotizaciones con al menos un `Order.sourceQuoteId` apuntándolas |
| `conversionRate` | `convertedCount / total × 100` |
| `avgDaysToOrder` | promedio de `Order.orderDate − Quote.createdAt` en esas conversiones |
| `lostReasons` | agrupado por `Opportunity.lostReason` |

**Advertencias que el diseño tiene que absorber:**

- `lostReason` es **texto libre**, no un enum. Va a llegar sucio ("precio",
  "Precio", "muy caro"). El back agrupa por texto normalizado (trim + minúsculas)
  y devuelve el más frecuente como etiqueta, pero la lista puede tener colas
  largas y valores raros. Diseñar para top 8 + "Otros".
- Las oportunidades sin `estimatedValue` existen: toda tarjeta de valor necesita
  poder decir "de 64 oportunidades, 12 sin valor estimado". El JSON lo trae en
  `totals.openWithoutValueCount`.
- **No hay tiempo por etapa.** No existe histórico de cambios de etapa en la base
  (§8). No diseñar "días promedio en cada etapa".

### Qué necesita el diseño

- El embudo propiamente dicho: las 6 etapas abiertas en orden, más las 2 de
  cierre tratadas aparte (no son pasos del embudo, son desenlaces).
- Bloque de cotizaciones con la tasa de conversión a pedido — es el único número
  de conversión medido con un enlace real (`Order.sourceQuoteId`), vale
  destacarlo.
- Motivos de pérdida con la advertencia de texto libre resuelta visualmente.

---

## 6. Pantalla 4 — Desempeño comercial

**Pregunta que responde:** qué cuesta cada vendedor, qué trae, y si está
haciendo el trabajo de campo.

`GET /analytics/seller-performance`

```json
{
  "range": { "from": "2026-01-01", "to": "2026-07-25" },
  "currency": "COP",
  "filters": { "companyId": null, "sellerUserId": null, "zoneId": null, "segmentId": null },
  "totals": {
    "netRevenue": 1252100000,
    "expenseTotal": 48200000,
    "expenseRatio": 3.85,
    "pendingExpenseTotal": 6400000,
    "visitsScheduled": 310, "visitsCompleted": 248, "visitCompliance": 80.0,
    "tasksOverdue": 23
  },
  "expenseByCategory": [
    { "category": "transporte", "label": "Transporte", "amount": 18000000, "count": 210, "sharePercent": 37.3 }
  ],
  "breakdowns": {
    "bySeller": [{
      "sellerId": "c...", "sellerName": "William Ríos",
      "netRevenue": 412000000, "orderCount": 130, "customerCount": 38,
      "expenseTotal": 16800000, "expenseRatio": 4.08, "costPerOrder": 129230.77,
      "pendingExpenseTotal": 2100000,
      "visitsScheduled": 96, "visitsCompleted": 78, "visitCompliance": 81.3,
      "revenuePerVisit": 5282051.28,
      "tasksOverdue": 6,
      "dormantCustomers": 9
    }],
    "byCustomer": [{
      "customerId": "c...", "customerName": "AVSA",
      "netRevenue": 210000000, "expenseTotal": 3200000, "expenseRatio": 1.52,
      "visitsCompleted": 11
    }]
  }
}
```

### Definiciones

| Campo | Cálculo |
|---|---|
| gasto contabilizable | `CommercialExpense.status` ∈ (`aprobado`, `contabilizado`) |
| `pendingExpenseTotal` | los de status `pendiente` y `requiere_correccion`, **excluidos** de todo lo demás; se muestran aparte |
| `expenseRatio` | `expenseTotal / netRevenue × 100` — se lee "% de la venta que costó venderla" |
| `costPerOrder` | `expenseTotal / orderCount` |
| `visitCompliance` | `visitsCompleted / visitsScheduled × 100`, sobre visitas con `scheduledAt` en el rango |
| `revenuePerVisit` | `netRevenue / visitsCompleted` |
| `tasksOverdue` | tareas del vendedor no zanjadas por un humano y con `dueAt` ya pasado (regla derivada, §2.3) |
| `dormantCustomers` | clientes asignados al vendedor sin ningún pedido dentro del rango |

**No incluye metas.** El cumplimiento de metas ya vive en
`GET /dashboard/seller-goals` y en el dashboard actual. No se duplica aquí; si el
diseño quiere un enlace, que sea un enlace.

`expenseRatio` **no es margen** (§8). La etiqueta no puede decir "rentabilidad"
ni "utilidad": es costo comercial sobre venta.

### Qué necesita el diseño

- Una tabla-matriz por vendedor es la pieza central: muchas columnas, pocas
  filas. Priorizar legibilidad de comparación entre filas.
- `expenseRatio` y `visitCompliance` piden semáforo o barra, no número pelado.
- El gasto pendiente de aprobación es una alerta de acción, no un KPI de
  desempeño: separado visualmente.

---

## 7. Fuera del alcance v1 (no diseñar todavía)

Existen los datos, pero no los pido en esta ronda. Los listo para que el diseño
deje lugar en la navegación, no para que los dibuje:

- **Logística**: entregas a tiempo, lead time pedido→entrega, desempeño por
  transportadora. Datos en `Order` (`committedDeliveryDate`, `dispatchDate`,
  `deliveryDate`, `carrierName`).
- **Devoluciones**: tasa sobre venta, por producto, por cliente.
- **Canal WhatsApp / Nora**: conversaciones por estado, casos por tipo y riesgo,
  % resuelto por Nora vs derivado a humano, y pedidos originados en WhatsApp
  (`Order.sourceConversationId`).
- **Facturación**: tiempo de `BillingRequest` pendiente → procesada.

---

## 8. Lo que la base de datos NO puede responder

Si algo de esto aparece en un diseño, es alucinación:

| No existe | Por qué |
|---|---|
| **Margen, utilidad, rentabilidad real** | `Product` solo tiene `basePrice` (precio), no costo. No hay costo en ninguna tabla. Requiere migración. |
| **Totales consolidados multimoneda** | No hay tabla de tasas de cambio. COP y USD se reportan por separado, siempre. |
| **Días promedio en cada etapa del embudo** | No hay histórico de cambios de `Opportunity.stage`. |
| **Motivos de devolución tipificados** | `Return.reason` es texto libre. |
| **Motivos de pérdida tipificados** | `Opportunity.lostReason` es texto libre (§5). |
| **Forecast, proyección, predicción** | No hay modelo ni datos para eso. Solo hay comparativo contra el período anterior. |
| **Presupuesto de gasto por vendedor** | Existen metas de **venta** (`SellerGoal`), no de gasto. |
| **Rotación de inventario, stock** | No hay inventario en el sistema. |
| **NPS, satisfacción, encuestas** | No existen. |

---

## 9. Notas de implementación

Desviaciones conscientes respecto de la versión original de este contrato:

- **Desempeño comercial no trae `breakdowns.byCustomer`.** El diseño no lo usa y
  la matriz por vendedor ya responde la pregunta. Se agrega si aparece la pantalla
  que lo necesite.
- **El CSV pasa por un Route Handler de Next** (`/analytics/csv?screen=…`), no por
  un enlace directo al API: el Bearer token vive en la cookie de sesión y solo lo
  adjunta `apiFetch` server-side. Mismo patrón que el PDF de reportes.
- **Los `tab` de los breakdowns de Ventas son enlaces**, no estado de cliente: la
  pestaña activa vive en la URL y la pantalla sigue siendo un server component.


- Un `AnalyticsModule` con un service por pantalla y un `AnalyticsFiltersDto`
  compartido; las reglas de §2.3 en un helper único, no copiadas por service.
- Reusar `shared/overdue.ts` para todo lo vencido y `shared/instant.ts` para los
  límites de día en Bogotá.
- Índices existentes que sirven: `Order[sellerUserId, orderDate]`,
  `Order[orderDate]`, `Invoice[dueDate, status]`, `Invoice[customerId, status]`,
  `CommercialExpense[submittedByUserId, expenseDate]`. Falta uno para
  `Return[returnDate]` — ya existe. No preveo migraciones para v1.
- Sin tablas de snapshot: todo se calcula en lectura. Con el volumen actual
  (518 clientes) alcanza de sobra; si algún día no, se cachea por rango.

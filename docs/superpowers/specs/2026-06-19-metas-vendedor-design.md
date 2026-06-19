# Metas Comerciales por Vendedor

## Contexto

La transcripcion del 2026-05-22 define que cada vendedor debe verse como una unidad comercial con una meta de ventas mensual, trimestral o anual, y que el CRM debe mostrar cuanto lleva vendido, el porcentaje de cumplimiento y cuanto le falta. El sistema ya tiene metas por cliente (`CustomerGoal`), pedidos multiempresa, clientes asignados a vendedores y dashboard comercial avanzado. Esta fase agrega metas por vendedor completas, con API, calculo de progreso, UI y pruebas.

## Objetivo

Permitir que direccion comercial asigne metas de venta a cada vendedor y consulte el cumplimiento por periodo. El avance se calcula con los pedidos de los clientes asignados al vendedor, no con el usuario que creo el pedido, para que facturacion o administracion puedan operar sin distorsionar los indicadores comerciales.

## Alcance

Incluye:

- Modelo `SellerGoal` asociado a `User`.
- CRUD de metas por vendedor.
- Calculo de progreso por vendedor y resumen general para dashboard.
- Filtro opcional por empresa (`companyId`) en progreso y dashboard.
- UI para crear, editar y eliminar metas desde la zona de usuarios.
- UI de dashboard con meta, vendido, porcentaje, faltante, pedidos y clientes por vendedor.
- Pruebas e2e de API y una prueba web basica si el entorno Playwright existente lo permite.

No incluye:

- Metas por zona.
- Comisiones.
- Proyecciones con IA.
- Importacion masiva de metas desde Excel.
- Cambiar las metas por cliente existentes.
- Integracion con Nora/WhatsApp.

## Decisiones

| Tema | Decision |
| --- | --- |
| Fuente del avance | Pedidos de clientes asignados al vendedor (`Customer.assignedToUserId`) |
| Monto usado | `Order.total` |
| Estados que suman | `facturado`, `despachado`, `en_transito`, `entregado` |
| Periodos | `mensual`, `trimestral`, `anual` |
| `periodValue` | `YYYY-MM`, `YYYY-QN`, `YYYY` |
| Multiempresa | Filtro opcional por `Order.companyId` |
| Vendedores elegibles | Usuarios activos con rol `comercial` o `director_comercial` |
| Acceso escritura | `administrador` y `director_comercial` |
| Acceso lectura | Roles comerciales y administrativos autenticados, con vendedores viendo su propia meta |

## Modelo de Datos

Agregar modelo:

```prisma
model SellerGoal {
  id           String   @id @default(cuid())
  userId       String
  periodType   String
  periodValue  String
  targetAmount Decimal  @db.Decimal(14, 2)
  notes        String?
  createdBy    String
  updatedBy    String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, periodType, periodValue])
  @@index([periodType, periodValue])
}
```

Agregar relacion en `User`:

```prisma
sellerGoals SellerGoal[]
```

La restriccion unica evita metas duplicadas para el mismo vendedor y periodo. Para cambiar una meta se usa `PATCH`, no otra creacion.

## API

### `POST /users/:id/seller-goals`

Crea una meta para el vendedor.

Body:

```json
{
  "periodType": "mensual",
  "periodValue": "2026-06",
  "targetAmount": 300000000,
  "notes": "Meta de junio"
}
```

Validaciones:

- El usuario existe, esta activo y tiene rol `comercial` o `director_comercial`.
- `periodType` pertenece a los valores soportados.
- `periodValue` coincide con el formato del periodo.
- `targetAmount` es mayor que cero.
- No existe otra meta para el mismo usuario/periodo.

### `GET /users/:id/seller-goals`

Lista metas del vendedor, ordenadas por periodo descendente.

### `PATCH /users/:id/seller-goals/:goalId`

Actualiza periodo, monto o notas. Si cambia periodo, se valida de nuevo la unicidad.

### `DELETE /users/:id/seller-goals/:goalId`

Elimina una meta. La eliminacion es fisica para seguir el patron actual de `CustomerGoal`.

### `GET /users/:id/seller-goals/progress?periodType=&periodValue=&companyId=`

Devuelve el progreso de una meta especifica. Si no se envia periodo, usa la meta mas reciente del vendedor.

Respuesta:

```json
{
  "userId": "usr_1",
  "sellerName": "Sebastian",
  "periodType": "mensual",
  "periodValue": "2026-06",
  "targetAmount": 300000000,
  "soldAmount": 120000000,
  "percentage": 40,
  "remainingAmount": 180000000,
  "ordersCount": 8,
  "customersCount": 5,
  "companyId": null
}
```

### `GET /dashboard/seller-goals?periodType=&periodValue=&companyId=`

Devuelve un resumen para todos los vendedores con meta en el periodo solicitado. Si no se envia periodo, usa el mes actual.

Respuesta:

```json
{
  "periodType": "mensual",
  "periodValue": "2026-06",
  "totals": {
    "targetAmount": 900000000,
    "soldAmount": 410000000,
    "percentage": 45.56,
    "remainingAmount": 490000000,
    "sellers": 3
  },
  "items": [
    {
      "userId": "usr_1",
      "sellerName": "Sebastian",
      "targetAmount": 300000000,
      "soldAmount": 120000000,
      "percentage": 40,
      "remainingAmount": 180000000,
      "ordersCount": 8,
      "customersCount": 5
    }
  ]
}
```

## Calculo de Periodos

- `mensual`: `2026-06` cubre del 2026-06-01 00:00:00 al ultimo dia del mes 23:59:59.999.
- `trimestral`: `2026-Q2` cubre abril, mayo y junio de 2026.
- `anual`: `2026` cubre todo el ano calendario.

El calculo debe usar la misma convencion que `CustomerGoalsService`, pero se recomienda extraer o duplicar de forma pequena un helper privado en el nuevo servicio para no mezclar responsabilidades.

## Calculo de Progreso

Para un vendedor y periodo:

1. Buscar la meta.
2. Sumar `Order.total` de pedidos donde:
   - `order.customer.assignedToUserId = userId`.
   - `order.status` esta en `facturado`, `despachado`, `en_transito`, `entregado`.
   - `order.orderDate` cae dentro del rango del periodo.
   - Si llega `companyId`, `order.companyId = companyId`.
3. Contar pedidos y clientes distintos.
4. Calcular:
   - `percentage = soldAmount / targetAmount * 100`.
   - `remainingAmount = max(0, targetAmount - soldAmount)`.

Se usa `orderDate`, no `createdAt`, porque el pedido puede registrarse despues de la fecha real de venta.

## UI

### Dashboard

Agregar un bloque "Metas por vendedor" bajo los KPIs y cerca del dashboard comercial avanzado.

Debe mostrar:

- Resumen general: meta total, vendido total, porcentaje, faltante.
- Tabla de vendedores: vendedor, meta, vendido, porcentaje, faltante, pedidos y clientes.
- Barra de progreso por vendedor.
- Estado visual:
  - `>= 100%`: cumplida.
  - `>= 80%`: cerca.
  - `< 80%`: en progreso.
- Respeta filtro `companyId` existente en `/dashboard`.

### Usuarios

En `/users`, agregar una accion o seccion para gestionar metas del vendedor. La UI minima aceptada puede ser un panel/modal en el cliente de administracion de usuarios.

Debe permitir:

- Crear meta.
- Editar monto/notas/periodo.
- Eliminar meta.
- Ver progreso de la meta actual o seleccionada.

Solo `administrador` y `director_comercial` pueden modificar metas. Un vendedor puede leer su propia meta desde dashboard, pero no editarla.

## Errores y Estados Vacios

- Sin metas para el periodo: mostrar estado vacio claro en dashboard.
- Meta duplicada: responder `409 Conflict`.
- Usuario no elegible: responder `400 Bad Request`.
- Periodo invalido: responder `400 Bad Request`.
- Meta inexistente: responder `404 Not Found`.
- Filtro `companyId` invalido o inactivo: responder `404 Not Found`.

## Seguridad y Permisos

Backend:

- Escritura: `administrador`, `director_comercial`.
- Lectura agregada de dashboard: `administrador`, `director_comercial`.
- Lectura individual: control roles o el mismo usuario vendedor.

Frontend:

- Ocultar controles de edicion si el rol no puede modificar metas.
- No depender solo del frontend; el backend debe validar permisos.

## Pruebas

### API e2e

Casos minimos:

- Crea meta mensual para un vendedor.
- Rechaza meta duplicada.
- Rechaza usuario con rol no elegible.
- Calcula progreso con pedidos de clientes asignados al vendedor.
- Ignora pedidos de clientes asignados a otro vendedor.
- Ignora estados no comerciales (`recibido`, `orden_facturacion`).
- Filtra progreso por empresa.
- Usa `orderDate` para ubicar pedidos en el periodo.
- Dashboard devuelve totales agregados correctos.
- Vendedor no puede editar su meta.

### Frontend

Casos minimos:

- Dashboard renderiza el bloque de metas por vendedor con datos.
- Estado vacio cuando no hay metas para el periodo.
- Usuario con permisos puede abrir/usar gestion de metas.

## Migracion y Datos Semilla

La migracion crea la tabla sin datos iniciales. No se deben crear metas falsas en seed salvo que el seed de demo ya tenga vendedores y pedidos suficientes; si se agregan, deben estar claramente marcadas como demo.

## Criterios de Aceptacion

- Direccion comercial puede crear una meta mensual para un vendedor.
- El dashboard muestra meta, vendido, porcentaje y faltante por vendedor.
- Las ventas se calculan por clientes asignados, aunque el pedido lo cree otro usuario.
- El filtro por empresa cambia los montos del dashboard.
- Un vendedor no puede modificar metas.
- Las pruebas e2e cubren el calculo principal y permisos.

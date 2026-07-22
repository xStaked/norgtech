# Filtros de búsqueda en el módulo de clientes

Fecha: 2026-07-21

## Problema

La lista de clientes muestra los 518 registros en una sola tabla sin ningún control:
no se puede buscar por nombre o NIT, ni acotar por empresa, estado (380 de los 518
están inactivos), segmento o condición de pago. El `FilterBar` existente solo pinta
un contador.

## Decisión de enfoque

Filtrado **en el servidor** vía query params en la URL (el usuario lo prefirió sobre
filtrar en memoria en el cliente): los filtros quedan compartibles por URL y el
patrón escala si la base crece. La página lee `searchParams` y los reenvía al API,
igual que ya hace `invoices/page.tsx`.

La lista entra mostrando **Todos** por defecto (activos + inactivos), como hoy.

## API

`GET /customers` — el query DTO actual (`includeInactive`) se extiende con parámetros
opcionales:

| Param | Tipo | Efecto en `where` |
|---|---|---|
| `search` | string | `OR` de `contains` case-insensitive sobre `displayName`, `legalName`, `taxId` |
| `companyId` | string | igualdad |
| `segmentId` | string | igualdad |
| `paymentCondition` | enum existente (`contado`, `credito_15/30/60/90`) | igualdad |
| `active` | `"true"` \| `"false"` | igualdad; **si viene, manda sobre `includeInactive`** |

Sin `active`, el comportamiento de `includeInactive` queda idéntico al actual: ningún
consumidor existente se rompe. Todos los params son opcionales y componibles (se
combinan con `AND`).

Limitación aceptada: la búsqueda ignora mayúsculas pero **no acentos** ("nutricion"
no encuentra "Nutrición"). Activar la extensión `unaccent` de Postgres queda como
mejora futura si molesta en la práctica.

## Web

- `customers/page.tsx` lee `searchParams`, arma el query string hacia
  `/customers` (reutilizando el helper de query string que ya usa invoices) y carga
  además `/companies` y `/customer-segments` para poblar los selects.
- Componente cliente nuevo `customers-filters.tsx`: input de búsqueda + selects de
  Empresa, Estado (Todos/Activos/Inactivos, default Todos), Segmento y Pago. Cada
  cambio hace `router.replace` con los params actualizados → el server component se
  re-renderiza filtrado. La búsqueda se aplica con un debounce de 300 ms (no en
  cada tecla, y sin exigir Enter).
- Los controles viven como `children` del `FilterBar` existente. El resumen pasa a
  "N de 518 clientes" cuando hay filtros activos, y aparece un botón "Limpiar"
  (vuelve a `/customers`) solo si hay alguno aplicado.

## Pruebas

- e2e de customers: un caso por param (`search`, `companyId`, `segmentId`,
  `paymentCondition`, `active=false`) y uno combinado, con el stub de Prisma
  existente extendido: la allowlist `KNOWN_WHERE_KEYS` incorpora las claves nuevas y
  sigue reventando ante claves desconocidas, para que los tests muerdan.
- Se verifica que sin params nuevos la respuesta es idéntica a la actual
  (compatibilidad de `includeInactive`).

## Fuera de alcance

- Paginación (518 filas se renderizan bien; se agrega cuando el volumen lo pida).
- Búsqueda accent-insensitive (`unaccent`).
- Filtros en otros módulos (este es el primero con controles reales; el patrón queda
  para replicar).

# Catálogo y precios — contexto para diseño de front

Estado: el modelo de datos y la carga **ya están en producción**. Lo que falta es
la interfaz. Este documento describe qué campos existen, qué pantallas faltan y
qué reglas de negocio tiene que respetar el diseño.

---

## 1. El problema que resuelve

Norgtech vende el mismo producto a precios distintos según a quién le venda.
No es un descuento porcentual sobre un precio base: son **precios absolutos
negociados por cliente**, que el cliente nos manda en un Excel.

El mismo `ACE TECH / Bolsa x 500 g` vale:

| Lista | Moneda | Precio sin IVA | Precio con IVA |
|---|---|---|---|
| DIRECTOS | COP | 84.238,10 | 88.450,00 |
| DISTRIBUIDORES | COP | 90.952,38 | 95.500,00 |
| CALASAN | COP | 90.952,38 | 95.500,00 |
| AVSA | COP | 84.238,10 | 88.450,00 |
| GUAMITO | COP | 82.333,33 | 86.450,00 |
| GUATEMALA | USD | 23,40 | 24,59 |
| ECUADOR | USD | 23,40 | 24,59 |

**El front actual no muestra nada de esto.** Muestra un único `precio base` por
producto, que es un valor provisional sin significado comercial.

---

## 2. Modelo de datos (lo que ya existe en producción)

```
Product  (53 reales, SKU CAT-*)
  └── ProductPresentation  (122)   ← el empaque vendible
        └── PriceListItem  (772)   ← el precio, dentro de una lista
              └── PriceList  (19)  ← DIRECTOS, CALASAN, GUATEMALA…

Customer (518)  ──priceListId──>  PriceList   (7 clientes ya enganchados)
```

Un producto tiene **varias presentaciones** (empaques). Un precio **no cuelga del
producto**, cuelga del par (presentación, lista). Por eso no existe "el precio de
ACE TECH": existe el precio de *ACE TECH en Bolsa x 500 g para AVSA*.

### Product

| Campo | Tipo | Obligatorio | Ejemplo |
|---|---|---|---|
| `id` | string | — | `clx...` |
| `sku` | string único | sí | `CAT-ACETECH` |
| `name` | string | sí | `ACE TECH` |
| `description` | string | no | — |
| `unit` | string | sí | `Polvo soluble`, `Líquido`, `Premix` |
| `active` | boolean | — | `true` |
| ~~`presentation`~~ | string | — | **campo viejo, se reemplaza por la tabla de presentaciones** |
| ~~`basePrice`~~ | decimal | — | **vestigial**, ver §5 |

### ProductPresentation

| Campo | Tipo | Obligatorio | Ejemplo |
|---|---|---|---|
| `id` | string | — | — |
| `empaque` | string | sí | `Bolsa x 500 g`, `Saco x 25 Kg.`, `Bolsa 400 gr`, `25kilos` |
| `form` | string | no | `Polvo soluble`, `Líquido`, `Premix`, `Polvo gelificante` |
| `dosage` | string | no | `500g/1.000 lt agua`, `120/Ton de alimento` |
| `active` | boolean | — | `true` |

Único por `(producto, empaque)`. El producto con más presentaciones hoy tiene 7
(`KEPASS HEAT LIQUIDO`); el promedio es 2–3.

**Ojo con el diseño:** los empaques vienen escritos de forma inconsistente en el
origen (`Bolsa x 400 g` vs `Bolsa 400 gr` vs `25kilos` vs `Saco x 25 Kg.`). No se
normalizaron a propósito — se sube lo que manda el cliente. El diseño no debe
asumir un formato parseable ni intentar extraer el número.

### PriceList

| Campo | Tipo | Obligatorio | Ejemplo |
|---|---|---|---|
| `name` | string único | sí | `DIRECTOS`, `CALASAN`, `GUATEMALA` |
| `kind` | enum | sí | `segmento` \| `cliente` \| `export` \| `linea` |
| `currency` | string | sí | `COP` \| `USD` |
| `country` | string | no | `Colombia`, `Guatemala`, `Ecuador`, `Venezuela`, o vacío |
| `active` | boolean | — | `true` |

Las 19 listas actuales:

| kind | Cuántas | Cuáles |
|---|---|---|
| `segmento` | 2 | DIRECTOS, DISTRIBUIDORES |
| `cliente` | 9 | CALASAN, NUTRIFARM, SUPLEBULL, AVSA, GUAMITO, NANONUTRICION, POLLOS BUCANEROS, INCUSA, GRUPO BIOS |
| `export` | 3 | GUATEMALA, ECUADOR, REDIVENCA |
| `linea` | 4 | AGRICOLA, AQUAVET, QUANTICA, SOLUCIONES NATURALES |
| — | 1 | LEVANIA (`cliente`, pero en USD) |

Tienen entre 3 y 75 ítems cada una. **No todas las listas tienen todos los
productos** — GUAMITO tiene 38 ítems y CALASAN 75. El diseño debe soportar
"este producto no está en esta lista" sin que se vea como un error.

### Precios por país — cómo funciona

Norgtech vende fuera de Colombia y el cliente pidió "precios por país". Está
resuelto, pero **no con un campo de precio por país**: un producto no tiene "un
costo por país", tiene un precio por cada par (presentación, lista). El país es
un **atributo de la lista**, no una dimensión del precio.

```
GUATEMALA   kind=export   currency=USD   country=Guatemala    46 ítems
ECUADOR     kind=export   currency=USD   country=Ecuador      49 ítems
REDIVENCA   kind=export   currency=USD   country=Venezuela    48 ítems
LEVANIA     kind=cliente  currency=USD   country=(vacío)       7 ítems
DIRECTOS…   kind=…        currency=COP   country=Colombia
```

Tres cosas que el diseño tiene que tener claras:

1. **`country` no decide el precio.** El precio se resuelve por
   `Customer.priceListId`, punto. Un cliente guatemalteco recibe precios de
   Guatemala porque su lista asignada es GUATEMALA, no porque su país diga
   Guatemala. Es deliberado: si el país decidiera el precio, cambiarle el país a
   un cliente le cambiaría lo que se le cobra sin que nadie lo haya autorizado.
   La asignación es explícita y auditable.

2. **La relación es 1 país : N listas.** Colombia tiene 15 listas (DIRECTOS,
   DISTRIBUIDORES, y las de cada cliente). El país no es una llave, es una
   etiqueta. Y moneda y país son independientes: LEVANIA cotiza en USD sin
   tener país asignado.

3. **No existe un "cliente país".** Se evaluó crear un `Customer` llamado
   GUATEMALA y se descartó: ensucia cartera, comisiones y reportes por cliente,
   no tiene NIT ni contacto, y se duplicaría el día que entre el comprador
   guatemalteco real. Ese comprador se crea como cliente normal con
   `country: "Guatemala"` y `priceListId → GUATEMALA`.

**Para qué sirve entonces `country` en el front:**

- filtrar y agrupar las listas por país en `/price-lists`
- al crear o editar un cliente con `country` distinto de Colombia, **sugerir**
  la lista de ese país (sugerir y dejar que el usuario confirme, nunca aplicarla
  sola)
- dejar obvio en la matriz de precios qué columnas son de exportación y en qué
  moneda están, que es donde más fácil se confunde alguien

### PriceListItem

| Campo | Tipo | Ejemplo |
|---|---|---|
| `priceSinIva` | decimal | `84238.10` |
| `priceConIva` | decimal | `88450.00` |
| `taxPercent` | decimal | `0`, `5`, `10` |
| `priceSinIva2` / `priceConIva2` | decimal, opcional | segundo nivel |
| `priceSinIva3` / `priceConIva3` | decimal, opcional | tercer nivel (solo AVSA) |

Único por `(lista, presentación)`.

---

## 3. Pantallas

### A. Lista de productos — **existe, hay que rehacerla**

`apps/web/src/app/(app)/products/page.tsx`

Hoy muestra tarjetas con `precio base` en verde grande, que es un número sin
significado. Además el buscador, "Categoría" y "Unidad" son **botones falsos**,
no filtran nada.

Debe mostrar por producto:

- `name`, `sku`, `unit`, `active`
- **cuántas presentaciones tiene** (`3 presentaciones`)
- **en cuántas listas tiene precio** (`en 12 listas`)
- **rango de precio**, no un número suelto: `$82.333 – $90.952` (el mínimo y el
  máximo entre todas sus listas en COP). Si el usuario tiene una lista/cliente
  seleccionado en un filtro, mostrar el precio de esa lista.
- filtros que sí funcionen: búsqueda por nombre/SKU, por `unit`, por lista de
  precios, y activo/inactivo

### B. Detalle de producto — **NO EXISTE, es lo más importante**

Ruta nueva: `/products/[id]`

Es la pantalla que hoy falta por completo. Secciones:

**Cabecera:** `name`, `sku`, `unit`, `description`, estado activo/inactivo, y
acciones editar / desactivar.

**Presentaciones:** una fila por presentación con `empaque`, `form`, `dosage`,
activo. Es una tabla editable (agregar, editar, desactivar).

**Precios por lista:** la parte central. Una **matriz presentación × lista**:

```
                        DIRECTOS      CALASAN       AVSA         GUATEMALA
Bolsa x 500 g           $84.238       $90.952       $84.238       US$23,40
Bolsa x 1 Kg            $156.400      $168.900         —          US$42,10
Saco x 25 Kg.              —          $2.350.554    $2.100.000       —
```

Requisitos del diseño para esta matriz:

- **Dos monedas a la vez.** Las columnas COP y USD conviven. Nunca sumarlas ni
  convertirlas, no hay tasa de cambio en el sistema. El símbolo debe dejar
  obvio cuál es cuál.
- **Celdas vacías** cuando el producto no está en esa lista. Debe leerse como
  "no aplica", no como "precio cero".
- **Sin IVA / con IVA:** un toggle para toda la matriz. El IVA no es uniforme
  (hay 0%, 5% y 10%), así que el número con IVA no se puede calcular en el
  front — viene del backend.
- **Niveles 2 y 3:** la mayoría de ítems solo tiene nivel 1. Algunos tienen un
  segundo y AVSA tiene un tercero. No deben ensuciar la vista principal:
  un indicador discreto en la celda que despliegue los otros niveles.
- Escala: hasta 19 columnas × 7 filas. Necesita scroll horizontal con la
  columna de presentación fija.

### C. Crear / editar producto — **existe pero incompleta, y no hay edición**

`apps/web/src/components/products/product-form.tsx`

Hoy pide: SKU, nombre, descripción, unidad, `presentación` (texto libre) y
`precio base` (un número). Los dos últimos son del modelo viejo.

Debe pedir:

- SKU, nombre, descripción, unidad, activo
- **presentaciones**: lista dinámica de filas (`empaque` obligatorio, `form` y
  `dosage` opcionales). Mínimo una.
- **precios**: opcional al crear. Si se ponen, es por (presentación, lista):
  `priceSinIva`, `priceConIva`, `taxPercent`.

No existe pantalla de edición (`/products/[id]/edit` o edición en el detalle).
Hay que diseñarla; puede ser el mismo formulario.

### D. Listas de precios — **NO EXISTE**

Ruta nueva: `/price-lists`

- **Índice:** una fila por lista con `name`, `kind`, `currency`, `country`,
  cuántos ítems tiene, cuántos clientes la usan, activo.
- **Detalle** `/price-lists/[id]`: los ítems de la lista (producto,
  presentación, precios, IVA), y qué clientes la tienen asignada.

Hoy 12 de las 19 listas **no tienen ningún cliente asignado**. Cuatro son de
clientes que aún no están creados en el CRM (NANONUTRICION, POLLOS BUCANEROS,
INCUSA, GRUPO BIOS) y el resto son de segmento/línea/país, que por diseño no se
enganchan a un solo cliente. La pantalla debe hacer visible ese estado sin que
parezca un error.

### E. Cliente → su lista de precios

En el detalle de cliente hay que agregar:

- **`priceListId`**: selector de lista de precios. Es lo que determina a qué
  precio se le cotiza. Hoy no existe en ninguna pantalla.
- **`country`**: campo nuevo, texto. Ya existe en la base (default `Colombia`).
  Si no es Colombia, sugerir la lista de ese país (ver "Precios por país").

### F. Cotización — elegir presentación

No es una pantalla nueva, pero es donde el catálogo se vuelve plata y hay que
tocarla. Al agregar una línea de cotización, hoy se elige solo el producto. Con
presentaciones eso ya no alcanza: el mismo producto en `Bolsa x 1 Kg` y en
`Saco x 25 Kg.` son precios completamente distintos.

**El backend ya cotiza por lista.** `priceLines` — la función que crea
cotizaciones y pedidos — resuelve el precio de la lista del cliente antes de
caer a `basePrice`. La respuesta de `POST /quotes/preview` trae por línea
`priceListName` y `presentation` para que el front muestre de dónde salió cada
precio.

**Si la presentación es ambigua, la línea se rechaza con 400.** Cuando el
cliente tiene lista y el producto tiene varios empaques con precio, no hay un
precio correcto que adivinar: el mensaje lista los empaques y el front debe
hacer elegir. Por eso el selector de presentación no es opcional.

El backend resuelve el precio con `GET /products/:id/price-for-customer/:customerId`
y responde una de tres cosas en el campo `source`:

| `source` | Qué pasó | Qué debe hacer el front |
|---|---|---|
| `price_list` | El cliente tiene lista y el producto está en ella | Mostrar el precio y de qué lista salió (`priceListName`, `currency`, `empaque`) |
| `ambiguous` | El producto tiene **varias presentaciones con precio** en esa lista | Mostrar `options[]` y **obligar a elegir** antes de continuar |
| `base_price` | El cliente no tiene lista, o el producto no está en ella | Precio base con descuento de segmento, como siempre |

El caso `ambiguous` es el que necesita diseño: la API devuelve las opciones con
su empaque y su precio en vez de escoger una sola, porque cotizar el empaque
equivocado despacha el producto equivocado. Si el usuario ya eligió la
presentación, se manda `?presentationId=…` y la respuesta vuelve a ser
`price_list`.

---

## 4. Reglas de negocio que el diseño debe respetar

1. **Los precios se muestran tal cual los mandó el cliente.** No redondear, no
   recalcular, no "corregir" inconsistencias. Hay ítems con IVA negativo y
   duplicados con precios distintos: se muestran como están.
2. **Dos monedas sin conversión.** COP y USD conviven, no hay tasa de cambio.
   Nada de totales mezclados.
3. **El IVA no es uniforme:** 0% (exento), 5% y 10% (LEVANIA). Nunca 19%. El
   diseño no puede hardcodear un porcentaje.
4. **El precio de lista ya es el precio final del cliente.** No lleva descuento
   de segmento encima (ver §5).
5. **La ausencia de precio es normal**, no un error.

---

## 5. Deuda conocida (contexto, no hay que diseñarlo)

- **`Product.basePrice` es el fallback, ya no el precio.** Se usa solo cuando el
  cliente no tiene lista, o el producto no está en ella. No debe aparecer en
  ninguna pantalla nueva.
- **Los pedidos que crea la automatización de WhatsApp** no mandan
  `presentationId`. Si el producto es ambiguo para ese cliente, la creación
  falla y la automatización ya lo degrada a `human_review` con el mensaje que
  lista los empaques — que es el comportamiento correcto: mejor que lo revise
  alguien a que salga despachado el empaque equivocado.
- **Descuento de segmento vs precio de lista** — ya resuelto en el backend. El
  precio de lista gana y el descuento de segmento **no** se aplica encima: la
  lista ya es el precio negociado con ese cliente, descontarle otra vez sería
  descontar dos veces. El fallback a `basePrice` + descuento sigue vivo para
  clientes sin lista.
- **Los niveles 2 y 3 no tienen semántica confirmada.** En casi todas las listas
  el nivel 2 es ~5% por encima del 1, pero en CALASAN es mucho menor. Está
  pendiente preguntarle al cliente qué significan. Diseñarlos como "niveles
  adicionales" genéricos, sin ponerles nombre comercial.
- **Quedan 4 productos basura en producción** (`Vogue 300 cc`, `PC gamer…`,
  `PC del gobierno`, `Prueba`) de pruebas viejas. No tienen presentaciones ni
  precios. Van a aparecer en la lista de productos hasta que se borren.

---

## 6. Contrato de API

Endpoints que expone el backend para estas pantallas.

```
GET    /products                      lista + nº presentaciones, nº listas, rango de precio
GET    /products/:id                  producto + presentaciones + precios por lista
POST   /products                      crear (acepta presentaciones anidadas)
PATCH  /products/:id                  editar
POST   /products/:id/presentations    agregar presentación
PATCH  /product-presentations/:id     editar / desactivar presentación

GET    /price-lists                   índice + nº ítems y nº clientes
GET    /price-lists/:id               detalle con ítems y clientes
PUT    /price-lists/:id/items         fijar el precio de una presentación en la lista

GET    /products/:id/price-for-customer/:customerId[?presentationId=…]
                                      precio efectivo. Responde source =
                                      price_list | ambiguous | base_price
                                      (ver §3.F)
```

`Customer` acepta además `country` y `priceListId` al crear y editar; su detalle
devuelve la lista completa en `priceList`.

# Adaptacion de AgroCRM Operativo de Stitch a Next.js

Fecha: 2026-04-30

## Objetivo

Adaptar la interfaz actual de `apps/web` para que refleje el lenguaje visual, la jerarquia operativa y la estructura de navegacion del proyecto de Stitch `AgroCRM Operativo`, manteniendo la logica funcional existente del CRM y evitando una reescritura del backend.

## Estado actual

El frontend actual ya cubre funcionalidades clave del MVP:

- autenticacion
- dashboard
- clientes
- oportunidades
- cotizaciones
- pedidos
- productos
- segmentos
- visitas
- seguimientos
- agenda

Sin embargo, la experiencia visual y operativa todavia se siente como un CRUD administrativo basico:

- `RootLayout` usa estilos inline globales simples
- el layout autenticado usa header horizontal en vez de shell persistente tipo CRM
- no existe un sistema visual compartido ni tokens reutilizables
- las tablas y listados no tienen la densidad operativa esperada
- falta una pagina real para `billing-requests`
- la proteccion de rutas no cubre de forma consistente todo el CRM

## Meta de diseno

La meta no es copiar pantallas de Stitch de forma literal ni rehacer las rutas del producto. La meta es convertir el frontend actual en un CRM operativo consistente que:

- conserve los flujos ya implementados
- adopte la arquitectura visual del proyecto `AgroCRM Operativo`
- incremente densidad informativa y velocidad de operacion
- unifique navegacion, encabezados, tablas, formularios y detalles
- deje una base reutilizable para futuras pantallas

## Principios

### Preservar funcionalidad

La logica de negocio actual de `apps/web` y `apps/api` se mantiene. Esta fase se enfoca en:

- layout
- navegacion
- presentacion
- componentes compartidos
- consistencia de estados de carga y error
- pequenos ajustes de frontend necesarios para soportar la nueva UX

No se debe introducir una reescritura del dominio ni duplicar logica ya resuelta en backend.

### Seguir la estructura de Stitch como contrato visual

El proyecto de Stitch define una direccion visual clara:

- sidebar fija
- topbar compacta
- fondo claro con superficies blancas y navy profundo
- cards y tablas con tono operativo
- dashboard como centro de trabajo

Ese contrato visual debe traducirse a primitives reutilizables en Next.js en lugar de implementarse con estilos inline aislados en cada pagina.

### Densidad operativa sobre decoracion

La interfaz debe priorizar:

- escaneo rapido
- acciones frecuentes visibles
- estados claros
- tablas y listas densas
- jerarquia compacta

No se debe convertir el producto en una landing o dashboard ornamental.

## Alcance

### Incluido

- nuevo `app shell` para rutas autenticadas
- sistema de tokens visuales alineado con Stitch
- componentes UI reutilizables para listas, detalle y formularios
- rediseño del dashboard
- rediseño visual de vistas existentes
- nueva pagina para `billing-requests`
- endurecimiento del middleware para proteger todas las rutas privadas
- normalizacion de patrones de loading, empty state y error state en frontend

### Excluido

- cambios mayores en modelo de datos
- rediseño de API REST
- automatizaciones nuevas de negocio
- tiempo real
- notificaciones push
- integraciones externas nuevas
- migracion a otra libreria de estado o data fetching

## Arquitectura propuesta

### 1. App shell autenticado

El layout de `apps/web/src/app/(app)` pasa de un header horizontal simple a un shell persistente con:

- sidebar izquierda fija
- topbar superior compacta
- area principal con ancho fluido
- breadcrumbs o contexto de pagina
- acciones contextuales por pantalla

La navegacion debe agrupar claramente las capacidades del CRM:

- Dashboard
- Clientes
- Oportunidades
- Agenda
- Visitas
- Seguimientos
- Cotizaciones
- Pedidos
- Facturacion
- Productos
- Segmentos

La pagina de login permanece separada y minimalista.

### 2. Sistema visual base

Se debe crear una capa compartida de estilo dentro de `apps/web` con:

- tokens de color
- tokens de spacing
- tipografia
- radios
- sombras
- estilos de badge y estado

Los tokens deben derivarse de la paleta definida en Stitch, especialmente:

- fondo principal claro
- superficies blancas
- navy profundo como color primario
- azul secundario para interaccion
- semanticos de estado

Se debe eliminar la dependencia de estilos inline repetidos en paginas nuevas o modificadas dentro de este alcance.

### 3. Primitives reutilizables

La adaptacion debe apoyarse en componentes compartidos, no en markup duplicado por pagina. Como minimo:

- `AppShell`
- `SidebarNav`
- `Topbar`
- `PageHeader`
- `StatCard`
- `StatusBadge`
- `DataTable`
- `FilterBar`
- `DetailSection`
- `EmptyState`
- `SectionCard`
- `FormSection`
- `InlineMetric`

Estos componentes deben resolver la mayor parte de las diferencias visuales entre las rutas actuales y Stitch.

### 4. Patrones de pagina

Las vistas existentes deben converger a tres patrones base:

#### List pages

Para modulos como clientes, productos, cotizaciones, pedidos, seguimientos y visitas:

- encabezado con titulo y CTA principal
- barra de filtros o acciones rapidas
- tabla o lista densa
- estados de vacio claros
- accesos rapidos a detalle

#### Detail pages

Para clientes, oportunidades, pedidos, cotizaciones, visitas y seguimientos:

- cabecera con estado y acciones
- resumen ejecutivo arriba
- secciones inferiores por contexto
- metadatos y actividad en formato operativo

#### Form pages

- agrupacion por bloques
- jerarquia visual consistente
- acciones fijas y legibles
- ayudas breves solo donde hagan falta

### 5. Dashboard operativo

El dashboard debe pasar de KPI cards basicas a un centro operativo real. Debe incluir:

- metricas clave
- actividad reciente
- agenda inmediata
- alertas o pendientes
- accesos directos a acciones frecuentes

No debe convertirse en un panel analitico complejo. El foco es operacion diaria.

### 6. Oportunidades como flujo comercial principal

`Opportunity` ya es el eje del flujo comercial segun el dominio actual. La UI debe reflejarlo mejor:

- lista clara por etapa
- badges de estado consistentes
- vista alternativa tipo pipeline o kanban si el costo tecnico es razonable
- accesos rapidos a cotizacion, visita y pedido si aplican

Si la vista pipeline no puede salir en la primera iteracion sin afectar demasiado el ritmo, debe planearse despues del shell y los listados densos, pero sigue siendo parte del alcance objetivo.

### 7. Agenda y seguimiento accionables

Las pantallas de agenda, visitas y follow-ups deben sentirse como cola de trabajo, no solo registro historico. Esto implica:

- acciones visibles por fila
- estados faciles de distinguir
- fechas y vencimientos bien priorizados
- relacion clara con cliente y oportunidad

### 8. Billing requests

La navegacion actual ya sugiere el modulo, pero falta la pagina real. Se debe crear una vista funcional para:

- listar solicitudes
- mostrar estado
- permitir acceso al detalle o contexto relacionado

No hace falta inventar una nueva logica si el backend ya expone lo necesario o puede extenderse minimamente.

### 9. Proteccion de rutas

El middleware debe dejar de proteger solo una parte del CRM. Todas las rutas privadas bajo el shell autenticado deben requerir sesion valida.

## Estructura de implementacion recomendada

La implementacion debe seguir este orden:

1. base visual compartida
2. shell autenticado y navegacion
3. proteccion consistente de rutas
4. dashboard operativo
5. listados densos de modulos principales
6. detalles y formularios consistentes
7. agenda, visitas, seguimientos y facturacion
8. pulido transversal

Este orden minimiza retrabajo porque permite que las vistas consuman una base visual comun desde el inicio.

## Impacto esperado por area

### `apps/web/src/app/(app)/layout.tsx`

Sera el punto principal de transformacion del shell autenticado.

### Rutas en `apps/web/src/app/(app)/*`

Se mantendran las rutas actuales, pero se adaptaran a los patrones compartidos.

### `apps/web/src/components`

Debe crecer una libreria pequena de componentes internos del CRM para evitar repeticion.

### `apps/web/src/lib`

Solo se tocaran utilidades si hace falta soportar patrones comunes de UI, errores o fetch.

### `apps/web/src/middleware.ts`

Debe ampliarse para cubrir todo el espacio privado del producto.

## Riesgos y controles

### Riesgo 1: maquillar sin unificar

Si se redisenan paginas aisladas sin primitives compartidas, el resultado quedara inconsistente.

Control:

- construir primero shell, tokens y componentes base

### Riesgo 2: tocar demasiada logica funcional

La tentacion de rehacer flujos completos puede retrasar el resultado.

Control:

- limitar cambios funcionales a lo estrictamente necesario para la UX

### Riesgo 3: crear deuda visual nueva

Si se mezclan estilos inline antiguos y nuevos sin criterio, el frontend quedara fragmentado.

Control:

- toda vista tocada en esta fase debe migrar a la nueva base visual

### Riesgo 4: desalineacion entre Stitch y codigo real

No toda pantalla del diseño visual tiene equivalencia exacta en el repo actual.

Control:

- usar Stitch como direccion de layout y lenguaje visual
- usar el dominio y rutas del repo como fuente de verdad funcional

## Testing y validacion

La validacion de esta fase debe cubrir:

- navegacion correcta en shell autenticado
- rutas privadas protegidas
- render correcto de dashboard y modulos principales
- formularios existentes sin regresion funcional
- enlaces de navegacion sin rutas rotas
- consistencia visual en desktop y mobile

Se deben priorizar:

- pruebas de frontend para rutas criticas si ya existen patrones
- validacion manual operativa de flujos
- smoke tests E2E sobre login, dashboard, clientes y oportunidades

## Resultado esperado

Al terminar esta fase, el producto debe seguir haciendo lo que hoy ya hace, pero con una interfaz de CRM operativo alineada con `AgroCRM Operativo` de Stitch:

- mas consistente
- mas densa
- mas navegable
- mas lista para crecer por modulos

El entregable principal no es una nueva funcionalidad de negocio, sino una base de interfaz profesional que permita que el CRM actual se vea y se use como producto operativo real.

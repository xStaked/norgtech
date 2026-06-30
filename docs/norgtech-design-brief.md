# Norgtech — Design Brief completo (contexto para Claude Design)

Documento de contexto para rediseñar el design system del web app **con el detalle
de todas las vistas**. Pégalo completo en Claude Design.

---

## 1. Qué es el producto

**Norgtech** es un **CRM / ERP comercial** (web app interna) para un equipo de
ventas y operación en Colombia. Herramienta **densa en datos**: pedidos, clientes,
facturas, cotizaciones, visitas, gastos, cobranza, devoluciones, metas de
vendedores y un asistente de IA ("**Nora**") integrado con WhatsApp. Usuarios:
power-users (comerciales, director comercial, técnicos, facturación, logística) que
viven en la herramienta varias horas al día.

**Stack:** Next.js (App Router) · React · **Tailwind CSS v4** · **shadcn/ui** ·
framer-motion · lucide-react · class-variance-authority. **UI en español (es-CO).**
Moneda COP sin decimales. Fechas "DD mmm YYYY".

**Escala:** 49 páginas, 20 áreas funcionales.

---

## 2. Objetivo del rediseño

Que la app se vea **moderna**, sea **visualmente consistente** y tenga **mejor
jerarquía y legibilidad** (hoy se siente genérica/anticuada y cada pantalla puede
verse distinta).

### Dirección estética acordada
- **Referencia:** **Stripe / Mercury** — base neutra cuidada, acentos vivos,
  sombras en capas, micro-detalles de marca. Serio pero con personalidad.
- **Modo:** **light-first** (light por defecto), dark pulido como alternativa.
  *(Hoy el default es dark; lo invertimos.)*
- **Acento dual con roles semánticos separados — nunca mezclar:**
  - **Azul Norgtech** = producto/CRM (`--primary`).
  - **Violeta Nora** = exclusivamente IA/Nora.
- **Debe aguantar densidad de datos:** tablas con muchas filas/columnas, números y
  dinero alineados (`tabular-nums`), badges de estado, filtros. Legibilidad de
  tablas = prioridad.

---

## 3. Sistema de diseño actual (punto de partida)

### ⚠️ Problema raíz: DOS fuentes de verdad
El estilo está duplicado y desincronizado:
- `apps/web/src/styles/globals.css` → variables CSS / tokens Tailwind.
- `apps/web/src/components/ui/theme.ts` → objeto JS `crmTheme` con SUS PROPIOS
  colores, radios, sombras, spacing y un bloque `nora`. Difiere incluso en
  tipografía (`globals.css`=Poppins; `theme.ts`="Avenir Next").

**El nuevo sistema debe colapsar todo en UNA sola fuente de tokens** y prohibir
valores hardcodeados en componentes/pantallas.

### Tokens — Dark (default hoy)
```
background #0b0f19  foreground #f1f5f9  card #111827  primary #2d6cdf
accent #6366f1  destructive #ef4444  secondary/muted #1e293b
muted-foreground #94a3b8  border/input rgba(255,255,255,0.08)  ring #2d6cdf
radius 0.625rem
```
### Tokens — Light
```
background #f4f7fb  foreground #10233f  card #ffffff  primary #10233f
accent #2d6cdf  destructive #ba3a2f  secondary/muted #eef3f8
muted-foreground #52637a  border/input #dbe4ef  ring #2d6cdf
```
### Paletas de marca
```
Norgtech (azul): 500 #2d6cdf · 600 #1a3a5c · 700 #10233f · 800 #0a1629 · 900 #060d18
                 400 #3d5a7d · 300 #5a7394 · 200 #8b9cb8 · 100 #c3d0de · 50 #e6edf7
Nora (violeta/IA): 500 #6366f1 · 600 #4f46e5 · 400 #7c5cff · 300 #9f8eff
                   gradiente: linear-gradient(135deg,#6366f1,#8b5cf6)
```
### Estados semánticos (CrmStatusTone): `neutral · info · success · warning · danger`
Light: success #1f8f5f · warning #c27b12 · danger #ba3a2f · info #2d6cdf.
### Escala (theme.ts)
```
radius sm8 md12 lg18 xl24 pill999 · shadow card 0 10px30 rgba(16,35,63,.08) ·
shadow floating 0 18px48 rgba(16,35,63,.12) · spacing page24 section16 stack20 ·
sidebar 288px · contenido máx 1600px · motion fast160ms base220ms
```

### Componentes base (`components/ui`, ~32)
`avatar · badge · button · button-link · card · collapsible · command ·
data-table · detail-section · dialog · dropdown-menu · empty-state · filter-bar ·
form-section · inline-metric · input · input-group · label · morph-surface ·
page-header · scroll-area · section-card · select · separator · sheet · shift-card ·
skeleton · sonner(toasts) · stat-card · status-badge · table · tabs · textarea ·
tooltip`

### Layout global
Sidebar (288px) + Topbar + contenido (máx 1600px). Patrón de página estándar:
`PageHeader` (eyebrow + título + descripción + acciones) → `StatCard` grid →
`FilterBar` → `SectionCard` con `DataTable` o secciones de detalle.

---

## 4. Detalle de TODAS las vistas

Cada área tiene típicamente: **Lista** (`/area`), **Detalle** (`/area/[id]`),
**Formularios** (`/new`, `/edit`). Estados en badges con tonos
info/warning/success/danger/neutral.

### 4.1 Dashboard `/dashboard`
- **Tipo:** dashboard / hub analítico.
- **KPIs destacados:** Valor pipeline (COP) · Ventas cerradas 30d · Seguimientos
  pendientes.
- **KPIs secundarios (grid):** Cotizaciones abiertas · Pedidos activos · Visitas
  esta semana · Seguimientos pendientes.
- **Filtro de empresa:** chips "Todas las empresas" + cada empresa.
- **Secciones por rol:** SellerGoalsDashboard, CommercialAdvancedDashboard
  (admin/director), CreditAlertsWidget, CustomerGoalsDashboard.
- **Columna izquierda:** "Actividad reciente" (actor, acción, entidad, hora).
- **Columna derecha (380px):** "Mi cola de trabajo" (visitas/tareas próximas) ·
  "Acciones rápidas" (Nuevo cliente/oportunidad/cotización/pedido) · widget **Nora**
  ("Abrir conversación") · FeedbackWidget.
- **Widgets:** KpiCard (animado), ShiftKpiCard, ActivityList, QueueList.

### 4.2 Orders (Pedidos) `/orders`
- **Lista — tabla:** Pedido · Estado · Cliente · Fecha comprometida · Subtotal ·
  Total · Empresa · Detalle.
- **Estados:** Recibido(info) · Orden de facturación(warning) · Facturado(neutral) ·
  Despachado(info) · En tránsito(warning) · Entregado(success).
- **Filtros:** pills por estado (Todos / cada estado). **StatCards:** Recibidos ·
  Orden facturación · Facturados · Despachados · En tránsito · Entregados.
- **Acciones:** "+ Nuevo pedido", "Ver facturación". Sección "Cola de pedidos".
- **Detalle:** Header "Pedido #" + badge estado. Grid info (Cliente, NIT, Empresa
  facturadora, Sede, Orden de compra, Fecha, Oportunidad, Cotización origen, Fecha
  entrega). Secciones: **Solicitante** · **Productos** (SKU, presentación, cantidad,
  precio, %IVA, subtotal, IVA, total) · **Entrega y facturación** · **Aprobación** ·
  OrderBillingHistory · OrderStatusTimeline (progreso visual) · OrderLogisticsSection
  (editable logística: transportadora, tracking, fechas). Caja resumen (Subtotal,
  IVA, Total). Acciones de transición de estado / revisión.
- **Form nuevo:** Encabezado (Empresa facturadora*, Zona despacho, Cliente* con
  resumen de crédito, OC, fechas, sede, oportunidad, cotización, dirección) ·
  Solicitante · **Productos** (line items dinámicos con catálogo, cantidad, valor,
  IVA, totales) + caja resumen + "+ Agregar item" · Entrega y facturación ·
  Aprobación. **Validación de crédito** ("Crédito disponible: $…", bloquea si excede).
- **Review** `/orders/review`: lista de pedidos "en revisión" con acciones.

### 4.3 Customers / CRM (Clientes) `/customers`
- **Lista — tabla:** Cliente (nombre comercial + razón social) · Segmento ·
  Ubicación · Crédito · Contacto principal · Detalle. Resumen "X clientes". Sección
  "Cartera de clientes".
- **Detalle:** Header (nombre, segmento, razón social) + acciones (Editar, +Visita,
  +Seguimiento, +Cotización, +Pedido). **Meta comercial** (período, meta $M,
  %cumplido, vendido) o "Sin meta asignada". Resumen de registros relacionados
  (oportunidades, visitas, seguimientos, cotizaciones, pedidos, facturación).
  **NoraContextLauncher** (IA por cliente). **Información de contacto** (NIT,
  teléfono, correo, dirección, ciudad, depto, segmento, notas). **Contactos**
  (cards con "Principal"). **CustomerGoalsSection** (gestión de metas + barra de
  progreso). **CreditInfoCard** (límite, saldo, disponible, %utilización, barra).
  **CustomerHistorySection** (tablas: oportunidades, visitas, seguimientos,
  cotizaciones, pedidos, facturación). **Zonas de despacho** (tabla Zona/Dirección/
  Vendedor).
- **Form nuevo/editar:** Segmento*, Razón social*, Nombre comercial*, NIT, Teléfono,
  Correo, Ciudad, Departamento, Dirección, Notas, Asignado a, Tipo de cliente,
  Condición de pago, Cupo de crédito $, Días de pago, Presupuesto mensual $. (Nuevo
  además: contacto principal + meta inicial opcional.)

### 4.4 Products (Productos) `/products`
- **Lista — cards** (no tabla): Nombre · Precio base (verde, derecha) · meta (SKU ·
  Unidad · Presentación) · Descripción. Acción "+ Nuevo producto".
- **Form nuevo:** SKU*, Nombre*, Descripción, Unidad* (ej: kg, dosis), Presentación
  (ej: Caja x10), Precio base*.

### 4.5 Invoices (Cartera/Facturas) `/invoices`
- **Lista — tabla:** Factura · Empresa · Cliente · Emisión · Vencimiento · Total ·
  Pagado · Saldo (rojo/verde) · Estado. **StatCards:** Emitidas · Enviadas ·
  Parcialmente pagadas · Vencidas · Pagadas. Acción "Nueva factura".
- **Estados:** Emitida · Enviada · Parcialmente pagada · Pagada · Vencida · Anulada.
- **Detalle:** banner de vencida (rojo) si aplica. **Información general** (Cliente,
  Pedido, emisión, vencimiento, estado, notas) · **Totales** (Subtotal, IVA, Total,
  Pagado, Saldo) · **Acciones** (transición de estado + "Registrar pago": Monto,
  Método, Referencia, Fecha, Notas) · **Pagos** (historial con archivos adjuntos).
- **Form nuevo:** Cliente ID*, Pedido ID, Número (auto), Emisión, Vencimiento,
  Subtotal*, IVA*, Total*, Notas.

### 4.6 Quotes (Cotizaciones) `/quotes`
- **Lista — tabla:** Cotización (#+fecha) · Estado · Cliente · Subtotal · Total ·
  Detalle. **StatCards:** Abiertas · En negociación · Cerradas · Valor total.
  Acciones "Nueva cotización", "Ver oportunidades".
- **Estados:** Abierta · En negociación · Cerrada · Perdida.
- **Detalle:** Header "Cotización #" + badge. Resumen (Cliente, Oportunidad, Válida
  hasta, Creada) + métricas inline (Subtotal, Total, Ítems). Tabla de ítems
  (Producto, SKU, Cantidad+unidad, Precio, Subtotal). Footer "Total cotizado".
  Si cerrada → "Generar factura".
- **Form nuevo:** Cliente* (muestra segmento + %descuento), Oportunidad, Notas,
  Válida hasta, **ítems** (Producto con precio, Cantidad, Precio unit, Subtotal,
  Notas) + "+ Agregar item". Resumen con Descuento por segmento.

### 4.7 Opportunities (Oportunidades) `/opportunities`
- **Lista — tabla:** Oportunidad (título+ID) · Etapa · Cliente · Valor estimado ·
  Creada · Detalle. **StatCards:** Prospectos · En contacto · En negociación ·
  Ventas cerradas. Acciones "Nueva oportunidad", "Nueva cotización".
- **Etapas:** Prospecto · Contacto · Visita · Cotización · Negociación · Orden de
  facturación · Venta cerrada · Perdida.
- **Detalle:** Header con badge de etapa (color por etapa). Card (Cliente, Valor
  estimado, Fecha cierre esperada, Fecha cierre, Motivo de pérdida).
  NoraContextLauncher (IA).
- **Form nuevo:** Cliente*, Título*, Etapa* (8 opciones), Valor estimado.

### 4.8 Visits (Visitas) `/visits`
- **Lista — tabla:** Cliente · Estado · Agenda (fecha/hora) · Resumen · Detalle.
  **Filtros (tabs):** Todas · Hoy · Esta semana · Programadas · Completadas · Mías.
  **StatCards:** Programadas · Completadas · Canceladas · No realizadas. Acciones
  "Nueva visita", "Ver seguimientos".
- **Estados:** Programada · Completada · Cancelada · No realizada.
- **Detalle:** Header "Operación en campo" + badge. Métricas inline (Agenda,
  Registro #). Contexto (Cliente, Oportunidad, Fecha programada, Siguiente paso,
  Estado, Creada). Notas. Si programada → VisitActions. Si completada →
  "ReportGenerateButton" (reporte ejecutivo).
- **Form nuevo:** Cliente*, Oportunidad, Fecha y hora*, Resumen*, Notas,
  Siguiente paso.

### 4.9 Expenses (Gastos comerciales) `/expenses`
- **Lista — tabla:** Fecha · Comercial · Categoría · Monto · Contexto (cliente/
  visita) · Estado · Detalle. **StatCards:** Pendientes · En corrección · Aprobados ·
  Contabilizados. Resumen "$ reportados". Acciones "Nuevo gasto" + export (roles).
- **Estados:** Pendiente · En corrección · Aprobado · Rechazado · Contabilizado.
- **Detalle:** Header "[Categoría] $[Monto]" + badge. Métricas (Monto, Fecha,
  Registro). **Información del gasto** (Comercial, Categoría, Cliente, Visita,
  Descripción, Proveedor, NIT, Factura, Medio de pago, **IA** confianza%+modelo,
  Creado). **Revisión** (Estado, Revisado por, Fecha, Nota + ExpenseStatusAction:
  Aprobar/Pedir corrección/Rechazar/Contabilizar). **Soportes** (archivos).
- **Form nuevo/editar:** **"Leer factura con IA"** (extracción) · Fecha*, Categoría*
  (Alimentación, Transporte, Hospedaje, Combustible, Peajes, Parqueadero, Cliente/
  atención, Otros), Monto*, Proveedor, NIT, N° factura, Medio de pago, Cliente,
  Visita, Descripción*, Soporte* (JPEG/PNG/WebP/PDF).

### 4.10 Follow-ups (Seguimientos) `/follow-ups`
- **Lista — tabla:** Tarea (título+tipo) · Estado · Cliente · Vence · Detalle.
  **Filtros (tabs):** Todas · Pendientes · Vencidas · Completadas · Vencen hoy ·
  Mías. **StatCards:** Pendientes · Vencidas · Completadas · Vencen hoy. Acciones
  "Nueva tarea", "Ver visitas".
- **Estados:** Pendiente · Completada · Vencida.
- **Detalle:** Header + badge. Métricas (Vence, Canal, Registro). Contexto (Cliente,
  Oportunidad, Tipo, Vencimiento, Estado, Creada). Notas. Si no completada →
  "Marcar como completada".
- **Form nuevo:** Cliente*, Oportunidad, Tipo* (Llamada, Email, WhatsApp, Reunión,
  Recordatorio, Otro), Título*, Fecha y hora*, Notas.

### 4.11 Returns (Devoluciones) `/returns`
- **Lista — tabla:** Fecha · Cliente · Factura (o "Sin factura") · Motivo · Monto.
  **StatCards:** Devoluciones · Monto total · Con nota crédito. Acción "Nueva
  devolución". (Sin vista de detalle.)
- **Form nuevo:** Cliente*, Factura (opcional, muestra saldo y advierte si la nota
  crédito supera el saldo), Fecha, Monto*, Motivo*, Notas.

### 4.12 Billing-requests (Solicitudes de facturación) `/billing-requests`
- **Lista — tabla:** Solicitud (#+notas) · Cliente · Empresa · Origen · Oportunidad ·
  Estado (inline: Procesar/Rechazar si pendiente) · Creación. Acción "Crear
  solicitud" (modal, roles admin/director/facturación). Se auto-generan de
  cotizaciones/pedidos.
- **Modal nuevo:** Cliente*, Pedido origen, Cotización origen, Notas.

### 4.13 Companies (Empresas) `/companies`
- **Lista — tabla:** Nombre (+ razón social) · Prefijo (badge code-style) · NIT ·
  Estado. Acción "Nueva empresa".
- **Form nuevo/editar:** Nombre, Razón social, NIT, Prefijo (2-4 mayúsculas), Activa.
- **CompanySelect:** dropdown "Norgtech (NT)".

### 4.14 Segments (Segmentos) `/segments`
- **Lista — cards (grid):** Nombre · Descripción · Descuento X% · Meta $YYM–$ZZM.
  Acción "Nuevo segmento", "Editar" por card.
- **Form nuevo/editar:** Nombre, Descripción, Descuento %, Meta mínima $, Meta
  máxima $.

### 4.15 Zones (Zonas) `/zones`
- **Lista — tabla:** Nombre · Departamento · Estado. Acción "Nueva zona".
- **Form nuevo/editar:** Nombre*, Departamento, Activa.

### 4.16 Agenda `/agenda`
- **Tipo:** dashboard operativo (sin detalle/edición).
- **KPIs:** Compromisos de hoy · Vencidos/Urgente · Seguimientos pendientes ·
  Visitas programadas.
- **Tabs con contador:** Hoy · Esta semana · Vencidos/Urgente.
- **Cola (cards):** tipo (Visita/Seguimiento), título, cliente, fecha/hora, estado,
  badge de urgencia. Acciones "Nueva visita", "Nuevo seguimiento".

### 4.17 Reports (Reportes) `/reports`
- **Lista — tabla:** Reporte (título+ID) · Cliente · Generado por · Fecha · Detalle.
- **Detalle (6 secciones):** Diagnóstico · Problemas identificados (lista) · Solución
  propuesta (+siguientes pasos) · Costos (desglose + "Total primer año") · ROI (5
  cajas: Inversión, Ahorro anual, Beneficio total, ROI %, Recuperación) · Cotización
  (ítems + total). Acción "Descargar PDF". (Se generan desde visitas; sin form.)

### 4.18 Users (Usuarios) `/users`
- **Tipo:** gestión (form + tabla editable inline).
- **Nuevo usuario:** Nombre*, Email*, Teléfono* (E.164 +57…), Rol*. Muestra
  contraseña temporal (one-time, 60s).
- **Tabla "Usuarios activos":** Nombre (editable) · Email (+badge "Tu usuario") ·
  Teléfono (editable) · Rol (editable) · Estado (toggle+badge) · Actualizado. Edición
  inline guarda al perder foco. Roles vendedor expanden SellerGoalsManager.

### 4.19 WhatsApp `/whatsapp`
- **Tipo:** bandeja split-pane de 3 columnas (320px | flexible | 320px).
- **Izquierda — Conversaciones:** título "Conversaciones" + "{n} activas". Items:
  remitente + badge estado (Nuevo/Pendiente/En gestión/Resuelto), preview último
  mensaje, badge intent (pedido/cartera/logística/gasto/reclamo/otro) + usuario
  asignado, meta (cliente + tipo: cliente/comercial/admin/desconocido).
- **Centro — Hilo:** header (remitente + tipo + estado, teléfono). Burbujas: salientes
  derecha (gradiente primary, blanco, timestamp+estado entrega), entrantes izquierda
  (gris, oscuro). Composer: textarea "Responder por WhatsApp" + botón enviar.
- **Derecha — IA y pedido:** **Estado** (botones pendiente/en_gestión/resuelto).
  **Nora** (sugerencias): badges modo/intent/riesgo, resumen, motivo de bloqueo
  (rojo), campos faltantes (ámbar), bloque de automatización de pedido (empresa,
  zona, total), caso activo (tipo/estado/riesgo, última pregunta, ítems), respuesta
  sugerida, propuestas. **Pedido (Order Draft):** pedido vinculado + estado, "Caso
  listo para revisión" → "Crear pedido en revisión", preview JSON → "Crear pedido".

### 4.20 Nora (Asistente IA) `/nora`
- **Tipo:** chat full-height. Header (eyebrow "Asistente comercial", "Nora",
  descripción). Área de chat scroll + composer sticky con fade.
- **Banners:** contexto (nora 10%), éxito (esmeralda), error (rojo).
- **Burbujas:** usuario derecha (gradiente nora, "Tú"+hora), Nora izquierda (card +
  blur, icono nora gradiente + "Nora", **markdown**). Typing dots. Botón "Reintentar".
- **Modos especiales:**
  - **Clarification:** "Selecciona una opción" + botones nora.
  - **Agenda card:** items con badge prioridad (Vencida/Hoy/Esta semana), tipo,
    título, fecha.
  - **Query/Data card:** lista o detalle (icono + conteo, tags de contexto, filas
    Label|Valor).
  - **Proposal card:** "Propuesta de Nora" + badge (Borrador/Confirmada/con alertas),
    bloques expandibles (Interacción, Oportunidad, Seguimiento, Tarea interna,
    Señales comerciales, Cliente, Contacto, Cotización, Pedido…), cada bloque con
    checkbox "Guardar bloque", inputs/selects/datetime. Confirmación parcial/completa
    con lista de errores. Botón gradiente "Confirmar propuesta".
- **Composer:** textarea redondeada, placeholders de ejemplo en lenguaje natural,
  auto-resize, Ctrl+Enter envía, botón circular gradiente (paper-plane), hint
  "Escribe al menos 5 caracteres".
- **Empty state:** icono MessageSquare (glow), "Hola, soy Nora", ejemplos clicables.

---

## 5. Qué entregar (lo que se le pide a Claude Design)

1. **Sistema de tokens unificado** (light-first + dark): paleta neutra base,
   `--primary` azul Norgtech afinado, rol `--nora`/violeta aparte, escala de spacing,
   radios, **sombras en capas**, **escala tipográfica** (display/heading/body/caption/
   mono para números) y tokens de estado success/warning/danger/info.
2. **Re-diseño visual de las primitivas** (button, card, badge, input, table,
   data-table, stat-card, status-badge, filter-bar, page-header, section-card,
   detail-section, inline-metric, tabs, dialog/sheet).
3. **Patrones de pantalla** (cubren las 49 páginas): listado/tabla con KPIs+filtros ·
   detalle multi-sección · formularios (incl. line items dinámicos) · dashboards ·
   chat/IA (WhatsApp + Nora, con la identidad violeta).
4. Estilo Stripe/Mercury, light-first, consistente, legible en alta densidad.

## 6. Restricciones
- Sin cambiar lógica de negocio, endpoints ni data-fetching: **solo capa visual**.
- Sin dependencias nuevas (Tailwind v4 + shadcn + framer-motion + lucide + cva ya
  instalados).
- UI en español. Accesibilidad: contraste AA en texto y estados, en ambos modos.

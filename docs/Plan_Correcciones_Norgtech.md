# Plan de correcciones — QA Norgtech CRM

> Basado en `Incidencias_Norgtech_QA.md` (84 incidencias). El objetivo de este plan es **agrupar por causa raíz** en lugar de atacar incidencia por incidencia, porque muchas comparten el mismo origen y se resuelven de una sola vez.
>
> **Stack detectado:** monorepo pnpm — Frontend `apps/web` (Next.js App Router, un folder por módulo en `src/app/(app)/`), Backend `backend/app` (FastAPI + SQLAlchemy + Alembic, con `models / routers / schemas / services / commands`), agente IA en `agents/` (Nora + WhatsApp).

---

## 1. Principio de trabajo

En vez de 84 tickets sueltos, trabajamos **14 temas de causa raíz**. Resolver un tema suele cerrar varias incidencias a la vez. Cada tema indica su capa (Frontend / Backend / Ambos), las incidencias que cierra y los archivos probables donde vive el cambio.

> ⚠️ **Seguridad primero:** todo lo de permisos (Tema B) y dinero (Temas D y E) debe cerrarse antes de cualquier despliegue, porque hoy son explotables por un usuario con sesión válida.

---

## 2. Temas por causa raíz

### Tema A — Ciclo de vida de la sesión (token / refresh)
- **Incidencias:** AUTH-01, AUTH-02
- **Capa:** Ambos (interceptor en front + endpoint refresh en back)
- **Causa raíz:** el cliente HTTP no reacciona al `401 Invalid token`: ni renueva con refresh token ni redirige al login.
- **Enfoque:** un único interceptor de respuestas (en `apps/web/src/lib/*` — cliente axios/fetch) que ante 401 intente `POST /auth/refresh` una vez y, si falla, limpie sesión y redirija a `/login`. Verificar que el backend exponga y rote el refresh token correctamente.

### Tema B — Control de acceso por rol (RBAC) 🔒 *bloqueante*
- **Incidencias:** RBAC-01 … RBAC-14 (14 incidencias)
- **Capa:** Ambos — y esta es la clave: **hoy solo se oculta la UI, no se protege la API**.
- **Causa raíz:** faltan tres capas de defensa por rol: (1) visibilidad de menú/botones, (2) guardas de ruta ante navegación directa por URL, (3) autorización en los endpoints del backend.
- **Enfoque:**
  1. Definir una **matriz de permisos rol × recurso × acción** como única fuente de verdad (ej. `apps/web/src/lib/permissions.ts` + su espejo en backend).
  2. Front: guardas en `apps/web/src/middleware.ts` y/o layout por segmento para bloquear rutas de creación a roles no autorizados (cierra RBAC-04→12).
  3. Front: ocultar en el sidebar los módulos Empresas/Zonas y el botón "Ver facturación" según rol (RBAC-02, RBAC-03, RBAC-14) y la sección "Control comercial avanzado" para Comercial (RBAC-13).
  4. **Back: dependencia de autorización en cada router** (FastAPI `Depends`) que rechace con 403 aunque la UI se salte — esto es lo que realmente cierra el hueco de seguridad.
  5. Confirmar la regla de negocio de RBAC-01 (¿Director comercial debe poder crear empresas? — ver Decisiones abiertas).

### Tema C — Vencimiento por tiempo (visitas y seguimientos)
- **Incidencias:** VIS-01, VIS-02, FUP-01, FUP-02, FUP-03, FUP-04, FUP-05
- **Capa:** Backend (cálculo) + Frontend (contadores)
- **Causa raíz:** el estado "vencido / no realizada" depende del paso del tiempo, pero no se recalcula; y los contadores usan una lógica distinta a la de las listas.
- **Enfoque:** centralizar la regla de vencimiento. Opción recomendada: **estado derivado en la consulta** (comparar fecha límite vs. `now()` en el servicio/serializer) para que no dependa de un job. Si se requiere persistir el cambio de estado, agregar una tarea programada. Los contadores del dashboard/agenda deben consumir exactamente el mismo criterio que las listas (cierra también FUP-01/02 y AGEN-01).

### Tema D — Descuentos por segmento y cálculo de totales 💰 *bloqueante*
- **Incidencias:** QUO-01, QUO-02, QUO-03, ORD-04
- **Capa:** Backend (motor de precios) + Frontend (resumen)
- **Causa raíz:** el descuento por segmento/meta no se resuelve (aparece `NaN%`) y los totales no lo aplican; el mismo cálculo difiere entre formulario de creación y detalle.
- **Enfoque:** un **único servicio de pricing** en backend que reciba cliente/segmento/ítems y devuelva subtotal, descuento, IVA y total; el frontend solo lo consume y lo muestra (nunca recalcula por su cuenta). Esto alinea cotización creación ↔ detalle y pedido creación ↔ detalle.

### Tema E — Crédito del cliente en pedidos 💰 *bloqueante*
- **Incidencias:** ORD-01, ORD-02
- **Capa:** Backend
- **Causa raíz:** al crear pedido no se valida el cupo disponible ni se descuenta el crédito.
- **Enfoque:** en el servicio de creación de pedido, validar `total_pedido <= credito_disponible` (rechazar con mensaje claro si excede) y actualizar el crédito del cliente de forma transaccional. Definir si el crédito se libera al cancelar/devolver.

### Tema F — Empresa facturadora y prefijos de empresa
- **Incidencias:** ORD-03, ORD-05, BILL-03
- **Capa:** Backend (datos) + Frontend (visualización)
- **Causa raíz:** se está usando el cliente en lugar de la empresa facturadora, y no se concatena el prefijo de la empresa en los identificadores.
- **Enfoque:** corregir la relación pedido→empresa facturadora en el serializer/servicio y usar `prefijo_empresa` al componer el nombre de pedido y de solicitud de facturación.

### Tema G — Manejo y traducción de errores de validación 🌐
- **Incidencias:** CLI-02, PRD-01, BILL-01, BILL-02, COM-02, ORD-08, AUTH-03
- **Capa:** Ambos
- **Causa raíz:** los errores del backend (duplicados que revientan en 500, mensajes crudos en inglés) no se mapean a respuestas 4xx con mensaje en español, y el front muestra el string tal cual.
- **Enfoque:**
  - Back: capturar `IntegrityError` de NIT/SKU duplicado y responder 409 con mensaje descriptivo (cierra CLI-02, PRD-01); traducir/normalizar validaciones (`companyId should not be empty`, `prefix must be uppercase`, `Opportunity/Quote does not belong to customer`, `User is not an active eligible seller`).
  - Front: componente/util de manejo de errores que muestre el mensaje del backend en español de forma consistente.

### Tema H — Presentación de textos e i18n 🌐
- **Incidencias:** I18N-01, I18N-02, DASH-01, DASH-02, CLI-06
- **Capa:** Frontend (con catálogo de labels)
- **Causa raíz:** se muestran enums a nivel código (`visit.created`, `venta_cerrada`, roles) y formato inconsistente de porcentajes.
- **Enfoque:** un diccionario de etiquetas (roles, etapas, tipos de evento) → español con capitalización y orden correctos, y un helper de formato de porcentaje con 2 decimales. Aplicar en Actividad reciente, Historial 360, selde roles, etc.

### Tema I — Exportaciones (Gastos y otros) 🌐
- **Incidencias:** EXP-02, EXP-03
- **Capa:** Backend (generación del archivo) o Frontend (si se exporta en cliente)
- **Causa raíz:** headers con nombre técnico y fechas en ISO/UTC.
- **Enfoque:** mapear encabezados a nombres legibles y formatear fechas a `dd/mm/aaaa HH:mm` en la capa de exportación. Reutilizable para todos los módulos que exportan.

### Tema J — Contadores y agregaciones de dashboards/metas
- **Incidencias:** DASH-03, DASH-04, DASH-05, DASH-06, AGEN-01, AGEN-02, GOAL-01, GOAL-02, RET-02
- **Capa:** Backend (queries) + Frontend
- **Causa raíz:** filtros inconsistentes entre tarjetas-contador y listas; agregaciones que no filtran por empresa/rol/vendedor; pedidos sin vendedor asociado.
- **Enfoque:** revisar cada endpoint de métricas para que (a) respete la empresa seleccionada (DASH-05) y el rol (DASH-04), (b) el contador use el mismo filtro que la lista (AGEN-01/02, DASH-06, ventas cerradas), (c) el pedido persista el `vendedor_id` para que sume en metas (GOAL-02, corrige "Sin vendedor"). "Mi cola de trabajo" (DASH-03) y ubicación de metas (GOAL-01) se revisan aquí.

### Tema K — Campos y catálogos faltantes en formularios ✨
- **Incidencias:** CLI-01, CLI-03, CLI-04, CLI-05, ORD-06, OPP-02, QUO-04
- **Capa:** Ambos (algunos requieren endpoint de catálogo o campo nuevo)
- **Causa raíz:** faltan selectores/campos: "Asignado a" como catálogo de usuarios, categoría de cliente, selección de zona (cliente y pedido), motivo de pérdida en oportunidad, cambio de estado de cotización.
- **Enfoque:** agregar los campos en los formularios y exponer/consumir los catálogos correspondientes. QUO-04 (cambiar estado de cotización a "cerrado") es prerequisito para poder facturar, así que tiene prioridad dentro de este tema.

### Tema L — Registros inactivos que desaparecen
- **Incidencias:** ZON-01, COM-01
- **Capa:** Backend (query) + Frontend (badge)
- **Causa raíz:** el listado filtra por activo y excluye los inactivos en lugar de mostrarlos marcados.
- **Enfoque:** listar también inactivos con estado visible; separar "desactivar" de "eliminar".

### Tema M — IA Nora / WhatsApp 🤖
- **Incidencias:** AI-01 … AI-11 (11 incidencias)
- **Capa:** `agents/` (orquestación de la IA) + backend de tickets
- **Causa raíz:** el agente no ejecuta transiciones de estado, no persiste campos, no parsea fecha/hora/descripción y confunde flujos (editar vs. eliminar).
- **Enfoque:** trabajarlo como un bloque aparte: (1) transiciones de estado de pedido/ticket (AI-01, AI-02); (2) herramientas de edición de cliente con todos los campos (AI-03, AI-04, AI-05); (3) parsing de fecha/hora/descripción de visitas (AI-07, AI-08); (4) desambiguación de intención editar/eliminar y manejo de contexto entre mensajes (AI-09, AI-10); (5) registrar gastos por IA (AI-06); (6) "Resumen del cliente" (AI-11). Requiere pruebas conversacionales dedicadas.

### Tema N — Reglas de estado de pedido y facturación
- **Incidencias:** ORD-07, ORD-08, OPP-01, BILL-04
- **Capa:** Backend (máquina de estados)
- **Causa raíz:** transiciones de estado sin sus precondiciones (guía en "En tránsito"; facturación disparada en el estado equivocado; crear pedido con etapa de oportunidad "Contacto" o con cotización/oportunidad que no pertenece al cliente).
- **Enfoque:** formalizar la máquina de estados de pedido: exigir número de guía para pasar a "En tránsito" (ORD-07); permitir generar solicitud de facturación solo en "Orden de facturación" y que "Facturado" lo detone el proceso de facturación (BILL-04); validar coherencia oportunidad/cotización↔cliente con mensaje claro (ORD-08); revisar por qué la etapa "Contacto" bloquea el pedido (OPP-01).

### Tema O — Varios
- **Incidencias:** ORD-09 (cantidad en decimales → forzar enteros/step), OPP-03 (registrar oportunidad en el detalle de la visita), REP-01 (error al descargar PDF del reporte).
- **Capa:** según el caso.

---

## 3. Priorización y orden de ejecución

| Fase | Foco | Temas | Incidencias | Por qué primero |
|------|------|-------|-------------|-----------------|
| **P0 — Bloqueante** | Seguridad y dinero | B, E, D, A, F(parcial ORD-03), J(GOAL-02) | RBAC-*, ORD-01/02/03/04, QUO-01/02/03, AUTH-01/02, GOAL-02 | Explotable con sesión válida y afecta cifras de dinero/crédito. No liberar sin esto. |
| **P1 — Core funcional** | Flujos operativos | C, G, N, J(resto), F(resto) | Vencimientos VIS/FUP, errores/validaciones, estados de pedido/facturación, contadores dashboard, prefijos | Rompen operación diaria pero no son huecos de seguridad. |
| **P2 — UX / catálogos** | Presentación y campos | H, I, K, L, O | i18n, exportaciones, campos faltantes, inactivos, ORD-09/OPP-03/REP-01 | Mejoran usabilidad y consistencia; bajo riesgo. |
| **P3 — IA** | Nora / WhatsApp | M | AI-01…AI-11 | Bloque independiente con pruebas propias; puede correr en paralelo. |

## 4. Estrategia de implementación

1. **Rama por fase o por tema** (worktrees), para revisar y probar en bloques coherentes en lugar de un PR gigante.
2. **Backend primero en los temas de seguridad y dinero** (B, D, E): la protección real vive en la API; la UI es secundaria.
3. **Utilidades compartidas antes que parches puntuales:** matriz de permisos (B), servicio de pricing (D), manejo de errores (G), diccionario de labels (H) y helper de vencimiento (C) se construyen una vez y se reutilizan.
4. **Pruebas por fase:** para P0 conviene test automatizado (hay Playwright en `apps/web` y pytest en backend) que verifique 403 por rol, tope de crédito y totales con descuento. Reusar las 6 credenciales de prueba del reporte para validar RBAC.
5. **Regresión con el propio reporte:** cada incidencia cerrada se re-verifica con el escenario descrito en el PDF.

## 5. Decisiones abiertas (necesito tu confirmación)

1. **RBAC-01:** ¿el **Director comercial** debería poder crear empresas, o es correcto que hoy no pueda? (define si es bug o comportamiento esperado).
2. **Crédito (Tema E):** cuando un pedido se cancela o hay una devolución, ¿el crédito del cliente se debe **reponer** automáticamente?
3. **Vencimientos (Tema C):** ¿prefieres estado **derivado en consulta** (más simple, sin infra) o persistir el cambio con una **tarea programada** (permite disparar notificaciones)?
4. **Facturación (BILL-04):** confírmame la máquina de estados objetivo: `... → Orden de facturación → (procesar) → Facturado`. ¿Algún estado intermedio adicional?
5. **Alcance de esta iteración:** ¿quieres que arranque implementando la **Fase P0** ya (en una rama/worktree), o prefieres primero revisar y ajustar este plan?

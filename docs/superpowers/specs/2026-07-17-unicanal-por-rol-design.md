# Unicanal por rol — diseño

Fecha: 2026-07-17
Estado: aprobado (pendiente review del spec escrito)
Rama: `feat/unicanal-rol`

## Problema

Un cliente escribe por WhatsApp. Hoy lo atiende Nora (customer agent, solo lectura) y, cuando necesita un humano, la conversación se deriva a **un único usuario buzón** (`NORA_UNICANAL_USER_ID`). Eso no sirve cuando el cliente necesita hablar con **un área concreta** ("quiero un técnico", "cómo va mi pedido y quiero hablar con el encargado", una duda de facturación, un tema de entrega).

Queremos que el cliente, al expresar la intención, quede ruteado al **rol** correcto; que a las personas de ese rol les llegue una **notificación en el dashboard** y la conversación aparezca en su **bandeja del módulo de WhatsApp**, donde responden. `administrador` y `director_comercial` **no atienden** este canal (solo supervisan).

## Qué ya existe (no se reconstruye)

- **Persistencia completa** de WhatsApp vía Kapso: `WhatsAppAccount`, `WhatsAppConversation`, `WhatsAppMessage`, `WhatsAppInternalNote`, tags, `NoraActionLog`, `NoraConversationCase`.
- **Entrada**: webhook `POST /whatsapp/webhooks/kapso` → `KapsoWebhookService` (upsert cuenta/conversación + mensaje inbound) → `noraRoutingService.routeInboundMessage`.
- **Customer agent + handoff**: Nora (Python, stateless, solo lectura) expone el tool `derivar_a_unicanal(motivo, intent)`; NestJS ejecuta la derivación (asignación + nota interna + mensaje de espera al cliente). Gated por `NORA_WHATSAPP_CUSTOMER_AGENT`.
- **Short-circuit "Nora se calla"** (`nora-routing.service.ts:257-263`): si un cliente escribe y la conversación ya está asignada a un humano y en gestión, Nora no responde.
- **Respuesta humana saliente**: `POST /whatsapp/conversations/:id/messages` → `sendMessage` → `persistAndDispatch` (crea mensaje outbound, despacha por Kapso). El composer del web ya lo usa.
- **RBAC**: `@Roles(...)` + `RolesGuard`. El controller de WhatsApp hoy: `@Roles("administrador","comercial","director_comercial")`.
- **Web inbox** (`apps/web/.../whatsapp/`): lista + hilo + composer + panel de cliente. Refresca **solo por acción del usuario** (sin polling).

## Roles

Enum Prisma `UserRole`: `administrador | director_comercial | comercial | tecnico | facturacion | logistica`.

- **Agentes** (reciben ruteo, notificación y bandeja de su rol): `comercial`, `tecnico`, `facturacion`, `logistica`.
- **Supervisores** (ven todas las conversaciones, no atienden, sin notificación ni ruteo): `administrador`, `director_comercial`.

## Decisión: mecanismo de notificación

**Conteo derivado + polling.** La notificación es un número derivado —*conversaciones pendientes sin tomar de mi rol*— servido por un endpoint y consultado por dashboard e inbox cada ~15s. **Sin modelo `Notification`, sin SSE/websocket.**

Alternativas descartadas: modelo `Notification` persistente (leído/no-leído, historial) — YAGNI hoy, se agrega encima sin tirar nada si hace falta un centro de notificaciones a nivel app; tiempo real SSE/websocket — no hay infra y es sobredimensionado para pocos agentes internos.

## Diseño

### 1. Modelo — una columna nueva

`WhatsAppConversation.assignedToRole: UserRole?` (nullable, indexado junto con `status`).

Ciclo de asignación:
- **Derivada por Nora**: `status = pendiente`, `assignedToRole = <rol>`, `assignedToUserId = null`.
- **Tomada por un agente**: `assignedToUserId = <yo>`, `status = en_gestion`. `assignedToRole` se conserva (define de qué cola salió).
- **Resuelta**: `status = resuelto` (flujo actual).

Se reusan los estados existentes `nuevo → pendiente → en_gestion → resuelto`. No se agregan estados.

### 2. Nora — customer agent

- El tool `derivar_a_unicanal` gana el parámetro **`rol`** (uno de `comercial | tecnico | facturacion | logistica`). Firma: `derivar_a_unicanal(motivo, rol)` (el `intent` actual se mantiene o se subsume en `motivo`).
- El prompt del customer agent mapea la intención del cliente a un rol:
  - "quiero/necesito un técnico", soporte, instalación, falla → `tecnico`
  - factura, pago, cartera, comprobante → `facturacion`
  - entrega, envío, transporte, dónde está mi pedido (logística) → `logistica`
  - compra, cotización, hablar con mi vendedor/asesor → `comercial`
- **Si la intención es ambigua, Nora pregunta al cliente** antes de derivar (no adivina el rol).
- Se conserva el self-service actual: Nora sigue respondiendo lecturas (estado de pedido, etc.) y solo deriva cuando el cliente lo pide o cuando no puede resolver.

Contrato de respuesta (`WhatsAppAgentResponse.handoff`): se agrega `rol` junto a `needed`/`reason`.

### 3. NestJS — ejecución de la derivación

En la rama del customer agent (`nora-routing.service.ts`):
- Reemplazar la asignación a `NORA_UNICANAL_USER_ID` por: `assignedToRole = handoff.rol`, `assignedToUserId = null`, `status = pendiente`.
- Conservar: nota interna con motivo, mensaje de espera al cliente.
- `NORA_UNICANAL_USER_ID` deja de usarse en este flujo. Si `handoff.rol` viniera vacío/ inválido, **no** se cae al buzón único: no se deriva y el customer agent re-pregunta el área en el siguiente turno (mismo camino que "intención ambigua"). El env se retira del path del customer agent.

Short-circuit "Nora se calla" (`:257-263`): ampliar la condición a **`assignedToRole != null` OR `assignedToUserId != null`**. Una vez ruteada a un rol, la conversación es de un humano aunque nadie la haya tomado todavía; Nora no debe responder encima.

### 4. Web — inbox por rol

- **Query filtrada por rol** (en el servicio, no en el cliente):
  - Agente: conversaciones con `assignedToRole = miRol` — las pendientes sin tomar **más** las tomadas por cualquiera de su rol (mostradas como "tomada por X").
  - Supervisor (`administrador`, `director_comercial`): todas las conversaciones.
- **Botón "Tomar"** en las conversaciones sin dueño (`assignedToUserId = null`): fija `assignedToUserId = yo`, `status = en_gestion`. Endpoint dedicado (p. ej. `POST /whatsapp/conversations/:id/claim`) con verificación de que el usuario pertenece al rol de la cola (o es supervisor).
- **Polling ~15s** en el inbox para que las nuevas aparezcan solas (hoy solo refresca por acción).
- Mostrar dueño/estado de asignación en la lista y el hilo (hoy `assignedToUserId` existe pero no se muestra).

### 5. Notificación

- Endpoint `GET /whatsapp/conversations/pending-count`: cantidad de conversaciones `pendiente` con `assignedToRole = miRol` y `assignedToUserId = null`. Para supervisores devuelve 0 (no atienden).
- **Dashboard**: badge/indicador que consume ese endpoint (~15s) y linkea al módulo de WhatsApp.
- El inbox usa el mismo dato para su badge de "pendientes".

### 6. RBAC

- Guard del controller de WhatsApp: incluir los **6 roles** (agregar `tecnico`, `facturacion`, `logistica`; conservar `administrador`, `director_comercial`, `comercial`).
- El **filtrado efectivo vive en el servicio** por rol: agente ve su cola; supervisor ve todo. Nora nunca setea `assignedToRole` en `administrador`/`director_comercial`.

## Fuera de alcance (YAGNI)

Historial leído/no-leído, notificaciones en tiempo real, reasignación manual entre roles, round-robin/reparto automático a personas, métricas de atención (tiempos de respuesta, SLA). Se agregan si aparece la necesidad real.

## Testing

**API e2e** (`apps/api/test/whatsapp.e2e-spec.ts`, jest `--runInBand`):
- Derivar con intención de técnico fija `assignedToRole = tecnico`, `status = pendiente`, `assignedToUserId = null`.
- Un agente de **otro** rol NO ve esa conversación en su listado; un `tecnico` sí; un supervisor sí.
- "Tomar" fija `assignedToUserId` y pasa a `en_gestion`; un agente de otro rol no puede tomarla.
- Tras el ruteo (aún sin tomar), un nuevo mensaje del cliente **no** dispara respuesta de Nora (short-circuit ampliado).
- `pending-count` cuenta solo lo pendiente-sin-tomar del rol propio; supervisor → 0.

**Nora pytest** (`agents/nora/tests/`):
- Mapeo intención→rol para los 4 roles.
- Intención ambigua → Nora pregunta, no llama `derivar_a_unicanal`.

**TZ**: no aplica lógica de fechas nueva; sin trampas de zona horaria en este cambio.

## Dependencias operativas

- El flujo depende del flag `NORA_WHATSAPP_CUSTOMER_AGENT` (customer agent). Confirmar que está ON en el entorno donde se quiera el unicanal por rol.
- Migración Prisma para la columna `assignedToRole` (+ índice). No hay backfill: conversaciones viejas quedan con `assignedToRole = null` (siguen visibles para supervisores; las que tengan `assignedToUserId` siguen con su dueño).

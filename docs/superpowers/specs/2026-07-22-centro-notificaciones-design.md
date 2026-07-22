# Centro de notificaciones — diseño

Fecha: 2026-07-22
Estado: aprobado en brainstorming (pendiente review del spec escrito)

## Problema

La campana del topbar (`apps/web/src/components/topbar.tsx:64-68`) es markup muerto del template Enterprise: un `<button>` sin `onClick` y un punto rojo hardcodeado que siempre está encendido. Nunca se conectó a nada.

El spec de unicanal por rol (`2026-07-17-unicanal-por-rol-design.md:32`) decidió "conteo derivado + polling, sin modelo `Notification`", y descartó un centro de notificaciones por YAGNI. Esa decisión resolvía **un** evento (conversación de WhatsApp pendiente de mi rol) y se implementó como badge en el ítem de WhatsApp del sidebar. No cubre el caso que aparece ahora: **varios tipos de evento de negocio que un usuario necesita ver en un solo lugar**.

Este spec agrega ese centro encima de lo existente. El badge de WhatsApp del sidebar se mantiene como está.

## Alcance v1

Seis tipos (los cuatro casos pedidos, con "vencido" partido en visita y seguimiento porque son entidades distintas, más el gasto comercial):

| Tipo | Qué es | Naturaleza |
|---|---|---|
| `meta_cumplida` | Un cliente alcanzó su meta comercial del periodo | derivado del tiempo (cron) |
| `pedido_hito` | Un pedido pasó a `facturado`, `despachado` o `entregado` | evento (write path) |
| `cliente_asignado` | Te asignaron un cliente | evento (write path) |
| `visita_vencida` | Pasó la fecha de la visita y nadie registró nada | derivado del tiempo (cron) |
| `seguimiento_vencido` | Pasó `dueAt` de la tarea y sigue sin resolver | derivado del tiempo (cron) |
| `gasto_resuelto` | Un gasto comercial fue aprobado o rechazado | evento (write path) |

Los tres tipos de "evento" se escriben en el instante del cambio. Los tres derivados del tiempo son la *ausencia* de un evento: alguien tiene que salir a buscarlos.

Fuera de v1, se agregan encima sin tirar nada: preferencias por usuario de qué notificar, agrupación ("3 pedidos cambiaron"), tiempo real (SSE/websocket), **envío por correo a los implicados en un pedido** (se cuelga leyendo la misma fila, que ya tiene destinatario y texto).

## Modelo

```prisma
enum NotificationType {
  meta_cumplida
  pedido_hito
  cliente_asignado
  visita_vencida
  seguimiento_vencido
  gasto_resuelto
}

model Notification {
  id         String           @id @default(cuid())
  userId     String
  type       NotificationType
  title      String
  body       String?
  entityType String           // "order" | "customer" | "visit" | "follow_up_task" | "customer_goal" | "commercial_expense"
  entityId   String
  dedupeKey  String           @unique
  readAt     DateTime?
  createdAt  DateTime         @default(now())
  user       User             @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, readAt, createdAt])
}
```

### `dedupeKey` — el eje del diseño

Formato: `${userId}:${type}:${entityId}:${discriminante}`.

| Tipo | Discriminante | Efecto |
|---|---|---|
| `pedido_hito` | el estado (`facturado`) | los tres hitos del mismo pedido conviven |
| `meta_cumplida` | `periodValue` de la meta | una por periodo, no una por corrida |
| `gasto_resuelto` | el estado resultante | aprobado y rechazado no se pisan |
| `visita_vencida`, `seguimiento_vencido` | ninguno | **una por entidad**, no una por día vencido |
| `cliente_asignado` | ninguno | una por (usuario, cliente): quitarte un cliente y devolvértelo no re-notifica. Aceptado — es raro y el costo de equivocarse es un aviso de menos, no uno repetido |

Consecuencias, todas deliberadas:

- **Cron idempotente por construcción.** Correrlo dos veces choca contra el índice único; con `createMany({ skipDuplicates: true })` la segunda corrida es un no-op.
- **Multi-instancia sin lock distribuido.** Si el API corre con réplicas, dos crons simultáneos son inocuos: la unicidad *es* el lock.
- **Los vencidos no se acumulan.** Una visita vencida hace 30 días produjo una notificación, no treinta.

### Texto guardado, no plantilla

`title`/`body` se escriben ya renderizados. "Pedido NN-1042 pasó a facturado" sigue siendo verdad dentro de un mes aunque el pedido ya esté entregado; renderizar al leer mostraría el estado de hoy, que es otra afirmación.

### Sin columna de URL

El link se deriva en el front desde `entityType` + `entityId` con una función (`notificationHref`). Si cambia la ruta de un módulo, se cambia en un lugar y las filas históricas siguen navegando bien.

## Destinatarios

Cada fila apunta a un `userId` concreto. Un evento con varios destinatarios produce varias filas (fan-out en el emisor), no una fila compartida: leído/no-leído por fila es inequívoco.

Un helper `recipientsFor(type, entity)` centraliza la regla:

| Tipo | Dueño | Copia a `administrador` / `director_comercial` |
|---|---|---|
| `meta_cumplida` | comercial asignado al cliente | **sí** |
| `pedido_hito` | comercial del cliente del pedido | no |
| `cliente_asignado` | el nuevo asignado | no |
| `visita_vencida` | `assignedToUserId` de la visita | no |
| `seguimiento_vencido` | `assignedToUserId` de la tarea | no |
| `gasto_resuelto` | quien reportó el gasto | no |

`meta_cumplida` es el único que es noticia hacia arriba. En los otros el supervisor o ya lo sabe (él asignó el cliente, él resolvió el gasto) o ya lo tiene en el dashboard (los vencidos). Copiar todo a los supervisores les llena la campana de ruido y dejan de mirarla, que es la forma más común de matar un centro de notificaciones. Se amplía tipo por tipo si aparece la necesidad.

Si una entidad no tiene responsable (`assignedToUserId = null`), no se emite nada: no hay a quién notificar.

## Generación

### Write path — `NotificationsService.emit(tx, {...})`

`NotificationsModule` exporta el servicio; tres servicios existentes lo inyectan y lo llaman en la línea donde ya escriben el cambio, **pasando el cliente de transacción de Prisma**. La notificación vive en la misma transacción que el cambio: si el update falla, no queda notificación fantasma.

| Disparador | Servicio | Condición |
|---|---|---|
| `Order.status` entra a `facturado`/`despachado`/`entregado` | `orders.service` | el estado **cambió** a uno de los tres |
| `Customer.assignedToUserId` toma un valor nuevo | `customers.service` | el valor **cambió** y el nuevo no es null |
| `CommercialExpense` pasa a aprobado/rechazado | `commercial-expenses.service` | el estado **cambió** |

En los tres la condición es *cambió*, no *es*: hay que comparar contra el valor previo, que los tres servicios ya leen antes de actualizar. Emitir sobre *es* re-notificaría en cada guardado.

Se descartaron: `@nestjs/event-emitter` (dependencia nueva para tres llamadas, y un evento sin listener falla en silencio — al renombrar el string la notificación desaparece sin que ningún test se entere) y una extensión de Prisma que intercepte los `update` (el disparador queda invisible para quien lee `orders.service`, y detectar el cambio exige leer el valor previo en cada update de todos modos).

### Cron diario

`ScheduleModule.forRoot()` + `@Cron("0 7 * * *", { timeZone: "America/Bogota" })`. Barre:

1. **Visitas vencidas** — `visitOverdueWhere(now)` de `apps/api/src/shared/overdue.ts`.
2. **Seguimientos vencidos** — `followUpTaskOverdueWhere(now)` del mismo módulo.
3. **Metas cumplidas** — metas del periodo en curso cuyo acumulado alcanza el objetivo, reusando el cálculo de `customer-goals.service.ts:122-141` (suma de pedidos `facturado|entregado` del periodo). Ese cálculo se extrae a un método reutilizable en `CustomerGoalsService` para no duplicar la regla.

Inserta con `createMany({ skipDuplicates: true })`.

**Restricción dura: el cron solo inserta en `Notification`. No toca `status` de ninguna entidad.**

`apps/api/src/shared/overdue.ts:5` documenta que en este repo no hay scheduler y que, por tanto, el paso del tiempo no puede cambiar ninguna columna — de ahí que "vencido" se derive en lectura. Meter un cron rompe esa premisa si se descuida. Se mantiene así: `Visit.status` sigue cambiando solo cuando lo cambia un humano, y `overdue.ts` sigue siendo la única definición de "vencido"; el cron la **consume**, no la duplica. El comentario de cabecera de `overdue.ts` se actualiza para decir que existe un cron y que solo escribe notificaciones — si no, el próximo que lo lea creerá que la documentación miente.

**Retención:** la misma corrida borra las leídas con `readAt` de más de 60 días. Sin eso la tabla solo crece.

## API

Módulo `notifications`, con `JwtAuthGuard` y **sin** `@Roles`: cada usuario ve las suyas y solo las suyas. Todas las consultas filtran por `userId = user.id`; un supervisor no puede leer la campana ajena.

```
GET   /notifications?unread=true&limit=20   lista, más reciente primero
GET   /notifications/unread-count           { count }
PATCH /notifications/:id/read               marca una
POST  /notifications/read-all               marca todas las del usuario
```

`PATCH /notifications/:id/read` valida que la fila pertenezca al usuario antes de escribir (404 si no, no 403: no se confirma la existencia de notificaciones ajenas).

## Web

**Campana** (`apps/web/src/components/topbar.tsx:64-68`): pasa de `<button>` inerte a `DropdownMenu` — ya está importado en ese archivo para el menú de usuario, no se agrega dependencia. El punto rojo se muestra **solo si `count > 0`**; hoy está encendido siempre, que es peor que no tenerlo. El panel lista las últimas 20; clic en un ítem marca leída y navega a la entidad vía `notificationHref`. Acción "marcar todas como leídas" en el encabezado del panel.

**Polling:** `sidebar-nav.tsx:131-147` ya tiene un `useEffect` que consulta un contador cada 15s para el badge de WhatsApp. Se extrae a `use-poll-count.ts` y lo usan los dos (badge de WhatsApp y campana). No se escribe un segundo poll.

## Verificación

Tres checks, no una suite:

1. **Idempotencia del barrido** — correr el cron dos veces sobre los mismos datos deja **una** fila por entidad. Es el test que justifica el diseño entero del `dedupeKey`.
2. **`recipientsFor` por tipo** — `meta_cumplida` incluye supervisores; los otros cinco no.
3. **Cron con `now` inyectado** — el barrido recibe la fecha como parámetro, igual que ya hacen las funciones de `overdue.ts`. Nada de depender del reloj real.

Los emisores del write path se cubren en los tests existentes de cada servicio: cambiar el estado de un pedido a `facturado` deja una fila; guardarlo de nuevo sin cambiar estado no deja una segunda.

## Riesgos conocidos

- **Ruido.** El límite real de este diseño es la atención del usuario, no la técnica. Si la campana se llena, la gente deja de abrirla y el sistema vale cero. Por eso v1 es conservador con los supervisores y con los hitos de pedido (3 de 5 transiciones).
- **El cron es infraestructura nueva en un repo que no la tenía.** Si el API se despliega con varias réplicas, corren varios crons; el `dedupeKey` lo vuelve inocuo, pero conviene confirmar cuántas réplicas hay antes de asumirlo resuelto.

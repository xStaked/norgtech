# Centro de notificaciones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir la campana muerta del topbar en un centro de notificaciones persistente con seis tipos de evento de negocio.

**Architecture:** Tabla `Notification` con una fila por (usuario, evento) y `dedupeKey` único. Tres tipos se escriben en el write path de los servicios existentes, dentro de la misma transacción del cambio (mismo patrón que `AuditService.record`); tres se descubren en un cron diario que **solo inserta notificaciones y nunca toca columnas de estado**. El front consulta un contador cada 15s reusando el poll que ya existe en el sidebar.

**Tech Stack:** NestJS 11, Prisma 6 (PostgreSQL), `@nestjs/schedule` (dependencia nueva), Next.js App Router, Jest + supertest con stubs de Prisma por spec.

Spec: `docs/superpowers/specs/2026-07-22-centro-notificaciones-design.md`

## Global Constraints

- **El cron no escribe columnas de estado.** Solo inserta en `Notification` y borra leídas viejas. `Visit.status` / `FollowUpTask.status` siguen cambiando solo por acción humana, y `apps/api/src/shared/overdue.ts` sigue siendo la única definición de "vencido".
- **Todas las consultas del API filtran por `userId = user.id`.** Nadie lee la campana ajena.
- **Zona horaria `America/Bogota`** en todo cálculo de fecha, vía `BOGOTA_TIME_ZONE` de `apps/api/src/shared/overdue.ts`. Nunca la zona del proceso.
- **Textos de usuario en español**, sin tildes rotas. Los identificadores de código en inglés, como el resto del repo.
- **Tests:** el runner solo recoge `apps/api/test/*.e2e-spec.ts` (ver `apps/api/test/jest-e2e.json`). Un test unitario también debe llamarse así para ejecutarse.
- **Comando de test:** `pnpm --filter @norgtech/api test`. Un archivo suelto: `pnpm --filter @norgtech/api test -- --testPathPattern <nombre>`.

## File Structure

**Crear**
- `apps/api/src/modules/notifications/notifications.service.ts` — `emit()`, resolución de destinatarios, `dedupeKeyFor()`, y las consultas de lectura/marcado.
- `apps/api/src/modules/notifications/notifications.controller.ts` — los cuatro endpoints.
- `apps/api/src/modules/notifications/notifications.module.ts` — provee y exporta el servicio.
- `apps/api/src/modules/notifications/notifications.cron.ts` — el barrido diario.
- `apps/api/test/notifications-service.e2e-spec.ts` — destinatarios e idempotencia.
- `apps/api/test/notifications-cron.e2e-spec.ts` — barrido con `now` inyectado.
- `apps/web/src/lib/use-poll-count.ts` — hook de poll compartido.
- `apps/web/src/components/notification-bell.tsx` — la campana.

**Modificar**
- `apps/api/prisma/schema.prisma` — enum `NotificationType`, modelo `Notification`, relación en `User`.
- `apps/api/src/app.module.ts` — `ScheduleModule.forRoot()` + `NotificationsModule`.
- `apps/api/src/shared/overdue.ts:5-22` — el comentario que afirma que no hay scheduler.
- `apps/api/src/modules/orders/orders.service.ts:406-475` — emisor de `pedido_hito`.
- `apps/api/src/modules/orders/orders.module.ts` — importar `NotificationsModule`.
- `apps/api/src/modules/customers/customers.service.ts:30-100,133-225` — emisor de `cliente_asignado`.
- `apps/api/src/modules/customers/customers.module.ts` — importar `NotificationsModule`.
- `apps/api/src/modules/commercial-expenses/commercial-expenses.service.ts:340-422` — emisor de `gasto_resuelto`.
- `apps/api/src/modules/commercial-expenses/commercial-expenses.module.ts` — importar `NotificationsModule`.
- `apps/api/src/modules/customer-goals/customer-goals.service.ts` — hacer público `getPeriodRange`.
- `apps/web/src/components/topbar.tsx:64-68` — sustituir el botón inerte.
- `apps/web/src/components/sidebar-nav.tsx:131-147` — usar el hook compartido.

**Desviación respecto del spec, deliberada:** `meta_cumplida` guarda `entityType: "customer"` con `entityId = customerId` (no `customer_goal`), porque la navegación va al detalle del cliente y no existe pantalla de meta. El `dedupeKey` ya lleva el tipo, así que no colisiona con `cliente_asignado`. El discriminante es el `periodValue`.

---

### Task 1: Modelo `Notification` y `NotificationsService.emit`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/modules/notifications/notifications.service.ts`
- Create: `apps/api/src/modules/notifications/notifications.module.ts`
- Test: `apps/api/test/notifications-service.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrismaService` de `apps/api/src/prisma/prisma.service`.
- Produces:
  - `dedupeKeyFor(userId: string, type: NotificationType, entityId: string, discriminator?: string): string`
  - `SUPERVISED_TYPES: NotificationType[]`
  - `NotificationsService.emit(input: EmitInput, writer?: NotificationWriter): Promise<{ count: number }>`
  - `interface EmitInput { userIds: string[]; type: NotificationType; title: string; body?: string; entityType: string; entityId: string; discriminator?: string }`
  - `type NotificationWriter = Pick<PrismaService, "notification" | "user"> | Prisma.TransactionClient`
  - `NotificationsModule` exporta `NotificationsService`.

- [ ] **Step 1: Añadir el enum y el modelo al schema**

En `apps/api/prisma/schema.prisma`, junto a los demás enums (después de `enum NoraCaseRiskLevel`):

```prisma
enum NotificationType {
  meta_cumplida
  pedido_hito
  cliente_asignado
  visita_vencida
  seguimiento_vencido
  gasto_resuelto
}
```

Al final del archivo:

```prisma
model Notification {
  id         String           @id @default(cuid())
  userId     String
  type       NotificationType
  title      String
  body       String?
  entityType String
  entityId   String
  /// `${userId}:${type}:${entityId}:${discriminante}`. El indice unico es lo
  /// que hace idempotente al cron: correrlo dos veces choca y no duplica, y
  /// con varias replicas del API hace de lock sin lock distribuido.
  dedupeKey  String           @unique
  readAt     DateTime?
  createdAt  DateTime         @default(now())
  user       User             @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, readAt, createdAt])
}
```

Y dentro de `model User`, junto a las demás relaciones (después de `sellerGoals SellerGoal[]`):

```prisma
  notifications                 Notification[]
```

- [ ] **Step 2: Generar la migración**

```bash
pnpm --filter @norgtech/api exec prisma migrate dev --name add_notification
```

Esperado: crea `apps/api/prisma/migrations/<timestamp>_add_notification/migration.sql` con el `CREATE TYPE "NotificationType"`, el `CREATE TABLE "Notification"` y el `CREATE UNIQUE INDEX "Notification_dedupeKey_key"`. Verificar que el índice único aparece — sin él todo el diseño se cae.

- [ ] **Step 3: Escribir el test que falla**

Crear `apps/api/test/notifications-service.e2e-spec.ts`. No levanta la app: prueba el servicio directo contra un almacén en memoria que respeta la unicidad de `dedupeKey`, que es justo el comportamiento bajo prueba.

```ts
import { NotificationType, UserRole } from "@prisma/client";
import {
  NotificationsService,
  dedupeKeyFor,
} from "../src/modules/notifications/notifications.service";

interface Row {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  entityType: string;
  entityId: string;
  dedupeKey: string;
}

/** Stub de Prisma que aplica el indice unico sobre `dedupeKey`. */
function makePrismaStub(rows: Row[]) {
  return {
    notification: {
      createMany: async ({
        data,
        skipDuplicates,
      }: {
        data: Row[];
        skipDuplicates?: boolean;
      }) => {
        let count = 0;
        for (const row of data) {
          const exists = rows.some((r) => r.dedupeKey === row.dedupeKey);
          if (exists) {
            if (!skipDuplicates) throw new Error("Unique constraint failed");
            continue;
          }
          rows.push(row);
          count++;
        }
        return { count };
      },
    },
    user: {
      findMany: async () => [
        { id: "admin-1" },
        { id: "director-1" },
      ],
    },
  };
}

describe("NotificationsService.emit", () => {
  it("no duplica cuando se emite dos veces el mismo evento", async () => {
    const rows: Row[] = [];
    const service = new NotificationsService(
      makePrismaStub(rows) as never,
    );

    const input = {
      userIds: ["seller-1"],
      type: NotificationType.visita_vencida,
      title: "Visita vencida: Agro Norte",
      entityType: "visit",
      entityId: "visit-1",
    };

    await service.emit(input);
    await service.emit(input);

    expect(rows).toHaveLength(1);
    expect(rows[0].dedupeKey).toBe(
      dedupeKeyFor("seller-1", NotificationType.visita_vencida, "visit-1"),
    );
  });

  it("distingue los hitos del mismo pedido por el discriminante", async () => {
    const rows: Row[] = [];
    const service = new NotificationsService(
      makePrismaStub(rows) as never,
    );

    for (const status of ["facturado", "despachado", "entregado"]) {
      await service.emit({
        userIds: ["seller-1"],
        type: NotificationType.pedido_hito,
        title: `Pedido NN-1 paso a ${status}`,
        entityType: "order",
        entityId: "order-1",
        discriminator: status,
      });
    }

    expect(rows).toHaveLength(3);
  });

  it("copia a los supervisores solo en meta_cumplida", async () => {
    const rows: Row[] = [];
    const service = new NotificationsService(
      makePrismaStub(rows) as never,
    );

    await service.emit({
      userIds: ["seller-1"],
      type: NotificationType.meta_cumplida,
      title: "Agro Norte cumplio su meta",
      entityType: "customer",
      entityId: "customer-1",
      discriminator: "2026",
    });

    expect(rows.map((r) => r.userId).sort()).toEqual([
      "admin-1",
      "director-1",
      "seller-1",
    ]);

    rows.length = 0;

    await service.emit({
      userIds: ["seller-1"],
      type: NotificationType.pedido_hito,
      title: "Pedido NN-1 paso a facturado",
      entityType: "order",
      entityId: "order-1",
      discriminator: "facturado",
    });

    expect(rows.map((r) => r.userId)).toEqual(["seller-1"]);
  });

  it("no escribe nada cuando no hay destinatario", async () => {
    const rows: Row[] = [];
    const service = new NotificationsService(
      makePrismaStub(rows) as never,
    );

    const result = await service.emit({
      userIds: [],
      type: NotificationType.visita_vencida,
      title: "Visita vencida",
      entityType: "visit",
      entityId: "visit-9",
    });

    expect(result.count).toBe(0);
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Correr el test y verificar que falla**

```bash
pnpm --filter @norgtech/api test -- --testPathPattern notifications-service
```

Esperado: FAIL — `Cannot find module '../src/modules/notifications/notifications.service'`.

- [ ] **Step 5: Implementar el servicio**

Crear `apps/api/src/modules/notifications/notifications.service.ts`:

```ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { NotificationType, Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Escritor aceptado por `emit`. Igual que `AuditService.record`, admite el
 * cliente de transaccion para que la notificacion viva dentro de la misma
 * transaccion que el cambio que la origina: si el update falla, no queda
 * notificacion fantasma.
 */
export type NotificationWriter =
  | Pick<PrismaService, "notification" | "user">
  | Prisma.TransactionClient;

export interface EmitInput {
  userIds: string[];
  type: NotificationType;
  title: string;
  body?: string;
  entityType: string;
  entityId: string;
  /**
   * Parte final del `dedupeKey`. Sirve para que varios eventos de la misma
   * entidad convivan: el estado en `pedido_hito`, el periodo en
   * `meta_cumplida`. Sin discriminante hay UNA notificacion por entidad, que
   * es lo que se quiere en los vencidos (no una por dia vencido).
   */
  discriminator?: string;
}

/** Roles que reciben copia de los tipos supervisados. */
const SUPERVISOR_ROLES: UserRole[] = [
  UserRole.administrador,
  UserRole.director_comercial,
];

/**
 * Tipos que ademas del dueno notifican a los supervisores.
 *
 * Solo `meta_cumplida`: es el unico que es noticia hacia arriba. En los demas
 * el supervisor o ya lo sabe (el asigno el cliente, el resolvio el gasto) o ya
 * lo tiene en el dashboard (los vencidos). Copiar todo les llena la campana de
 * ruido y dejan de mirarla.
 */
export const SUPERVISED_TYPES: NotificationType[] = [
  NotificationType.meta_cumplida,
];

export function dedupeKeyFor(
  userId: string,
  type: NotificationType,
  entityId: string,
  discriminator?: string,
): string {
  return [userId, type, entityId, discriminator ?? ""].join(":");
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async emit(
    input: EmitInput,
    writer: NotificationWriter = this.prisma,
  ): Promise<{ count: number }> {
    const recipients = await this.resolveRecipients(input, writer);
    if (recipients.length === 0) {
      return { count: 0 };
    }

    return writer.notification.createMany({
      data: recipients.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        entityType: input.entityType,
        entityId: input.entityId,
        dedupeKey: dedupeKeyFor(
          userId,
          input.type,
          input.entityId,
          input.discriminator,
        ),
      })),
      skipDuplicates: true,
    });
  }

  private async resolveRecipients(
    input: EmitInput,
    writer: NotificationWriter,
  ): Promise<string[]> {
    const owners = input.userIds.filter((id): id is string => Boolean(id));
    if (owners.length === 0) {
      return [];
    }

    if (!SUPERVISED_TYPES.includes(input.type)) {
      return [...new Set(owners)];
    }

    const supervisors = await writer.user.findMany({
      where: { role: { in: SUPERVISOR_ROLES }, active: true },
      select: { id: true },
    });

    return [...new Set([...owners, ...supervisors.map((u) => u.id)])];
  }
}
```

- [ ] **Step 6: Correr el test y verificar que pasa**

```bash
pnpm --filter @norgtech/api test -- --testPathPattern notifications-service
```

Esperado: PASS, 4 tests.

- [ ] **Step 7: Crear el módulo**

`apps/api/src/modules/notifications/notifications.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";

@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/modules/notifications apps/api/test/notifications-service.e2e-spec.ts
git commit -m "feat(notificaciones): modelo Notification y emisor con dedupe"
```

---

### Task 2: Endpoints de lectura y marcado

**Files:**
- Modify: `apps/api/src/modules/notifications/notifications.service.ts`
- Create: `apps/api/src/modules/notifications/notifications.controller.ts`
- Modify: `apps/api/src/modules/notifications/notifications.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/notifications-api.e2e-spec.ts`

**Interfaces:**
- Consumes: `NotificationsService` (Task 1), `JwtAuthGuard` de `../auth/jwt-auth.guard`, `@CurrentUser()` de `../auth/decorators/current-user.decorator`, `AuthUser` de `../auth/types/authenticated-request`.
- Produces:
  - `NotificationsService.list(userId: string, opts: { unread?: boolean; limit?: number })`
  - `NotificationsService.unreadCount(userId: string): Promise<{ count: number }>`
  - `NotificationsService.markRead(userId: string, id: string): Promise<{ ok: true }>`
  - `NotificationsService.markAllRead(userId: string): Promise<{ count: number }>`
  - Rutas `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `POST /notifications/read-all`.

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/api/test/notifications-api.e2e-spec.ts`:

```ts
import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { NotificationType, UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  authHeader,
  findMockUserByEmail,
  loginAs,
  MOCK_USERS,
  refreshTokenStub,
} from "./helpers/login-as";

describe("Notifications API", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  const comercialId = MOCK_USERS[UserRole.comercial].id;
  const otroId = MOCK_USERS[UserRole.tecnico].id;

  let rows: Array<Record<string, unknown>>;

  beforeEach(async () => {
    rows = [
      {
        id: "n-1",
        userId: comercialId,
        type: NotificationType.pedido_hito,
        title: "Pedido NN-1 paso a facturado",
        body: null,
        entityType: "order",
        entityId: "order-1",
        dedupeKey: "k1",
        readAt: null,
        createdAt: new Date("2026-07-20T10:00:00.000Z"),
      },
      {
        id: "n-2",
        userId: otroId,
        type: NotificationType.visita_vencida,
        title: "Visita vencida",
        body: null,
        entityType: "visit",
        entityId: "visit-1",
        dedupeKey: "k2",
        readAt: null,
        createdAt: new Date("2026-07-21T10:00:00.000Z"),
      },
    ];

    const prismaStub = {
      user: {
        findUnique: async ({ where }: { where: { email?: string } }) =>
          findMockUserByEmail(where.email),
        findMany: async () => [],
      },
      refreshToken: refreshTokenStub(),
      notification: {
        findMany: async ({
          where,
          take,
        }: {
          where: { userId: string; readAt?: null };
          take?: number;
        }) => {
          const result = rows.filter(
            (r) =>
              r.userId === where.userId &&
              (where.readAt === undefined || r.readAt === null),
          );
          return take ? result.slice(0, take) : result;
        },
        count: async ({ where }: { where: { userId: string } }) =>
          rows.filter((r) => r.userId === where.userId && r.readAt === null)
            .length,
        updateMany: async ({
          where,
          data,
        }: {
          where: { id?: string; userId: string; readAt?: null };
          data: { readAt: Date };
        }) => {
          const target = rows.filter(
            (r) =>
              r.userId === where.userId &&
              (where.id === undefined || r.id === where.id) &&
              r.readAt === null,
          );
          for (const row of target) row.readAt = data.readAt;
          return { count: target.length };
        },
        deleteMany: async () => ({ count: 0 }),
      },
    };

    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("solo devuelve las notificaciones del usuario autenticado", async () => {
    const token = await loginAs(app, UserRole.comercial);

    const response = await request(app.getHttpServer())
      .get("/notifications")
      .set(authHeader(token))
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe("n-1");
  });

  it("cuenta solo las no leidas propias", async () => {
    const token = await loginAs(app, UserRole.comercial);

    const response = await request(app.getHttpServer())
      .get("/notifications/unread-count")
      .set(authHeader(token))
      .expect(200);

    expect(response.body).toEqual({ count: 1 });
  });

  it("no deja marcar como leida una notificacion ajena", async () => {
    const token = await loginAs(app, UserRole.comercial);

    await request(app.getHttpServer())
      .patch("/notifications/n-2/read")
      .set(authHeader(token))
      .expect(404);

    expect(rows[1].readAt).toBeNull();
  });

  it("marca todas las propias como leidas", async () => {
    const token = await loginAs(app, UserRole.comercial);

    await request(app.getHttpServer())
      .post("/notifications/read-all")
      .set(authHeader(token))
      .expect(201);

    expect(rows[0].readAt).not.toBeNull();
    expect(rows[1].readAt).toBeNull();
  });

  it("rechaza sin token", async () => {
    await request(app.getHttpServer()).get("/notifications").expect(401);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
pnpm --filter @norgtech/api test -- --testPathPattern notifications-api
```

Esperado: FAIL con 404 en `/notifications` (la ruta no existe todavía).

- [ ] **Step 3: Añadir los métodos de lectura al servicio**

Añadir dentro de la clase `NotificationsService`, después de `emit`:

```ts
  list(userId: string, opts: { unread?: boolean; limit?: number } = {}) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(opts.unread ? { readAt: null } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: opts.limit ?? 20,
    });
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  /**
   * 404 y no 403 cuando la fila es de otro: responder 403 confirmaria que
   * existe una notificacion ajena con ese id.
   */
  async markRead(userId: string, id: string): Promise<{ ok: true }> {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });

    if (result.count === 0) {
      throw new NotFoundException("Notification not found");
    }

    return { ok: true };
  }

  markAllRead(userId: string): Promise<{ count: number }> {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
```

- [ ] **Step 4: Crear el controller**

`apps/api/src/modules/notifications/notifications.controller.ts`:

```ts
import { Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { NotificationsService } from "./notifications.service";

/**
 * Sin `@Roles`: la campana es personal. Cada endpoint filtra por el usuario
 * del token, asi que no hay rol que pueda leer la campana de otro.
 */
@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("unread") unread?: string,
    @Query("limit") limit?: string,
  ) {
    const parsed = Number(limit);
    return this.notifications.list(user.id, {
      unread: unread === "true",
      limit: Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 50) : 20,
    });
  }

  @Get("unread-count")
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user.id);
  }

  @Patch(":id/read")
  markRead(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @Post("read-all")
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }
}
```

- [ ] **Step 5: Registrar controller y módulo**

En `apps/api/src/modules/notifications/notifications.module.ts`, añadir el controller y la importación de `AuthModule` (el guard lo necesita, igual que en `audit.module.ts`):

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
```

En `apps/api/src/app.module.ts`, añadir el import al principio del bloque de imports de módulos:

```ts
import { NotificationsModule } from "./modules/notifications/notifications.module";
```

y `NotificationsModule,` en el array `imports`, después de `AuditModule,`.

- [ ] **Step 6: Correr el test y verificar que pasa**

```bash
pnpm --filter @norgtech/api test -- --testPathPattern notifications-api
```

Esperado: PASS, 5 tests.

- [ ] **Step 7: Verificar que el allowlist de endpoints abiertos sigue limpio**

Existe `apps/api/test/helpers/allowlist-open-endpoints.ts`, que un spec usa para detectar rutas sin guard. Correr la suite completa para confirmar que las cuatro rutas nuevas no aparecen como abiertas:

```bash
pnpm --filter @norgtech/api test
```

Esperado: PASS. Si algún spec reporta las rutas de `/notifications` como no protegidas, revisar que `@UseGuards(JwtAuthGuard)` esté en el controller.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/notifications apps/api/src/app.module.ts apps/api/test/notifications-api.e2e-spec.ts
git commit -m "feat(notificaciones): endpoints de lectura y marcado"
```

---

### Task 3: Emisor de `pedido_hito`

**Files:**
- Modify: `apps/api/src/modules/orders/orders.service.ts:406-475`
- Modify: `apps/api/src/modules/orders/orders.module.ts`
- Test: `apps/api/test/notifications-emitters.e2e-spec.ts` (crear)

**Interfaces:**
- Consumes: `NotificationsService.emit` (Task 1).
- Produces: al pasar un pedido a `facturado`/`despachado`/`entregado` queda una fila con `type: pedido_hito`, `entityType: "order"`, `discriminator` = el estado nuevo.

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/api/test/notifications-emitters.e2e-spec.ts`. Prueba el servicio directo, sin app: `OrdersService.updateStatus` es transaccional y lo que interesa es qué llega a `emit`.

```ts
import { NotificationType, OrderStatus } from "@prisma/client";
import { NotificationsService } from "../src/modules/notifications/notifications.service";
import { OrdersService } from "../src/modules/orders/orders.service";

describe("Emisor de pedido_hito", () => {
  const emitted: Array<Record<string, unknown>> = [];

  function makeOrdersService(order: Record<string, unknown>) {
    const tx = {
      order: {
        findUnique: async () => order,
        update: async ({ data }: { data: Record<string, unknown> }) => ({
          ...order,
          ...data,
          customer: { assignedToUserId: "seller-1", displayName: "Agro Norte" },
        }),
      },
      auditLog: { create: async () => ({}) },
    };

    const prisma = {
      $transaction: async (fn: (client: unknown) => Promise<unknown>) => fn(tx),
    };

    const notifications = {
      emit: async (input: Record<string, unknown>) => {
        emitted.push(input);
        return { count: 1 };
      },
    } as unknown as NotificationsService;

    // Orden real del constructor de OrdersService:
    // (prisma, auditService, orderXlsxExportService, credit, whatsApp,
    //  pricingService, notifications)
    return new OrdersService(
      prisma as never,
      { record: async () => ({}) } as never,
      {} as never,
      { assertCreditLimit: async () => undefined } as never,
      {} as never,
      {} as never,
      notifications,
    );
  }

  beforeEach(() => {
    emitted.length = 0;
  });

  it("emite al pasar a facturado, con el estado como discriminante", async () => {
    const service = makeOrdersService({
      id: "order-1",
      orderNumber: "NN-1042",
      status: OrderStatus.orden_facturacion,
      customerId: "customer-1",
      sellerUserId: "seller-1",
      total: 100,
      trackingNumber: null,
    });

    await service.updateStatus(
      { id: "admin-1" } as never,
      "order-1",
      { status: OrderStatus.facturado } as never,
    );

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      userIds: ["seller-1"],
      type: NotificationType.pedido_hito,
      entityType: "order",
      entityId: "order-1",
      discriminator: OrderStatus.facturado,
    });
    expect(emitted[0].title).toContain("NN-1042");
  });

  it("no emite en las transiciones intermedias", async () => {
    const service = makeOrdersService({
      id: "order-2",
      orderNumber: "NN-1043",
      status: OrderStatus.recibido,
      customerId: "customer-1",
      sellerUserId: "seller-1",
      total: 100,
      trackingNumber: null,
    });

    await service.updateStatus(
      { id: "admin-1" } as never,
      "order-2",
      { status: OrderStatus.orden_facturacion } as never,
    );

    expect(emitted).toHaveLength(0);
  });
});
```

`updateStatus` solo usa `prisma`, `auditService`, `credit` y (tras este cambio) `notifications`; los otros tres se pasan como `{}` porque esa ruta no los toca.

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
pnpm --filter @norgtech/api test -- --testPathPattern notifications-emitters
```

Esperado: FAIL — `OrdersService` no acepta un cuarto parámetro / no se emite nada.

- [ ] **Step 3: Inyectar el servicio en `OrdersService`**

En `apps/api/src/modules/orders/orders.service.ts`, añadir a los imports:

```ts
import { NotificationType } from "@prisma/client";
import { NotificationsService } from "../notifications/notifications.service";
```

(`NotificationType` va en el import existente de `@prisma/client` si ya hay uno.)

Añadir el parámetro al constructor, al final de la lista existente:

```ts
    private readonly notifications: NotificationsService,
```

Y declarar la constante junto a las demás del módulo, antes de la clase:

```ts
/**
 * Hitos que notifican. Los intermedios (orden_facturacion, en_transito) se ven
 * entrando al pedido; notificar los cinco saltos convierte la campana en ruido.
 */
const NOTIFIED_ORDER_MILESTONES: OrderStatus[] = [
  OrderStatus.facturado,
  OrderStatus.despachado,
  OrderStatus.entregado,
];
```

- [ ] **Step 4: Emitir dentro de la transacción**

En `updateStatus`, después del bloque `await this.auditService.record({...}, tx);` (línea ~471) y antes de `return updated;`:

```ts
      // La condicion es "cambio", no "es": guardar el pedido de nuevo en el
      // mismo estado no debe re-notificar.
      if (
        order.status !== dto.status &&
        NOTIFIED_ORDER_MILESTONES.includes(dto.status)
      ) {
        const ownerId = updated.sellerUserId ?? updated.customer?.assignedToUserId;
        if (ownerId) {
          await this.notifications.emit(
            {
              userIds: [ownerId],
              type: NotificationType.pedido_hito,
              title: `Pedido ${updated.orderNumber ?? updated.id} pasó a ${dto.status}`,
              body: updated.customer?.displayName ?? undefined,
              entityType: "order",
              entityId: updated.id,
              discriminator: dto.status,
            },
            tx,
          );
        }
      }
```

- [ ] **Step 5: Importar el módulo**

En `apps/api/src/modules/orders/orders.module.ts`, añadir `NotificationsModule` al array `imports`:

```ts
import { NotificationsModule } from "../notifications/notifications.module";
```

- [ ] **Step 6: Correr los tests**

```bash
pnpm --filter @norgtech/api test -- --testPathPattern "notifications-emitters|orders"
```

Esperado: PASS. Los specs existentes de pedidos deben seguir verdes; si alguno construye `OrdersService` a mano, hay que pasarle el stub de notificaciones.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/orders apps/api/test/notifications-emitters.e2e-spec.ts
git commit -m "feat(notificaciones): avisar los hitos del pedido"
```

---

### Task 4: Emisores de `cliente_asignado` y `gasto_resuelto`

**Files:**
- Modify: `apps/api/src/modules/customers/customers.service.ts`
- Modify: `apps/api/src/modules/customers/customers.module.ts`
- Modify: `apps/api/src/modules/commercial-expenses/commercial-expenses.service.ts:340-422`
- Modify: `apps/api/src/modules/commercial-expenses/commercial-expenses.module.ts`
- Test: `apps/api/test/notifications-emitters.e2e-spec.ts` (ampliar)

**Interfaces:**
- Consumes: `NotificationsService.emit` (Task 1).
- Produces: filas `cliente_asignado` (`entityType: "customer"`, sin discriminante) y `gasto_resuelto` (`entityType: "commercial_expense"`, discriminante = estado resultante).

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `apps/api/test/notifications-emitters.e2e-spec.ts`:

```ts
import { CommercialExpenseStatus } from "@prisma/client";
import { CustomersService } from "../src/modules/customers/customers.service";
import { CommercialExpensesService } from "../src/modules/commercial-expenses/commercial-expenses.service";

describe("Emisor de cliente_asignado", () => {
  const emitted: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    emitted.length = 0;
  });

  function makeCustomersService(existing: Record<string, unknown>) {
    const tx = {
      customer: {
        update: async ({ data }: { data: Record<string, unknown> }) => ({
          ...existing,
          ...data,
          contacts: [],
        }),
      },
      auditLog: { create: async () => ({}) },
    };

    const prisma = {
      customer: { findUnique: async () => existing },
      customerSegment: { findUnique: async () => ({ id: "seg-1" }) },
      user: { findUnique: async () => ({ id: "seller-2", active: true }) },
      $transaction: async (fn: (client: unknown) => Promise<unknown>) => fn(tx),
    };

    const notifications = {
      emit: async (input: Record<string, unknown>) => {
        emitted.push(input);
        return { count: 1 };
      },
    } as unknown as NotificationsService;

    return new CustomersService(
      prisma as never,
      { record: async () => ({}) } as never,
      notifications,
    );
  }

  it("emite cuando el cliente cambia de responsable", async () => {
    const service = makeCustomersService({
      id: "customer-1",
      displayName: "Agro Norte",
      assignedToUserId: "seller-1",
    });

    await service.update({ id: "admin-1" } as never, "customer-1", {
      assignedToUserId: "seller-2",
    } as never);

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      userIds: ["seller-2"],
      type: NotificationType.cliente_asignado,
      entityType: "customer",
      entityId: "customer-1",
    });
  });

  it("no emite si el responsable no cambia", async () => {
    const service = makeCustomersService({
      id: "customer-1",
      displayName: "Agro Norte",
      assignedToUserId: "seller-2",
    });

    await service.update({ id: "admin-1" } as never, "customer-1", {
      assignedToUserId: "seller-2",
    } as never);

    expect(emitted).toHaveLength(0);
  });
});

describe("Emisor de gasto_resuelto", () => {
  const emitted: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    emitted.length = 0;
  });

  it("emite al aprobar, hacia quien reporto el gasto", async () => {
    const expense = {
      id: "exp-1",
      status: CommercialExpenseStatus.pendiente,
      submittedByUserId: "seller-1",
      amount: 120000,
      category: "transporte",
    };

    const tx = {
      commercialExpense: {
        findUnique: async () => ({
          ...expense,
          status: expense.status,
        }),
        updateMany: async () => ({ count: 1 }),
      },
      auditLog: { create: async () => ({}) },
    };

    let calls = 0;
    tx.commercialExpense.findUnique = async () => {
      calls++;
      return calls === 1
        ? { ...expense }
        : { ...expense, status: CommercialExpenseStatus.aprobado };
    };

    const prisma = {
      $transaction: async (fn: (client: unknown) => Promise<unknown>) => fn(tx),
    };

    const notifications = {
      emit: async (input: Record<string, unknown>) => {
        emitted.push(input);
        return { count: 1 };
      },
    } as unknown as NotificationsService;

    // Orden real: (prisma, auditService, storageService, exportService,
    //              whatsAppService, notifications)
    const service = new CommercialExpensesService(
      prisma as never,
      { record: async () => ({}) } as never,
      {} as never,
      {} as never,
      { notifyExpenseCorrection: async () => undefined } as never,
      notifications,
    );

    await service.updateStatus(
      { id: "admin-1", role: "administrador" } as never,
      "exp-1",
      { status: CommercialExpenseStatus.aprobado } as never,
    );

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      userIds: ["seller-1"],
      type: NotificationType.gasto_resuelto,
      entityType: "commercial_expense",
      entityId: "exp-1",
      discriminator: CommercialExpenseStatus.aprobado,
    });
  });
});
```

`CustomersService` declara hoy `(prisma, auditService)`, así que con `notifications` al final queda de tres parámetros — el `new CustomersService(...)` de arriba ya está completo. Si `updateStatus` de gastos exige más stubs (por ejemplo campos del `include` de `commercialExpenseInclude`), completarlos en el stub hasta que el test corra.

- [ ] **Step 2: Correr y verificar que falla**

```bash
pnpm --filter @norgtech/api test -- --testPathPattern notifications-emitters
```

Esperado: FAIL en los dos describes nuevos.

- [ ] **Step 3: Emitir en `CustomersService`**

Inyectar `private readonly notifications: NotificationsService,` al final del constructor e importar `NotificationType` y `NotificationsService`.

En `update`, después del `await this.auditService.record({...}, tx);` (línea ~212) y antes de `return result;`:

```ts
      // "cambio", no "es": reguardar el cliente con el mismo responsable no
      // debe re-notificar. Y sin discriminante en el dedupeKey: una sola
      // notificacion por (usuario, cliente) para siempre.
      if (
        dto.assignedToUserId &&
        dto.assignedToUserId !== customer.assignedToUserId
      ) {
        await this.notifications.emit(
          {
            userIds: [dto.assignedToUserId],
            type: NotificationType.cliente_asignado,
            title: `Te asignaron el cliente ${result.displayName}`,
            entityType: "customer",
            entityId: id,
          },
          tx,
        );
      }
```

En `create`, después de su `auditService.record` (línea ~81) y antes del `return`, el mismo bloque sin comparación previa (no hay responsable anterior):

```ts
      if (dto.assignedToUserId) {
        await this.notifications.emit(
          {
            userIds: [dto.assignedToUserId],
            type: NotificationType.cliente_asignado,
            title: `Te asignaron el cliente ${customer.displayName}`,
            entityType: "customer",
            entityId: customer.id,
          },
          tx,
        );
      }
```

(Dentro de `create` la variable del cliente recién creado se llama `customer`; en `update` se llama `result`. Por eso los dos bloques difieren.)

Importar `NotificationsModule` en `apps/api/src/modules/customers/customers.module.ts`.

- [ ] **Step 4: Emitir en `CommercialExpensesService`**

Inyectar `private readonly notifications: NotificationsService,` al final del constructor e importar lo necesario.

En `updateStatus`, después de `await this.auditService.record({...}, tx);` (línea ~419) y antes de `return updated;`:

```ts
      if (
        dto.status === CommercialExpenseStatus.aprobado ||
        dto.status === CommercialExpenseStatus.rechazado
      ) {
        await this.notifications.emit(
          {
            userIds: [updated.submittedByUserId],
            type: NotificationType.gasto_resuelto,
            title: `Tu gasto fue ${dto.status}`,
            body: updated.description,
            entityType: "commercial_expense",
            entityId: updated.id,
            discriminator: dto.status,
          },
          tx,
        );
      }
```

No hace falta comparar contra el estado previo: `expenseStatusTransitions` ya rechaza la transición hacia el mismo estado, así que llegar aquí implica que cambió.

Importar `NotificationsModule` en `apps/api/src/modules/commercial-expenses/commercial-expenses.module.ts`.

- [ ] **Step 5: Correr los tests**

```bash
pnpm --filter @norgtech/api test -- --testPathPattern "notifications-emitters|customers|commercial-expenses"
```

Esperado: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/customers apps/api/src/modules/commercial-expenses apps/api/test/notifications-emitters.e2e-spec.ts
git commit -m "feat(notificaciones): avisar asignacion de cliente y resolucion de gasto"
```

---

### Task 5: Cron diario de vencidos, metas y retención

**Files:**
- Create: `apps/api/src/modules/notifications/notifications.cron.ts`
- Modify: `apps/api/src/modules/notifications/notifications.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/modules/customer-goals/customer-goals.service.ts`
- Modify: `apps/api/src/shared/overdue.ts:5-22`
- Modify: `apps/api/package.json` (dependencia)
- Test: `apps/api/test/notifications-cron.e2e-spec.ts`

**Interfaces:**
- Consumes: `NotificationsService.emit`, `visitOverdueWhere` / `followUpTaskOverdueWhere` / `BOGOTA_TIME_ZONE` de `apps/api/src/shared/overdue.ts`, `CustomerGoalsService.getProgress` y `getPeriodRange`.
- Produces: `NotificationsCron.sweep(now: Date): Promise<void>` — punto de entrada testeable, invocado por `@Cron`.

- [ ] **Step 1: Instalar la dependencia**

```bash
pnpm --filter @norgtech/api add @nestjs/schedule
```

Esperado: `@nestjs/schedule` aparece en `apps/api/package.json`.

- [ ] **Step 2: Hacer público `getPeriodRange`**

En `apps/api/src/modules/customer-goals/customer-goals.service.ts`, cambiar la declaración de `private getPeriodRange(` a `getPeriodRange(`. El cron necesita saber si una meta pertenece al periodo en curso, y duplicar el cálculo de rangos sería una segunda definición de la misma regla.

- [ ] **Step 3: Escribir el test que falla**

Crear `apps/api/test/notifications-cron.e2e-spec.ts`:

```ts
import { NotificationType } from "@prisma/client";
import { NotificationsCron } from "../src/modules/notifications/notifications.cron";

describe("NotificationsCron.sweep", () => {
  const now = new Date("2026-07-22T12:00:00.000Z");

  function makeCron(emitted: Array<Record<string, unknown>>, deleted: number[]) {
    const prisma = {
      visit: {
        findMany: async () => [
          {
            id: "visit-1",
            assignedToUserId: "seller-1",
            scheduledAt: new Date("2026-07-15T14:00:00.000Z"),
            customer: { displayName: "Agro Norte" },
          },
          {
            id: "visit-2",
            assignedToUserId: null,
            scheduledAt: new Date("2026-07-16T14:00:00.000Z"),
            customer: { displayName: "Sin responsable" },
          },
        ],
      },
      followUpTask: {
        findMany: async () => [
          {
            id: "task-1",
            assignedToUserId: "seller-1",
            title: "Llamar por la cotizacion",
            dueAt: new Date("2026-07-18T14:00:00.000Z"),
            customer: { displayName: "Agro Norte" },
          },
        ],
      },
      customerGoal: {
        findMany: async () => [
          {
            id: "goal-1",
            customerId: "customer-1",
            periodType: "anual",
            periodValue: "2026",
            customer: { displayName: "Agro Norte", assignedToUserId: "seller-1" },
          },
        ],
      },
      notification: {
        deleteMany: async () => {
          deleted.push(1);
          return { count: 3 };
        },
      },
    };

    const notifications = {
      emit: async (input: Record<string, unknown>) => {
        emitted.push(input);
        return { count: 1 };
      },
    };

    const customerGoals = {
      getPeriodRange: () => ({
        start: new Date("2026-01-01T00:00:00.000Z"),
        end: new Date("2026-12-31T23:59:59.999Z"),
      }),
      getProgress: async () => ({
        soldAmount: 1200,
        targetAmount: 1000,
        percentage: 120,
      }),
    };

    return new NotificationsCron(
      prisma as never,
      notifications as never,
      customerGoals as never,
    );
  }

  it("emite una notificacion por visita vencida con responsable", async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const cron = makeCron(emitted, []);

    await cron.sweep(now);

    const visitas = emitted.filter(
      (e) => e.type === NotificationType.visita_vencida,
    );
    expect(visitas).toHaveLength(1);
    expect(visitas[0]).toMatchObject({
      userIds: ["seller-1"],
      entityType: "visit",
      entityId: "visit-1",
    });
  });

  it("emite por seguimiento vencido y por meta cumplida", async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const cron = makeCron(emitted, []);

    await cron.sweep(now);

    expect(
      emitted.filter((e) => e.type === NotificationType.seguimiento_vencido),
    ).toHaveLength(1);

    const metas = emitted.filter(
      (e) => e.type === NotificationType.meta_cumplida,
    );
    expect(metas).toHaveLength(1);
    expect(metas[0]).toMatchObject({
      userIds: ["seller-1"],
      entityType: "customer",
      entityId: "customer-1",
      discriminator: "2026",
    });
  });

  it("purga las leidas viejas", async () => {
    const deleted: number[] = [];
    const cron = makeCron([], deleted);

    await cron.sweep(now);

    expect(deleted).toHaveLength(1);
  });
});
```

- [ ] **Step 4: Correr y verificar que falla**

```bash
pnpm --filter @norgtech/api test -- --testPathPattern notifications-cron
```

Esperado: FAIL — no existe `notifications.cron`.

- [ ] **Step 5: Implementar el cron**

Crear `apps/api/src/modules/notifications/notifications.cron.ts`:

```ts
import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { NotificationType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  BOGOTA_TIME_ZONE,
  followUpTaskOverdueWhere,
  visitOverdueWhere,
} from "../../shared/overdue";
import { CustomerGoalsService } from "../customer-goals/customer-goals.service";
import { NotificationsService } from "./notifications.service";

/** Dias que sobrevive una notificacion ya leida antes de purgarse. */
const READ_RETENTION_DAYS = 60;

/**
 * Barrido diario de lo que el reloj vuelve notificable.
 *
 * REGLA DURA: este cron solo INSERTA en `Notification` y purga leidas viejas.
 * No escribe `status` de ninguna entidad. `shared/overdue.ts` sigue siendo la
 * unica definicion de "vencido" y este modulo la consume; si algun dia esta
 * clase empieza a escribir `Visit.status`, la lista de vencidos y el contador
 * dejan de cuadrar (es el bug AGEN-02 otra vez).
 */
@Injectable()
export class NotificationsCron {
  private readonly logger = new Logger(NotificationsCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly customerGoals: CustomerGoalsService,
  ) {}

  @Cron("0 7 * * *", { timeZone: BOGOTA_TIME_ZONE })
  async runDaily(): Promise<void> {
    await this.sweep(new Date());
  }

  /** `now` inyectado: los tests no dependen del reloj del proceso. */
  async sweep(now: Date): Promise<void> {
    await this.sweepOverdueVisits(now);
    await this.sweepOverdueFollowUps(now);
    await this.sweepAchievedGoals(now);
    await this.purgeRead(now);
  }

  private async sweepOverdueVisits(now: Date): Promise<void> {
    const visits = await this.prisma.visit.findMany({
      where: { ...visitOverdueWhere(now), assignedToUserId: { not: null } },
      select: {
        id: true,
        assignedToUserId: true,
        scheduledAt: true,
        customer: { select: { displayName: true } },
      },
    });

    // ponytail: un emit por visita. Con miles de vencidas conviene un solo
    // createMany; hasta entonces esto es una consulta por fila una vez al dia.
    for (const visit of visits) {
      await this.notifications.emit({
        userIds: [visit.assignedToUserId as string],
        type: NotificationType.visita_vencida,
        title: `Visita vencida: ${visit.customer.displayName}`,
        body: `Programada para ${this.formatDate(visit.scheduledAt)} y sin registro.`,
        entityType: "visit",
        entityId: visit.id,
      });
    }
  }

  private async sweepOverdueFollowUps(now: Date): Promise<void> {
    const tasks = await this.prisma.followUpTask.findMany({
      where: {
        ...followUpTaskOverdueWhere(now),
        assignedToUserId: { not: null },
      },
      select: {
        id: true,
        title: true,
        assignedToUserId: true,
        dueAt: true,
        customer: { select: { displayName: true } },
      },
    });

    for (const task of tasks) {
      await this.notifications.emit({
        userIds: [task.assignedToUserId as string],
        type: NotificationType.seguimiento_vencido,
        title: `Seguimiento vencido: ${task.title}`,
        body: `${task.customer.displayName} — vencia el ${this.formatDate(task.dueAt)}.`,
        entityType: "follow_up_task",
        entityId: task.id,
      });
    }
  }

  private async sweepAchievedGoals(now: Date): Promise<void> {
    const goals = await this.prisma.customerGoal.findMany({
      select: {
        id: true,
        customerId: true,
        periodType: true,
        periodValue: true,
        customer: { select: { displayName: true, assignedToUserId: true } },
      },
    });

    for (const goal of goals) {
      const ownerId = goal.customer.assignedToUserId;
      if (!ownerId) continue;

      // Solo el periodo en curso: una meta cumplida en 2025 no es noticia hoy.
      const { start, end } = this.customerGoals.getPeriodRange(
        goal.periodType,
        goal.periodValue,
      );
      if (now < start || now > end) continue;

      const progress = await this.customerGoals.getProgress(
        goal.customerId,
        goal.periodType,
        goal.periodValue,
      );
      if (progress.soldAmount < progress.targetAmount) continue;

      await this.notifications.emit({
        userIds: [ownerId],
        type: NotificationType.meta_cumplida,
        title: `${goal.customer.displayName} cumplió su meta ${goal.periodValue}`,
        body: `${progress.percentage}% del objetivo.`,
        entityType: "customer",
        entityId: goal.customerId,
        discriminator: goal.periodValue,
      });
    }
  }

  private async purgeRead(now: Date): Promise<void> {
    const cutoff = new Date(
      now.getTime() - READ_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    const result = await this.prisma.notification.deleteMany({
      where: { readAt: { not: null, lt: cutoff } },
    });

    this.logger.log(`Notificaciones leidas purgadas: ${result.count}`);
  }

  private formatDate(instant: Date): string {
    return instant.toLocaleDateString("es-CO", { timeZone: BOGOTA_TIME_ZONE });
  }
}
```

- [ ] **Step 6: Registrar el cron**

En `apps/api/src/modules/notifications/notifications.module.ts`, añadir `CustomerGoalsModule` a `imports` y `NotificationsCron` a `providers`:

```ts
import { CustomerGoalsModule } from "../customer-goals/customer-goals.module";
import { NotificationsCron } from "./notifications.cron";
```

En `apps/api/src/app.module.ts`, añadir:

```ts
import { ScheduleModule } from "@nestjs/schedule";
```

y `ScheduleModule.forRoot(),` en `imports`, justo después de `ThrottlerModule.forRoot(...)`.

- [ ] **Step 7: Correr el test y verificar que pasa**

```bash
pnpm --filter @norgtech/api test -- --testPathPattern notifications-cron
```

Esperado: PASS, 3 tests.

- [ ] **Step 8: Corregir el comentario de `overdue.ts`**

En `apps/api/src/shared/overdue.ts`, reemplazar el párrafo de las líneas 5-10 que empieza con "En este repo NO hay scheduler" por:

```
 * En este repo hay UN scheduler (`NotificationsCron`), y solo inserta filas en
 * `Notification`: no escribe `status` de ninguna entidad. El paso del tiempo,
 * por tanto, sigue sin poder cambiar ninguna columna de estado; `status` solo
 * cambia cuando lo cambia un humano. Cualquier codigo que lea la columna
 * esperando que signifique "ya paso la fecha" sigue estando roto por
 * construccion.
```

Dejar intacto el resto del comentario (la regla derivada y la advertencia sobre AGEN-02).

- [ ] **Step 9: Correr la suite completa**

```bash
pnpm --filter @norgtech/api test
```

Esperado: PASS. `ScheduleModule.forRoot()` se instancia en todos los specs que importan `AppModule`; si alguno se cuelga al cerrar la app, confirmar que los specs llaman `app.close()` en su `afterAll`/`afterEach`.

- [ ] **Step 10: Commit**

```bash
git add apps/api/package.json apps/api/src/modules/notifications apps/api/src/app.module.ts apps/api/src/shared/overdue.ts apps/api/src/modules/customer-goals/customer-goals.service.ts apps/api/test/notifications-cron.e2e-spec.ts pnpm-lock.yaml
git commit -m "feat(notificaciones): cron diario de vencidos, metas y retencion"
```

---

### Task 6: La campana en el web

**Files:**
- Create: `apps/web/src/lib/use-poll-count.ts`
- Create: `apps/web/src/components/notification-bell.tsx`
- Modify: `apps/web/src/components/topbar.tsx:64-68`
- Modify: `apps/web/src/components/sidebar-nav.tsx:131-147`

**Interfaces:**
- Consumes: `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `POST /notifications/read-all` (Task 2); `apiFetchClient` de `@/lib/api.client`.
- Produces: `usePollCount(path: string, intervalMs?: number): { count: number; refresh: () => void }`, componente `<NotificationBell />`.

- [ ] **Step 1: Extraer el hook de poll**

Crear `apps/web/src/lib/use-poll-count.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetchClient } from "@/lib/api.client";

/**
 * Consulta un endpoint que devuelve `{ count }` cada `intervalMs`.
 * Extraido de sidebar-nav para que la campana y el badge de WhatsApp no
 * tengan dos implementaciones del mismo poll.
 */
export function usePollCount(path: string, intervalMs = 15000) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    const res = await apiFetchClient(path);
    if (res.ok) {
      const data = (await res.json()) as { count: number };
      setCount(data.count);
    }
  }, [path]);

  useEffect(() => {
    let alive = true;

    async function poll() {
      const res = await apiFetchClient(path);
      if (alive && res.ok) {
        const data = (await res.json()) as { count: number };
        setCount(data.count);
      }
    }

    void poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [path, intervalMs]);

  return { count, refresh };
}
```

- [ ] **Step 2: Usar el hook en el sidebar**

En `apps/web/src/components/sidebar-nav.tsx`, borrar el bloque de las líneas 131-147 (`const [pending, setPending] = useState(0);` y su `useEffect`) y sustituirlo por:

```tsx
  const { count: pending } = usePollCount("/whatsapp/conversations/pending-count");
```

Añadir el import `import { usePollCount } from "@/lib/use-poll-count";` y quitar de la línea 5 los imports de `useEffect`/`useState` si ya no se usan en el archivo (revisar antes de borrarlos).

- [ ] **Step 3: Crear el componente de la campana**

Crear `apps/web/src/components/notification-bell.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { apiFetchClient } from "@/lib/api.client";
import { usePollCount } from "@/lib/use-poll-count";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  entityType: string;
  entityId: string;
  createdAt: string;
}

/** Ruta de detalle por tipo de entidad. Un solo lugar que tocar si cambian. */
const ENTITY_ROUTES: Record<string, string> = {
  order: "/orders",
  customer: "/customers",
  visit: "/visits",
  follow_up_task: "/follow-ups",
  commercial_expense: "/expenses",
};

export function notificationHref(entityType: string, entityId: string): string {
  const base = ENTITY_ROUTES[entityType];
  return base ? `${base}/${entityId}` : "/dashboard";
}

export function NotificationBell() {
  const router = useRouter();
  const { count, refresh } = usePollCount("/notifications/unread-count");
  const [items, setItems] = useState<NotificationItem[]>([]);

  async function loadItems(open: boolean) {
    if (!open) return;
    const res = await apiFetchClient("/notifications?unread=true&limit=20");
    if (res.ok) {
      setItems((await res.json()) as NotificationItem[]);
    }
  }

  async function openItem(item: NotificationItem) {
    await apiFetchClient(`/notifications/${item.id}/read`, { method: "PATCH" });
    void refresh();
    router.push(notificationHref(item.entityType, item.entityId));
  }

  async function markAll() {
    await apiFetchClient("/notifications/read-all", { method: "POST" });
    setItems([]);
    void refresh();
  }

  return (
    <DropdownMenu onOpenChange={loadItems}>
      <DropdownMenuTrigger className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
        <Bell className="h-[18px] w-[18px]" />
        {count > 0 && (
          <span className="absolute right-2 top-1.5 h-[7px] w-[7px] rounded-full border-2 border-card bg-destructive" />
        )}
        <span className="sr-only">
          {count > 0 ? `${count} notificaciones sin leer` : "Notificaciones"}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[320px]">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-[12.5px] font-semibold">Notificaciones</span>
          {items.length > 0 && (
            <button
              onClick={markAll}
              className="text-[11.5px] text-muted-foreground hover:text-foreground"
            >
              Marcar todas
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-2 py-3 text-[12.5px] text-muted-foreground">
            No tienes notificaciones sin leer.
          </p>
        ) : (
          items.map((item) => (
            <DropdownMenuItem
              key={item.id}
              onClick={() => openItem(item)}
              className="flex flex-col items-start gap-0.5"
            >
              <span className="text-[12.5px] font-medium">{item.title}</span>
              {item.body && (
                <span className="text-[11.5px] text-muted-foreground">
                  {item.body}
                </span>
              )}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 4: Sustituir el botón inerte del topbar**

En `apps/web/src/components/topbar.tsx`, reemplazar las líneas 64-68 por:

```tsx
      {/* Bell */}
      <NotificationBell />
```

Añadir `import { NotificationBell } from "@/components/notification-bell";` y quitar `Bell` del import de `lucide-react` (ya no se usa en este archivo).

- [ ] **Step 5: Verificar tipos y lint**

```bash
pnpm --filter @norgtech/web lint
pnpm --filter @norgtech/web build
```

Esperado: sin errores. Un fallo típico: dejar `Bell`, `useEffect` o `useState` importados sin usar tras las sustituciones.

- [ ] **Step 6: Verificar en el navegador**

Levantar el stack (`pnpm dev`), entrar como un usuario con notificaciones y comprobar tres cosas:
1. Sin notificaciones sin leer, la campana **no** muestra el punto rojo.
2. Al abrirla, lista las pendientes; con cero, muestra el texto vacío.
3. Al hacer clic en una, navega al detalle y el contador baja.

Para generar una notificación de prueba sin esperar al cron: cambiar un pedido a `facturado` desde la UI con un usuario que sea el vendedor del pedido.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/use-poll-count.ts apps/web/src/components/notification-bell.tsx apps/web/src/components/topbar.tsx apps/web/src/components/sidebar-nav.tsx
git commit -m "feat(notificaciones): campana funcional en el topbar"
```

---

## Verificación final

- [ ] `pnpm --filter @norgtech/api test` — toda la suite verde.
- [ ] `pnpm lint` — sin errores en api ni web.
- [ ] `pnpm build` — compila.
- [ ] Confirmar con quien opere el despliegue **cuántas réplicas del API corren**. Con varias, el cron se ejecuta varias veces; el índice único de `dedupeKey` lo hace inocuo, pero conviene saberlo antes de asumirlo resuelto.

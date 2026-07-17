import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import {
  FollowUpTaskStatus,
  FollowUpTaskType,
  UserRole,
  VisitStatus,
} from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  BOGOTA_TIME_ZONE,
  dayRangeInZone,
  isFollowUpTaskOverdue,
  isVisitOverdue,
  followUpTaskOverdueWhere,
  visitOverdueWhere,
} from "../src/shared/overdue";
import { matchesWhere } from "./helpers/match-where";
import { refreshTokenStub } from "./helpers/login-as";

/**
 * "Vencido" se DERIVA en lectura a partir de una unica regla compartida.
 * No hay scheduler en este repo: el paso del tiempo no puede cambiar ninguna
 * columna, asi que la columna `status` nunca puede significar "paso el tiempo".
 */

// Instante congelado: 2026-07-16 12:00 en Bogota (UTC-5).
const NOW = new Date("2026-07-16T17:00:00.000Z");
const PAST = new Date("2026-07-15T17:00:00.000Z");
const FUTURE = new Date("2026-07-17T17:00:00.000Z");

describe("Overdue (regla derivada compartida)", () => {
  describe("predicado puro", () => {
    it("una visita programada con scheduledAt pasado esta vencida sin que nadie escriba nada", () => {
      expect(
        isVisitOverdue({ status: VisitStatus.programada, scheduledAt: PAST }, NOW),
      ).toBe(true);
    });

    it("una visita programada futura no esta vencida", () => {
      expect(
        isVisitOverdue({ status: VisitStatus.programada, scheduledAt: FUTURE }, NOW),
      ).toBe(false);
    });

    it.each([VisitStatus.completada, VisitStatus.cancelada, VisitStatus.no_realizada])(
      "una visita en estado terminal (%s) fijado por un humano NO esta vencida",
      (status) => {
        expect(isVisitOverdue({ status, scheduledAt: PAST }, NOW)).toBe(false);
      },
    );

    it("una tarea pendiente con dueAt pasado esta vencida", () => {
      expect(
        isFollowUpTaskOverdue({ status: FollowUpTaskStatus.pendiente, dueAt: PAST }, NOW),
      ).toBe(true);
    });

    it("una tarea pendiente futura no esta vencida", () => {
      expect(
        isFollowUpTaskOverdue({ status: FollowUpTaskStatus.pendiente, dueAt: FUTURE }, NOW),
      ).toBe(false);
    });

    it("una tarea completada NO esta vencida aunque su dueAt haya pasado", () => {
      expect(
        isFollowUpTaskOverdue({ status: FollowUpTaskStatus.completada, dueAt: PAST }, NOW),
      ).toBe(false);
    });

    it("una tarea marcada 'vencida' a mano sigue vencida si su dueAt paso", () => {
      expect(
        isFollowUpTaskOverdue({ status: FollowUpTaskStatus.vencida, dueAt: PAST }, NOW),
      ).toBe(true);
    });
  });

  /**
   * AGEN-02: el bug era que la LISTA y el CONTADOR usaban predicados distintos.
   * Aqui se exige que el fragmento Prisma y el predicado en memoria coincidan
   * fila por fila: son la misma regla o el test falla.
   */
  describe("el fragmento where y el predicado son la MISMA regla", () => {
    it("coinciden fila por fila en visitas", () => {
      const visits = [
        { id: "v1", status: VisitStatus.programada, scheduledAt: PAST },
        { id: "v2", status: VisitStatus.programada, scheduledAt: FUTURE },
        { id: "v3", status: VisitStatus.completada, scheduledAt: PAST },
        { id: "v4", status: VisitStatus.cancelada, scheduledAt: PAST },
        { id: "v5", status: VisitStatus.no_realizada, scheduledAt: PAST },
        { id: "v6", status: VisitStatus.completada, scheduledAt: FUTURE },
      ];

      const byWhere = visits.filter((v) => matchesWhere(v, visitOverdueWhere(NOW)));
      const byPredicate = visits.filter((v) => isVisitOverdue(v, NOW));

      expect(byWhere.map((v) => v.id)).toEqual(["v1"]);
      expect(byPredicate.map((v) => v.id)).toEqual(["v1"]);
    });

    it("coinciden fila por fila en tareas", () => {
      const tasks = [
        { id: "t1", status: FollowUpTaskStatus.pendiente, dueAt: PAST },
        { id: "t2", status: FollowUpTaskStatus.pendiente, dueAt: FUTURE },
        { id: "t3", status: FollowUpTaskStatus.completada, dueAt: PAST },
        { id: "t4", status: FollowUpTaskStatus.vencida, dueAt: PAST },
        { id: "t5", status: FollowUpTaskStatus.vencida, dueAt: FUTURE },
      ];

      const byWhere = tasks.filter((t) => matchesWhere(t, followUpTaskOverdueWhere(NOW)));
      const byPredicate = tasks.filter((t) => isFollowUpTaskOverdue(t, NOW));

      expect(byWhere.map((t) => t.id)).toEqual(["t1", "t4"]);
      expect(byPredicate.map((t) => t.id)).toEqual(["t1", "t4"]);
    });
  });

  /**
   * VIS-03: las columnas son TIMESTAMP(3) sin zona. Los limites del dia deben
   * calcularse en America/Bogota explicitamente, nunca en la zona del servidor.
   */
  describe("limites de dia en America/Bogota", () => {
    it("el dia de Bogota va de 05:00Z a 04:59:59.999Z del dia siguiente", () => {
      const { start, end } = dayRangeInZone(NOW, BOGOTA_TIME_ZONE);
      expect(start.toISOString()).toBe("2026-07-16T05:00:00.000Z");
      expect(end.toISOString()).toBe("2026-07-17T04:59:59.999Z");
    });

    it("un instante UTC del dia siguiente que en Bogota sigue siendo hoy cae dentro del rango", () => {
      // 2026-07-17T03:00Z = 2026-07-16 22:00 en Bogota => sigue siendo "hoy".
      const lateNight = new Date("2026-07-17T03:00:00.000Z");
      const { start, end } = dayRangeInZone(NOW, BOGOTA_TIME_ZONE);
      expect(lateNight.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(lateNight.getTime()).toBeLessThanOrEqual(end.getTime());
    });

    it("un instante que en Bogota ya es ayer queda fuera del rango", () => {
      // 2026-07-16T04:00Z = 2026-07-15 23:00 en Bogota => es ayer.
      const yesterdayInBogota = new Date("2026-07-16T04:00:00.000Z");
      const { start } = dayRangeInZone(NOW, BOGOTA_TIME_ZONE);
      expect(yesterdayInBogota.getTime()).toBeLessThan(start.getTime());
    });

    it("el rango no depende de la zona del proceso", () => {
      const original = process.env.TZ;
      try {
        process.env.TZ = "UTC";
        const utcRange = dayRangeInZone(NOW, BOGOTA_TIME_ZONE);
        process.env.TZ = "Asia/Tokyo";
        const tokyoRange = dayRangeInZone(NOW, BOGOTA_TIME_ZONE);
        expect(utcRange.start.toISOString()).toBe(tokyoRange.start.toISOString());
        expect(utcRange.end.toISOString()).toBe(tokyoRange.end.toISOString());
      } finally {
        process.env.TZ = original;
      }
    });
  });
});

describe("Overdue via HTTP", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  const passwordHash = "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";

  const customerRow = { id: "customer-1", displayName: "Cliente Test" };

  // Fechas relativas al reloj real, lejos de cualquier frontera de dia: el
  // pasado sigue siendo pasado dentro de un test, asi que no hay flakiness.
  const dayAgo = () => new Date(Date.now() - 24 * 60 * 60 * 1000);
  const dayAhead = () => new Date(Date.now() + 24 * 60 * 60 * 1000);

  const visits: Array<Record<string, unknown>> = [];
  const tasks: Array<Record<string, unknown>> = [];

  beforeAll(async () => {
    visits.push(
      {
        id: "visit-past-programada",
        customerId: "customer-1",
        opportunityId: null,
        status: VisitStatus.programada,
        scheduledAt: dayAgo(),
        assignedToUserId: null,
      },
      {
        id: "visit-future-programada",
        customerId: "customer-1",
        opportunityId: null,
        status: VisitStatus.programada,
        scheduledAt: dayAhead(),
        assignedToUserId: null,
      },
      {
        id: "visit-past-no-realizada",
        customerId: "customer-1",
        opportunityId: null,
        status: VisitStatus.no_realizada,
        scheduledAt: dayAgo(),
        assignedToUserId: null,
      },
    );

    tasks.push(
      {
        id: "task-past-pendiente",
        customerId: "customer-1",
        opportunityId: null,
        type: FollowUpTaskType.llamada,
        title: "Tarea vencida",
        status: FollowUpTaskStatus.pendiente,
        dueAt: dayAgo(),
        assignedToUserId: null,
      },
      {
        id: "task-future-pendiente",
        customerId: "customer-1",
        opportunityId: null,
        type: FollowUpTaskType.llamada,
        title: "Tarea futura",
        status: FollowUpTaskStatus.pendiente,
        dueAt: dayAhead(),
        assignedToUserId: null,
      },
      {
        id: "task-past-completada",
        customerId: "customer-1",
        opportunityId: null,
        type: FollowUpTaskType.email,
        title: "Tarea hecha",
        status: FollowUpTaskStatus.completada,
        dueAt: dayAgo(),
        assignedToUserId: null,
      },
    );

    const prismaStub = {
      user: {
        findUnique: async ({ where }: { where: { email?: string } }) =>
          where.email === "admin@norgtech.local"
            ? {
                id: "admin-user-id",
                name: "Admin",
                email: "admin@norgtech.local",
                passwordHash,
                role: UserRole.administrador,
                active: true,
              }
            : null,
      },
      refreshToken: refreshTokenStub(),
      customer: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          where.id === customerRow.id ? customerRow : null,
      },
      visit: {
        findMany: async ({ where }: { where?: Record<string, unknown> }) =>
          visits
            .filter((v) => matchesWhere(v, where))
            .map((v) => ({ ...v, customer: customerRow })),
        findUnique: async ({ where }: { where: { id: string } }) => {
          const found = visits.find((v) => v.id === where.id);
          return found ? { ...found, customer: customerRow } : null;
        },
      },
      followUpTask: {
        findMany: async ({ where }: { where?: Record<string, unknown> }) =>
          tasks
            .filter((t) => matchesWhere(t, where))
            .map((t) => ({ ...t, customer: customerRow })),
        findUnique: async ({ where }: { where: { id: string } }) => {
          const found = tasks.find((t) => t.id === where.id);
          return found ? { ...found, customer: customerRow } : null;
        },
      },
      auditLog: { findMany: async () => [] },
      $transaction: async <T>(callback: (tx: unknown) => Promise<T>) =>
        callback({
          visit: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              const visit = { id: `visit-${visits.length + 1}`, status: VisitStatus.programada, ...data };
              visits.push(visit);
              return visit;
            },
          },
          auditLog: { create: async ({ data }: { data: unknown }) => data },
        }),
    };

    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  async function token() {
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin@norgtech.local", password: "Admin123*" })
      .expect(200);
    return res.body.accessToken;
  }

  it("GET /visits?overdue=true devuelve la visita pasada sin que nadie ejecute nada", async () => {
    const res = await request(app.getHttpServer())
      .get("/visits?overdue=true")
      .set("Authorization", `Bearer ${await token()}`)
      .expect(200);

    expect(res.body.map((v: { id: string }) => v.id)).toEqual(["visit-past-programada"]);
  });

  it("GET /follow-up-tasks?overdue=true devuelve la tarea pasada pendiente y solo esa", async () => {
    const res = await request(app.getHttpServer())
      .get("/follow-up-tasks?overdue=true")
      .set("Authorization", `Bearer ${await token()}`)
      .expect(200);

    expect(res.body.map((t: { id: string }) => t.id)).toEqual(["task-past-pendiente"]);
  });

  it("las respuestas exponen isOverdue derivado para que el front no invente su propia regla", async () => {
    const accessToken = await token();

    const visitsRes = await request(app.getHttpServer())
      .get("/visits")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    const byId = Object.fromEntries(
      visitsRes.body.map((v: { id: string; isOverdue: boolean }) => [v.id, v.isOverdue]),
    );
    expect(byId["visit-past-programada"]).toBe(true);
    expect(byId["visit-future-programada"]).toBe(false);
    expect(byId["visit-past-no-realizada"]).toBe(false);

    const tasksRes = await request(app.getHttpServer())
      .get("/follow-up-tasks")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    const tasksById = Object.fromEntries(
      tasksRes.body.map((t: { id: string; isOverdue: boolean }) => [t.id, t.isOverdue]),
    );
    expect(tasksById["task-past-pendiente"]).toBe(true);
    expect(tasksById["task-future-pendiente"]).toBe(false);
    expect(tasksById["task-past-completada"]).toBe(false);
  });

  it("la LISTA vencida y el CONTADOR derivado coinciden (AGEN-02)", async () => {
    const accessToken = await token();

    const listRes = await request(app.getHttpServer())
      .get("/follow-up-tasks?overdue=true")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    const allRes = await request(app.getHttpServer())
      .get("/follow-up-tasks")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    const countFromFlags = allRes.body.filter((t: { isOverdue: boolean }) => t.isOverdue).length;

    expect(listRes.body.length).toBe(1);
    expect(countFromFlags).toBe(1);
    expect(listRes.body.map((t: { id: string }) => t.id)).toEqual(
      allRes.body
        .filter((t: { isOverdue: boolean }) => t.isOverdue)
        .map((t: { id: string }) => t.id),
    );
  });

  it("el endpoint mark-overdue ya no existe: el tiempo no escribe estado", async () => {
    await request(app.getHttpServer())
      .post("/follow-up-tasks/mark-overdue")
      .set("Authorization", `Bearer ${await token()}`)
      .expect(404);
  });

  /**
   * VIS-03: un datetime-local convertido a ISO CON offset debe guardar el
   * instante correcto pase lo que pase con la zona del servidor.
   */
  it("un datetime-local con offset explicito conserva la hora de pared de Bogota", async () => {
    const res = await request(app.getHttpServer())
      .post("/visits")
      .set("Authorization", `Bearer ${await token()}`)
      .send({
        customerId: "customer-1",
        scheduledAt: "2026-07-16T14:30:00.000-05:00",
        summary: "Visita de prueba",
      })
      .expect(201);

    const stored = visits.find((v) => v.id === res.body.id);
    expect((stored!.scheduledAt as Date).toISOString()).toBe("2026-07-16T19:30:00.000Z");

    const wallClock = new Intl.DateTimeFormat("es-CO", {
      timeZone: BOGOTA_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(stored!.scheduledAt as Date);
    expect(wallClock).toBe("14:30");
  });

  it("lee un scheduledAt sin offset como hora de Colombia, no del servidor (VIS-03)", async () => {
    // Rechazar esto con 400 parecia lo correcto ("un instante sin offset no es
    // un instante"), pero rompia produccion: Nora
    // (agents/nora/src/tools/visits.py) postea el `scheduled_at` del LLM sin
    // offset. Y ademas no hacia falta: en este negocio una hora sin offset
    // significa hora de pared en Colombia. El bug de VIS-03 era interpretarla
    // en la zona del SERVIDOR, no que faltara el offset.
    const response = await request(app.getHttpServer())
      .post("/visits")
      .set("Authorization", `Bearer ${await token()}`)
      .send({
        customerId: "customer-1",
        scheduledAt: "2026-07-16T14:30",
        summary: "Visita creada con hora local",
      })
      .expect(201);

    // 14:30 en Bogota (UTC-5) = 19:30 UTC.
    expect(new Date(response.body.scheduledAt).toISOString()).toBe(
      "2026-07-16T19:30:00.000Z",
    );
  });
});

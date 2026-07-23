import { FollowUpTaskStatus, NotificationType, VisitStatus } from "@prisma/client";
import { NotificationsCron } from "../src/modules/notifications/notifications.cron";

/**
 * Filtro Prisma en memoria: soporta solo las formas concretas que
 * `notifications.cron.ts` usa (`notIn`, `lt`, `gte`, `not: null`). No es un
 * interprete general de `where`. Un mismo campo puede traer varios operadores
 * (p.ej. `scheduledAt: { lt, gte }`): se exigen TODOS (AND).
 */
function matchesWhere(
  row: Record<string, unknown>,
  where: Record<string, unknown>,
): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];
    if (condition && typeof condition === "object") {
      const c = condition as Record<string, unknown>;
      if ("notIn" in c && (c.notIn as unknown[]).includes(value)) return false;
      if ("lt" in c && !(new Date(value as Date).getTime() < (c.lt as Date).getTime())) {
        return false;
      }
      if ("gte" in c && !(new Date(value as Date).getTime() >= (c.gte as Date).getTime())) {
        return false;
      }
      if ("not" in c && value === c.not) return false;
      return true;
    }
    return value === condition;
  });
}

describe("NotificationsCron.sweep", () => {
  const now = new Date("2026-07-22T12:00:00.000Z");

  const VISITS = [
    {
      id: "visit-1",
      assignedToUserId: "seller-1",
      status: VisitStatus.programada,
      scheduledAt: new Date("2026-07-15T14:00:00.000Z"),
      customer: { displayName: "Agro Norte" },
    },
    {
      id: "visit-2",
      assignedToUserId: null,
      status: VisitStatus.programada,
      scheduledAt: new Date("2026-07-16T14:00:00.000Z"),
      customer: { displayName: "Sin responsable" },
    },
    // NO vencida: fecha futura respecto de `now`.
    {
      id: "visit-3",
      assignedToUserId: "seller-2",
      status: VisitStatus.programada,
      scheduledAt: new Date("2026-08-01T14:00:00.000Z"),
      customer: { displayName: "Futura" },
    },
    // Zanjada por un humano: vencida por fecha pero completada.
    {
      id: "visit-4",
      assignedToUserId: "seller-3",
      status: VisitStatus.completada,
      scheduledAt: new Date("2026-07-10T14:00:00.000Z"),
      customer: { displayName: "Ya atendida" },
    },
    // Vencida pero anterior a la ventana de aviso (90d): sigue en la lista,
    // no debe generar campanazo.
    {
      id: "visit-5",
      assignedToUserId: "seller-4",
      status: VisitStatus.programada,
      scheduledAt: new Date("2026-01-01T14:00:00.000Z"),
      customer: { displayName: "Backlog viejo" },
    },
  ];

  const FOLLOW_UP_TASKS = [
    {
      id: "task-1",
      assignedToUserId: "seller-1",
      title: "Llamar por la cotizacion",
      status: FollowUpTaskStatus.pendiente,
      dueAt: new Date("2026-07-18T14:00:00.000Z"),
      customer: { displayName: "Agro Norte" },
    },
    // NO vencida: fecha futura respecto de `now`.
    {
      id: "task-2",
      assignedToUserId: "seller-2",
      title: "Enviar catalogo",
      status: FollowUpTaskStatus.pendiente,
      dueAt: new Date("2026-08-05T14:00:00.000Z"),
      customer: { displayName: "Futura" },
    },
    // Zanjada por un humano: vencida por fecha pero completada.
    {
      id: "task-3",
      assignedToUserId: "seller-3",
      title: "Confirmar entrega",
      status: FollowUpTaskStatus.completada,
      dueAt: new Date("2026-07-05T14:00:00.000Z"),
      customer: { displayName: "Ya atendida" },
    },
    // Vencida pero anterior a la ventana de aviso (90d): no debe notificarse.
    {
      id: "task-4",
      assignedToUserId: "seller-4",
      title: "Seguimiento olvidado",
      status: FollowUpTaskStatus.pendiente,
      dueAt: new Date("2026-01-01T14:00:00.000Z"),
      customer: { displayName: "Backlog viejo" },
    },
  ];

  function makeCron(
    emitted: Array<Record<string, unknown>>,
    deleted: number[],
    opts: { getPeriodRange?: () => { start: Date; end: Date } } = {},
  ) {
    const prisma = {
      visit: {
        findMany: async ({ where }: { where: Record<string, unknown> }) =>
          VISITS.filter((visit) => matchesWhere(visit, where)),
      },
      followUpTask: {
        findMany: async ({ where }: { where: Record<string, unknown> }) =>
          FOLLOW_UP_TASKS.filter((task) => matchesWhere(task, where)),
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
      getPeriodRange:
        opts.getPeriodRange ??
        (() => ({
          start: new Date("2026-01-01T00:00:00.000Z"),
          end: new Date("2026-12-31T23:59:59.999Z"),
        })),
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

    const seguimientos = emitted.filter(
      (e) => e.type === NotificationType.seguimiento_vencido,
    );
    expect(seguimientos).toHaveLength(1);
    expect(seguimientos[0]).toMatchObject({
      userIds: ["seller-1"],
      entityType: "follow_up_task",
      entityId: "task-1",
    });

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

  it("no notifica vencidos anteriores a la ventana de aviso", async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const cron = makeCron(emitted, []);

    await cron.sweep(now);

    const ids = emitted.map((e) => e.entityId);
    expect(ids).not.toContain("visit-5");
    expect(ids).not.toContain("task-4");
  });

  it("una meta con periodo invalido no tumba el barrido ni la purga", async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const deleted: number[] = [];
    const cron = makeCron(emitted, deleted, {
      getPeriodRange: () => {
        throw new Error("periodValue corrupto");
      },
    });

    await expect(cron.sweep(now)).resolves.toBeUndefined();

    expect(
      emitted.filter((e) => e.type === NotificationType.meta_cumplida),
    ).toHaveLength(0);
    // Las visitas/seguimientos y la purga corren pese al error de la meta.
    expect(emitted.some((e) => e.type === NotificationType.visita_vencida)).toBe(
      true,
    );
    expect(deleted).toHaveLength(1);
  });

  it("purga las leidas viejas", async () => {
    const deleted: number[] = [];
    const cron = makeCron([], deleted);

    await cron.sweep(now);

    expect(deleted).toHaveLength(1);
  });
});

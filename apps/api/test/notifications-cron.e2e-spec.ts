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

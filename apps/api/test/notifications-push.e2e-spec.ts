import { NotificationType, VisitStatus } from "@prisma/client";
import { NotificationsCron } from "../src/modules/notifications/notifications.cron";
import { NotificationsService } from "../src/modules/notifications/notifications.service";
import { WhatsAppNotificationsCron } from "../src/modules/whatsapp/whatsapp-notifications.cron";
import { WhatsAppService } from "../src/modules/whatsapp/whatsapp.service";

const NOW = new Date("2026-07-28T15:00:00.000Z");

describe("Recordatorio de visita proxima", () => {
  function makeCron(visits: Array<Record<string, unknown>>) {
    const emitted: Array<Record<string, unknown>> = [];
    const queries: Array<Record<string, unknown>> = [];

    const prisma = {
      visit: {
        findMany: async (args: Record<string, unknown>) => {
          queries.push(args);
          return visits;
        },
      },
    };

    const notifications = {
      emit: async (input: Record<string, unknown>) => {
        emitted.push(input);
        return { count: 1 };
      },
    } as unknown as NotificationsService;

    return {
      cron: new NotificationsCron(prisma as never, notifications, {} as never),
      emitted,
      queries,
    };
  }

  const visit = {
    id: "visit-1",
    assignedToUserId: "seller-1",
    scheduledAt: new Date("2026-07-28T16:00:00.000Z"),
    customer: { displayName: "Agro Norte" },
  };

  it("emite para la visita que arranca dentro de la ventana", async () => {
    const { cron, emitted } = makeCron([visit]);

    await cron.sweepUpcomingVisits(NOW);

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      userIds: ["seller-1"],
      type: NotificationType.visita_proxima,
      title: "Visita pronto: Agro Norte",
      entityType: "visit",
      entityId: "visit-1",
      // La hora programada como discriminante: reprogramar vuelve a avisar.
      discriminator: "2026-07-28T16:00:00.000Z",
    });
    expect(emitted[0].body).toContain("11:00");
  });

  it("consulta solo las dos horas siguientes y omite lo ya zanjado", async () => {
    const { cron, queries } = makeCron([]);

    await cron.sweepUpcomingVisits(NOW);

    const where = queries[0].where as Record<string, Record<string, unknown>>;
    expect(where.scheduledAt).toEqual({
      gte: NOW,
      lte: new Date("2026-07-28T17:00:00.000Z"),
    });
    expect(where.status.notIn).toContain(VisitStatus.completada);
    expect(where.status.notIn).toContain(VisitStatus.cancelada);
    expect(where.assignedToUserId).toEqual({ not: null });
  });

  it("ignora la visita sin responsable", async () => {
    const { cron, emitted } = makeCron([{ ...visit, assignedToUserId: null }]);

    await cron.sweepUpcomingVisits(NOW);

    expect(emitted).toHaveLength(0);
  });
});

describe("Empujon por WhatsApp del outbox de notificaciones", () => {
  function makeCron(pending: Array<Record<string, unknown>>) {
    const updates: Array<Record<string, unknown>> = [];
    const sent: Array<Record<string, unknown>> = [];

    const prisma = {
      notification: {
        findMany: async () => pending,
        update: async (args: Record<string, unknown>) => {
          updates.push(args);
          return {};
        },
      },
    };

    const whatsapp = {
      notifyUser: async (
        user: unknown,
        templateName: string,
        params: Array<{ name: string; text: string }>,
        previewBody: string,
      ) => {
        sent.push({ user, templateName, params, previewBody });
        return true;
      },
    } as unknown as WhatsAppService;

    return {
      cron: new WhatsAppNotificationsCron(prisma as never, whatsapp),
      updates,
      sent,
    };
  }

  const notification = {
    id: "notif-1",
    type: NotificationType.cliente_asignado,
    title: "Te asignaron el cliente Agro Norte",
    body: null,
    createdAt: new Date("2026-07-28T14:58:00.000Z"),
    user: { name: "Carlos", phone: "+573001112233", active: true },
  };

  it("envia la plantilla del tipo y marca la fila como empujada", async () => {
    const { cron, updates, sent } = makeCron([notification]);

    await cron.push(NOW);

    expect(updates).toEqual([
      { where: { id: "notif-1" }, data: { pushedAt: NOW } },
    ]);
    expect(sent).toHaveLength(1);
    expect(sent[0].templateName).toBe("cliente_asignado");
    expect(sent[0].params).toEqual([
      { name: "nombre", text: "Carlos" },
      { name: "detalle", text: "Te asignaron el cliente Agro Norte" },
    ]);
  });

  it("une titulo y cuerpo en un solo parametro de una linea", async () => {
    const { cron, sent } = makeCron([
      {
        ...notification,
        type: NotificationType.visita_proxima,
        title: "Visita pronto:  Agro\nNorte",
        body: "Empieza a las 11:00 a. m.",
      },
    ]);

    await cron.push(NOW);

    expect(sent[0].templateName).toBe("visita_proxima");
    expect((sent[0].params as Array<{ text: string }>)[1].text).toBe(
      "Visita pronto: Agro Norte — Empieza a las 11:00 a. m.",
    );
  });

  it("marca sin enviar lo viejo y lo de usuarios inactivos", async () => {
    const { cron, updates, sent } = makeCron([
      { ...notification, id: "viejo", createdAt: new Date("2026-07-28T10:00:00.000Z") },
      {
        ...notification,
        id: "inactivo",
        user: { ...notification.user, active: false },
      },
    ]);

    await cron.push(NOW);

    expect(updates).toHaveLength(2);
    expect(sent).toHaveLength(0);
  });

  it("un fallo de Kapso no detiene el resto del lote", async () => {
    const { cron, updates } = makeCron([notification, { ...notification, id: "notif-2" }]);
    let calls = 0;
    (cron as unknown as { whatsapp: WhatsAppService }).whatsapp = {
      notifyUser: async () => {
        calls += 1;
        throw new Error("kapso 500");
      },
    } as unknown as WhatsAppService;

    await expect(cron.push(NOW)).resolves.toBeUndefined();

    expect(calls).toBe(2);
    expect(updates).toHaveLength(2);
  });
});

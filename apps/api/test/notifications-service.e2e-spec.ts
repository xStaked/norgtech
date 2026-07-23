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

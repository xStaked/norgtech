import { UserRole } from "@prisma/client";
import { backfillOrderSeller } from "../prisma/scripts/backfill-order-seller";

/**
 * Estos tests viven aqui, y no como `prisma/scripts/*.spec.ts` (el precedente
 * de fix-billing-company-snapshot.spec.ts), porque el unico runner del paquete
 * es test/jest-e2e.json con testRegex `.e2e-spec.ts$`: un `.spec.ts` en
 * prisma/scripts NO lo ejecuta nadie. Ver reporte.
 */
describe("backfillOrderSeller (GOAL-02)", () => {
  const users = [
    { id: "seller-1", role: UserRole.comercial, active: true },
    { id: "director-1", role: UserRole.director_comercial, active: true },
    { id: "seller-inactive", role: UserRole.comercial, active: false },
    { id: "billing-1", role: UserRole.facturacion, active: true },
  ];

  function buildPrisma(orders: any[]) {
    const updates: any[] = [];
    const prisma: any = {
      order: {
        findMany: jest.fn(async ({ where }: any) => {
          // El script SOLO debe pedir pedidos sin vendedor: es lo que lo hace
          // idempotente. Si dejara de filtrar, este stub lo delataria.
          expect(where).toEqual({ sellerUserId: null });
          return orders.filter((order) => order.sellerUserId === null);
        }),
        update: jest.fn(async (args: any) => {
          updates.push(args);
          return args;
        }),
      },
      user: {
        findMany: jest.fn(async ({ where }: any) =>
          users.filter((user) => where.id.in.includes(user.id)),
        ),
      },
    };
    return { prisma, updates };
  }

  it("usa customer.assignedToUserId cuando existe", async () => {
    const { prisma, updates } = buildPrisma([
      {
        id: "ord_1",
        sellerUserId: null,
        createdBy: "billing-1",
        customer: { assignedToUserId: "seller-1" },
      },
    ]);

    const res = await backfillOrderSeller(prisma);

    expect(res).toEqual({ scanned: 1, updated: 1, unresolved: 0 });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({
      where: { id: "ord_1" },
      data: { sellerUserId: "seller-1" },
    });
  });

  it("cae a createdBy cuando el cliente no tiene vendedor asignado y el creador es vendedor elegible", async () => {
    const { prisma, updates } = buildPrisma([
      {
        id: "ord_2",
        sellerUserId: null,
        createdBy: "seller-1",
        customer: { assignedToUserId: null },
      },
      {
        id: "ord_3",
        sellerUserId: null,
        createdBy: "director-1",
        customer: { assignedToUserId: null },
      },
    ]);

    const res = await backfillOrderSeller(prisma);

    expect(res).toEqual({ scanned: 2, updated: 2, unresolved: 0 });
    expect(updates.map((u) => u.data.sellerUserId)).toEqual([
      "seller-1",
      "director-1",
    ]);
  });

  it("prefiere el cliente asignado sobre createdBy", async () => {
    const { prisma, updates } = buildPrisma([
      {
        id: "ord_4",
        sellerUserId: null,
        createdBy: "seller-1",
        customer: { assignedToUserId: "director-1" },
      },
    ]);

    await backfillOrderSeller(prisma);

    expect(updates[0].data.sellerUserId).toBe("director-1");
  });

  it("deja NULL y reporta unresolved cuando el creador no es vendedor elegible", async () => {
    const { prisma, updates } = buildPrisma([
      // rol no vendedor
      {
        id: "ord_5",
        sellerUserId: null,
        createdBy: "billing-1",
        customer: { assignedToUserId: null },
      },
      // vendedor pero inactivo
      {
        id: "ord_6",
        sellerUserId: null,
        createdBy: "seller-inactive",
        customer: { assignedToUserId: null },
      },
    ]);

    const res = await backfillOrderSeller(prisma);

    expect(res).toEqual({ scanned: 2, updated: 0, unresolved: 2 });
    expect(updates).toHaveLength(0);
  });

  it("reporta scanned/updated/unresolved sin topes silenciosos", async () => {
    const { prisma } = buildPrisma([
      {
        id: "ord_7",
        sellerUserId: null,
        createdBy: "seller-1",
        customer: { assignedToUserId: null },
      },
      {
        id: "ord_8",
        sellerUserId: null,
        createdBy: "billing-1",
        customer: { assignedToUserId: null },
      },
    ]);
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);

    const res = await backfillOrderSeller(prisma);

    expect(res).toEqual({ scanned: 2, updated: 1, unresolved: 1 });
    expect(log).toHaveBeenCalledWith(
      "[backfill-order-seller] scanned=2 updated=1 unresolved=1",
    );
    log.mockRestore();
  });

  it("es idempotente: ignora pedidos que ya tienen vendedor", async () => {
    const { prisma, updates } = buildPrisma([
      {
        id: "ord_9",
        sellerUserId: "seller-1",
        createdBy: "seller-1",
        customer: { assignedToUserId: "director-1" },
      },
    ]);

    const res = await backfillOrderSeller(prisma);

    expect(res).toEqual({ scanned: 0, updated: 0, unresolved: 0 });
    expect(updates).toHaveLength(0);
  });
});

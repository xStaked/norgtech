import { fixBillingCompanySnapshot } from "../prisma/scripts/fix-billing-company-snapshot";

describe("fixBillingCompanySnapshot", () => {
  function buildPrisma(orders: any[]) {
    const updates: any[] = [];
    const prisma: any = {
      order: {
        findMany: jest.fn().mockResolvedValue(orders),
        update: jest.fn(async (args: any) => {
          updates.push(args);
          return args;
        }),
      },
    };
    return { prisma, updates };
  }

  it("reescribe el snapshot cuando hoy = nombre del cliente", async () => {
    const { prisma, updates } = buildPrisma([
      {
        id: "ord_1",
        billingCompanyNameSnapshot: "DT comercial",
        customerNameSnapshot: "DT comercial",
        company: { name: "Empresa Prueba" },
      },
    ]);
    const res = await fixBillingCompanySnapshot(prisma);
    expect(res.corrected).toBe(1);
    expect(updates[0].data.billingCompanyNameSnapshot).toBe("Empresa Prueba");
  });

  it("no toca pedidos ya correctos (idempotente)", async () => {
    const { prisma, updates } = buildPrisma([
      {
        id: "ord_2",
        billingCompanyNameSnapshot: "Empresa Prueba",
        customerNameSnapshot: "DT comercial",
        company: { name: "Empresa Prueba" },
      },
    ]);
    const res = await fixBillingCompanySnapshot(prisma);
    expect(res.corrected).toBe(0);
    expect(updates).toHaveLength(0);
  });
});

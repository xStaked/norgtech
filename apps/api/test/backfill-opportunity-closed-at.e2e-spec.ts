import { OpportunityStage } from "@prisma/client";
import { backfillOpportunityClosedAt } from "../prisma/scripts/backfill-opportunity-closed-at";

/**
 * Estos tests viven aqui, y no como `prisma/scripts/*.spec.ts`, porque el unico
 * runner del paquete es test/jest-e2e.json con testRegex `.e2e-spec.ts$`: un
 * `.spec.ts` en prisma/scripts NO lo ejecuta nadie.
 */
describe("backfillOpportunityClosedAt (DASH-06)", () => {
  function buildPrisma(opportunities: any[]) {
    const updates: any[] = [];
    const prisma: any = {
      opportunity: {
        findMany: jest.fn(async ({ where }: any) => {
          // El script SOLO debe pedir ventas cerradas sin closedAt: es lo que
          // lo hace idempotente. Si dejara de filtrar, este stub lo delataria.
          expect(where).toEqual({
            stage: OpportunityStage.venta_cerrada,
            closedAt: null,
          });
          return opportunities.filter(
            (o) => o.stage === OpportunityStage.venta_cerrada && o.closedAt === null,
          );
        }),
        update: jest.fn(async (args: any) => {
          updates.push(args);
          return args;
        }),
      },
    };
    return { prisma, updates };
  }

  it("sella closedAt = updatedAt en ventas cerradas historicas", async () => {
    const updatedAt = new Date("2026-05-02T15:30:00.000Z");
    const { prisma, updates } = buildPrisma([
      { id: "opp_1", stage: OpportunityStage.venta_cerrada, closedAt: null, updatedAt },
    ]);

    const res = await backfillOpportunityClosedAt(prisma);

    expect(res).toEqual({ scanned: 1, updated: 1 });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({
      where: { id: "opp_1" },
      data: { closedAt: updatedAt },
    });
  });

  it("es idempotente: ignora las que ya tienen closedAt", async () => {
    const { prisma, updates } = buildPrisma([
      {
        id: "opp_2",
        stage: OpportunityStage.venta_cerrada,
        closedAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-01T00:00:00.000Z"),
      },
    ]);

    const res = await backfillOpportunityClosedAt(prisma);

    expect(res).toEqual({ scanned: 0, updated: 0 });
    expect(updates).toHaveLength(0);
  });

  it("no toca oportunidades que no son venta_cerrada", async () => {
    const { prisma, updates } = buildPrisma([
      {
        id: "opp_3",
        stage: OpportunityStage.negociacion,
        closedAt: null,
        updatedAt: new Date("2026-06-01T00:00:00.000Z"),
      },
      {
        id: "opp_4",
        stage: OpportunityStage.perdida,
        closedAt: null,
        updatedAt: new Date("2026-06-01T00:00:00.000Z"),
      },
    ]);

    const res = await backfillOpportunityClosedAt(prisma);

    expect(res).toEqual({ scanned: 0, updated: 0 });
    expect(updates).toHaveLength(0);
  });

  it("reporta scanned/updated y advierte de la aproximacion en el log", async () => {
    const { prisma } = buildPrisma([
      {
        id: "opp_5",
        stage: OpportunityStage.venta_cerrada,
        closedAt: null,
        updatedAt: new Date("2026-05-02T00:00:00.000Z"),
      },
      {
        id: "opp_6",
        stage: OpportunityStage.venta_cerrada,
        closedAt: null,
        updatedAt: new Date("2026-05-03T00:00:00.000Z"),
      },
      {
        id: "opp_7",
        stage: OpportunityStage.negociacion,
        closedAt: null,
        updatedAt: new Date("2026-05-04T00:00:00.000Z"),
      },
    ]);
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);

    const res = await backfillOpportunityClosedAt(prisma);

    expect(res).toEqual({ scanned: 2, updated: 2 });
    expect(log).toHaveBeenCalledWith(
      "[backfill-opportunity-closed-at] scanned=2 updated=2 (closedAt=updatedAt, aproximacion: updatedAt se mueve con cualquier edicion)",
    );
    log.mockRestore();
  });
});

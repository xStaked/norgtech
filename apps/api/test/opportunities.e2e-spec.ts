import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { OpportunityStage, UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { refreshTokenStub } from "./helpers/login-as";

declare global {
  // eslint-disable-next-line no-var
  var __APP__: ReturnType<INestApplication["getHttpServer"]> | undefined;
  // eslint-disable-next-line no-var
  var __ADMIN_TOKEN__: string | undefined;
  // eslint-disable-next-line no-var
  var __CUSTOMER_ID__: string | undefined;
}

describe("Opportunities", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  const passwordHash =
    "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";
  const customerId = "customer-id";
  const auditLogs: Array<Record<string, unknown>> = [];
  const opportunities: Array<Record<string, unknown>> = [];
  const staleWriteIds = new Set<string>();

  beforeAll(async () => {
    const user = {
      findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email === "admin@norgtech.local" || where.id === "admin-user-id") {
          return {
            id: "admin-user-id",
            name: "Admin",
            email: "admin@norgtech.local",
            passwordHash,
            role: UserRole.administrador,
            active: true,
          };
        }

        return null;
      },
    };

    const customer = {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        id === customerId
          ? {
              id: customerId,
              legalName: "Ganaderia Andina SAS",
              displayName: "Ganaderia Andina",
              taxId: "900123456",
              phone: null,
              email: null,
              address: null,
              city: null,
              department: null,
              notes: null,
              segmentId: "segment-id",
              assignedToUserId: null,
              active: true,
              createdBy: "admin-user-id",
              updatedBy: "admin-user-id",
              createdAt: new Date("2026-04-29T00:00:00.000Z"),
              updatedAt: new Date("2026-04-29T00:00:00.000Z"),
            }
          : null,
    };

    const prismaStub = {
      user,
      refreshToken: refreshTokenStub(),
      customer,
      opportunity: {
        create: async () => {
          throw new Error("opportunity.create must run inside a transaction");
        },
        findUnique: async () => {
          throw new Error("opportunity.findUnique must be implemented");
        },
        updateMany: async () => {
          throw new Error("opportunity.updateMany must run inside a transaction");
        },
      },
      auditLog: {
        create: async () => {
          throw new Error("auditLog.create must run inside a transaction");
        },
        findMany: async ({
          where,
        }: {
          where?: { entityType?: string; entityId?: string };
        }) =>
          auditLogs.filter(
            (entry) =>
              (!where?.entityType || entry.entityType === where.entityType) &&
              (!where?.entityId || entry.entityId === where.entityId),
          ),
      },
      $transaction: async <T>(
        callback: (tx: {
          opportunity: {
            create: (args: {
              data: {
                customerId: string;
                title: string;
                stage: OpportunityStage;
                estimatedValue?: number | string | null;
                closedAt?: Date | null;
                createdBy: string;
                updatedBy: string;
              };
            }) => Promise<Record<string, unknown>>;
            findUnique: (args: {
              where: { id: string };
            }) => Promise<Record<string, unknown> | null>;
            updateMany: (args: {
              where: {
                id: string;
                stage: OpportunityStage;
              };
              data: {
                stage: OpportunityStage;
                updatedBy: string;
                closedAt?: Date | null;
              };
            }) => Promise<{ count: number }>;
          };
          auditLog: {
            create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
          };
        }) => Promise<T>,
      ) => {
        const pendingOpportunities: Array<Record<string, unknown>> = [];
        const pendingAuditLogs: Array<Record<string, unknown>> = [];

        const findOpportunityById = (id: string) =>
          pendingOpportunities.find((entry) => entry.id === id) ??
          opportunities.find((entry) => entry.id === id) ??
          null;

        const result = await callback({
          opportunity: {
            create: async ({ data }) => {
              const opportunity = {
                id: `opportunity-${pendingOpportunities.length + opportunities.length + 1}`,
                customerId: data.customerId,
                title: data.title,
                description: null,
                stage: data.stage,
                estimatedValue: data.estimatedValue ?? null,
                expectedCloseDate: null,
                assignedToUserId: null,
                lostReason: null,
                // El stub honra `closedAt` en vez de fijarlo a null: si lo
                // ignorara, un test de DASH-06 pasaria sin que el servicio
                // escriba nada (stub que traga claves desconocidas).
                closedAt: data.closedAt ?? null,
                createdBy: data.createdBy,
                updatedBy: data.updatedBy,
                createdAt: new Date("2026-04-29T00:00:00.000Z"),
                updatedAt: new Date("2026-04-29T00:00:00.000Z"),
              };

              if (data.title === "Simular carrera") {
                staleWriteIds.add(opportunity.id);
              }

              pendingOpportunities.push(opportunity);
              return opportunity;
            },
            findUnique: async ({ where: { id } }) => findOpportunityById(id),
            updateMany: async ({ where, data }) => {
              const { id, stage } = where;
              const existing = findOpportunityById(id);

              if (!existing) {
                return { count: 0 };
              }

              if (staleWriteIds.has(id)) {
                const raced = {
                  ...existing,
                  stage: "perdida",
                  updatedBy: "external-user-id",
                  updatedAt: new Date("2026-04-29T00:00:01.000Z"),
                };

                const pendingRaceIndex = pendingOpportunities.findIndex(
                  (entry) => entry.id === id,
                );

                if (pendingRaceIndex >= 0) {
                  pendingOpportunities[pendingRaceIndex] = raced;
                } else {
                  const committedRaceIndex = opportunities.findIndex((entry) => entry.id === id);
                  if (committedRaceIndex >= 0) {
                    opportunities[committedRaceIndex] = raced;
                  }
                }

                staleWriteIds.delete(id);
              }

              const current = findOpportunityById(id);

              if (!current || current.stage !== stage) {
                return { count: 0 };
              }

              const updated = {
                ...current,
                stage: data.stage,
                updatedBy: data.updatedBy,
                updatedAt: new Date("2026-04-29T00:00:00.000Z"),
                ...("closedAt" in data ? { closedAt: data.closedAt } : {}),
              };

              const pendingIndex = pendingOpportunities.findIndex(
                (entry) => entry.id === id,
              );

              if (pendingIndex >= 0) {
                pendingOpportunities[pendingIndex] = updated;
              } else {
                const committedIndex = opportunities.findIndex((entry) => entry.id === id);
                if (committedIndex >= 0) {
                  opportunities[committedIndex] = updated;
                }
              }

              return { count: 1 };
            },
          },
          auditLog: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              const entry = {
                id: `audit-${pendingAuditLogs.length + auditLogs.length + 1}`,
                createdAt: new Date("2026-04-29T00:00:00.000Z"),
                ...data,
              };

              pendingAuditLogs.push(entry);
              return entry;
            },
          },
        });

        opportunities.push(...pendingOpportunities);
        auditLogs.push(...pendingAuditLogs);

        return result;
      },
    };

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    globalThis.__APP__ = app.getHttpServer();
    globalThis.__CUSTOMER_ID__ = customerId;

    const loginResponse = await request(globalThis.__APP__)
      .post("/auth/login")
      .send({ email: "admin@norgtech.local", password: "Admin123*" })
      .expect(200);

    globalThis.__ADMIN_TOKEN__ = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    globalThis.__ADMIN_TOKEN__ = undefined;
    globalThis.__APP__ = undefined;
    globalThis.__CUSTOMER_ID__ = undefined;

    await app.close();
    await moduleRef.close();
  });

  it("allows valid pipeline transitions and rejects invalid ones", async () => {
    const created = await request(globalThis.__APP__)
      .post("/opportunities")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: globalThis.__CUSTOMER_ID__,
        title: "Proyecto nutricion bovina",
        stage: "prospecto",
        estimatedValue: 15000000,
      })
      .expect(201);

    await request(globalThis.__APP__)
      .patch(`/opportunities/${created.body.id}/stage`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ stage: "contacto" })
      .expect(200);

    await request(globalThis.__APP__)
      .patch(`/opportunities/${created.body.id}/stage`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ stage: "venta_cerrada" })
      .expect(400);
  });

  // DASH-06: `closedAt` no lo escribia nadie, asi que el contador
  // "Ventas cerradas 30d" (stage=venta_cerrada AND closedAt >= hace 30d)
  // era estructuralmente 0: la columna siempre era NULL.
  describe("closedAt (DASH-06)", () => {
    const advanceTo = async (id: string, stages: OpportunityStage[]) => {
      for (const stage of stages) {
        await request(globalThis.__APP__)
          .patch(`/opportunities/${id}/stage`)
          .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
          .send({ stage })
          .expect(200);
      }
    };

    it("stamps closedAt when an opportunity transitions into venta_cerrada", async () => {
      const created = await request(globalThis.__APP__)
        .post("/opportunities")
        .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
        .send({
          customerId: globalThis.__CUSTOMER_ID__,
          title: "Cierre por transicion",
          stage: "prospecto",
        })
        .expect(201);

      expect(created.body.closedAt).toBeNull();

      await advanceTo(created.body.id, [
        "contacto",
        "visita",
        "cotizacion",
        "negociacion",
        "orden_facturacion",
      ]);

      const closed = await request(globalThis.__APP__)
        .patch(`/opportunities/${created.body.id}/stage`)
        .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
        .send({ stage: "venta_cerrada" })
        .expect(200);

      expect(closed.body.stage).toBe("venta_cerrada");
      expect(closed.body.closedAt).not.toBeNull();
      expect(closed.body.closedAt).toEqual(expect.any(String));
      expect(Number.isNaN(Date.parse(closed.body.closedAt))).toBe(false);
    });

    it("leaves closedAt null while the opportunity is not a closed sale", async () => {
      const created = await request(globalThis.__APP__)
        .post("/opportunities")
        .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
        .send({
          customerId: globalThis.__CUSTOMER_ID__,
          title: "Sigue abierta",
          stage: "prospecto",
        })
        .expect(201);

      // Se afirma sobre la respuesta del PATCH: el stub de este spec no
      // implementa `opportunity.findUnique` fuera de transaccion (GET -> 500).
      const moved = await request(globalThis.__APP__)
        .patch(`/opportunities/${created.body.id}/stage`)
        .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
        .send({ stage: "contacto" })
        .expect(200);

      expect(moved.body.stage).toBe("contacto");
      expect(moved.body.closedAt).toBeNull();
    });

    it("stamps closedAt when an opportunity is created directly as venta_cerrada", async () => {
      // `CreateOpportunityDto.stage` es un @IsEnum libre: se puede crear ya
      // cerrada sin pasar por updateStage, asi que el create tambien sella.
      const created = await request(globalThis.__APP__)
        .post("/opportunities")
        .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
        .send({
          customerId: globalThis.__CUSTOMER_ID__,
          title: "Nace cerrada",
          stage: "venta_cerrada",
        })
        .expect(201);

      expect(created.body.stage).toBe("venta_cerrada");
      expect(created.body.closedAt).not.toBeNull();
      expect(Number.isNaN(Date.parse(created.body.closedAt))).toBe(false);
    });

    it("leaves closedAt null when an opportunity is created as perdida", async () => {
      const created = await request(globalThis.__APP__)
        .post("/opportunities")
        .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
        .send({
          customerId: globalThis.__CUSTOMER_ID__,
          title: "Nace perdida",
          stage: "perdida",
        })
        .expect(201);

      expect(created.body.closedAt).toBeNull();
    });
  });

  it("rejects stale stage updates when the row changes before persistence", async () => {
    const created = await request(globalThis.__APP__)
      .post("/opportunities")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: globalThis.__CUSTOMER_ID__,
        title: "Simular carrera",
        stage: "prospecto",
        estimatedValue: 15000000,
      })
      .expect(201);

    await request(globalThis.__APP__)
      .patch(`/opportunities/${created.body.id}/stage`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ stage: "contacto" })
      .expect(409);
  });
});

import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { UserRole, VisitStatus } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

declare global {
  // eslint-disable-next-line no-var
  var __APP__: ReturnType<INestApplication["getHttpServer"]> | undefined;
  // eslint-disable-next-line no-var
  var __ADMIN_TOKEN__: string | undefined;
}

describe("Visits", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  const passwordHash = "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";
  const visits: Array<Record<string, unknown>> = [];
  const auditLogs: Array<Record<string, unknown>> = [];

  beforeAll(async () => {
    const user = {
      findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email === "admin@norgtech.local") {
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
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id === "customer-1") {
          return {
            id: "customer-1",
            displayName: "Cliente Test",
          };
        }
        return null;
      },
    };

    const prismaStub = {
      user,
      customer,
      visit: {
        create: async () => {
          throw new Error("visit.create must run inside a transaction");
        },
        findUnique: async ({ where }: { where: { id: string } }) => {
          return visits.find((v) => v.id === where.id) ?? null;
        },
        findMany: async ({ where }: { where?: Record<string, unknown> }) => {
          let result = [...visits];
          if (where?.status) {
            result = result.filter((v) => v.status === where.status);
          }
          if (where?.assignedToUserId) {
            result = result.filter((v) => v.assignedToUserId === where.assignedToUserId);
          }
          if (where?.scheduledAt && typeof where.scheduledAt === "object") {
            const range = where.scheduledAt as Record<string, Date>;
            result = result.filter((v) => {
              const t = new Date(v.scheduledAt as string).getTime();
              return (!range.gte || t >= new Date(range.gte).getTime())
                && (!range.lte || t <= new Date(range.lte).getTime());
            });
          }
          return result.map((v) => ({ ...v, customer: { id: "customer-1", displayName: "Cliente Test" } }));
        },
        updateMany: async ({ where, data }: { where: { id: string; status?: string }; data: Record<string, unknown> }) => {
          const idx = visits.findIndex((v) => v.id === where.id && (!where.status || v.status === where.status));
          if (idx !== -1) {
            visits[idx] = { ...visits[idx], ...data };
            return { count: 1 };
          }
          return { count: 0 };
        },
      },
      auditLog: {
        create: async () => {
          throw new Error("auditLog.create must run inside a transaction");
        },
        findMany: async () => auditLogs,
      },
      $transaction: async <T>(callback: (tx: {
        visit: {
          create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
        };
        auditLog: {
          create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
        };
      }) => Promise<T>) => {
        const pendingVisits: Array<Record<string, unknown>> = [];
        const pendingAuditLogs: Array<Record<string, unknown>> = [];

        const txVisit = {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            const visit = {
              id: `visit-${visits.length + pendingVisits.length + 1}`,
              ...data,
              status: data.status ?? VisitStatus.programada,
              createdAt: new Date("2026-04-29T00:00:00.000Z"),
              updatedAt: new Date("2026-04-29T00:00:00.000Z"),
            };
            pendingVisits.push(visit);
            return visit;
          },
          findUnique: async ({ where }: { where: { id: string } }) => {
            const found = [...visits, ...pendingVisits].find((v) => v.id === where.id);
            return found ? { ...found } : null;
          },
          updateMany: async ({ where, data }: { where: { id: string; status?: string }; data: Record<string, unknown> }) => {
            const all = [...visits, ...pendingVisits];
            const idx = all.findIndex((v) => v.id === where.id && (!where.status || v.status === where.status));
            if (idx !== -1) {
              if (idx < visits.length) {
                visits[idx] = { ...visits[idx], ...data };
              } else {
                pendingVisits[idx - visits.length] = { ...pendingVisits[idx - visits.length], ...data };
              }
              return { count: 1 };
            }
            return { count: 0 };
          },
        };

        const result = await callback({
          visit: txVisit,
          auditLog: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              const entry = {
                id: `audit-${auditLogs.length + pendingAuditLogs.length + 1}`,
                createdAt: new Date("2026-04-29T00:00:00.000Z"),
                ...data,
              };
              pendingAuditLogs.push(entry);
              return entry;
            },
          },
        });

        visits.push(...pendingVisits);
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

    const loginResponse = await request(globalThis.__APP__)
      .post("/auth/login")
      .send({ email: "admin@norgtech.local", password: "Admin123*" })
      .expect(200);

    globalThis.__ADMIN_TOKEN__ = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    globalThis.__ADMIN_TOKEN__ = undefined;
    globalThis.__APP__ = undefined;
    if (app) {
      await app.close();
    }
  });

  it("creates a visit", async () => {
    const response = await request(globalThis.__APP__)
      .post("/visits")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        scheduledAt: "2026-04-30T10:00:00.000Z",
        notes: "Notas de prueba",
      })
      .expect(201);

    expect(response.body.customerId).toBe("customer-1");
    expect(response.body.status).toBe(VisitStatus.programada);
  });

  it("filters visits by status", async () => {
    const response = await request(globalThis.__APP__)
      .get("/visits?status=programada")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.every((v: { status: string }) => v.status === VisitStatus.programada)).toBe(true);
  });

  it("filters visits by assignedToMe", async () => {
    const response = await request(globalThis.__APP__)
      .get("/visits?assignedToMe=true")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });

  it("updates visit status with valid transition", async () => {
    const createResponse = await request(globalThis.__APP__)
      .post("/visits")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        scheduledAt: "2026-05-01T10:00:00.000Z",
      })
      .expect(201);

    const visitId = createResponse.body.id;

    await request(globalThis.__APP__)
      .patch(`/visits/${visitId}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: VisitStatus.completada })
      .expect(200);

    const updated = visits.find((v) => v.id === visitId);
    expect(updated?.status).toBe(VisitStatus.completada);
  });

  it("rejects invalid status transition", async () => {
    const createResponse = await request(globalThis.__APP__)
      .post("/visits")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        scheduledAt: "2026-05-02T10:00:00.000Z",
      })
      .expect(201);

    const visitId = createResponse.body.id;

    await request(globalThis.__APP__)
      .patch(`/visits/${visitId}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: VisitStatus.programada })
      .expect(400);
  });
});

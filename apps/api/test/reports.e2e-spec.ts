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

describe("Reports", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  const passwordHash = "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";
  const reports: Array<Record<string, unknown>> = [];
  const visits: Array<Record<string, unknown>> = [];

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

    const visit = {
      findUnique: async ({ where }: { where: { id: string } }) => {
        return visits.find((v) => v.id === where.id) ?? null;
      },
      findMany: async () => visits,
    };

    const executiveReport = {
      create: async ({ data, include }: { data: Record<string, unknown>; include?: Record<string, boolean> }) => {
        const report = {
          id: `report-${reports.length + 1}`,
          ...data,
          createdAt: new Date("2026-04-29T00:00:00.000Z"),
          updatedAt: new Date("2026-04-29T00:00:00.000Z"),
          customer: include?.customer ? { id: "customer-1", displayName: "Cliente Test" } : undefined,
          visit: include?.visit ? { id: data.visitId, scheduledAt: new Date("2026-04-29T00:00:00.000Z"), status: VisitStatus.completada } : undefined,
          creator: include?.creator ? { id: "admin-user-id", name: "Admin", email: "admin@norgtech.local" } : undefined,
        };
        reports.push(report);
        return report;
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        return reports.find((r) => r.id === where.id) ?? null;
      },
      findMany: async () => reports,
    };

    const prismaStub = {
      user,
      customer,
      visit,
      executiveReport,
      $transaction: async <T>(
        callback: (tx: {
          executiveReport: {
            create: (args: {
              data: Record<string, unknown>;
              include?: Record<string, boolean>;
            }) => Promise<Record<string, unknown>>;
          };
        }) => Promise<T>,
      ) => {
        const pendingReports: Array<Record<string, unknown>> = [];

        const result = await callback({
          executiveReport: {
            create: async ({ data, include }) => {
              const report = {
                id: `report-${reports.length + pendingReports.length + 1}`,
                ...data,
                createdAt: new Date("2026-04-29T00:00:00.000Z"),
                updatedAt: new Date("2026-04-29T00:00:00.000Z"),
                customer: include?.customer ? { id: "customer-1", displayName: "Cliente Test" } : undefined,
                visit: include?.visit ? { id: data.visitId, scheduledAt: new Date("2026-04-29T00:00:00.000Z"), status: VisitStatus.completada } : undefined,
                creator: include?.creator ? { id: "admin-user-id", name: "Admin", email: "admin@norgtech.local" } : undefined,
              };
              pendingReports.push(report);
              return report;
            },
          },
        });

        reports.push(...pendingReports);
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

  it("creates a report from a completed visit", async () => {
    visits.push({
      id: "visit-completed-1",
      customerId: "customer-1",
      status: VisitStatus.completada,
      summary: "Visita completada con éxito",
      notes: "Notas de la visita",
      nextStep: "Seguimiento en 7 días",
      completedAt: new Date("2026-04-29T00:00:00.000Z"),
      scheduledAt: new Date("2026-04-29T00:00:00.000Z"),
      opportunity: null,
      customer: { displayName: "Cliente Test" },
    });

    const response = await request(globalThis.__APP__)
      .post("/reports/from-visit/visit-completed-1")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({})
      .expect(201);

    expect(response.body.title).toContain("Reporte Ejecutivo");
    expect(response.body.customerId).toBe("customer-1");
    expect(response.body.visitId).toBe("visit-completed-1");
    expect(response.body.payload).toBeDefined();
  });

  it("rejects report generation from incomplete visit", async () => {
    visits.push({
      id: "visit-incomplete-1",
      customerId: "customer-1",
      status: VisitStatus.programada,
      summary: null,
      notes: null,
      nextStep: null,
      completedAt: null,
      scheduledAt: new Date("2026-04-29T00:00:00.000Z"),
    });

    await request(globalThis.__APP__)
      .post("/reports/from-visit/visit-incomplete-1")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({})
      .expect(400);
  });

  it("rejects report generation from visit without summary", async () => {
    visits.push({
      id: "visit-no-summary-1",
      customerId: "customer-1",
      status: VisitStatus.completada,
      summary: null,
      notes: null,
      nextStep: null,
      completedAt: new Date("2026-04-29T00:00:00.000Z"),
      scheduledAt: new Date("2026-04-29T00:00:00.000Z"),
    });

    await request(globalThis.__APP__)
      .post("/reports/from-visit/visit-no-summary-1")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({})
      .expect(400);
  });

  it("persists report metadata correctly", async () => {
    visits.push({
      id: "visit-persist-1",
      customerId: "customer-1",
      status: VisitStatus.completada,
      summary: "Resumen para persistencia",
      notes: null,
      nextStep: null,
      completedAt: new Date("2026-04-29T00:00:00.000Z"),
      scheduledAt: new Date("2026-04-29T00:00:00.000Z"),
      opportunity: null,
      customer: { displayName: "Cliente Test" },
    });

    const createResponse = await request(globalThis.__APP__)
      .post("/reports/from-visit/visit-persist-1")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({})
      .expect(201);

    const reportId = createResponse.body.id;

    const detailResponse = await request(globalThis.__APP__)
      .get(`/reports/${reportId}`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    expect(detailResponse.body.id).toBe(reportId);
    expect(detailResponse.body.customerId).toBe("customer-1");
    expect(detailResponse.body.payload).toBeDefined();
  });

  it("lists all reports", async () => {
    const response = await request(globalThis.__APP__)
      .get("/reports")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });

  it("downloads PDF for a report", async () => {
    visits.push({
      id: "visit-pdf-1",
      customerId: "customer-1",
      status: VisitStatus.completada,
      summary: "Resumen para PDF",
      notes: null,
      nextStep: null,
      completedAt: new Date("2026-04-29T00:00:00.000Z"),
      scheduledAt: new Date("2026-04-29T00:00:00.000Z"),
      opportunity: null,
      customer: { displayName: "Cliente Test" },
    });

    const createResponse = await request(globalThis.__APP__)
      .post("/reports/from-visit/visit-pdf-1")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({})
      .expect(201);

    const reportId = createResponse.body.id;

    const pdfResponse = await request(globalThis.__APP__)
      .get(`/reports/${reportId}/pdf`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    expect(pdfResponse.headers["content-type"]).toBe("application/pdf");
    expect(Buffer.isBuffer(pdfResponse.body)).toBe(true);
    expect(pdfResponse.body.length).toBeGreaterThan(0);
  });
});

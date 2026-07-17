import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
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
  var __FACTURACION_TOKEN__: string | undefined;
  // eslint-disable-next-line no-var
  var __LOGISTICA_TOKEN__: string | undefined;
}

describe("BillingRequests", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  const passwordHash = "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";
  const billingRequests: Array<Record<string, unknown>> = [];
  const auditLogs: Array<Record<string, unknown>> = [];
  // BILL-04: el pedido origen debe modelar su transicion orden_facturacion ->
  // facturado; un stub que ignore `status` haria vacua la prueba del avance.
  const orders: Array<Record<string, any>> = [
    { id: "order-1", customerId: "customer-1", opportunityId: null, status: "entregado" },
    { id: "order-of", customerId: "customer-1", opportunityId: null, status: "orden_facturacion" },
    { id: "order-already-facturado", customerId: "customer-1", opportunityId: null, status: "facturado" },
  ];

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
        if (where.email === "facturacion@norgtech.local") {
          return {
            id: "facturacion-user-id",
            name: "Facturacion",
            email: "facturacion@norgtech.local",
            passwordHash,
            role: UserRole.facturacion,
            active: true,
          };
        }
        if (where.email === "logistica@norgtech.local") {
          return {
            id: "logistica-user-id",
            name: "Logistica",
            email: "logistica@norgtech.local",
            passwordHash,
            role: UserRole.logistica,
            active: true,
          };
        }
        if (where.id === "customer-1") {
          return {
            id: "customer-1",
            displayName: "Agro Norte",
            createdBy: "admin-user-id",
            updatedBy: "admin-user-id",
          };
        }
        return null;
      },
    };

    const customer = {
      findUnique: async ({ where: { id } }: { where: { id: string } }) => {
        if (id === "customer-1") {
          return {
            id: "customer-1",
            displayName: "Agro Norte",
            createdBy: "admin-user-id",
            updatedBy: "admin-user-id",
          };
        }
        return null;
      },
    };

    const order = {
      findUnique: async ({ where: { id } }: { where: { id: string } }) => {
        const found = orders.find((o) => o.id === id);
        return found ? JSON.parse(JSON.stringify(found)) : null;
      },
    };

    const quote = {
      findUnique: async ({ where: { id } }: { where: { id: string } }) => {
        if (id === "quote-1") {
          return {
            id: "quote-1",
            customerId: "customer-1",
            opportunityId: null,
          };
        }
        return null;
      },
    };

    const company = {
      findUnique: async ({ where: { id } }: { where: { id: string } }) => {
        if (id === "company-1") {
          return {
            id: "company-1",
            name: "Nortech",
            legalName: "Tecnologia de Nutricion Organica SAS",
            nit: "900999888-1",
            prefix: "NOR",
            isActive: true,
          };
        }
        return null;
      },
    };

    const prismaStub = {
      user,
      refreshToken: refreshTokenStub(),
      customer,
      company,
      order,
      quote,
      billingRequest: {
        create: async () => {
          throw new Error("billingRequest.create must run inside a transaction");
        },
        findUnique: async ({ where: { id } }: { where: { id: string } }) => {
          const found = billingRequests.find((b) => b.id === id);
          return found ? JSON.parse(JSON.stringify(found)) : null;
        },
        findMany: async () => billingRequests.map((b) => JSON.parse(JSON.stringify(b))),
        update: async ({ where: { id }, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const idx = billingRequests.findIndex((b) => b.id === id);
          if (idx === -1) return null;
          billingRequests[idx] = { ...billingRequests[idx], ...data, updatedAt: new Date() };
          return JSON.parse(JSON.stringify(billingRequests[idx]));
        },
      },
      auditLog: {
        create: async () => {
          throw new Error("auditLog.create must run inside a transaction");
        },
      },
      $transaction: async <T>(
        callback: (tx: any) => Promise<T>,
      ) => {
        const pendingBillingRequests: Array<Record<string, unknown>> = [];
        const pendingAuditLogs: Array<Record<string, unknown>> = [];

        const result = await callback({
          billingRequest: {
            create: async ({ data, include }: { data: Record<string, unknown>; include?: Record<string, unknown> }) => {
              const br = {
                id: `billing-request-${billingRequests.length + pendingBillingRequests.length + 1}`,
                ...data,
                status: "pendiente",
                customer: include?.customer ? { id: "customer-1", displayName: "Agro Norte" } : undefined,
                opportunity: null,
                sourceOrder: include?.sourceOrder ? { id: data.sourceOrderId } : undefined,
                sourceQuote: include?.sourceQuote ? { id: data.sourceQuoteId } : undefined,
                createdAt: new Date("2026-04-29T00:00:00.000Z"),
                updatedAt: new Date("2026-04-29T00:00:00.000Z"),
              };
              pendingBillingRequests.push(br);
              return br;
            },
            findUnique: async ({ where: { id } }: { where: { id: string } }) => {
              const found = billingRequests.find((b) => b.id === id) ?? pendingBillingRequests.find((b) => b.id === id);
              return found ? JSON.parse(JSON.stringify(found)) : null;
            },
            update: async ({ where: { id }, data }: { where: { id: string }; data: Record<string, unknown> }) => {
              let idx = billingRequests.findIndex((b) => b.id === id);
              if (idx !== -1) {
                billingRequests[idx] = { ...billingRequests[idx], ...data, updatedAt: new Date() };
                return JSON.parse(JSON.stringify(billingRequests[idx]));
              }
              idx = pendingBillingRequests.findIndex((b) => b.id === id);
              if (idx !== -1) {
                pendingBillingRequests[idx] = { ...pendingBillingRequests[idx], ...data, updatedAt: new Date() };
                return JSON.parse(JSON.stringify(pendingBillingRequests[idx]));
              }
              return null;
            },
          },
          order: {
            findUnique: async ({ where: { id } }: { where: { id: string } }) => {
              const found = orders.find((o) => o.id === id);
              return found ? JSON.parse(JSON.stringify(found)) : null;
            },
            update: async ({ where: { id }, data }: { where: { id: string }; data: Record<string, any> }) => {
              const idx = orders.findIndex((o) => o.id === id);
              if (idx === -1) return null;
              orders[idx] = { ...orders[idx], ...data, updatedAt: new Date() };
              return JSON.parse(JSON.stringify(orders[idx]));
            },
          },
          auditLog: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              const entry = { id: `audit-${auditLogs.length + pendingAuditLogs.length + 1}`, createdAt: new Date(), ...data };
              pendingAuditLogs.push(entry);
              return entry;
            },
          },
        });

        billingRequests.push(...pendingBillingRequests);
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

    const adminLogin = await request(globalThis.__APP__)
      .post("/auth/login")
      .send({ email: "admin@norgtech.local", password: "Admin123*" })
      .expect(200);
    globalThis.__ADMIN_TOKEN__ = adminLogin.body.accessToken;

    const facturacionLogin = await request(globalThis.__APP__)
      .post("/auth/login")
      .send({ email: "facturacion@norgtech.local", password: "Admin123*" })
      .expect(200);
    globalThis.__FACTURACION_TOKEN__ = facturacionLogin.body.accessToken;

    const logisticaLogin = await request(globalThis.__APP__)
      .post("/auth/login")
      .send({ email: "logistica@norgtech.local", password: "Admin123*" })
      .expect(200);
    globalThis.__LOGISTICA_TOKEN__ = logisticaLogin.body.accessToken;
  });

  afterAll(async () => {
    globalThis.__ADMIN_TOKEN__ = undefined;
    globalThis.__FACTURACION_TOKEN__ = undefined;
    globalThis.__LOGISTICA_TOKEN__ = undefined;
    globalThis.__APP__ = undefined;
    if (app) {
      await app.close();
    }
  });

  it("lists billing requests", async () => {
    const response = await request(globalThis.__APP__)
      .get("/billing-requests")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });

  it("creates a billing request directly", async () => {
    const response = await request(globalThis.__APP__)
      .post("/billing-requests")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        companyId: "company-1",
        sourceOrderId: "order-1",
        notes: "Facturar urgente",
      })
      .expect(201);

    expect(response.body.customerId).toBe("customer-1");
    expect(response.body.sourceOrderId).toBe("order-1");
    expect(response.body.companyId).toBe("company-1");
  });

  it("transitions billing request status", async () => {
    const createResponse = await request(globalThis.__APP__)
      .post("/billing-requests")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        companyId: "company-1",
        notes: "Test",
      })
      .expect(201);

    const brId = createResponse.body.id;

    const response = await request(globalThis.__APP__)
      .patch(`/billing-requests/${brId}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "procesada" })
      .expect(200);

    expect(response.body.status).toBe("procesada");
  });

  it("advances the linked source order to facturado when processed (BILL-04)", async () => {
    const createResponse = await request(globalThis.__APP__)
      .post("/billing-requests")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        companyId: "company-1",
        sourceOrderId: "order-of",
      })
      .expect(201);

    expect(orders.find((o) => o.id === "order-of")?.status).toBe("orden_facturacion");

    await request(globalThis.__APP__)
      .patch(`/billing-requests/${createResponse.body.id}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "procesada" })
      .expect(200);

    // El pedido origen avanzo por el efecto lateral del procesamiento.
    expect(orders.find((o) => o.id === "order-of")?.status).toBe("facturado");
  });

  it("is idempotent when the source order is already facturado (BILL-04)", async () => {
    const createResponse = await request(globalThis.__APP__)
      .post("/billing-requests")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        companyId: "company-1",
        sourceOrderId: "order-already-facturado",
      })
      .expect(201);

    // Procesar no debe reventar aunque el pedido ya este facturado.
    await request(globalThis.__APP__)
      .patch(`/billing-requests/${createResponse.body.id}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "procesada" })
      .expect(200);

    expect(orders.find((o) => o.id === "order-already-facturado")?.status).toBe("facturado");
  });

  it("no revienta al procesar cuando el pedido origen ya paso de facturado (BILL-04)", async () => {
    // order-1 esta en 'entregado' (mas adelante que facturado). Procesar la
    // solicitud NO debe devolver 400 ni tocar el pedido: bloquear al back-office
    // por donde quedo el pedido seria peor que no avanzar.
    const createResponse = await request(globalThis.__APP__)
      .post("/billing-requests")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        companyId: "company-1",
        sourceOrderId: "order-1",
      })
      .expect(201);

    await request(globalThis.__APP__)
      .patch(`/billing-requests/${createResponse.body.id}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "procesada" })
      .expect(200);

    expect(orders.find((o) => o.id === "order-1")?.status).toBe("entregado");
  });

  it("allows facturacion to access billing requests", async () => {
    await request(globalThis.__APP__)
      .get("/billing-requests")
      .set("Authorization", `Bearer ${globalThis.__FACTURACION_TOKEN__}`)
      .expect(200);
  });

  it("denies logistica access to billing requests", async () => {
    await request(globalThis.__APP__)
      .get("/billing-requests")
      .set("Authorization", `Bearer ${globalThis.__LOGISTICA_TOKEN__}`)
      .expect(403);
  });
});

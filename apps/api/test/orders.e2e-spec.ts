import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

declare global {
  // eslint-disable-next-line no-var
  var __APP__: ReturnType<INestApplication["getHttpServer"]> | undefined;
  // eslint-disable-next-line no-var
  var __ADMIN_TOKEN__: string | undefined;
}

describe("Orders", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  const passwordHash = "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";
  const auditLogs: Array<Record<string, unknown>> = [];
  const orders: Array<Record<string, unknown>> = [];
  const products: Array<Record<string, unknown>> = [
    {
      id: "product-1",
      name: "Fertilizante",
      sku: "FERT-001",
      unit: "kg",
      basePrice: 50000,
      active: true,
      createdBy: "admin-user-id",
      updatedBy: "admin-user-id",
      createdAt: new Date("2026-04-29T00:00:00.000Z"),
      updatedAt: new Date("2026-04-29T00:00:00.000Z"),
    },
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
        if (where.id === "logistics-user-id") {
          return {
            id: "logistics-user-id",
            name: "Logistics",
            email: "logistics@norgtech.local",
            passwordHash,
            role: UserRole.logistica,
            active: true,
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

    const prismaStub = {
      user,
      customer,
      product: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          products.find((p) => p.id === id) ?? null,
      },
      order: {
        create: async () => {
          throw new Error("order.create must run inside a transaction");
        },
        findUnique: async ({ where: { id } }: { where: { id: string } }) => {
          const found = orders.find((o) => o.id === id);
          return found ? JSON.parse(JSON.stringify(found)) : null;
        },
        findMany: async () => orders.map((o) => JSON.parse(JSON.stringify(o))),
        update: async ({ where: { id }, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const idx = orders.findIndex((o) => o.id === id);
          if (idx === -1) return null;
          orders[idx] = { ...orders[idx], ...data, updatedAt: new Date() };
          return JSON.parse(JSON.stringify(orders[idx]));
        },
      },
      orderItem: {
        createMany: async () => ({ count: 0 }),
      },
      billingRequest: {
        create: async () => {
          throw new Error("billingRequest.create must run inside a transaction");
        },
        findMany: async () => [],
      },
      auditLog: {
        create: async () => {
          throw new Error("auditLog.create must run inside a transaction");
        },
        findMany: async () => auditLogs,
      },
      $transaction: async <T>(
        callback: (tx: any) => Promise<T>,
      ) => {
        const pendingOrders: Array<Record<string, unknown>> = [];
        const pendingAuditLogs: Array<Record<string, unknown>> = [];
        const pendingBillingRequests: Array<Record<string, unknown>> = [];

        const result = await callback({
          order: {
            create: async ({ data, include }: { data: Record<string, unknown>; include?: Record<string, unknown> }) => {
              const order = {
                id: `order-${orders.length + pendingOrders.length + 1}`,
                status: "recibido",
                ...data,
                items: include?.items ? (data.items as { create: unknown[] }).create : undefined,
                customer: include?.customer ? { id: "customer-1", displayName: "Agro Norte" } : undefined,
                opportunity: null,
                sourceQuote: null,
                createdAt: new Date("2026-04-29T00:00:00.000Z"),
                updatedAt: new Date("2026-04-29T00:00:00.000Z"),
              };
              pendingOrders.push(order);
              return order;
            },
            findUnique: async ({ where: { id } }: { where: { id: string } }) => {
              const found = orders.find((o) => o.id === id) ?? pendingOrders.find((o) => o.id === id);
              return found ? JSON.parse(JSON.stringify(found)) : null;
            },
            update: async ({ where: { id }, data }: { where: { id: string }; data: Record<string, unknown> }) => {
              let idx = orders.findIndex((o) => o.id === id);
              if (idx !== -1) {
                orders[idx] = { ...orders[idx], ...data, updatedAt: new Date() };
                return JSON.parse(JSON.stringify(orders[idx]));
              }
              idx = pendingOrders.findIndex((o) => o.id === id);
              if (idx !== -1) {
                pendingOrders[idx] = { ...pendingOrders[idx], ...data, updatedAt: new Date() };
                return JSON.parse(JSON.stringify(pendingOrders[idx]));
              }
              return null;
            },
          },
          auditLog: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              const entry = { id: `audit-${auditLogs.length + pendingAuditLogs.length + 1}`, createdAt: new Date(), ...data };
              pendingAuditLogs.push(entry);
              return entry;
            },
          },
          billingRequest: {
            create: async ({ data, include }: { data: Record<string, unknown>; include?: Record<string, unknown> }) => {
              const br = {
                id: `billing-request-${auditLogs.length + pendingBillingRequests.length + 1}`,
                ...data,
                customer: include?.customer ? { id: "customer-1", displayName: "Agro Norte" } : undefined,
                opportunity: null,
                sourceOrder: include?.sourceOrder ? { id: data.sourceOrderId } : undefined,
                sourceQuote: null,
                status: "pendiente",
                createdAt: new Date("2026-04-29T00:00:00.000Z"),
                updatedAt: new Date("2026-04-29T00:00:00.000Z"),
              };
              pendingBillingRequests.push(br);
              return br;
            },
          },
        });

        orders.push(...pendingOrders);
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

  it("creates an order with items", async () => {
    const response = await request(globalThis.__APP__)
      .post("/orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        items: [
          { productId: "product-1", quantity: 2, unitPrice: 50000 },
        ],
      })
      .expect(201);

    expect(response.body.items).toHaveLength(1);
    expect(Number(response.body.total)).toBe(100000);
  });

  it("transitions order status and sets dispatch/delivery dates", async () => {
    const createResponse = await request(globalThis.__APP__)
      .post("/orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        items: [{ productId: "product-1", quantity: 1, unitPrice: 50000 }],
      })
      .expect(201);

    const orderId = createResponse.body.id;

    const step1 = await request(globalThis.__APP__)
      .patch(`/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "orden_facturacion" })
      .expect(200);
    expect(step1.body.status).toBe("orden_facturacion");

    const step2 = await request(globalThis.__APP__)
      .patch(`/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "facturado" })
      .expect(200);
    expect(step2.body.status).toBe("facturado");

    const step3 = await request(globalThis.__APP__)
      .patch(`/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "despachado" })
      .expect(200);
    expect(step3.body.status).toBe("despachado");
    expect(step3.body.dispatchDate).toBeTruthy();

    const step4 = await request(globalThis.__APP__)
      .patch(`/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "entregado" })
      .expect(200);
    expect(step4.body.status).toBe("entregado");
    expect(step4.body.deliveryDate).toBeTruthy();
  });

  it("rejects invalid status transitions", async () => {
    const createResponse = await request(globalThis.__APP__)
      .post("/orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        items: [{ productId: "product-1", quantity: 1, unitPrice: 50000 }],
      })
      .expect(201);

    await request(globalThis.__APP__)
      .patch(`/orders/${createResponse.body.id}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "entregado" })
      .expect(400);
  });

  it("updates logistics fields", async () => {
    const createResponse = await request(globalThis.__APP__)
      .post("/orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        items: [{ productId: "product-1", quantity: 1, unitPrice: 50000 }],
      })
      .expect(201);

    const orderId = createResponse.body.id;

    const response = await request(globalThis.__APP__)
      .patch(`/orders/${orderId}/logistics`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        assignedLogisticsUserId: "logistics-user-id",
        committedDeliveryDate: "2026-05-01",
        logisticsNotes: "Entrega prioritaria",
      })
      .expect(200);

    expect(response.body.assignedLogisticsUserId).toBe("logistics-user-id");
    expect(response.body.logisticsNotes).toBe("Entrega prioritaria");
  });

  it("creates billing request from order when status is entregado", async () => {
    const createResponse = await request(globalThis.__APP__)
      .post("/orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        items: [{ productId: "product-1", quantity: 1, unitPrice: 50000 }],
      })
      .expect(201);

    const orderId = createResponse.body.id;

    await request(globalThis.__APP__)
      .patch(`/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "orden_facturacion" })
      .expect(200);

    await request(globalThis.__APP__)
      .patch(`/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "facturado" })
      .expect(200);

    await request(globalThis.__APP__)
      .patch(`/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "despachado" })
      .expect(200);

    await request(globalThis.__APP__)
      .patch(`/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "entregado" })
      .expect(200);

    const response = await request(globalThis.__APP__)
      .post(`/orders/${orderId}/billing-request`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(201);

    expect(response.body.sourceType).toBe("order");
    expect(response.body.sourceOrderId).toBe(orderId);
  });
});

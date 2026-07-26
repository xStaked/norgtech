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
}

/**
 * ORD-04 / QUO-03 guarantee: /quotes/preview and /orders/preview must return
 * the exact same numbers that the corresponding create() endpoint persists,
 * because both now go through the single PricingService (form == detail).
 * Covers both a customer that meets its segment sales goal (discount
 * applies) and one that doesn't (discount is suppressed).
 */
describe("Pricing preview parity (ORD-04 / QUO-03)", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  const passwordHash = "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";

  const productId = "product-preview-1";
  const companyId = "company-preview-1";
  const meetsGoalCustomerId = "customer-meets-goal";
  const notMeetsGoalCustomerId = "customer-not-meets-goal";

  const quotes: Array<Record<string, unknown>> = [];
  const quoteItems: Array<Record<string, unknown>> = [];
  const orders: Array<Record<string, unknown>> = [];
  const orderItems: Array<Record<string, unknown>> = [];
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
      findUnique: async ({ where: { id } }: { where: { id: string } }) => {
        if (id === meetsGoalCustomerId) {
          return {
            id,
            displayName: "Cliente Meta Cumplida",
            taxId: "900000001-1",
            address: "Calle Meta 1",
            companyId,
            segment: {
              name: "Oro",
              discountPercent: 10,
              minGoalAmount: 1_000_000,
            },
          };
        }
        if (id === notMeetsGoalCustomerId) {
          return {
            id,
            displayName: "Cliente Meta Pendiente",
            taxId: "900000002-1",
            address: "Calle Meta 2",
            companyId,
            segment: {
              name: "Oro",
              discountPercent: 10,
              minGoalAmount: 1_000_000,
            },
          };
        }
        return null;
      },
    };

    const product = {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        id === productId
          ? {
              id: productId,
              name: "Fertilizante NPK",
              sku: "SKU-PREVIEW-1",
              unit: "bulto",
              presentation: "Bulto 50kg",
              basePrice: 100000,
            }
          : null,
    };

    const company = {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        id === companyId
          ? { id: companyId, name: "Nortech", prefix: "NOR", isActive: true }
          : null,
    };

    const order = {
      // Goal-check aggregate used by PricingService.resolveSegmentDiscount:
      // the "meets goal" customer's accumulated sales clear their segment's
      // minGoalAmount, the other customer's don't.
      aggregate: async ({ where }: { where: { customerId: string } }) => {
        if (where.customerId === meetsGoalCustomerId) {
          return { _sum: { total: 5_000_000 } };
        }
        return { _sum: { total: 0 } };
      },
      create: async () => {
        throw new Error("order.create must run inside a transaction");
      },
      findFirst: async () => null,
      // nextOrderNumber lee los consecutivos ya usados por prefijo.
      findMany: async () => [],
    };

    const prismaStub = {
      user,
      refreshToken: refreshTokenStub(),
      customer,
      product,
      company,
      order,
      quote: {
        create: async () => {
          throw new Error("quote.create must run inside a transaction");
        },
      },
      quoteItem: {
        create: async () => {
          throw new Error("quoteItem.create must run inside a transaction");
        },
      },
      orderItem: {
        create: async () => {
          throw new Error("orderItem.create must run inside a transaction");
        },
      },
      auditLog: {
        create: async () => {
          throw new Error("auditLog.create must run inside a transaction");
        },
      },
      $transaction: async <T>(callback: (tx: any) => Promise<T>) => {
        const tx = {
          quote: {
            create: async ({ data, include }: { data: Record<string, unknown>; include?: Record<string, unknown> }) => {
              const itemsCreate = (data.items as { create?: unknown } | undefined)?.create;
              const itemsArray = Array.isArray(itemsCreate) ? itemsCreate : itemsCreate ? [itemsCreate] : [];
              const quote = {
                id: `quote-${quotes.length + 1}`,
                ...data,
                items: include?.items ? itemsArray : undefined,
              };
              quotes.push(quote);
              return quote;
            },
          },
          order: {
            create: async ({ data, include }: { data: Record<string, unknown>; include?: Record<string, unknown> }) => {
              const itemsCreate = (data.items as { create?: unknown } | undefined)?.create;
              const itemsArray = Array.isArray(itemsCreate) ? itemsCreate : itemsCreate ? [itemsCreate] : [];
              const order = {
                id: `order-${orders.length + 1}`,
                status: "recibido",
                ...data,
                items: include?.items ? itemsArray : undefined,
              };
              orders.push(order);
              return order;
            },
          },
          quoteItem: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              const item = { id: `quote-item-${quoteItems.length + 1}`, ...data };
              quoteItems.push(item);
              return item;
            },
          },
          orderItem: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              const item = { id: `order-item-${orderItems.length + 1}`, ...data };
              orderItems.push(item);
              return item;
            },
          },
          auditLog: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              const entry = { id: `audit-${auditLogs.length + 1}`, ...data };
              auditLogs.push(entry);
              return entry;
            },
          },
        };

        return callback(tx);
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

  describe("quotes: preview matches create()", () => {
    it("matches when the customer meets its segment sales goal (discount applies)", async () => {
      const payload = {
        customerId: meetsGoalCustomerId,
        items: [{ productId, quantity: 3, unitPrice: 100000 }],
      };

      const previewResponse = await request(globalThis.__APP__)
        .post("/quotes/preview")
        .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
        .send(payload)
        .expect(201);

      const createResponse = await request(globalThis.__APP__)
        .post("/quotes")
        .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
        .send(payload)
        .expect(201);

      expect(previewResponse.body.discountPercent).toBe(10);
      expect(previewResponse.body.meetsGoal).toBe(true);
      expect(previewResponse.body.total).toBe(Number(createResponse.body.total));
      expect(previewResponse.body.subtotal).toBe(Number(createResponse.body.subtotal));
    });

    it("matches when the customer has NOT met its segment sales goal (no discount)", async () => {
      const payload = {
        customerId: notMeetsGoalCustomerId,
        items: [{ productId, quantity: 3, unitPrice: 100000 }],
      };

      const previewResponse = await request(globalThis.__APP__)
        .post("/quotes/preview")
        .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
        .send(payload)
        .expect(201);

      const createResponse = await request(globalThis.__APP__)
        .post("/quotes")
        .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
        .send(payload)
        .expect(201);

      expect(previewResponse.body.discountPercent).toBe(0);
      expect(previewResponse.body.meetsGoal).toBe(false);
      expect(previewResponse.body.total).toBe(Number(createResponse.body.total));
      expect(previewResponse.body.subtotal).toBe(Number(createResponse.body.subtotal));
      // No discount applied: total equals the raw (undiscounted) list price.
      expect(previewResponse.body.total).toBe(300000);
    });
  });

  describe("orders: preview matches create()", () => {
    it("matches when the customer meets its segment sales goal (discount applies)", async () => {
      const payload = {
        customerId: meetsGoalCustomerId,
        items: [{ productId, quantity: 2, unitPrice: 100000, taxPercent: 19 }],
      };

      const previewResponse = await request(globalThis.__APP__)
        .post("/orders/preview")
        .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
        .send(payload)
        .expect(201);

      const createResponse = await request(globalThis.__APP__)
        .post("/orders")
        .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
        .send({ ...payload, companyId })
        .expect(201);

      expect(previewResponse.body.discountPercent).toBe(10);
      expect(previewResponse.body.meetsGoal).toBe(true);
      expect(previewResponse.body.total).toBe(Number(createResponse.body.total));
      expect(previewResponse.body.subtotal).toBe(Number(createResponse.body.subtotal));
    });

    it("matches when the customer has NOT met its segment sales goal (no discount)", async () => {
      const payload = {
        customerId: notMeetsGoalCustomerId,
        items: [{ productId, quantity: 2, unitPrice: 100000, taxPercent: 19 }],
      };

      const previewResponse = await request(globalThis.__APP__)
        .post("/orders/preview")
        .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
        .send(payload)
        .expect(201);

      const createResponse = await request(globalThis.__APP__)
        .post("/orders")
        .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
        .send({ ...payload, companyId })
        .expect(201);

      expect(previewResponse.body.discountPercent).toBe(0);
      expect(previewResponse.body.meetsGoal).toBe(false);
      expect(previewResponse.body.total).toBe(Number(createResponse.body.total));
      expect(previewResponse.body.subtotal).toBe(Number(createResponse.body.subtotal));
      // No discount: subtotal is 2 * 100000, total includes 19% tax.
      expect(previewResponse.body.subtotal).toBe(200000);
      expect(previewResponse.body.total).toBe(238000);
    });
  });
});

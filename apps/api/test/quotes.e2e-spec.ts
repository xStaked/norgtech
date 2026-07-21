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

describe("Quotes", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  const passwordHash = "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";
  const customerId = "customer-id";
  const discountCustomerId = "discount-customer-id";
  const productId = "product-id";
  const quotes: Array<Record<string, unknown>> = [];
  const quoteItems: Array<Record<string, unknown>> = [];
  const billingRequests: Array<Record<string, unknown>> = [];
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

    // customerId -> empresa activa (compania-activa); discountCustomerId ->
    // empresa inactiva (compania-inactiva), usada por el test de
    // createBillingRequest que espera 404 cuando la empresa del cliente esta
    // inactiva.
    const customerCompanies: Record<string, string> = {
      [customerId]: "compania-activa",
      [discountCustomerId]: "compania-inactiva",
    };

    const customer = {
      findUnique: async ({ where: { id }, include }: { where: { id: string }; include?: Record<string, boolean> }) => {
        if (id !== customerId && id !== discountCustomerId) return null;
        const result: Record<string, unknown> = { id, companyId: customerCompanies[id] };
        if (include?.segment) {
          result.segment = {
            discountPercent: id === discountCustomerId ? 10 : 0,
            minGoalAmount: 0,
          };
        }
        return result;
      },
    };

    const companies: Record<string, { id: string; isActive: boolean }> = {
      "compania-activa": { id: "compania-activa", isActive: true },
      "compania-inactiva": { id: "compania-inactiva", isActive: false },
    };

    const company = {
      findUnique: async ({ where: { id } }: { where: { id: string } }) => companies[id] ?? null,
    };

    // discountCustomerId's segment has a positive discount, so PricingService
    // conditions it on YTD sales meeting the (zero, in this fixture)
    // minGoalAmount. Returning 0 here still satisfies the >= 0 goal.
    const order = {
      aggregate: async () => ({ _sum: { total: 0 } }),
    };

    const product = {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        id === productId
          ? {
              id: productId,
              name: "Vacuna Aftosa",
              sku: "VAC-001",
              unit: "dosis",
              basePrice: 45000,
            }
          : null,
    };

    const prismaStub = {
      user,
      refreshToken: refreshTokenStub(),
      customer,
      company,
      product,
      order,
      quote: {
        create: async () => {
          throw new Error("quote.create must run inside a transaction");
        },
        findUnique: async ({
          where: { id },
          include,
        }: {
          where: { id: string };
          include?: Record<string, boolean>;
        }) => {
          const found = quotes.find((q) => q.id === id);
          if (!found) return null;
          const result: Record<string, unknown> = { ...found };
          if (include?.items) {
            result.items = quoteItems.filter((item) => item.quoteId === id);
          }
          if (include?.customer) {
            result.customer = { id: found.customerId, companyId: customerCompanies[found.customerId as string] };
          }
          return result;
        },
        update: async () => null,
        findMany: async () => quotes,
      },
      quoteItem: {
        create: async () => {
          throw new Error("quoteItem.create must run inside a transaction");
        },
      },
      billingRequest: {
        create: async () => {
          throw new Error("billingRequest.create must run inside a transaction");
        },
      },
      auditLog: {
        create: async () => {
          throw new Error("auditLog.create must run inside a transaction");
        },
        findMany: async () => auditLogs,
      },
      $transaction: async <T>(
        callback: (tx: {
          quote: {
            create: (args: {
              data: Record<string, unknown>;
              include?: Record<string, boolean>;
            }) => Promise<Record<string, unknown>>;
          };
          quoteItem: {
            create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
          };
          billingRequest: {
            create: (args: {
              data: Record<string, unknown>;
              include?: Record<string, boolean>;
            }) => Promise<Record<string, unknown>>;
          };
          auditLog: {
            create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
          };
        }) => Promise<T>,
      ) => {
        const pendingQuotes: Array<Record<string, unknown>> = [];
        const pendingItems: Array<Record<string, unknown>> = [];
        const pendingBillingRequests: Array<Record<string, unknown>> = [];
        const pendingAudits: Array<Record<string, unknown>> = [];

        const tx = {
          quote: {
            create: async ({ data, include }: { data: Record<string, unknown>; include?: Record<string, boolean> }) => {
              const quoteItemsArray: Array<Record<string, unknown>> = [];
              const itemsCreate = (data.items as { create?: unknown } | undefined)?.create;
              if (itemsCreate) {
                const itemsToCreate = Array.isArray(itemsCreate) ? itemsCreate : [itemsCreate];
                for (const itemData of itemsToCreate) {
                  const item = await tx.quoteItem.create({ data: itemData as Record<string, unknown> });
                  quoteItemsArray.push(item);
                }
              }
              const quote = {
                id: `quote-${pendingQuotes.length + quotes.length + 1}`,
                ...data,
                createdAt: new Date("2026-04-29T00:00:00.000Z"),
                updatedAt: new Date("2026-04-29T00:00:00.000Z"),
                customer: { id: customerId, displayName: "Ganaderia Andina" },
                opportunity: null,
                items: include?.items ? quoteItemsArray : undefined,
              };
              pendingQuotes.push(quote);
              return quote;
            },
          },
          quoteItem: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              const item = {
                id: `item-${pendingItems.length + quoteItems.length + 1}`,
                ...data,
              };
              pendingItems.push(item);
              return item;
            },
          },
          billingRequest: {
            create: async ({ data, include }: { data: Record<string, unknown>; include?: Record<string, boolean> }) => {
              const billingRequest = {
                id: `billing-request-${pendingBillingRequests.length + billingRequests.length + 1}`,
                ...data,
                status: "pendiente",
                createdAt: new Date("2026-04-29T00:00:00.000Z"),
                updatedAt: new Date("2026-04-29T00:00:00.000Z"),
                customer: include?.customer ? { id: data.customerId } : undefined,
              };
              pendingBillingRequests.push(billingRequest);
              return billingRequest;
            },
          },
          auditLog: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              const entry = {
                id: `audit-${pendingAudits.length + auditLogs.length + 1}`,
                createdAt: new Date("2026-04-29T00:00:00.000Z"),
                ...data,
              };
              pendingAudits.push(entry);
              return entry;
            },
          },
        };

        const result = await callback(tx);

        quotes.push(...pendingQuotes);
        quoteItems.push(...pendingItems);
        billingRequests.push(...pendingBillingRequests);
        auditLogs.push(...pendingAudits);

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

  it("creates a quote with items and calculates totals", async () => {
    const response = await request(globalThis.__APP__)
      .post("/quotes")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId,
        items: [
          {
            productId,
            quantity: 10,
            unitPrice: 45000,
          },
        ],
      })
      .expect(201);

    expect(response.body.subtotal).toBe("450000");
    expect(response.body.total).toBe("450000");
  });

  it("treats empty opportunityId as null", async () => {
    const response = await request(globalThis.__APP__)
      .post("/quotes")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId,
        opportunityId: "",
        items: [
          {
            productId,
            quantity: 2,
            unitPrice: 45000,
          },
        ],
      })
      .expect(201);

    expect(response.body.opportunityId).toBeNull();
  });

  it("rejects quote with invalid customer", async () => {
    await request(globalThis.__APP__)
      .post("/quotes")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "invalid-customer",
        items: [
          {
            quantity: 1,
            unitPrice: 100,
          },
        ],
      })
      .expect(404);
  });

  it("applies customer segment discount to quote items", async () => {
    const response = await request(globalThis.__APP__)
      .post("/quotes")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: discountCustomerId,
        items: [
          {
            productId,
            quantity: 10,
            unitPrice: 45000,
          },
        ],
      })
      .expect(201);

    expect(response.body.subtotal).toBe("405000");
    expect(response.body.total).toBe("405000");
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].originalUnitPrice).toBe("45000");
    expect(response.body.items[0].discountPercent).toBe("10");
    expect(response.body.items[0].unitPrice).toBe("40500");
    expect(response.body.items[0].subtotal).toBe("405000");
  });

  it("stores null originalUnitPrice and discountPercent for custom items", async () => {
    const response = await request(globalThis.__APP__)
      .post("/quotes")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId,
        items: [
          {
            quantity: 5,
            unitPrice: 20000,
          },
        ],
      })
      .expect(201);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].originalUnitPrice).toBeNull();
    expect(response.body.items[0].discountPercent).toBeNull();
    expect(response.body.items[0].unitPrice).toBe("20000");
    expect(response.body.items[0].subtotal).toBe("100000");
  });

  it("creates a billing request from a closed quote using the customer's own company", async () => {
    quotes.push({
      id: "quote-cerrada-propia-empresa",
      customerId,
      opportunityId: null,
      status: "cerrada",
      subtotal: "450000",
      total: "450000",
      createdAt: new Date("2026-04-29T00:00:00.000Z"),
      updatedAt: new Date("2026-04-29T00:00:00.000Z"),
    });

    const response = await request(globalThis.__APP__)
      .post("/quotes/quote-cerrada-propia-empresa/billing-request")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(201);

    // customerId esta mapeado a "compania-activa" en el fixture; si el
    // servicio siguiera usando company.findFirst (la mas antigua) esto
    // fallaria en cuanto hubiera mas de una empresa activa en el fixture.
    expect(response.body.companyId).toBe("compania-activa");
  });

  it("rejects a billing request when the quote's customer company is inactive", async () => {
    quotes.push({
      id: "quote-cerrada-empresa-inactiva",
      customerId: discountCustomerId,
      opportunityId: null,
      status: "cerrada",
      subtotal: "405000",
      total: "405000",
      createdAt: new Date("2026-04-29T00:00:00.000Z"),
      updatedAt: new Date("2026-04-29T00:00:00.000Z"),
    });

    // discountCustomerId esta mapeado a "compania-inactiva": una billing
    // request muerta (que InvoicesService.create rechazaria despues) es peor
    // que un 404 claro en el momento de crearla.
    await request(globalThis.__APP__)
      .post("/quotes/quote-cerrada-empresa-inactiva/billing-request")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(404);
  });
});

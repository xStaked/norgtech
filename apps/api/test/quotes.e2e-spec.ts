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

describe("Quotes", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  const passwordHash = "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";
  const customerId = "customer-id";
  const productId = "product-id";
  const quotes: Array<Record<string, unknown>> = [];
  const quoteItems: Array<Record<string, unknown>> = [];
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
            role: UserRole.admin,
            active: true,
          };
        }
        return null;
      },
    };

    const customer = {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        id === customerId ? { id: customerId } : null,
    };

    const product = {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        id === productId
          ? {
              id: productId,
              name: "Vacuna Aftosa",
              sku: "VAC-001",
              unit: "dosis",
            }
          : null,
    };

    const prismaStub = {
      user,
      customer,
      product,
      quote: {
        create: async () => {
          throw new Error("quote.create must run inside a transaction");
        },
        findUnique: async () => null,
        update: async () => null,
        findMany: async () => quotes,
      },
      quoteItem: {
        create: async () => {
          throw new Error("quoteItem.create must run inside a transaction");
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
          auditLog: {
            create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
          };
        }) => Promise<T>,
      ) => {
        const pendingQuotes: Array<Record<string, unknown>> = [];
        const pendingItems: Array<Record<string, unknown>> = [];
        const pendingAudits: Array<Record<string, unknown>> = [];

        const result = await callback({
          quote: {
            create: async ({ data, include }) => {
              const quote = {
                id: `quote-${pendingQuotes.length + quotes.length + 1}`,
                ...data,
                createdAt: new Date("2026-04-29T00:00:00.000Z"),
                updatedAt: new Date("2026-04-29T00:00:00.000Z"),
                customer: { id: customerId, displayName: "Ganaderia Andina" },
                opportunity: null,
                items: include?.items ? [] : undefined,
              };
              pendingQuotes.push(quote);
              return quote;
            },
          },
          quoteItem: {
            create: async ({ data }) => {
              const item = {
                id: `item-${pendingItems.length + quoteItems.length + 1}`,
                ...data,
              };
              pendingItems.push(item);
              return item;
            },
          },
          auditLog: {
            create: async ({ data }) => {
              const entry = {
                id: `audit-${pendingAudits.length + auditLogs.length + 1}`,
                createdAt: new Date("2026-04-29T00:00:00.000Z"),
                ...data,
              };
              pendingAudits.push(entry);
              return entry;
            },
          },
        });

        quotes.push(...pendingQuotes);
        quoteItems.push(...pendingItems);
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

    expect(response.body.subtotal).toBe(450000);
    expect(response.body.total).toBe(450000);
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
});

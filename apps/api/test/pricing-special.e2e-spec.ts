import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { CreditService } from "../src/modules/credit/credit.service";
import { findMockUserByEmail, loginAs, refreshTokenStub } from "./helpers/login-as";

describe("Seller-scoped special pricing", () => {
  let app: INestApplication;

  const ownerId = "00000000-0000-4000-8000-000000000003";
  const otherSellerId = "00000000-0000-4000-8000-000000000007";
  const customerId = "customer-special-1";
  const productId = "product-special-1";
  const presentationId = "pres-special-1";
  const companyId = "company-special-1";

  let specialSinIva = 80;
  const storedQuotes = new Map<string, Record<string, any>>();
  let nextQuoteId = 1;
  let nextOrderId = 1;

  beforeAll(async () => {
    const prismaStub: Record<string, any> = {
      user: {
        findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
          if (where.email) return findMockUserByEmail(where.email);
          return Object.values({ ownerId, otherSellerId }).includes(where.id as any)
            ? { id: where.id, role: UserRole.comercial, active: true }
            : null;
        },
      },
      refreshToken: refreshTokenStub(),
      customer: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          id === customerId
            ? { id, priceListId: "general-list-1", currency: "COP", segment: null, assignedToUserId: ownerId, companyId, displayName: "Cliente especial", taxId: null, address: null }
            : null,
      },
      product: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          id === productId
            ? { id, name: "Producto especial", sku: "SKU-SP-1", unit: "bolsa", basePrice: 120, presentation: null }
            : null,
      },
      order: { aggregate: async () => ({ _sum: { total: 0 } }), findMany: async () => [] },
      company: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          id === companyId ? { id, name: "Norgtech", prefix: "NOR", isActive: true } : null,
      },
      priceListItem: {
        findMany: async () => [
          {
            priceListId: "general-list-1",
            presentationId,
            priceSinIva: 100,
            priceConIva: 105,
            taxPercent: 5,
            priceList: { name: "DIRECTOS", currency: "COP" },
            presentation: { empaque: "Bolsa x 500 g", form: "Polvo" },
          },
        ],
      },
      specialPriceListItem: {
        findFirst: async ({ where }: { where: Record<string, any> }) => {
          if (where.ownerUserId !== ownerId) return null;
          if (where.customerId !== customerId || where.presentationId !== presentationId) return null;
          if (!where.active) return null;
          return {
            priceSinIva: specialSinIva,
            priceConIva: 84,
            taxPercent: 5,
            customer: { currency: "COP" },
            presentation: { empaque: "Bolsa x 500 g", form: "Polvo", productId },
            revision: { specialPriceList: { id: "special-1", name: "Especial VIOS", active: true } },
          };
        },
      },
      quote: {
        create: async () => { throw new Error("must run in tx"); },
        findUnique: async ({ where: { id } }: { where: { id: string } }) => storedQuotes.get(id) ?? null,
      },
      auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "audit-1", ...data }) },
    };
    prismaStub.$transaction = async (cb: (tx: any) => Promise<unknown>) =>
      cb({
        quote: {
          create: async ({ data }: { data: Record<string, any> }) => {
            const id = `quote-${nextQuoteId++}`;
            const created = { id, ...data, items: (data.items.create as Array<Record<string, any>>).map((item, i) => ({ id: `qi-${id}-${i}`, ...item })) };
            storedQuotes.set(id, created);
            return created;
          },
        },
        order: {
          create: async ({ data }: { data: Record<string, any> }) => {
            const id = `order-${nextOrderId++}`;
            return { id, status: "recibido", ...data, items: (data.items.create as Array<Record<string, any>>).map((item, i) => ({ id: `oi-${id}-${i}`, ...item })) };
          },
        },
        auditLog: prismaStub.auditLog,
      });

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .overrideProvider(CreditService)
      .useValue({ assertCreditLimit: async () => undefined })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("owner uses approved special price", async () => {
    const token = await loginAs(app, UserRole.comercial);
    const res = await request(app.getHttpServer())
      .post("/quotes/preview")
      .set("Authorization", `Bearer ${token}`)
      .send({ customerId, items: [{ productId, presentationId, quantity: 2, unitPrice: 0 }] })
      .expect(201);
    const [line] = res.body.lines;
    expect(line.unitPrice).toBe(specialSinIva);
    expect(line.priceSource).toBe("special_price_list");
    expect(line.priceListName).toBe("Especial VIOS");
  });

  it("another seller falls back to the general list", async () => {
    const token = await loginAs(app, UserRole.promotor);
    const res = await request(app.getHttpServer())
      .post("/quotes/preview")
      .set("Authorization", `Bearer ${token}`)
      .send({ customerId, items: [{ productId, presentationId, quantity: 2, unitPrice: 0 }] })
      .expect(201);
    const [line] = res.body.lines;
    expect(line.unitPrice).toBe(100);
    expect(line.priceSource).toBe("price_list");
  });

  it("quote preview matches create for the owner", async () => {
    const token = await loginAs(app, UserRole.comercial);
    const payload = { customerId, items: [{ productId, presentationId, quantity: 1, unitPrice: 0 }] };
    const preview = await request(app.getHttpServer())
      .post("/quotes/preview")
      .set("Authorization", `Bearer ${token}`)
      .send(payload)
      .expect(201);
    const created = await request(app.getHttpServer())
      .post("/quotes")
      .set("Authorization", `Bearer ${token}`)
      .send(payload)
      .expect(201);
    expect(preview.body.total).toBe(Number(created.body.total));
    expect(preview.body.lines[0].unitPrice).toBe(specialSinIva);
    expect(created.body.currencySnapshot).toBe("COP");
    const [item] = created.body.items;
    expect(item.priceSource).toBe("special_price_list");
    expect(item.priceListNameSnapshot).toBe("Especial VIOS");
    expect(item.currencySnapshot).toBe("COP");
    expect(Number(item.unitPrice)).toBe(specialSinIva);
  });

  it("order created from quote preserves its approved unit price after list update", async () => {
    const token = await loginAs(app, UserRole.comercial);
    const payload = { customerId, items: [{ productId, presentationId, quantity: 1, unitPrice: 0 }] };
    const quoted = await request(app.getHttpServer())
      .post("/quotes")
      .set("Authorization", `Bearer ${token}`)
      .send(payload)
      .expect(201);
    const approvedPrice = Number(quoted.body.items[0].unitPrice);

    specialSinIva = approvedPrice + 10;

    const ordered = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId,
        companyId,
        sourceQuoteId: quoted.body.id,
        items: [{ productId, presentationId, quantity: 1, unitPrice: 0 }],
      })
      .expect(201);
    expect(Number(ordered.body.items[0].unitPrice)).toBe(approvedPrice);
    expect(ordered.body.items[0].priceSource).toBe("special_price_list");
    specialSinIva = 80;
  });
});

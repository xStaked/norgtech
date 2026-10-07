import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { findMockUserByEmail, loginAs, refreshTokenStub } from "./helpers/login-as";

describe("Seller-scoped special pricing", () => {
  let app: INestApplication;

  const ownerId = "00000000-0000-4000-8000-000000000003";
  const otherSellerId = "00000000-0000-4000-8000-000000000007";
  const customerId = "customer-special-1";
  const productId = "product-special-1";
  const presentationId = "pres-special-1";

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
            ? { id, priceListId: "general-list-1", currency: "COP", segment: null, assignedToUserId: ownerId }
            : null,
      },
      product: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          id === productId
            ? { id, name: "Producto especial", sku: "SKU-SP-1", unit: "bolsa", basePrice: 120, presentation: null }
            : null,
      },
      order: { aggregate: async () => ({ _sum: { total: 0 } }) },
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
            priceSinIva: 80,
            priceConIva: 84,
            taxPercent: 5,
            customer: { currency: "COP" },
            presentation: { empaque: "Bolsa x 500 g", form: "Polvo", productId },
            revision: { specialPriceList: { id: "special-1", name: "Especial VIOS", active: true } },
          };
        },
      },
      quote: { create: async () => { throw new Error("must run in tx"); } },
      auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "audit-1", ...data }) },
    };
    prismaStub.$transaction = async (cb: (tx: any) => Promise<unknown>) =>
      cb({
        quote: {
          create: async ({ data }: { data: Record<string, any> }) => ({ id: "quote-1", ...data, items: data.items.create }),
        },
        auditLog: prismaStub.auditLog,
      });

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
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
    expect(line.unitPrice).toBe(80);
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
    expect(preview.body.lines[0].unitPrice).toBe(80);
  });
});

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
}

describe("Products", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  const passwordHash = "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";
  const products: Array<Record<string, unknown>> = [];
  const customerId = "customer-id";
  const discountCustomerId = "discount-customer-id";
  const goalMissCustomerId = "goal-miss-customer-id";

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        user: {
          findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
            const byEmail = where.email;
            const byId = where.id;
            if (byEmail === "admin@norgtech.local" || byId === "admin-user-id") {
              return {
                id: "admin-user-id",
                name: "Admin",
                email: "admin@norgtech.local",
                passwordHash,
                role: UserRole.administrador,
                active: true,
              };
            }
            if (byEmail === "facturacion@norgtech.local" || byId === "facturacion-user-id") {
              return {
                id: "facturacion-user-id",
                name: "Facturacion",
                email: "facturacion@norgtech.local",
                passwordHash,
                role: UserRole.facturacion,
                active: true,
              };
            }
            return null;
          },
        },
        refreshToken: refreshTokenStub(),
        customer: {
          findUnique: async ({ where: { id }, include }: { where: { id: string }; include?: Record<string, boolean> }) => {
            if (id !== customerId && id !== discountCustomerId && id !== goalMissCustomerId) {
              return null;
            }
            const result: Record<string, unknown> = { id };
            if (include?.segment) {
              result.segment = {
                discountPercent: id === customerId ? 0 : 5,
                // goalMissCustomer's YTD sales fall short of this; the others'
                // zero threshold is always met.
                minGoalAmount: id === goalMissCustomerId ? 30000000 : 0,
              };
            }
            return result;
          },
        },
        order: {
          aggregate: async ({ where }: { where: { customerId: string } }) => ({
            _sum: { total: where.customerId === goalMissCustomerId ? 12000000 : 0 },
          }),
        },
        product: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            const product = {
              id: `product-${products.length + 1}`,
              ...data,
              createdAt: new Date("2026-04-29T00:00:00.000Z"),
              updatedAt: new Date("2026-04-29T00:00:00.000Z"),
            };
            products.push(product);
            return product;
          },
          findMany: async () => products.filter((p) => (p as { active?: boolean }).active !== false),
          findUnique: async ({ where: { id } }: { where: { id: string } }) =>
            products.find((p) => (p as { id: string }).id === id) ?? null,
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    globalThis.__APP__ = app.getHttpServer();

    const loginResponse = await request(globalThis.__APP__)
      .post("/auth/login")
      .send({ email: "admin@norgtech.local", password: "Admin123*" })
      .expect(200);

    globalThis.__ADMIN_TOKEN__ = loginResponse.body.accessToken;

    const facturacionLoginResponse = await request(globalThis.__APP__)
      .post("/auth/login")
      .send({ email: "facturacion@norgtech.local", password: "Admin123*" })
      .expect(200);

    globalThis.__FACTURACION_TOKEN__ = facturacionLoginResponse.body.accessToken;
  });

  afterAll(async () => {
    globalThis.__ADMIN_TOKEN__ = undefined;
    globalThis.__FACTURACION_TOKEN__ = undefined;
    globalThis.__APP__ = undefined;

    if (app) {
      await app.close();
    }
  });

  it("allows an admin to create a product", async () => {
    const response = await request(globalThis.__APP__)
      .post("/products")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        sku: "VAC-001",
        name: "Vacuna Aftosa",
        unit: "dosis",
        presentation: "Caja x10",
        basePrice: 45000,
      })
      .expect(201);

    expect(response.body.sku).toBe("VAC-001");
    expect(response.body.name).toBe("Vacuna Aftosa");
  });

  it("lists active products", async () => {
    const response = await request(globalThis.__APP__)
      .get("/products")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThanOrEqual(1);
  });

  it("returns price for customer without discount", async () => {
    const productResponse = await request(globalThis.__APP__)
      .post("/products")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        sku: "VAC-002",
        name: "Vacuna Carbunco",
        unit: "dosis",
        presentation: "Caja x10",
        basePrice: 100000,
      })
      .expect(201);

    const productId = productResponse.body.id;

    const response = await request(globalThis.__APP__)
      .get(`/products/${productId}/price-for-customer/${customerId}`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    expect(response.body.productId).toBe(productId);
    expect(response.body.customerId).toBe(customerId);
    expect(response.body.basePrice).toBe(100000);
    expect(Number(response.body.discountPercent)).toBe(0);
    expect(response.body.finalPrice).toBe("100000");
  });

  it("returns discounted price for customer with segment discount", async () => {
    const productResponse = await request(globalThis.__APP__)
      .post("/products")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        sku: "VAC-003",
        name: "Vacuna Brucelosis",
        unit: "dosis",
        presentation: "Caja x10",
        basePrice: 200000,
      })
      .expect(201);

    const productId = productResponse.body.id;

    const response = await request(globalThis.__APP__)
      .get(`/products/${productId}/price-for-customer/${discountCustomerId}`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    expect(response.body.productId).toBe(productId);
    expect(response.body.customerId).toBe(discountCustomerId);
    expect(response.body.basePrice).toBe(200000);
    expect(response.body.meetsGoal).toBe(true);
    expect(Number(response.body.discountPercent)).toBe(5);
    expect(response.body.finalPrice).toBe("190000");
  });

  it("quotes full price when the customer has not met the segment goal", async () => {
    const productResponse = await request(globalThis.__APP__)
      .post("/products")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        sku: "VAC-004",
        name: "Vacuna Carbon",
        unit: "dosis",
        presentation: "Caja x10",
        basePrice: 200000,
      })
      .expect(201);

    const response = await request(globalThis.__APP__)
      .get(`/products/${productResponse.body.id}/price-for-customer/${goalMissCustomerId}`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    // The segment carries a 5% discount, but YTD sales (12M) fall short of the
    // 30M goal — so the quote must match what an order would actually charge.
    expect(response.body.meetsGoal).toBe(false);
    expect(Number(response.body.discountPercent)).toBe(0);
    expect(response.body.finalPrice).toBe("200000");
  });

  it("returns 404 for invalid product in price-for-customer", async () => {
    await request(globalThis.__APP__)
      .get(`/products/invalid-product/price-for-customer/${customerId}`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(404);
  });

  it("returns 404 for invalid customer in price-for-customer", async () => {
    const productResponse = await request(globalThis.__APP__)
      .post("/products")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        sku: "VAC-004",
        name: "Vacuna Rabia",
        unit: "dosis",
        presentation: "Caja x10",
        basePrice: 50000,
      })
      .expect(201);

    await request(globalThis.__APP__)
      .get(`/products/${productResponse.body.id}/price-for-customer/invalid-customer`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(404);
  });

  it("allows facturacion role to list products", async () => {
    const response = await request(globalThis.__APP__)
      .get("/products")
      .set("Authorization", `Bearer ${globalThis.__FACTURACION_TOKEN__}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });
});

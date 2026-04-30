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

describe("Products", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  const passwordHash = "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";
  const products: Array<Record<string, unknown>> = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        user: {
          findUnique: async ({ where: { email } }: { where: { email: string } }) =>
            email === "admin@norgtech.local"
              ? {
                  id: "admin-user-id",
                  name: "Admin",
                  email: "admin@norgtech.local",
                  passwordHash,
                  role: UserRole.admin,
                  active: true,
                }
              : null,
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
  });

  afterAll(async () => {
    globalThis.__ADMIN_TOKEN__ = undefined;
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
});

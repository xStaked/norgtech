import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Prisma, UserRole } from "@prisma/client";
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
  // Cliente con lista negociada. Tiene además 5% de descuento de segmento y
  // cumple la meta: el precio de lista debe ignorarlo igual.
  const listCustomerId = "list-customer-id";
  const ambiguousCustomerId = "ambiguous-customer-id";
  const listPriceItems = [
    {
      priceListId: "list-1",
      presentationId: "presentation-a",
      priceSinIva: new Prisma.Decimal(84238.1),
      priceConIva: new Prisma.Decimal(88450),
      taxPercent: new Prisma.Decimal(5),
      priceList: { name: "AVSA", currency: "COP" },
      presentation: { empaque: "Bolsa x 500 g", form: "Polvo soluble" },
    },
    {
      priceListId: "list-2",
      presentationId: "presentation-b",
      priceSinIva: new Prisma.Decimal(156400),
      priceConIva: new Prisma.Decimal(164220),
      taxPercent: new Prisma.Decimal(5),
      priceList: { name: "CALASAN", currency: "COP" },
      presentation: { empaque: "Bolsa x 1 Kg", form: "Polvo soluble" },
    },
    {
      priceListId: "list-2",
      presentationId: "presentation-c",
      priceSinIva: new Prisma.Decimal(2350554),
      priceConIva: new Prisma.Decimal(2468081.7),
      taxPercent: new Prisma.Decimal(5),
      priceList: { name: "CALASAN", currency: "COP" },
      presentation: { empaque: "Saco x 25 Kg.", form: "Premix" },
    },
  ];

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
            const known = [
              customerId,
              discountCustomerId,
              goalMissCustomerId,
              listCustomerId,
              ambiguousCustomerId,
            ];
            if (!known.includes(id)) {
              return null;
            }
            const result: Record<string, unknown> = { id, priceListId: null };
            if (id === listCustomerId) result.priceListId = "list-1";
            if (id === ambiguousCustomerId) result.priceListId = "list-2";
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
        priceListItem: {
          findMany: async ({
            where,
          }: {
            where: { priceListId: string; presentation: { id?: string } };
          }) =>
            listPriceItems.filter(
              (item) =>
                item.priceListId === where.priceListId &&
                (where.presentation.id === undefined ||
                  item.presentationId === where.presentation.id),
            ),
        },
        order: {
          aggregate: async ({ where }: { where: { customerId: string } }) => ({
            _sum: { total: where.customerId === goalMissCustomerId ? 12000000 : 0 },
          }),
        },
        product: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            if (products.some((p) => (p as { sku?: string }).sku === data.sku)) {
              throw new Prisma.PrismaClientKnownRequestError(
                "Unique constraint failed on the fields: (`sku`)",
                { code: "P2002", clientVersion: "test", meta: { target: ["sku"] } },
              );
            }
            // `presentations` llega como nested create de Prisma; el stub lo
            // aplana al array que devolvería el include.
            const { presentations, ...scalars } = data as {
              presentations?: { create: Record<string, unknown>[] };
            } & Record<string, unknown>;
            const product = {
              id: `product-${products.length + 1}`,
              ...scalars,
              presentations: (presentations?.create ?? []).map((p, index) => ({
                id: `presentation-${products.length + 1}-${index + 1}`,
                productId: `product-${products.length + 1}`,
                ...p,
                priceItems: [],
              })),
              createdAt: new Date("2026-04-29T00:00:00.000Z"),
              updatedAt: new Date("2026-04-29T00:00:00.000Z"),
            };
            products.push(product);
            return product;
          },
          // Honors the `where.active` filter so the includeInactive e2e below is
          // real: the service passes `where: { active: true }` by default and
          // `where: undefined` when includeInactive is set.
          findMany: async ({ where }: { where?: { active?: boolean } } = {}) =>
            products
              .filter(
                (p) =>
                  where?.active === undefined ||
                  ((p as { active?: boolean }).active ?? true) === where.active,
              )
              .map((p) => ({ presentations: [], ...p })),
          findUnique: async ({ where: { id } }: { where: { id: string } }) => {
            const product = products.find((p) => (p as { id: string }).id === id);
            return product ? { presentations: [], ...product } : null;
          },
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

  it("prefers the customer's price list over basePrice, with no segment discount on top", async () => {
    const productResponse = await request(globalThis.__APP__)
      .post("/products")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ sku: "CAT-ACETECH", name: "ACE TECH", unit: "Polvo soluble", basePrice: 999999 })
      .expect(201);

    const response = await request(globalThis.__APP__)
      .get(`/products/${productResponse.body.id}/price-for-customer/${listCustomerId}`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    expect(response.body.source).toBe("price_list");
    expect(response.body.priceListName).toBe("AVSA");
    expect(response.body.currency).toBe("COP");
    expect(response.body.empaque).toBe("Bolsa x 500 g");
    // El precio negociado gana sobre basePrice…
    expect(Number(response.body.finalPrice)).toBe(84238.1);
    // …y el 5% del segmento NO se aplica encima: descontaría dos veces sobre
    // un precio que el cliente ya acordó.
    expect(Number(response.body.discountPercent)).toBe(0);
    expect(Number(response.body.taxPercent)).toBe(5);
  });

  it("asks which presentation when the product has several priced in the list", async () => {
    const productResponse = await request(globalThis.__APP__)
      .post("/products")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ sku: "CAT-DYSENTECH", name: "DYSENTECH", unit: "Polvo soluble", basePrice: 1 })
      .expect(201);

    const response = await request(globalThis.__APP__)
      .get(`/products/${productResponse.body.id}/price-for-customer/${ambiguousCustomerId}`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    // Elegir una al azar cotizaría un empaque distinto al que se despacha.
    expect(response.body.source).toBe("ambiguous");
    expect(response.body.options).toHaveLength(2);
    expect(response.body.options.map((o: { empaque: string }) => o.empaque)).toEqual([
      "Bolsa x 1 Kg",
      "Saco x 25 Kg.",
    ]);
    expect(response.body.finalPrice).toBeUndefined();
  });

  it("prices the chosen presentation when the caller disambiguates", async () => {
    const productResponse = await request(globalThis.__APP__)
      .post("/products")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ sku: "CAT-SILYTECH", name: "SILYTECH", unit: "Premix", basePrice: 1 })
      .expect(201);

    const response = await request(globalThis.__APP__)
      .get(`/products/${productResponse.body.id}/price-for-customer/${ambiguousCustomerId}`)
      .query({ presentationId: "presentation-c" })
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    expect(response.body.source).toBe("price_list");
    expect(response.body.empaque).toBe("Saco x 25 Kg.");
    expect(Number(response.body.finalPrice)).toBe(2350554);
  });

  it("creates a product with its presentations", async () => {
    const response = await request(globalThis.__APP__)
      .post("/products")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        sku: "CAT-HYDRATECH",
        name: "HYDRATECH",
        unit: "Polvo gelificante",
        presentations: [
          { empaque: "Saco x 20 Kg.", form: "Polvo gelificante", dosage: "6,66g/ 100 animales" },
          { empaque: "Bolsa x 1 Kg" },
        ],
      })
      .expect(201);

    expect(response.body.presentations).toHaveLength(2);
    expect(response.body.presentations[0].empaque).toBe("Saco x 20 Kg.");
    // basePrice es vestigial: se puede crear un producto sin él.
    expect(Number(response.body.basePrice)).toBe(0);
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
        sku: "VAC-005",
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

  // PRD-01: a duplicate SKU used to surface the raw Prisma P2002 as a 500.
  it("returns 409 with a Spanish message when the sku already exists", async () => {
    const payload = {
      sku: "DUP-001",
      name: "Vacuna Duplicada",
      unit: "dosis",
      presentation: "Caja x10",
      basePrice: 45000,
    };

    await request(globalThis.__APP__)
      .post("/products")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send(payload)
      .expect(201);

    const response = await request(globalThis.__APP__)
      .post("/products")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ ...payload, name: "Otro nombre" })
      .expect(409);

    expect(response.body.message).toBe("Ya existe un producto con ese SKU");
  });

  // ZON-01/COM-01 family: deactivated records must not silently disappear, but
  // only when the caller opts in. Default list stays active-only.
  it("excludes inactive products from the default list", async () => {
    await request(globalThis.__APP__)
      .post("/products")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        sku: "INACT-001",
        name: "Producto Inactivo",
        unit: "dosis",
        presentation: "Caja x10",
        basePrice: 1000,
        active: false,
      })
      .expect(201);

    const response = await request(globalThis.__APP__)
      .get("/products")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    const skus = (response.body as Array<{ sku: string }>).map((p) => p.sku);
    expect(skus).not.toContain("INACT-001");
  });

  it("includes inactive products when includeInactive=true", async () => {
    const response = await request(globalThis.__APP__)
      .get("/products?includeInactive=true")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    const skus = (response.body as Array<{ sku: string }>).map((p) => p.sku);
    expect(skus).toContain("INACT-001");
  });

  it("allows facturacion role to list products", async () => {
    const response = await request(globalThis.__APP__)
      .get("/products")
      .set("Authorization", `Bearer ${globalThis.__FACTURACION_TOKEN__}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });
});

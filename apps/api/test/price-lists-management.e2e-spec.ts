import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { findMockUserByEmail, loginAs, refreshTokenStub } from "./helpers/login-as";

describe("General price list management", () => {
  let app: INestApplication;

  const lists = new Map<string, Record<string, any>>();
  const sourceItem = {
    id: "general-item-1",
    priceListId: "general-source",
    presentationId: "presentation-1",
    priceSinIva: 100,
    priceConIva: 105,
    taxPercent: 5,
    presentation: {
      empaque: "Bolsa x 500 g",
      form: "Polvo",
      dosage: null,
      product: { id: "product-1", sku: "SKU-1", name: "Producto 1", unit: "bolsa" },
    },
  };
  const items: Array<Record<string, any>> = [];
  const auditRecords: Array<Record<string, any>> = [];

  beforeAll(async () => {
    const priceList = {
      findUnique: async ({ where: { id } }: { where: { id: string } }) => {
        const list = lists.get(id);
        return list
          ? {
              ...list,
              items: items.filter((item) => item.priceListId === id),
            }
          : null;
      },
      create: async ({ data }: { data: Record<string, any> }) => {
        const { items: nestedItems, ...fields } = data;
        const list = {
          id: `general-${lists.size + 1}`,
          active: false,
          status: "borrador",
          customers: [],
          ...fields,
        };
        const createdItems = (nestedItems?.create ?? []).map((item: Record<string, any>) => ({
          id: `general-item-${items.length + 1}`,
          priceListId: list.id,
          ...item,
          presentation: sourceItem.presentation,
        }));
        items.push(...createdItems);
        lists.set(list.id, list);
        return { ...list, items: createdItems };
      },
      update: async ({ where: { id }, data }: { where: { id: string }; data: Record<string, any> }) => {
        const list = lists.get(id);
        if (!list) throw new Error("Record to update not found");
        const updated = { ...list, ...data };
        lists.set(id, updated);
        return updated;
      },
      findMany: async () => [...lists.values()],
    };
    const priceListItem = {
      findMany: async ({ where }: { where: { priceListId: string } }) =>
        items.filter((item) => item.priceListId === where.priceListId),
      createMany: async ({ data }: { data: Array<Record<string, any>> }) => {
        for (const item of data) {
          items.push({
            id: `general-item-${items.length + 1}`,
            ...item,
            presentation: items[0].presentation,
          } as (typeof items)[number]);
        }
        return { count: data.length };
      },
    };
    const auditLog = {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const entry = { id: `audit-${auditRecords.length + 1}`, ...data };
        auditRecords.push(entry);
        return entry;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        auditRecords.filter(
          (record) =>
            (!where.entityType || record.entityType === where.entityType) &&
            (!where.entityId || record.entityId === where.entityId),
        ),
    };
    const prismaStub = {
      user: {
        findUnique: async ({ where }: { where: { email?: string } }) =>
          findMockUserByEmail(where.email),
      },
      refreshToken: refreshTokenStub(),
      priceList,
      priceListItem,
      auditLog,
      $transaction: async (callback: (tx: Record<string, any>) => Promise<unknown>) =>
        callback({ priceList, priceListItem, auditLog }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    auditRecords.length = 0;
    lists.clear();
    lists.set("general-source", {
      id: "general-source",
      name: "DIRECTOS",
      kind: "segmento",
      currency: "COP",
      country: "Colombia",
      active: true,
      status: "aprobada",
      customers: [{ id: "customer-assigned" }],
    });
    items.splice(0, items.length, sourceItem);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("admin creates a general list inactive until explicitly activated", async () => {
    const token = await loginAs(app, UserRole.administrador);

    const response = await request(app.getHttpServer())
      .post("/price-lists")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "NUEVA", kind: "linea", currency: "USD", country: "Ecuador" })
      .expect(201);

    expect(response.body).toMatchObject({
      name: "NUEVA",
      kind: "linea",
      currency: "USD",
      active: false,
      status: "borrador",
    });
    const history = await request(app.getHttpServer())
      .get(`/audit?entityType=PriceList&entityId=${response.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(history.body[0].action).toBe("price_list.created");

    const activated = await request(app.getHttpServer())
      .patch(`/price-lists/${response.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ active: true })
      .expect(200);
    expect(activated.body).toMatchObject({ active: true, status: "aprobada" });
  });

  it("commercial cannot create a general list", async () => {
    const token = await loginAs(app, UserRole.comercial);

    await request(app.getHttpServer())
      .post("/price-lists")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "NO AUTORIZADA", kind: "linea", currency: "COP" })
      .expect(403);
  });

  it("promotor clones a general list without assigning its customers", async () => {
    const token = await loginAs(app, UserRole.promotor);

    const response = await request(app.getHttpServer())
      .post("/price-lists/general-source/clone")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "DIRECTOS copia" })
      .expect(201);

    expect(response.body).toMatchObject({
      name: "DIRECTOS copia",
      active: false,
      status: "borrador",
      customers: [],
    });
    expect(response.body.items).toHaveLength(1);
  });

  it("director deactivates a general list without deleting its prices", async () => {
    const token = await loginAs(app, UserRole.director_comercial);

    const response = await request(app.getHttpServer())
      .patch("/price-lists/general-source")
      .set("Authorization", `Bearer ${token}`)
      .send({ active: false, name: "DIRECTOS desactivada" })
      .expect(200);

    expect(response.body).toMatchObject({ active: false, name: "DIRECTOS desactivada" });
    expect((await request(app.getHttpServer())
      .get("/price-lists/general-source")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)).body.items).toHaveLength(1);
    const history = await request(app.getHttpServer())
      .get("/audit?entityType=PriceList&entityId=general-source")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(history.body[0].action).toBe("price_list.deactivated");
  });
});

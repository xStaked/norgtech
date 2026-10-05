import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { findMockUserByEmail, loginAs, refreshTokenStub } from "./helpers/login-as";

/**
 * Task 1 (fase 2, frente 2): estados y aprobación de listas especiales.
 *
 * - `PATCH /price-lists/:id/approval { action: "aprobar" | "rechazar" }`
 *   solo admin/director (el comercial recibe 403).
 * - Regla "solo aprobada libera precio": una cotización sobre un cliente
 *   cuya lista sigue en revisión NO toma sus precios (cae a basePrice).
 */
describe("Price lists approval", () => {
  let app: INestApplication;

  const productId = "product-approval-1";
  const presentationId = "pres-approval-1";
  const customerId = "customer-approval-1";

  // Dos listas en revisión: una para el flujo de aprobación (RBAC) y otra
  // enganchada al cliente, para la regla "solo aprobada libera precio".
  const lists: Record<string, Record<string, unknown>> = {
    "list-por-aprobar": {
      id: "list-por-aprobar",
      name: "ESPECIAL-POR-APROBAR",
      kind: "cliente",
      currency: "COP",
      active: true,
      status: "en_revision",
    },
    "list-pendiente": {
      id: "list-pendiente",
      name: "ESPECIAL-PENDIENTE",
      kind: "cliente",
      currency: "COP",
      active: true,
      status: "en_revision",
    },
  };

  const auditRecords: Array<Record<string, unknown>> = [];

  const listItems: Array<Record<string, unknown>> = [
    {
      id: "item-approval-1",
      priceListId: "list-pendiente",
      presentationId,
      productId,
      priceSinIva: 84238.1,
      priceConIva: 88450,
      taxPercent: 5,
      priceList: { name: "ESPECIAL-PENDIENTE", currency: "COP" },
      presentation: { empaque: "Bolsa x 500 g", form: "Polvo soluble" },
    },
  ];

  beforeAll(async () => {
    const prismaStub = {
      user: {
        findUnique: async ({ where }: { where: { email?: string } }) =>
          findMockUserByEmail(where.email),
      },
      refreshToken: refreshTokenStub(),
      priceList: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          lists[id] ?? null,
        update: async ({
          where: { id },
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          if (!lists[id]) {
            throw new Error("Record to update not found");
          }
          lists[id] = { ...lists[id], ...data };
          return lists[id];
        },
      },
      // Imita el filtro de Prisma: solo devuelve ítems cuya lista cumpla
      // `where.priceList` (active + status). Si el servicio no manda el
      // filtro de status, la lista en revisión "libera" su precio y el test
      // de cotización falla, que es lo que debe pasar en RED.
      priceListItem: {
        findMany: async ({ where }: { where: Record<string, any> }) =>
          listItems.filter((item) => {
            if (where.priceListId && item.priceListId !== where.priceListId) {
              return false;
            }
            const list = lists[item.priceListId as string];
            const listFilter = (where.priceList ?? {}) as Record<string, unknown>;
            if (listFilter.active !== undefined && list.active !== listFilter.active) {
              return false;
            }
            if (listFilter.status !== undefined && list.status !== listFilter.status) {
              return false;
            }
            const presFilter = (where.presentation ?? {}) as Record<string, unknown>;
            if (presFilter.productId && item.productId !== presFilter.productId) {
              return false;
            }
            if (presFilter.id && item.presentationId !== presFilter.id) {
              return false;
            }
            return true;
          }),
      },
      customer: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) => {
          if (id !== customerId) return null;
          return { id, priceListId: "list-pendiente", segment: null };
        },
      },
      product: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          id === productId
            ? { id: productId, name: "Fertilizante NPK", sku: "SKU-APPR-1", unit: "bulto", basePrice: 100 }
            : null,
      },
      order: {
        aggregate: async () => ({ _sum: { total: 0 } }),
      },
      auditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const entry = {
            id: `audit-${auditRecords.length + 1}`,
            createdAt: new Date(),
            ...data,
          };
          auditRecords.push(entry);
          return entry;
        },
        findMany: async () => auditRecords,
      },
    };
    (prismaStub as Record<string, unknown>).$transaction = async (
      callback: (tx: unknown) => Promise<unknown>,
    ) =>
      callback({
        priceList: (prismaStub as Record<string, any>).priceList,
        priceListItem: (prismaStub as Record<string, any>).priceListItem,
        auditLog: (prismaStub as Record<string, any>).auditLog,
      });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("403 cuando un comercial intenta aprobar una lista en revisión", async () => {
    const token = await loginAs(app, UserRole.comercial);

    await request(app.getHttpServer())
      .patch("/price-lists/list-por-aprobar/approval")
      .set("Authorization", `Bearer ${token}`)
      .send({ action: "aprobar" })
      .expect(403);
  });

  it("200 y estado aprobada cuando un admin aprueba", async () => {
    const token = await loginAs(app, UserRole.administrador);

    const response = await request(app.getHttpServer())
      .patch("/price-lists/list-por-aprobar/approval")
      .set("Authorization", `Bearer ${token}`)
      .send({ action: "aprobar" })
      .expect(200);

    expect(response.body.status).toBe("aprobada");
  });

  it("200 y estado rechazada cuando dirección comercial rechaza", async () => {
    lists["list-por-aprobar"].status = "en_revision";
    const token = await loginAs(app, UserRole.director_comercial);

    const response = await request(app.getHttpServer())
      .patch("/price-lists/list-por-aprobar/approval")
      .set("Authorization", `Bearer ${token}`)
      .send({ action: "rechazar" })
      .expect(200);

    expect(response.body.status).toBe("rechazada");
  });

  it("registra la aprobación en auditoría con actor y antes/después", async () => {
    lists["list-por-aprobar"].status = "en_revision";
    auditRecords.length = 0;
    const token = await loginAs(app, UserRole.administrador);

    await request(app.getHttpServer())
      .patch("/price-lists/list-por-aprobar/approval")
      .set("Authorization", `Bearer ${token}`)
      .send({ action: "aprobar" })
      .expect(200);

    expect(auditRecords).toHaveLength(1);
    const [record] = auditRecords;
    expect(record.entityType).toBe("PriceList");
    expect(record.entityId).toBe("list-por-aprobar");
    expect(record.action).toBe("price_list.approval_updated");
    expect(record.actorUserId).toBe("00000000-0000-4000-8000-000000000001");
    expect((record.previousState as Record<string, unknown>).status).toBe("en_revision");
    expect((record.nextState as Record<string, unknown>).status).toBe("aprobada");
  });

  it("la cotización NO toma los precios de una lista en revisión (cae a basePrice)", async () => {
    const token = await loginAs(app, UserRole.administrador);

    const response = await request(app.getHttpServer())
      .post("/quotes/preview")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId,
        items: [{ productId, quantity: 2, unitPrice: 100 }],
      })
      .expect(201);

    const [line] = response.body.lines;
    expect(line.priceListName).toBeNull();
    expect(line.unitPrice).toBe(100);
    expect(response.body.subtotal).toBe(200);
  });

  it("la cotización SÍ toma los precios una vez aprobada la lista", async () => {
    const adminToken = await loginAs(app, UserRole.administrador);

    await request(app.getHttpServer())
      .patch("/price-lists/list-pendiente/approval")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "aprobar" })
      .expect(200);

    const response = await request(app.getHttpServer())
      .post("/quotes/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        customerId,
        items: [{ productId, quantity: 2, unitPrice: 100 }],
      })
      .expect(201);

    const [line] = response.body.lines;
    expect(line.priceListName).toBe("ESPECIAL-PENDIENTE");
    expect(line.unitPrice).toBe(84238.1);
    expect(response.body.subtotal).toBe(168476.2);
  });
});

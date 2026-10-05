import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { findMockUserByEmail, loginAs, refreshTokenStub } from "./helpers/login-as";

/**
 * Task 3 (fase 2, frente 2): histórico + último precio vendido.
 *
 * - `PUT /price-lists/:id/items` registra en AuditModule quién/cuándo cambió
 *   cada precio, con antes/después por presentación.
 * - `GET /price-lists/last-sold?customerId&productId` devuelve el último precio
 *   VENDIDO (OrderItem de pedidos reales) e ignora cotizaciones (QuoteItem).
 */
describe("Price lists history + last sold", () => {
  let app: INestApplication;

  const listId = "list-historial";
  const presentationId = "pres-historial-1";
  const customerId = "customer-historial-1";
  const productId = "product-historial-1";

  const auditRecords: Array<Record<string, any>> = [];

  const priceItem = {
    id: "item-historial-1",
    priceListId: listId,
    presentationId,
    priceSinIva: 100,
    priceConIva: null,
    taxPercent: 5,
    priceSinIva2: null,
    priceConIva2: null,
    priceSinIva3: null,
    priceConIva3: null,
  };

  // Dos pedidos reales del mismo (cliente, producto); la respuesta debe ser el
  // más reciente por orderDate. La cotización (QuoteItem, otra tabla) con precio
  // distinto NO debe contaminar el resultado.
  const orderItems = [
    {
      id: "oi-old",
      productId,
      unitPrice: 90,
      order: {
        customerId,
        orderNumber: "NT-001",
        orderDate: new Date("2026-01-10T00:00:00.000Z"),
        status: "entregado",
      },
    },
    {
      id: "oi-new",
      productId,
      unitPrice: 120,
      order: {
        customerId,
        orderNumber: "NT-009",
        orderDate: new Date("2026-09-20T00:00:00.000Z"),
        status: "facturado",
      },
    },
  ];
  const quoteUnitPrice = 999;

  beforeAll(async () => {
    const prismaStub = {
      user: {
        findUnique: async ({ where }: { where: { email?: string } }) =>
          findMockUserByEmail(where.email),
      },
      refreshToken: refreshTokenStub(),
      priceList: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          id === listId
            ? { id: listId, name: "HISTORIAL", kind: "cliente", currency: "COP" }
            : null,
      },
      productPresentation: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          id === presentationId ? { id: presentationId, empaque: "Bolsa x 500 g" } : null,
      },
      priceListItem: {
        findUnique: async () => ({ ...priceItem }),
        upsert: async ({
          update,
          create,
        }: {
          update: Record<string, unknown>;
          create: Record<string, unknown>;
        }) => ({ ...priceItem, ...create, ...update }),
      },
      auditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          auditRecords.push(data);
          return { id: `audit-${auditRecords.length}`, ...data };
        },
      },
      orderItem: {
        // Imita `orderBy: { order: { orderDate: "desc" } }`: devuelve el ítem
        // cuyo pedido es más reciente, o null sin ventas.
        findFirst: async ({ where }: { where: Record<string, any> }) => {
          const matches = orderItems.filter(
            (item) =>
              item.productId === where.productId &&
              item.order.customerId === (where.order?.customerId ?? where.customerId),
          );
          matches.sort((a, b) => +b.order.orderDate - +a.order.orderDate);
          return matches[0] ?? null;
        },
      },
      // El endpoint JAMÁS toca cotizaciones: si lo hace, el test revienta aquí
      // en vez de devolver silenciosamente el precio de la cotización (999).
      quoteItem: {
        findMany: async () => {
          throw new Error("last-sold debe leer pedidos reales, no cotizaciones");
        },
        findFirst: async () => {
          throw new Error("last-sold debe leer pedidos reales, no cotizaciones");
        },
      },
    };

    // upsertItem corre su write + auditoría dentro de una $transaction: el
    // stub la emula delegando al mismo stub (sin DB real no hay atomicidad
    // que probar, solo que el servicio pase por la tx).
    (prismaStub as unknown as Record<string, any>).$transaction = async (
      callback: (tx: unknown) => Promise<unknown>,
    ) =>
      callback({
        priceListItem: (prismaStub as unknown as Record<string, any>).priceListItem,
        auditLog: (prismaStub as unknown as Record<string, any>).auditLog,
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

  it("cambiar un precio registra auditoría con antes/después", async () => {
    const token = await loginAs(app, UserRole.administrador);
    auditRecords.length = 0;

    await request(app.getHttpServer())
      .put(`/price-lists/${listId}/items`)
      .set("Authorization", `Bearer ${token}`)
      .send({ presentationId, priceSinIva: 120 })
      .expect(200);

    expect(auditRecords).toHaveLength(1);
    const [record] = auditRecords;
    expect(record.entityType).toBe("PriceList");
    expect(record.entityId).toBe(listId);
    expect(record.actorUserId).toBe("00000000-0000-4000-8000-000000000001");
    expect(record.previousState.priceSinIva).toBe(100);
    expect(record.nextState.priceSinIva).toBe(120);
    expect(record.nextState.presentationId).toBe(presentationId);
  });

  it("último vendido: el pedido más reciente, ignorando cotizaciones", async () => {
    const token = await loginAs(app, UserRole.comercial);

    const response = await request(app.getHttpServer())
      .get(`/price-lists/last-sold?customerId=${customerId}&productId=${productId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    // NT-009 (120), no NT-001 (90) y nunca la cotización (999).
    expect(Number(response.body.unitPrice)).toBe(120);
    expect(response.body.orderNumber).toBe("NT-009");
    expect(response.body.unitPrice).not.toBe(quoteUnitPrice);
  });

  it("último vendido: cuerpo vacío sin ventas previas", async () => {
    const token = await loginAs(app, UserRole.comercial);

    const response = await request(app.getHttpServer())
      .get("/price-lists/last-sold?customerId=sin-ventas&productId=sin-ventas")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    // Sin ventas no hay nada que devolver: el servicio retorna null y Nest lo
    // serializa como cuerpo vacío.
    expect(response.text).toBe("");
  });
});

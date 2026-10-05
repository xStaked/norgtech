import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Prisma, UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  authHeader,
  findMockUserByEmail,
  loginAs,
  MOCK_USERS,
  refreshTokenStub,
} from "./helpers/login-as";

/**
 * Task 3 (Frente 3, fase 2): liquidacion de comisiones por periodo.
 * RED: este spec FALLA hasta que exista el endpoint de lectura
 * `GET /commissions` (con el filtro forzado por vendedor) y la accion
 * `PATCH /commissions/:id/paid` de marcar pagada.
 *
 * Guardas de la matriz Frente 0:
 * - comercial ve SOLO las suyas (sellerUserId forzado a su id).
 * - administrador y director_comercial ven todas y pueden filtrar por vendedor.
 * - tecnico/facturacion/logistica no entran (403).
 * - marcar pagada solo admin/director.
 */
describe("Commissions ledger (liquidacion)", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  const sellerId = MOCK_USERS[UserRole.comercial].id;
  const otherSellerId = MOCK_USERS[UserRole.director_comercial].id;
  const adminId = MOCK_USERS[UserRole.administrador].id;

  interface CommissionRow {
    id: string;
    sellerUserId: string;
    invoiceId: string;
    paymentId: string;
    base: Prisma.Decimal;
    percent: Prisma.Decimal;
    amount: Prisma.Decimal;
    reversedAmount: Prisma.Decimal;
    status: string;
    paidAt: Date | null;
    paidBy?: string | null;
    createdAt: Date;
    updatedAt: Date;
    seller?: { id: string; name: string };
    invoice?: {
      id: string;
      invoiceNumber: string;
      customer?: { id: string; displayName: string };
    };
    payment?: { id: string; paymentDate: Date; amount: Prisma.Decimal };
  }

  let rows: CommissionRow[];
  let whereCaptures: Array<Record<string, unknown> | undefined>;

  function seedLedger(): void {
    rows = [
      row({
        id: "commission-1",
        sellerUserId: sellerId,
        amount: 25000,
        paymentDate: "2026-06-10T15:00:00.000Z",
      }),
      row({
        id: "commission-2",
        sellerUserId: otherSellerId,
        amount: 40000,
        paymentDate: "2026-06-12T15:00:00.000Z",
      }),
      row({
        id: "commission-3",
        sellerUserId: sellerId,
        amount: 30000,
        paymentDate: "2026-06-20T15:00:00.000Z",
        paidAt: new Date("2026-06-25T12:00:00.000Z"),
        paidBy: adminId,
      }),
      row({
        id: "commission-4",
        sellerUserId: sellerId,
        amount: 5000,
        reversedAmount: 5000,
        status: "reversada",
        paymentDate: "2026-06-22T15:00:00.000Z",
      }),
      row({
        id: "commission-5",
        sellerUserId: sellerId,
        amount: 12000,
        paymentDate: "2026-07-05T15:00:00.000Z",
      }),
    ];
    whereCaptures = [];
  }

  function row(input: {
    id: string;
    sellerUserId: string;
    amount: number;
    reversedAmount?: number;
    status?: string;
    paymentDate: string;
    paidAt?: Date;
    paidBy?: string;
  }): CommissionRow {
    const sellerName =
      input.sellerUserId === sellerId ? "Comercial Mock" : "Director Comercial Mock";
    return {
      id: input.id,
      sellerUserId: input.sellerUserId,
      invoiceId: `invoice-for-${input.id}`,
      paymentId: `payment-for-${input.id}`,
      base: new Prisma.Decimal(input.amount),
      percent: new Prisma.Decimal(5),
      amount: new Prisma.Decimal(input.amount),
      reversedAmount: new Prisma.Decimal(input.reversedAmount ?? 0),
      status: input.status ?? "causada",
      paidAt: input.paidAt ?? null,
      paidBy: input.paidBy ?? null,
      createdAt: new Date(input.paymentDate),
      updatedAt: new Date(input.paymentDate),
      seller: { id: input.sellerUserId, name: sellerName },
      invoice: {
        id: `invoice-for-${input.id}`,
        invoiceNumber: `FV-${input.id.replace("commission-", "")}`,
        customer: { id: "customer-1", displayName: "Agro Norte" },
      },
      payment: {
        id: `payment-for-${input.id}`,
        paymentDate: new Date(input.paymentDate),
        amount: new Prisma.Decimal(input.amount),
      },
    };
  }

  function matchesWhere(item: CommissionRow, where?: Record<string, unknown>): boolean {
    if (!where) return true;
    if (where.sellerUserId && item.sellerUserId !== where.sellerUserId) return false;
    const paymentDate = (where.payment ?? {}) as {
      paymentDate?: { gte?: Date; lte?: Date };
    };
    const range = paymentDate.paymentDate;
    if (range?.gte && item.payment!.paymentDate < range.gte) return false;
    if (range?.lte && item.payment!.paymentDate > range.lte) return false;
    return true;
  }

  beforeAll(async () => {
    const prismaStub = {
      user: {
        findUnique: async ({
          where,
        }: {
          where: { email?: string; id?: string };
        }) => {
          if (where.email) return findMockUserByEmail(where.email);
          if (where.id) {
            const found = Object.values(MOCK_USERS).find(
              (user) => user.id === where.id,
            );
            return found ? { ...found } : null;
          }
          return null;
        },
      },
      refreshToken: refreshTokenStub(),
      commission: {
        findMany: async ({
          where,
        }: {
          where?: Record<string, unknown>;
        } = {}) => {
          whereCaptures.push(where);
          return rows
            .filter((item) => matchesWhere(item, where))
            .map((item) => ({ ...item, payment: { ...item.payment! } }));
        },
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          rows.find((item) => item.id === id) ?? null,
        update: async ({
          where: { id },
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const found = rows.find((item) => item.id === id);
          if (!found) throw new Error("Commission not found in stub");
          Object.assign(found, data);
          return { ...found };
        },
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
  });

  beforeEach(() => {
    seedLedger();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("GET /commissions", () => {
    it("forces sellerUserId to the authenticated comercial, ignoring the query param", async () => {
      const token = await loginAs(app, UserRole.comercial);

      const response = await request(app.getHttpServer())
        .get(`/commissions?sellerUserId=${otherSellerId}`)
        .set(authHeader(token))
        .expect(200);

      const where = whereCaptures[0] as { sellerUserId?: string };
      expect(where.sellerUserId).toBe(sellerId);

      const ledger = response.body as Array<{
        id: string;
        amount: string | number;
        seller: { name: string };
        invoice: { invoiceNumber: string };
      }>;
      expect(ledger.map((item) => item.id).sort()).toEqual([
        "commission-1",
        "commission-3",
        "commission-4",
        "commission-5",
      ]);
      expect(ledger[0].seller.name).toBe("Comercial Mock");
      expect(ledger[0].invoice.invoiceNumber).toBe("FV-1");
    });

    it("lets an administrador see every seller and filter by sellerUserId", async () => {
      const token = await loginAs(app, UserRole.administrador);

      const list = await request(app.getHttpServer())
        .get("/commissions")
        .set(authHeader(token))
        .expect(200);
      expect(list.body).toHaveLength(5);

      const filtered = await request(app.getHttpServer())
        .get(`/commissions?sellerUserId=${otherSellerId}`)
        .set(authHeader(token))
        .expect(200);
      expect(filtered.body).toHaveLength(1);
      expect(filtered.body[0].id).toBe("commission-2");

      const where = whereCaptures[1] as { sellerUserId?: string };
      expect(where.sellerUserId).toBe(otherSellerId);
    });

    it("filters the period by payment date boundaries", async () => {
      const token = await loginAs(app, UserRole.administrador);

      const response = await request(app.getHttpServer())
        .get("/commissions?from=2026-06-01&to=2026-06-30")
        .set(authHeader(token))
        .expect(200);

      expect(
        response.body.map((item: { id: string }) => item.id).sort(),
      ).toEqual(["commission-1", "commission-2", "commission-3", "commission-4"]);

      const where = whereCaptures[0] as {
        payment?: { paymentDate?: { gte?: Date; lte?: Date } };
      };
      expect(where.payment?.paymentDate?.gte?.toISOString()).toBe(
        "2026-06-01T05:00:00.000Z",
      );
      expect(where.payment?.paymentDate?.lte?.toISOString()).toBe(
        // Fin del 30 de junio en hora de Colombia (UTC-5).
        "2026-07-01T04:59:59.999Z",
      );
    });

    it("rejects an inverted range with 400", async () => {
      const token = await loginAs(app, UserRole.administrador);

      await request(app.getHttpServer())
        .get("/commissions?from=2026-07-01&to=2026-06-30")
        .set(authHeader(token))
        .expect(400);
    });

    it("rejects an invalid date with 400 instead of an unfiltered list", async () => {
      const token = await loginAs(app, UserRole.administrador);

      await request(app.getHttpServer())
        .get("/commissions?from=not-a-date")
        .set(authHeader(token))
        .expect(400);
    });

    it.each([UserRole.tecnico, UserRole.facturacion, UserRole.logistica])(
      "rejects %s with 403 (roles without commissions)",
      async (role) => {
        const token = await loginAs(app, role);
        await request(app.getHttpServer())
          .get("/commissions")
          .set(authHeader(token))
          .expect(403);
      },
    );
  });

  describe("PATCH /commissions/:id/paid", () => {
    it("marks a causada commission as paid as administrador", async () => {
      const token = await loginAs(app, UserRole.administrador);

      const response = await request(app.getHttpServer())
        .patch("/commissions/commission-1/paid")
        .set(authHeader(token))
        .expect(200);

      expect(response.body.paidAt).toBeTruthy();
      expect(response.body.paidBy).toBe(adminId);
      expect(response.body.id).toBe("commission-1");
    });

    it("marks as paid as director_comercial too", async () => {
      const token = await loginAs(app, UserRole.director_comercial);

      await request(app.getHttpServer())
        .patch("/commissions/commission-2/paid")
        .set(authHeader(token))
        .expect(200);
    });

    it("marks a partially reversed commission paying the net (reversal intact)", async () => {
      const token = await loginAs(app, UserRole.administrador);

      rows.push(
        row({
          id: "commission-6",
          sellerUserId: sellerId,
          amount: 10000,
          reversedAmount: 2500,
          paymentDate: "2026-06-18T15:00:00.000Z",
        }),
      );

      await request(app.getHttpServer())
        .patch("/commissions/commission-6/paid")
        .set(authHeader(token))
        .expect(200);
    });

    it("rejects comercial with 403 (only admin/director liquidate)", async () => {
      const token = await loginAs(app, UserRole.comercial);

      await request(app.getHttpServer())
        .patch("/commissions/commission-1/paid")
        .set(authHeader(token))
        .expect(403);
    });

    it("rejects an already paid commission with 409", async () => {
      const token = await loginAs(app, UserRole.administrador);

      await request(app.getHttpServer())
        .patch("/commissions/commission-3/paid")
        .set(authHeader(token))
        .expect(409);
    });

    it("rejects a fully reversed commission with 409 (nothing left to pay)", async () => {
      const token = await loginAs(app, UserRole.administrador);

      await request(app.getHttpServer())
        .patch("/commissions/commission-4/paid")
        .set(authHeader(token))
        .expect(409);
    });

    it("returns 404 for an unknown commission", async () => {
      const token = await loginAs(app, UserRole.administrador);

      await request(app.getHttpServer())
        .patch("/commissions/commission-does-not-exist/paid")
        .set(authHeader(token))
        .expect(404);
    });
  });
});

import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
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
 * Task 1 (Frente 3, fase 2): regla de % de comisión por vendedor por periodo.
 * RED: este spec debe FALLAR antes de implementar el módulo `commissions`
 * (las rutas responden 404 hasta que exista el controlador).
 */
describe("Commissions rules", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  const rules: Array<Record<string, unknown>> = [];
  let ruleCounter = 0;

  const sellerId = MOCK_USERS[UserRole.comercial].id;
  const otherSellerId = MOCK_USERS[UserRole.director_comercial].id;
  const nonSellerId = MOCK_USERS[UserRole.tecnico].id;

  function matches(
    rule: Record<string, unknown>,
    where?: {
      id?: string;
      sellerUserId?: string;
      periodType?: string;
      periodValue?: string;
    },
  ) {
    if (!where) return true;
    if (where.id && rule.id !== where.id) return false;
    if (where.sellerUserId && rule.sellerUserId !== where.sellerUserId) {
      return false;
    }
    if (where.periodType && rule.periodType !== where.periodType) return false;
    if (where.periodValue && rule.periodValue !== where.periodValue) {
      return false;
    }
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
      commissionRule: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          ruleCounter++;
          const rule = {
            id: `commission-rule-${ruleCounter}`,
            ...data,
            createdAt: new Date(`2026-06-01T00:00:0${ruleCounter}.000Z`),
            updatedAt: new Date(`2026-06-01T00:00:0${ruleCounter}.000Z`),
          };
          rules.push(rule);
          return { ...rule };
        },
        findMany: async ({
          where,
        }: {
          where?: {
            sellerUserId?: string;
            periodType?: string;
            periodValue?: string;
          };
        }) => rules.filter((rule) => matches(rule, where)).map((r) => ({ ...r })),
        findFirst: async ({
          where,
        }: {
          where?: {
            sellerUserId?: string;
            periodType?: string;
            periodValue?: string;
          };
        }) => {
          const found = rules.find((rule) => matches(rule, where));
          return found ? { ...found } : null;
        },
        findUnique: async ({ where }: { where: { id: string } }) => {
          const found = rules.find((rule) => rule.id === where.id);
          return found ? { ...found } : null;
        },
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const found = rules.find((rule) => rule.id === where.id);
          if (!found) throw new Error("Rule not found in stub");
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
    rules.length = 0;
    ruleCounter = 0;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("rejects rule creation as comercial with 403", async () => {
    const token = await loginAs(app, UserRole.comercial);

    await request(app.getHttpServer())
      .post("/commissions/rules")
      .set(authHeader(token))
      .send({
        sellerUserId: sellerId,
        periodType: "mensual",
        periodValue: "2026-06",
        percent: 5,
      })
      .expect(403);
  });

  it("creates a rule as administrador with 201", async () => {
    const token = await loginAs(app, UserRole.administrador);

    const response = await request(app.getHttpServer())
      .post("/commissions/rules")
      .set(authHeader(token))
      .send({
        sellerUserId: sellerId,
        periodType: "mensual",
        periodValue: "2026-06",
        percent: 5,
      })
      .expect(201);

    expect(response.body.sellerUserId).toBe(sellerId);
    expect(response.body.periodType).toBe("mensual");
    expect(response.body.periodValue).toBe("2026-06");
    expect(Number(response.body.percent)).toBe(5);
  });

  it("creates a rule as director_comercial with 201", async () => {
    const token = await loginAs(app, UserRole.director_comercial);

    await request(app.getHttpServer())
      .post("/commissions/rules")
      .set(authHeader(token))
      .send({
        sellerUserId: otherSellerId,
        periodType: "trimestral",
        periodValue: "2026-Q2",
        percent: 7.5,
      })
      .expect(201);
  });

  it("rejects duplicate rules for the same seller and period with 409", async () => {
    const token = await loginAs(app, UserRole.administrador);

    await request(app.getHttpServer())
      .post("/commissions/rules")
      .set(authHeader(token))
      .send({
        sellerUserId: sellerId,
        periodType: "mensual",
        periodValue: "2026-06",
        percent: 5,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/commissions/rules")
      .set(authHeader(token))
      .send({
        sellerUserId: sellerId,
        periodType: "mensual",
        periodValue: "2026-06",
        percent: 6,
      })
      .expect(409);
  });

  it("rejects a rule for a user who is not an eligible seller with 400", async () => {
    const token = await loginAs(app, UserRole.administrador);

    await request(app.getHttpServer())
      .post("/commissions/rules")
      .set(authHeader(token))
      .send({
        sellerUserId: nonSellerId,
        periodType: "mensual",
        periodValue: "2026-06",
        percent: 5,
      })
      .expect(400);
  });

  it("lists rules as admin but forbids comercial readers", async () => {
    const adminToken = await loginAs(app, UserRole.administrador);
    const sellerToken = await loginAs(app, UserRole.comercial);

    await request(app.getHttpServer())
      .post("/commissions/rules")
      .set(authHeader(adminToken))
      .send({
        sellerUserId: sellerId,
        periodType: "anual",
        periodValue: "2026",
        percent: 4,
      })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`/commissions/rules?sellerUserId=${sellerId}`)
      .set(authHeader(adminToken))
      .expect(200);

    expect(list.body).toHaveLength(1);
    expect(Number(list.body[0].percent)).toBe(4);

    await request(app.getHttpServer())
      .get("/commissions/rules")
      .set(authHeader(sellerToken))
      .expect(403);
  });

  it("finds a stored rule with a lowercase periodValue filter", async () => {
    const token = await loginAs(app, UserRole.administrador);

    await request(app.getHttpServer())
      .post("/commissions/rules")
      .set(authHeader(token))
      .send({
        sellerUserId: sellerId,
        periodType: "trimestral",
        periodValue: "2026-Q2",
        percent: 7.5,
      })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(
        `/commissions/rules?sellerUserId=${sellerId}&periodType=trimestral&periodValue=2026-q2`,
      )
      .set(authHeader(token))
      .expect(200);

    expect(list.body).toHaveLength(1);
    expect(list.body[0].periodValue).toBe("2026-Q2");
  });

  it("rejects invalid period filters with 400 instead of an empty list", async () => {
    const token = await loginAs(app, UserRole.administrador);

    await request(app.getHttpServer())
      .get("/commissions/rules?periodType=mensual&periodValue=not-a-period")
      .set(authHeader(token))
      .expect(400);

    await request(app.getHttpServer())
      .get("/commissions/rules?periodType=semanal")
      .set(authHeader(token))
      .expect(400);

    await request(app.getHttpServer())
      .get("/commissions/rules?periodValue=2026-06")
      .set(authHeader(token))
      .expect(400);
  });

  it("resolves 0% for a seller without a rule for the period", async () => {
    const token = await loginAs(app, UserRole.administrador);

    const response = await request(app.getHttpServer())
      .get(
        `/commissions/rules/effective?sellerUserId=${sellerId}&periodType=mensual&periodValue=2026-06`,
      )
      .set(authHeader(token))
      .expect(200);

    expect(response.body.sellerUserId).toBe(sellerId);
    expect(response.body.periodType).toBe("mensual");
    expect(response.body.periodValue).toBe("2026-06");
    expect(Number(response.body.percent)).toBe(0);
  });

  it("resolves the rule percent for a seller with a rule for the period", async () => {
    const token = await loginAs(app, UserRole.administrador);

    await request(app.getHttpServer())
      .post("/commissions/rules")
      .set(authHeader(token))
      .send({
        sellerUserId: sellerId,
        periodType: "mensual",
        periodValue: "2026-06",
        percent: 5,
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(
        `/commissions/rules/effective?sellerUserId=${sellerId}&periodType=mensual&periodValue=2026-06`,
      )
      .set(authHeader(token))
      .expect(200);

    expect(Number(response.body.percent)).toBe(5);
  });

  it("updates a rule percent as admin but forbids comercial writers", async () => {
    const adminToken = await loginAs(app, UserRole.administrador);
    const sellerToken = await loginAs(app, UserRole.comercial);

    const created = await request(app.getHttpServer())
      .post("/commissions/rules")
      .set(authHeader(adminToken))
      .send({
        sellerUserId: sellerId,
        periodType: "mensual",
        periodValue: "2026-06",
        percent: 5,
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/commissions/rules/${created.body.id}`)
      .set(authHeader(sellerToken))
      .send({ percent: 9 })
      .expect(403);

    const updated = await request(app.getHttpServer())
      .patch(`/commissions/rules/${created.body.id}`)
      .set(authHeader(adminToken))
      .send({ percent: 6.25 })
      .expect(200);

    expect(Number(updated.body.percent)).toBe(6.25);
  });

  it("returns 404 when updating an unknown rule", async () => {
    const token = await loginAs(app, UserRole.administrador);

    await request(app.getHttpServer())
      .patch("/commissions/rules/rule-that-does-not-exist")
      .set(authHeader(token))
      .send({ percent: 6 })
      .expect(404);
  });
});

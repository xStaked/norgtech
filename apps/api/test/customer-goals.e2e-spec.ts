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

describe("CustomerGoals", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  const passwordHash =
    "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";
  const goals: Array<Record<string, unknown>> = [];
  const orders: Array<Record<string, unknown>> = [];
  const customerId = "customer-1";
  let goalCounter = 0;

  beforeAll(async () => {
    const user = {
      findUnique: async ({
        where,
      }: {
        where: { email?: string; id?: string };
      }) => {
        if (where.email === "admin@norgtech.local") {
          return {
            id: "admin-user-id",
            name: "Admin",
            email: "admin@norgtech.local",
            passwordHash,
            role: UserRole.administrador,
            active: true,
          };
        }
        return null;
      },
    };

    const customer = {
      findUnique: async ({ where: { id } }: { where: { id: string } }) => {
        if (id === customerId) {
          return {
            id: customerId,
            displayName: "Agro Norte",
            createdBy: "admin-user-id",
            updatedBy: "admin-user-id",
          };
        }
        return null;
      },
    };

    const prismaStub = {
      user,
      customer,
      customerGoal: {
        create: async ({
          data,
        }: {
          data: Record<string, unknown>;
        }) => {
          goalCounter++;
          const goal = {
            id: `goal-${goals.length + 1}`,
            ...data,
            createdAt: new Date(`2026-04-29T00:00:0${goalCounter}.000Z`),
            updatedAt: new Date(`2026-04-29T00:00:0${goalCounter}.000Z`),
          };
          goals.push(goal);
          return goal;
        },
        findMany: async ({
          where,
          orderBy,
        }: {
          where?: { customerId?: string };
          orderBy?: Record<string, string>;
        }) => {
          let result = goals.filter(
            (g) => !where?.customerId || g.customerId === where.customerId,
          );
          if (orderBy?.periodValue === "desc") {
            result = result.sort(
              (a, b) =>
                String(b.periodValue).localeCompare(String(a.periodValue)),
            );
          }
          return result.map((g) => ({ ...g }));
        },
        findUnique: async ({
          where: { id },
        }: {
          where: { id: string };
        }) => {
          const found = goals.find((g) => g.id === id);
          return found ? { ...found } : null;
        },
        findFirst: async ({
          where,
          orderBy,
        }: {
          where?: {
            customerId?: string;
            periodType?: string;
            periodValue?: string;
          };
          orderBy?: Record<string, string> | Array<Record<string, string>>;
        }) => {
          let result = goals.filter((g) => {
            if (where?.customerId && g.customerId !== where.customerId)
              return false;
            if (where?.periodType && g.periodType !== where.periodType)
              return false;
            if (where?.periodValue && g.periodValue !== where.periodValue)
              return false;
            return true;
          });
          const order = Array.isArray(orderBy) ? orderBy[0] : orderBy;
          if (order?.createdAt === "desc") {
            result = result.sort(
              (a, b) =>
                new Date(String(b.createdAt)).getTime() -
                new Date(String(a.createdAt)).getTime(),
            );
          }
          return result.length > 0 ? { ...result[0] } : null;
        },
        update: async ({
          where: { id },
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const idx = goals.findIndex((g) => g.id === id);
          if (idx === -1) return null;
          goals[idx] = { ...goals[idx], ...data, updatedAt: new Date() };
          return { ...goals[idx] };
        },
        delete: async ({ where: { id } }: { where: { id: string } }) => {
          const idx = goals.findIndex((g) => g.id === id);
          if (idx === -1) return null;
          const removed = goals.splice(idx, 1)[0];
          return { ...removed };
        },
      },
      order: {
        findMany: async ({
          where,
        }: {
          where?: {
            customerId?: string;
            status?: { in?: string[] };
            createdAt?: { gte?: Date; lte?: Date };
          };
        }) => {
          return orders
            .filter((o) => {
              if (where?.customerId && o.customerId !== where.customerId)
                return false;
              if (
                where?.status?.in &&
                !where.status.in.includes(String(o.status))
              )
                return false;
              if (
                where?.createdAt?.gte &&
                new Date(String(o.createdAt)) < where.createdAt.gte
              )
                return false;
              if (
                where?.createdAt?.lte &&
                new Date(String(o.createdAt)) > where.createdAt.lte
              )
                return false;
              return true;
            })
            .map((o) => ({ ...o }));
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

  it("creates a goal for a customer", async () => {
    const response = await request(globalThis.__APP__)
      .post(`/customers/${customerId}/goals`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        periodType: "anual",
        periodValue: "2025",
        targetAmount: 120000000,
        notes: "Meta anual 2025",
      })
      .expect(201);

    expect(response.body.periodType).toBe("anual");
    expect(response.body.periodValue).toBe("2025");
    expect(Number(response.body.targetAmount)).toBe(120000000);
    expect(response.body.notes).toBe("Meta anual 2025");
    expect(response.body.customerId).toBe(customerId);
  });

  it("lists goals for a customer ordered by periodValue desc", async () => {
    await request(globalThis.__APP__)
      .post(`/customers/${customerId}/goals`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        periodType: "mensual",
        periodValue: "2025-03",
        targetAmount: 10000000,
      })
      .expect(201);

    const response = await request(globalThis.__APP__)
      .get(`/customers/${customerId}/goals`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThanOrEqual(2);
    expect(response.body[0].periodValue).toBe("2025-03");
  });

  it("updates a goal", async () => {
    const createResponse = await request(globalThis.__APP__)
      .post(`/customers/${customerId}/goals`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        periodType: "trimestral",
        periodValue: "2025-Q1",
        targetAmount: 30000000,
      })
      .expect(201);

    const goalId = createResponse.body.id;

    const updateResponse = await request(globalThis.__APP__)
      .patch(`/customers/${customerId}/goals/${goalId}`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        targetAmount: 35000000,
        notes: "Ajuste de meta",
      })
      .expect(200);

    expect(Number(updateResponse.body.targetAmount)).toBe(35000000);
    expect(updateResponse.body.notes).toBe("Ajuste de meta");
  });

  it("deletes a goal", async () => {
    const createResponse = await request(globalThis.__APP__)
      .post(`/customers/${customerId}/goals`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        periodType: "mensual",
        periodValue: "2025-01",
        targetAmount: 5000000,
      })
      .expect(201);

    const goalId = createResponse.body.id;

    await request(globalThis.__APP__)
      .delete(`/customers/${customerId}/goals/${goalId}`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    const listResponse = await request(globalThis.__APP__)
      .get(`/customers/${customerId}/goals`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    const ids = listResponse.body.map((g: { id: string }) => g.id);
    expect(ids).not.toContain(goalId);
  });

  it("returns progress with sales data", async () => {
    orders.push(
      {
        id: "order-1",
        customerId,
        status: "facturado",
        total: 40000000,
        createdAt: new Date("2025-02-15T00:00:00.000Z"),
      },
      {
        id: "order-2",
        customerId,
        status: "entregado",
        total: 45000000,
        createdAt: new Date("2025-05-10T00:00:00.000Z"),
      },
      {
        id: "order-3",
        customerId,
        status: "recibido",
        total: 10000000,
        createdAt: new Date("2025-03-01T00:00:00.000Z"),
      },
    );

    const response = await request(globalThis.__APP__)
      .get(`/customers/${customerId}/goal-progress`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .query({ periodType: "anual", periodValue: "2025" })
      .expect(200);

    expect(response.body.customerId).toBe(customerId);
    expect(response.body.periodType).toBe("anual");
    expect(response.body.periodValue).toBe("2025");
    expect(response.body.targetAmount).toBe(120000000);
    expect(response.body.soldAmount).toBe(85000000);
    expect(response.body.percentage).toBe(70.83);
    expect(response.body.remainingAmount).toBe(35000000);
    expect(response.body.ordersCount).toBe(2);
  });

  it("returns progress for the most recent goal when no query params", async () => {
    await request(globalThis.__APP__)
      .post(`/customers/${customerId}/goals`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        periodType: "mensual",
        periodValue: "2025-06",
        targetAmount: 20000000,
      })
      .expect(201);

    const response = await request(globalThis.__APP__)
      .get(`/customers/${customerId}/goal-progress`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    expect(response.body.customerId).toBe(customerId);
    expect(response.body.periodType).toBe("mensual");
    expect(response.body.periodValue).toBe("2025-06");
  });

  it("rejects invalid periodType", async () => {
    await request(globalThis.__APP__)
      .post(`/customers/${customerId}/goals`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        periodType: "semanal",
        periodValue: "2025-W1",
        targetAmount: 1000000,
      })
      .expect(400);
  });

  it("returns 404 when customer does not exist", async () => {
    await request(globalThis.__APP__)
      .post(`/customers/nonexistent/goals`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        periodType: "anual",
        periodValue: "2025",
        targetAmount: 1000000,
      })
      .expect(404);
  });

  it("returns 404 when goal does not belong to customer on update", async () => {
    const createResponse = await request(globalThis.__APP__)
      .post(`/customers/${customerId}/goals`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        periodType: "mensual",
        periodValue: "2025-04",
        targetAmount: 1000000,
      })
      .expect(201);

    const goalId = createResponse.body.id;

    await request(globalThis.__APP__)
      .patch(`/customers/other-customer/goals/${goalId}`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ targetAmount: 2000000 })
      .expect(404);
  });

  it("returns 404 when goal does not belong to customer on delete", async () => {
    const createResponse = await request(globalThis.__APP__)
      .post(`/customers/${customerId}/goals`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        periodType: "mensual",
        periodValue: "2025-05",
        targetAmount: 1000000,
      })
      .expect(201);

    const goalId = createResponse.body.id;

    await request(globalThis.__APP__)
      .delete(`/customers/other-customer/goals/${goalId}`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(404);
  });

  it("returns 404 when no goal exists for period", async () => {
    await request(globalThis.__APP__)
      .get(`/customers/${customerId}/goal-progress`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .query({ periodType: "anual", periodValue: "2099" })
      .expect(404);
  });
});

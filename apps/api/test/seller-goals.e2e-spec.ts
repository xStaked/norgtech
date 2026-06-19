import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { OrderStatus, UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

declare global {
  // eslint-disable-next-line no-var
  var __APP__: ReturnType<INestApplication["getHttpServer"]> | undefined;
  // eslint-disable-next-line no-var
  var __ADMIN_TOKEN__: string | undefined;
}

describe("SellerGoals", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  const passwordHash =
    "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";
  const goals: Array<Record<string, unknown>> = [];
  let goalCounter = 0;

  const users = [
    {
      id: "admin-user-id",
      name: "Admin",
      email: "admin@norgtech.local",
      passwordHash,
      role: UserRole.administrador,
      active: true,
    },
    {
      id: "seller-user-id",
      name: "Seller",
      email: "seller@norgtech.local",
      passwordHash,
      role: UserRole.comercial,
      active: true,
    },
    {
      id: "other-seller-id",
      name: "Other Seller",
      email: "other-seller@norgtech.local",
      passwordHash,
      role: UserRole.comercial,
      active: true,
    },
    {
      id: "billing-user-id",
      name: "Billing",
      email: "billing@norgtech.local",
      passwordHash,
      role: UserRole.facturacion,
      active: true,
    },
  ];

  const customers = [
    {
      id: "assigned-customer-id",
      displayName: "Agro Norte",
      assignedToUserId: "seller-user-id",
    },
    {
      id: "other-customer-id",
      displayName: "Agro Sur",
      assignedToUserId: "other-seller-id",
    },
  ];

  const orders = [
    {
      id: "order-1",
      customerId: "assigned-customer-id",
      customer: customers[0],
      status: OrderStatus.facturado,
      total: 70000000,
      companyId: "company-1",
      orderDate: new Date("2026-06-05T12:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: "order-2",
      customerId: "assigned-customer-id",
      customer: customers[0],
      status: OrderStatus.entregado,
      total: 50000000,
      companyId: "company-1",
      orderDate: new Date("2026-06-20T12:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: "order-different-seller",
      customerId: "other-customer-id",
      customer: customers[1],
      status: OrderStatus.facturado,
      total: 90000000,
      companyId: "company-1",
      orderDate: new Date("2026-06-12T12:00:00.000Z"),
      createdAt: new Date("2026-06-12T12:00:00.000Z"),
    },
    {
      id: "order-draft-status",
      customerId: "assigned-customer-id",
      customer: customers[0],
      status: OrderStatus.recibido,
      total: 30000000,
      companyId: "company-1",
      orderDate: new Date("2026-06-15T12:00:00.000Z"),
      createdAt: new Date("2026-06-15T12:00:00.000Z"),
    },
    {
      id: "order-outside-period",
      customerId: "assigned-customer-id",
      customer: customers[0],
      status: OrderStatus.facturado,
      total: 20000000,
      companyId: "company-1",
      orderDate: new Date("2026-07-01T00:00:00.000Z"),
      createdAt: new Date("2026-06-15T12:00:00.000Z"),
    },
    {
      id: "order-other-company",
      customerId: "assigned-customer-id",
      customer: customers[0],
      status: OrderStatus.facturado,
      total: 40000000,
      companyId: "company-2",
      orderDate: new Date("2026-06-18T12:00:00.000Z"),
      createdAt: new Date("2026-06-18T12:00:00.000Z"),
    },
  ];

  beforeAll(async () => {
    const prismaStub = {
      user: {
        findUnique: async ({
          where,
        }: {
          where: { email?: string; id?: string };
        }) => {
          const found = users.find(
            (user) =>
              (where.email && user.email === where.email) ||
              (where.id && user.id === where.id),
          );
          return found ? { ...found } : null;
        },
      },
      sellerGoal: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          goalCounter++;
          const goal = {
            id: `seller-goal-${goalCounter}`,
            ...data,
            createdAt: new Date(`2026-06-01T00:00:0${goalCounter}.000Z`),
            updatedAt: new Date(`2026-06-01T00:00:0${goalCounter}.000Z`),
          };
          goals.push(goal);
          return { ...goal };
        },
        findFirst: async ({
          where,
          orderBy,
        }: {
          where?: {
            userId?: string;
            periodType?: string;
            periodValue?: string;
          };
          orderBy?: Record<string, string>;
        }) => {
          let result = goals.filter((goal) => {
            if (where?.userId && goal.userId !== where.userId) return false;
            if (where?.periodType && goal.periodType !== where.periodType) {
              return false;
            }
            if (where?.periodValue && goal.periodValue !== where.periodValue) {
              return false;
            }
            return true;
          });
          if (orderBy?.createdAt === "desc") {
            result = result.sort(
              (a, b) =>
                new Date(String(b.createdAt)).getTime() -
                new Date(String(a.createdAt)).getTime(),
            );
          }
          return result.length > 0 ? { ...result[0] } : null;
        },
        findMany: async ({
          where,
          include,
        }: {
          where?: {
            userId?: string;
            periodType?: string;
            periodValue?: string;
          };
          include?: { user?: unknown };
        }) => {
          return goals
            .filter((goal) => {
              if (where?.userId && goal.userId !== where.userId) return false;
              if (where?.periodType && goal.periodType !== where.periodType) {
                return false;
              }
              if (where?.periodValue && goal.periodValue !== where.periodValue) {
                return false;
              }
              return true;
            })
            .map((goal) => {
              const foundUser = users.find((user) => user.id === goal.userId);
              return {
                ...goal,
                ...(include?.user && foundUser
                  ? {
                      user: {
                        id: foundUser.id,
                        name: foundUser.name,
                        active: foundUser.active,
                        role: foundUser.role,
                      },
                    }
                  : {}),
              };
            });
        },
      },
      order: {
        findMany: async ({
          where,
        }: {
          where?: {
            customer?: { assignedToUserId?: string };
            status?: { in?: string[] };
            orderDate?: { gte?: Date; lte?: Date };
            companyId?: string;
          };
        }) => {
          return orders
            .filter((order) => {
              if (
                where?.customer?.assignedToUserId &&
                order.customer.assignedToUserId !==
                  where.customer.assignedToUserId
              ) {
                return false;
              }
              if (
                where?.status?.in &&
                !where.status.in.includes(order.status)
              ) {
                return false;
              }
              if (
                where?.orderDate?.gte &&
                order.orderDate < where.orderDate.gte
              ) {
                return false;
              }
              if (
                where?.orderDate?.lte &&
                order.orderDate > where.orderDate.lte
              ) {
                return false;
              }
              if (where?.companyId && order.companyId !== where.companyId) {
                return false;
              }
              return true;
            })
            .map((order) => ({ ...order }));
        },
      },
      customer: {
        findMany: async ({
          where,
        }: {
          where?: { assignedToUserId?: string; id?: { in?: string[] } };
        }) => {
          return customers
            .filter((customer) => {
              if (
                where?.assignedToUserId &&
                customer.assignedToUserId !== where.assignedToUserId
              ) {
                return false;
              }
              if (where?.id?.in && !where.id.in.includes(customer.id)) {
                return false;
              }
              return true;
            })
            .map((customer) => ({ ...customer }));
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

  beforeEach(() => {
    goals.length = 0;
    goalCounter = 0;
  });

  afterAll(async () => {
    globalThis.__ADMIN_TOKEN__ = undefined;
    globalThis.__APP__ = undefined;
    if (app) {
      await app.close();
    }
  });

  it("creates a monthly goal for an eligible seller", async () => {
    const response = await request(globalThis.__APP__)
      .post("/users/seller-user-id/seller-goals")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        periodType: "mensual",
        periodValue: "2026-06",
        targetAmount: 300000000,
        notes: "Meta junio",
      })
      .expect(201);

    expect(response.body.userId).toBe("seller-user-id");
    expect(response.body.periodType).toBe("mensual");
    expect(response.body.periodValue).toBe("2026-06");
    expect(Number(response.body.targetAmount)).toBe(300000000);
  });

  it("rejects duplicate goals for the same seller and period", async () => {
    await request(globalThis.__APP__)
      .post("/users/seller-user-id/seller-goals")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        periodType: "mensual",
        periodValue: "2026-07",
        targetAmount: 200000000,
      })
      .expect(201);

    await request(globalThis.__APP__)
      .post("/users/seller-user-id/seller-goals")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        periodType: "mensual",
        periodValue: "2026-07",
        targetAmount: 250000000,
      })
      .expect(409);
  });

  it("calculates progress from orders for customers assigned to the seller", async () => {
    await request(globalThis.__APP__)
      .post("/users/seller-user-id/seller-goals")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        periodType: "mensual",
        periodValue: "2026-06",
        targetAmount: 300000000,
      })
      .expect(201);

    const response = await request(globalThis.__APP__)
      .get(
        "/users/seller-user-id/seller-goals/progress?periodType=mensual&periodValue=2026-06&companyId=company-1",
      )
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    expect(response.body.sellerName).toBe("Seller");
    expect(response.body.companyId).toBe("company-1");
    expect(response.body.soldAmount).toBe(120000000);
    expect(response.body.ordersCount).toBe(2);
    expect(response.body.customersCount).toBe(1);
    expect(response.body.percentage).toBe(40);
  });

  it("returns seller goals dashboard totals and items for the selected period", async () => {
    await request(globalThis.__APP__)
      .post("/users/seller-user-id/seller-goals")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        periodType: "mensual",
        periodValue: "2026-06",
        targetAmount: 300000000,
      })
      .expect(201);

    await request(globalThis.__APP__)
      .post("/users/other-seller-id/seller-goals")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        periodType: "mensual",
        periodValue: "2026-06",
        targetAmount: 200000000,
      })
      .expect(201);

    const response = await request(globalThis.__APP__)
      .get("/dashboard/seller-goals?periodType=mensual&periodValue=2026-06")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    expect(response.body.periodType).toBe("mensual");
    expect(response.body.periodValue).toBe("2026-06");
    expect(response.body.companyId).toBeNull();
    expect(response.body.totals).toEqual({
      targetAmount: 500000000,
      soldAmount: 250000000,
      percentage: 50,
      remainingAmount: 250000000,
      sellers: 2,
    });
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items[0]).toEqual(
      expect.objectContaining({
        userId: "seller-user-id",
        sellerName: "Seller",
        targetAmount: 300000000,
        soldAmount: 160000000,
        percentage: 53.33,
        remainingAmount: 140000000,
        ordersCount: 3,
        customersCount: 1,
      }),
    );
    expect(response.body.items[1]).toEqual(
      expect.objectContaining({
        userId: "other-seller-id",
        sellerName: "Other Seller",
        targetAmount: 200000000,
        soldAmount: 90000000,
        percentage: 45,
        remainingAmount: 110000000,
        ordersCount: 1,
        customersCount: 1,
      }),
    );
  });
});

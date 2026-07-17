import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { OrderStatus, UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { refreshTokenStub } from "./helpers/login-as";

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
  let orderFindManyCalls = 0;

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
    {
      id: "inactive-seller-id",
      name: "Inactive Seller",
      email: "inactive-seller@norgtech.local",
      passwordHash,
      role: UserRole.comercial,
      active: false,
    },
  ];

  const customers: Array<{
    id: string;
    displayName: string;
    assignedToUserId: string | null;
  }> = [
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
    {
      id: "billing-customer-id",
      displayName: "Agro Billing",
      assignedToUserId: "billing-user-id",
    },
    {
      id: "inactive-customer-id",
      displayName: "Agro Inactive",
      assignedToUserId: "inactive-seller-id",
    },
    // GOAL-02: cliente sin vendedor asignado. Sus pedidos antes no contaban
    // para nadie; ahora deben atribuirse por order.sellerUserId.
    {
      id: "unassigned-customer-id",
      displayName: "Agro Sin Vendedor",
      assignedToUserId: null,
    },
  ];

  const orders = [
    {
      id: "order-1",
      sellerUserId: "seller-user-id",
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
      sellerUserId: "seller-user-id",
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
      sellerUserId: "other-seller-id",
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
      sellerUserId: "seller-user-id",
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
      sellerUserId: "seller-user-id",
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
      sellerUserId: "seller-user-id",
      customerId: "assigned-customer-id",
      customer: customers[0],
      status: OrderStatus.facturado,
      total: 40000000,
      companyId: "company-2",
      orderDate: new Date("2026-06-18T12:00:00.000Z"),
      createdAt: new Date("2026-06-18T12:00:00.000Z"),
    },
    {
      id: "order-billing-user",
      sellerUserId: "billing-user-id",
      customerId: "billing-customer-id",
      customer: customers[2],
      status: OrderStatus.facturado,
      total: 60000000,
      companyId: "company-1",
      orderDate: new Date("2026-06-11T12:00:00.000Z"),
      createdAt: new Date("2026-06-11T12:00:00.000Z"),
    },
    {
      id: "order-inactive-seller",
      sellerUserId: "inactive-seller-id",
      customerId: "inactive-customer-id",
      customer: customers[3],
      status: OrderStatus.facturado,
      total: 80000000,
      companyId: "company-1",
      orderDate: new Date("2026-06-13T12:00:00.000Z"),
      createdAt: new Date("2026-06-13T12:00:00.000Z"),
    },
    // GOAL-02, periodo 2026-05 (aislado de los asserts de junio):
    // cliente SIN vendedor asignado -> antes no contaba para nadie.
    {
      id: "order-unassigned-customer",
      sellerUserId: "seller-user-id",
      customerId: "unassigned-customer-id",
      customer: customers[4],
      status: OrderStatus.facturado,
      total: 25000000,
      companyId: "company-1",
      orderDate: new Date("2026-05-10T12:00:00.000Z"),
      createdAt: new Date("2026-05-10T12:00:00.000Z"),
    },
    // GOAL-02: cliente asignado a other-seller-id pero vendido por
    // seller-user-id -> debe contar para el vendedor real, no para el asignado.
    {
      id: "order-seller-overrides-assignment",
      sellerUserId: "seller-user-id",
      customerId: "other-customer-id",
      customer: customers[1],
      status: OrderStatus.facturado,
      total: 15000000,
      companyId: "company-1",
      orderDate: new Date("2026-05-12T12:00:00.000Z"),
      createdAt: new Date("2026-05-12T12:00:00.000Z"),
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
      refreshToken: refreshTokenStub(),
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
            user?: {
              active?: boolean;
              role?: { in?: UserRole[] };
            };
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
              if (where?.user) {
                const foundUser = users.find((user) => user.id === goal.userId);
                if (!foundUser) return false;
                if (
                  where.user.active !== undefined &&
                  foundUser.active !== where.user.active
                ) {
                  return false;
                }
                if (
                  where.user.role?.in &&
                  !where.user.role.in.includes(foundUser.role)
                ) {
                  return false;
                }
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
            sellerUserId?: string | { in?: string[] };
            status?: { in?: string[] };
            orderDate?: { gte?: Date; lte?: Date };
            companyId?: string;
          };
        }) => {
          orderFindManyCalls++;
          // Un filtro que este stub no entienda sería IGNORADO en silencio y
          // devolvería todos los pedidos, haciendo pasar los tests por la
          // razón equivocada. Mejor fallar ruidosamente.
          const KNOWN_WHERE_KEYS = [
            "sellerUserId",
            "status",
            "orderDate",
            "companyId",
          ];
          for (const key of Object.keys(where ?? {})) {
            if (!KNOWN_WHERE_KEYS.includes(key)) {
              throw new Error(
                `order.findMany stub: filtro no soportado "${key}". Enséñale el filtro al stub antes de usarlo.`,
              );
            }
          }
          return orders
            .filter((order) => {
              // GOAL-02: atribución por el vendedor real del pedido.
              const sellerUserId = where?.sellerUserId;
              if (sellerUserId) {
                if (
                  typeof sellerUserId === "string" &&
                  order.sellerUserId !== sellerUserId
                ) {
                  return false;
                }
                if (
                  typeof sellerUserId !== "string" &&
                  sellerUserId.in &&
                  !sellerUserId.in.includes(order.sellerUserId)
                ) {
                  return false;
                }
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
    orderFindManyCalls = 0;
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

  // Mismo escenario y mismas cifras que antes, pero la atribución ahora se
  // deriva de order.sellerUserId (GOAL-02), no de customer.assignedToUserId.
  it("calculates progress from orders attributed to the seller", async () => {
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

  // GOAL-02: la atribución se hace por order.sellerUserId, no por
  // customer.assignedToUserId. Antes, un pedido de un cliente sin vendedor
  // asignado no contaba para NADIE ("Sin vendedor").
  it("counts an order whose customer has no assigned seller toward the order's sellerUserId goal", async () => {
    await request(globalThis.__APP__)
      .post("/users/seller-user-id/seller-goals")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        periodType: "mensual",
        periodValue: "2026-05",
        targetAmount: 100000000,
      })
      .expect(201);

    const response = await request(globalThis.__APP__)
      .get(
        "/users/seller-user-id/seller-goals/progress?periodType=mensual&periodValue=2026-05&companyId=company-1",
      )
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    // 25.000.000 (cliente sin asignar) + 15.000.000 (cliente asignado a otro)
    expect(response.body.soldAmount).toBe(40000000);
    expect(response.body.ordersCount).toBe(2);
    expect(response.body.customersCount).toBe(2);
    expect(response.body.percentage).toBe(40);
    expect(response.body.remainingAmount).toBe(60000000);
  });

  // GOAL-02: el vendedor del pedido gana sobre el vendedor asignado al cliente.
  it("attributes an order to its sellerUserId and not to the customer's assigned seller", async () => {
    await request(globalThis.__APP__)
      .post("/users/seller-user-id/seller-goals")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        periodType: "mensual",
        periodValue: "2026-05",
        targetAmount: 100000000,
      })
      .expect(201);

    await request(globalThis.__APP__)
      .post("/users/other-seller-id/seller-goals")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        periodType: "mensual",
        periodValue: "2026-05",
        targetAmount: 100000000,
      })
      .expect(201);

    const response = await request(globalThis.__APP__)
      .get("/dashboard/seller-goals?periodType=mensual&periodValue=2026-05")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    const items: Array<{
      userId: string;
      soldAmount: number;
      ordersCount: number;
    }> = response.body.items;

    const seller = items.find((item) => item.userId === "seller-user-id");
    const other = items.find((item) => item.userId === "other-seller-id");

    // order-seller-overrides-assignment: cliente de other-seller-id, vendido
    // por seller-user-id. Cuenta para el vendedor real...
    expect(seller).toEqual(
      expect.objectContaining({ soldAmount: 40000000, ordersCount: 2 }),
    );
    // ...y NO para el vendedor asignado al cliente.
    expect(other).toEqual(
      expect.objectContaining({ soldAmount: 0, ordersCount: 0 }),
    );
  });

  // Igual que antes (mismas cifras), con la atribución por order.sellerUserId.
  it("returns seller goals dashboard totals and items attributed by sellerUserId for the selected period", async () => {
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

    goals.push(
      {
        id: "billing-goal",
        userId: "billing-user-id",
        periodType: "mensual",
        periodValue: "2026-06",
        targetAmount: 100000000,
        notes: null,
        createdBy: "admin-user-id",
        updatedBy: "admin-user-id",
        createdAt: new Date("2026-06-01T00:00:03.000Z"),
        updatedAt: new Date("2026-06-01T00:00:03.000Z"),
      },
      {
        id: "inactive-goal",
        userId: "inactive-seller-id",
        periodType: "mensual",
        periodValue: "2026-06",
        targetAmount: 150000000,
        notes: null,
        createdBy: "admin-user-id",
        updatedBy: "admin-user-id",
        createdAt: new Date("2026-06-01T00:00:04.000Z"),
        updatedAt: new Date("2026-06-01T00:00:04.000Z"),
      },
    );
    orderFindManyCalls = 0;

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
    expect(orderFindManyCalls).toBe(1);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items.map((item: { userId: string }) => item.userId)).toEqual([
      "seller-user-id",
      "other-seller-id",
    ]);
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

  // GOAL-01 -------------------------------------------------------------
  // El panel filtra por periodo (correcto: es un panel POR periodo), pero ese
  // filtro era invisible: una meta anual/trimestral/de otro mes aparecía en la
  // lista del usuario y NO en el panel, sin decir por qué. El panel debe
  // declarar qué periodos existen para que "mi meta no está" se convierta en
  // "mi meta no está EN ESTE periodo".

  async function createGoal(
    userId: string,
    periodType: string,
    periodValue: string,
    targetAmount: number,
  ) {
    await request(globalThis.__APP__)
      .post(`/users/${userId}/seller-goals`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ periodType, periodValue, targetAmount })
      .expect(201);
  }

  it("exposes every period that has goals, so a goal outside the shown period is discoverable", async () => {
    await createGoal("seller-user-id", "mensual", "2026-06", 300000000);
    await createGoal("seller-user-id", "anual", "2026", 900000000);
    await createGoal("seller-user-id", "trimestral", "2026-Q2", 500000000);
    await createGoal("other-seller-id", "anual", "2026", 400000000);

    const response = await request(globalThis.__APP__)
      .get("/dashboard/seller-goals?periodType=mensual&periodValue=2026-06")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    // El panel sigue filtrando: solo la meta mensual de junio.
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].userId).toBe("seller-user-id");

    // ...pero ahora DICE qué otros periodos tienen metas.
    expect(response.body.availablePeriods).toEqual([
      { periodType: "anual", periodValue: "2026", goals: 2 },
      { periodType: "trimestral", periodValue: "2026-Q2", goals: 1 },
      { periodType: "mensual", periodValue: "2026-06", goals: 1 },
    ]);
  });

  it("omits from availablePeriods the goals of users the dashboard can never show", async () => {
    await createGoal("seller-user-id", "mensual", "2026-06", 300000000);
    goals.push(
      {
        id: "billing-anual-goal",
        userId: "billing-user-id",
        periodType: "anual",
        periodValue: "2026",
        targetAmount: 100000000,
        notes: null,
        createdBy: "admin-user-id",
        updatedBy: "admin-user-id",
        createdAt: new Date("2026-06-01T00:00:03.000Z"),
        updatedAt: new Date("2026-06-01T00:00:03.000Z"),
      },
      {
        id: "inactive-anual-goal",
        userId: "inactive-seller-id",
        periodType: "anual",
        periodValue: "2026",
        targetAmount: 150000000,
        notes: null,
        createdBy: "admin-user-id",
        updatedBy: "admin-user-id",
        createdAt: new Date("2026-06-01T00:00:04.000Z"),
        updatedAt: new Date("2026-06-01T00:00:04.000Z"),
      },
    );

    const response = await request(globalThis.__APP__)
      .get("/dashboard/seller-goals?periodType=mensual&periodValue=2026-06")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);

    // Un periodo que solo contiene metas de usuarios no elegibles saldría
    // vacío al seleccionarlo: ofrecerlo sería otra mentira por omisión.
    expect(response.body.availablePeriods).toEqual([
      { periodType: "mensual", periodValue: "2026-06", goals: 1 },
    ]);
  });

  it("marks the period as defaulted when the client did not choose one", async () => {
    await createGoal("seller-user-id", "mensual", "2026-06", 300000000);

    const defaulted = await request(globalThis.__APP__)
      .get("/dashboard/seller-goals")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);
    expect(defaulted.body.periodIsDefault).toBe(true);

    const explicit = await request(globalThis.__APP__)
      .get("/dashboard/seller-goals?periodType=mensual&periodValue=2026-06")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(200);
    expect(explicit.body.periodIsDefault).toBe(false);
  });

  // El mes por defecto se calculaba con el reloj del proceso. A las 21:00 de
  // Bogotá del 31 de julio ya es 1 de agosto en UTC: un servidor en UTC
  // mostraba agosto mientras el usuario colombiano seguía en julio, y sus
  // metas de julio "desaparecían" del panel esa noche.
  // OJO: este test solo DISCRIMINA si TZ del proceso != America/Bogota.
  describe("default period (GOAL-01, VIS-03)", () => {
    beforeEach(() => {
      jest.useFakeTimers({
        doNotFake: [
          "setTimeout",
          "clearTimeout",
          "setInterval",
          "clearInterval",
          "setImmediate",
          "clearImmediate",
          "nextTick",
          "queueMicrotask",
          "performance",
          "hrtime",
        ],
      });
      // 2026-08-01T02:00Z == 2026-07-31 21:00 en Bogotá.
      jest.setSystemTime(new Date("2026-08-01T02:00:00.000Z"));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("defaults to the current month in America/Bogota, not in the server's timezone", async () => {
      // El token global se emitió con el reloj real: bajo el reloj falso ya
      // estaría vencido. Se re-emite dentro del instante bajo prueba.
      const login = await request(globalThis.__APP__)
        .post("/auth/login")
        .send({ email: "admin@norgtech.local", password: "Admin123*" })
        .expect(200);

      const response = await request(globalThis.__APP__)
        .get("/dashboard/seller-goals")
        .set("Authorization", `Bearer ${login.body.accessToken}`)
        .expect(200);

      expect(response.body.periodType).toBe("mensual");
      expect(response.body.periodValue).toBe("2026-07");
    });
  });
});

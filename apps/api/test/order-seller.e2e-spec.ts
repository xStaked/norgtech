import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Prisma, UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  authHeader,
  loginAs,
  MOCK_PASSWORD_HASH,
  MOCK_USERS,
  refreshTokenStub,
} from "./helpers/login-as";

/**
 * GOAL-02: el pedido no guardaba su vendedor, asi que las metas lo atribuian
 * por `customer.assignedToUserId` y un cliente sin asignado producia
 * "Sin vendedor". Estas pruebas fijan la regla de precedencia de
 * `Order.sellerUserId` al crear y el endpoint que alimenta el selector.
 */
describe("Order seller attribution (GOAL-02)", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  const ADMIN = MOCK_USERS[UserRole.administrador];
  const ANA = MOCK_USERS[UserRole.comercial];
  const DIRECTOR = MOCK_USERS[UserRole.director_comercial];
  const LOGISTICA = MOCK_USERS[UserRole.logistica];

  /** Seller por rol pero inactivo: no debe ser elegible ni aparecer en la lista. */
  const INACTIVE_SELLER = {
    id: "00000000-0000-4000-8000-0000000000ff",
    name: "Comercial Inactivo",
    email: "comercial.inactivo@norgtech.local",
    passwordHash: MOCK_PASSWORD_HASH,
    role: UserRole.comercial,
    active: false,
  };

  const users = [...Object.values(MOCK_USERS), INACTIVE_SELLER];

  const createdOrders: Array<Record<string, any>> = [];

  const baseCustomer = {
    displayName: "Agro Norte",
    taxId: "900111222-1",
    address: "Calle 10 # 20-30",
    createdBy: ADMIN.id,
    updatedBy: ADMIN.id,
    creditLimit: null,
    paymentDays: 30,
    segment: { discountPercent: 0, minGoalAmount: 0 },
  };

  const customers: Record<string, Record<string, any>> = {
    // Cliente CON vendedor asignado
    "customer-assigned": {
      ...baseCustomer,
      id: "customer-assigned",
      assignedToUserId: ANA.id,
    },
    // Cliente SIN vendedor asignado: el caso que producia "Sin vendedor"
    "customer-unassigned": {
      ...baseCustomer,
      id: "customer-unassigned",
      assignedToUserId: null,
    },
  };

  const orderPayload = (customerId: string, extra: Record<string, unknown> = {}) => ({
    customerId,
    companyId: "company-1",
    // unitPrice es obligatorio en el DTO, pero para lineas de catalogo
    // priceLines() lo deriva de product.basePrice e ignora este valor.
    items: [{ productId: "product-1", quantity: 1, unitPrice: 50000 }],
    ...extra,
  });

  beforeAll(async () => {
    const user = {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.email) return users.find((u) => u.email === where.email) ?? null;
        return users.find((u) => u.id === where.id) ?? null;
      },
      findMany: async ({
        where,
        select,
        orderBy,
      }: {
        where?: { active?: boolean; role?: { in?: UserRole[] } };
        select?: Record<string, boolean>;
        orderBy?: { name?: "asc" | "desc" };
      } = {}) => {
        let rows = users.filter((u) => {
          if (where?.active !== undefined && u.active !== where.active) return false;
          if (where?.role?.in && !where.role.in.includes(u.role)) return false;
          return true;
        });
        if (orderBy?.name) {
          rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
        }
        if (!select) return rows;
        return rows.map((u) =>
          Object.fromEntries(
            Object.entries(select)
              .filter(([, on]) => on)
              .map(([key]) => [key, (u as unknown as Record<string, unknown>)[key]]),
          ),
        );
      },
    };

    const prismaStub: Record<string, any> = {
      user,
      refreshToken: refreshTokenStub(),
      customer: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          customers[id] ?? null,
      },
      company: {
        findUnique: async ({ where }: { where: { id?: string; prefix?: string } }) => {
          const company = { id: "company-1", name: "Norgtech SAS", prefix: "NT", isActive: true };
          if (where.id && where.id !== company.id) return null;
          return company;
        },
      },
      product: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          id === "product-1"
            ? {
                id: "product-1",
                name: "Fertilizante",
                sku: "FERT-001",
                unit: "kg",
                presentation: "Bulto 50kg",
                basePrice: new Prisma.Decimal(50000),
                active: true,
              }
            : null,
      },
      invoice: {
        aggregate: async () => ({ _sum: { totalAmount: 0 } }),
      },
      order: {
        create: async () => {
          throw new Error("order.create must run inside a transaction");
        },
        // PricingService.resolveSegmentDiscount consulta ventas YTD.
        aggregate: async () => ({ _sum: { total: 999_999_999 } }),
        findFirst: async () => null,
        findMany: async () => [],
        findUnique: async ({ where: { id }, include }: { where: { id: string }; include?: any }) => {
          const order = createdOrders.find((o) => o.id === id);
          if (!order) return null;
          const seller = users.find((u) => u.id === order.sellerUserId);
          return {
            ...order,
            seller: include?.seller
              ? seller
                ? { id: seller.id, name: seller.name }
                : null
              : undefined,
          };
        },
      },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          ...prismaStub,
          $queryRaw: async () => [],
          order: {
            ...prismaStub.order,
            findMany: async () => [],
            create: async ({ data, include }: { data: Record<string, any>; include?: any }) => {
              const order = {
                id: `order-${createdOrders.length + 1}`,
                status: "recibido",
                ...data,
                items: include?.items ? data.items.create : undefined,
                customer: include?.customer ? customers[data.customerId] : undefined,
                opportunity: null,
                sourceQuote: null,
                sourceConversation: null,
                createdAt: new Date("2026-07-16T00:00:00.000Z"),
                updatedAt: new Date("2026-07-16T00:00:00.000Z"),
              };
              createdOrders.push(order);
              return order;
            },
          },
          auditLog: { create: async ({ data }: { data: unknown }) => data },
        }),
    };

    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await moduleRef?.close();
  });

  describe("orders.create resolves sellerUserId", () => {
    it("(a) uses dto.sellerUserId when it is a valid seller, over the customer's assigned user", async () => {
      const token = await loginAs(app, UserRole.administrador);

      const res = await request(app.getHttpServer())
        .post("/orders")
        .set(authHeader(token))
        .send(orderPayload("customer-assigned", { sellerUserId: DIRECTOR.id }))
        .expect(201);

      // El cliente esta asignado a ANA; el dto debe ganar.
      expect(res.body.sellerUserId).toBe(DIRECTOR.id);
      expect(res.body.sellerUserId).not.toBe(ANA.id);
    });

    it("(b) rejects dto.sellerUserId when the user is not an eligible seller", async () => {
      const token = await loginAs(app, UserRole.administrador);

      // Rol no vendedor
      await request(app.getHttpServer())
        .post("/orders")
        .set(authHeader(token))
        .send(orderPayload("customer-assigned", { sellerUserId: LOGISTICA.id }))
        .expect(400);

      // Rol vendedor pero inactivo
      await request(app.getHttpServer())
        .post("/orders")
        .set(authHeader(token))
        .send(orderPayload("customer-assigned", { sellerUserId: INACTIVE_SELLER.id }))
        .expect(400);

      // Usuario inexistente: no se persiste un id arbitrario
      await request(app.getHttpServer())
        .post("/orders")
        .set(authHeader(token))
        .send(orderPayload("customer-assigned", { sellerUserId: "no-such-user" }))
        .expect(404);
    });

    it("(c) falls back to customer.assignedToUserId when dto omits the seller", async () => {
      const token = await loginAs(app, UserRole.administrador);

      const res = await request(app.getHttpServer())
        .post("/orders")
        .set(authHeader(token))
        .send(orderPayload("customer-assigned"))
        .expect(201);

      expect(res.body.sellerUserId).toBe(ANA.id);
    });

    it("(d) falls back to the creator when they are a seller and the customer has none", async () => {
      const token = await loginAs(app, UserRole.comercial);

      const res = await request(app.getHttpServer())
        .post("/orders")
        .set(authHeader(token))
        .send(orderPayload("customer-unassigned"))
        .expect(201);

      // Este es el caso GOAL-02: antes quedaba "Sin vendedor".
      expect(res.body.sellerUserId).toBe(ANA.id);
      expect(res.body.sellerUserId).not.toBeNull();
    });

    it("(e) leaves the seller null when nothing resolves (admin + unassigned customer)", async () => {
      const token = await loginAs(app, UserRole.administrador);

      const res = await request(app.getHttpServer())
        .post("/orders")
        .set(authHeader(token))
        .send(orderPayload("customer-unassigned"))
        .expect(201);

      // Default documentado: el admin no es seller elegible -> queda sin vendedor.
      expect(res.body.sellerUserId).toBeNull();
    });

    it("findOne exposes the resolved seller id and name", async () => {
      const token = await loginAs(app, UserRole.administrador);

      const created = await request(app.getHttpServer())
        .post("/orders")
        .set(authHeader(token))
        .send(orderPayload("customer-assigned"))
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/orders/${created.body.id}`)
        .set(authHeader(token))
        .expect(200);

      expect(res.body.seller).not.toBeNull();
      expect(res.body.seller).toEqual({ id: ANA.id, name: ANA.name });
    });
  });

  describe("GET /users/sellers", () => {
    it("(f) returns only active sellers, id+name only, and is reachable by a comercial", async () => {
      const token = await loginAs(app, UserRole.comercial);

      const res = await request(app.getHttpServer())
        .get("/users/sellers")
        .set(authHeader(token))
        .expect(200);

      const ids = res.body.map((u: { id: string }) => u.id).sort();
      expect(ids).toEqual([ANA.id, DIRECTOR.id].sort());

      // Ni inactivos ni roles no vendedores.
      expect(ids).not.toContain(INACTIVE_SELLER.id);
      expect(ids).not.toContain(ADMIN.id);
      expect(ids).not.toContain(LOGISTICA.id);

      // Superficie minima: solo id y name.
      for (const seller of res.body) {
        expect(Object.keys(seller).sort()).toEqual(["id", "name"]);
      }
    });

    it("is denied to roles that cannot create orders", async () => {
      const token = await loginAs(app, UserRole.tecnico);

      await request(app.getHttpServer())
        .get("/users/sellers")
        .set(authHeader(token))
        .expect(403);
    });
  });
});

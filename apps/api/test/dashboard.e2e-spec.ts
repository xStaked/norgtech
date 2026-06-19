import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
import request from "supertest";
import { DashboardController } from "../src/modules/dashboard/dashboard.controller";
import { DashboardService } from "../src/modules/dashboard/dashboard.service";
import { JwtAuthGuard } from "../src/modules/auth/jwt-auth.guard";
import { RolesGuard } from "../src/modules/auth/roles.guard";
import { PrismaService } from "../src/prisma/prisma.service";
import { SellerGoalsService } from "../src/modules/seller-goals/seller-goals.service";

describe("Dashboard advanced commercial summary", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    jest.useFakeTimers({ now: new Date("2026-06-01T12:00:00.000Z") });

    const users = [
      {
        id: "admin-user-id",
        name: "Admin",
        email: "admin@norgtech.local",
        role: UserRole.administrador,
        active: true,
      },
      {
        id: "seller-1",
        name: "Laura Comercial",
        email: "laura@norgtech.local",
        role: UserRole.comercial,
        active: true,
      },
      {
        id: "seller-2",
        name: "Carlos Comercial",
        email: "carlos@norgtech.local",
        role: UserRole.comercial,
        active: true,
      },
    ];

    const customers = [
      {
        id: "customer-1",
        displayName: "Agro Norte",
        legalName: "Agro Norte SAS",
        active: true,
        assignedToUserId: "seller-1",
        assignedToUser: { id: "seller-1", name: "Laura Comercial" },
      },
      {
        id: "customer-2",
        displayName: "Cultivos Sur",
        legalName: "Cultivos Sur SAS",
        active: true,
        assignedToUserId: "seller-2",
        assignedToUser: { id: "seller-2", name: "Carlos Comercial" },
      },
      {
        id: "customer-3",
        displayName: "Dormido Centro",
        legalName: "Dormido Centro SAS",
        active: true,
        assignedToUserId: "seller-1",
        assignedToUser: { id: "seller-1", name: "Laura Comercial" },
      },
    ];

    const orders = [
      {
        id: "order-current-1",
        customerId: "customer-1",
        orderDate: new Date("2026-05-20T00:00:00.000Z"),
        zone: "Antioquia",
        total: 1000,
        subtotal: 840,
        status: "recibido",
        customer: customers[0],
        customerZone: { zone: { name: "Antioquia" } },
      },
      {
        id: "order-current-2",
        customerId: "customer-2",
        orderDate: new Date("2026-05-25T00:00:00.000Z"),
        zone: "Cundinamarca",
        total: 2000,
        subtotal: 1680,
        status: "recibido",
        customer: customers[1],
        customerZone: { zone: { name: "Cundinamarca" } },
      },
      {
        id: "order-old-1",
        customerId: "customer-3",
        orderDate: new Date("2025-12-15T00:00:00.000Z"),
        zone: "Antioquia",
        total: 700,
        subtotal: 590,
        status: "entregado",
        customer: customers[2],
        customerZone: { zone: { name: "Antioquia" } },
      },
    ];

    const orderItems = [
      {
        id: "item-current-1",
        orderId: "order-current-1",
        productId: "product-fast",
        productSnapshotName: "Fertilizante Plus",
        productSnapshotSku: "FERT-001",
        quantity: 10,
        totalWithTax: 1000,
        subtotal: 840,
        order: orders[0],
      },
      {
        id: "item-current-2",
        orderId: "order-current-2",
        productId: "product-fast",
        productSnapshotName: "Fertilizante Plus",
        productSnapshotSku: "FERT-001",
        quantity: 20,
        totalWithTax: 2000,
        subtotal: 1680,
        order: orders[1],
      },
      {
        id: "item-old-1",
        orderId: "order-old-1",
        productId: "product-slow",
        productSnapshotName: "Bioestimulante Lento",
        productSnapshotSku: "BIO-009",
        quantity: 6,
        totalWithTax: 700,
        subtotal: 590,
        order: orders[2],
      },
    ];
    const products = [
      {
        id: "product-fast",
        sku: "FERT-001",
        name: "Fertilizante Plus",
        active: true,
      },
      {
        id: "product-never-sold",
        sku: "NEW-001",
        name: "Producto Sin Ventas",
        active: true,
      },
    ];

    const prismaStub = {
      user: {
        findUnique: async ({ where }: { where: { email?: string; id?: string } }) =>
          users.find((user) => user.email === where.email || user.id === where.id) ?? null,
        findMany: async ({ where }: { where?: { id?: { in?: string[] } } } = {}) => {
          const ids = where?.id?.in;
          return ids ? users.filter((user) => ids.includes(user.id)) : users;
        },
      },
      order: {
        findMany: async ({
          where,
        }: {
          where?: {
            orderDate?: { gte?: Date; lte?: Date };
            customer?: { assignedToUserId?: string };
          };
        } = {}) =>
          orders.filter((order) => {
            const gte = where?.orderDate?.gte;
            const lte = where?.orderDate?.lte;
            const assignedToUserId = where?.customer?.assignedToUserId;
            return (
              (!gte || order.orderDate >= gte) &&
              (!lte || order.orderDate <= lte) &&
              (!assignedToUserId || order.customer.assignedToUserId === assignedToUserId)
            );
          }),
        count: async () => 0,
      },
      orderItem: {
        findMany: async ({
          where,
        }: {
          where?: {
            order?: {
              orderDate?: { lte?: Date };
              customer?: { assignedToUserId?: string };
            };
          };
        } = {}) =>
          orderItems.filter((item) => {
            const lte = where?.order?.orderDate?.lte;
            const assignedToUserId = where?.order?.customer?.assignedToUserId;
            return (
              (!lte || item.order.orderDate <= lte) &&
              (!assignedToUserId || item.order.customer.assignedToUserId === assignedToUserId)
            );
          }),
      },
      customer: {
        findMany: async ({
          where,
        }: {
          where?: { active?: boolean; assignedToUserId?: string };
        } = {}) =>
          customers.filter(
            (customer) =>
              (where?.active === undefined || customer.active === where.active) &&
              (!where?.assignedToUserId || customer.assignedToUserId === where.assignedToUserId),
          ),
      },
      product: {
        findMany: async () => products,
      },
      quote: { count: async () => 0 },
      opportunity: {
        aggregate: async () => ({ _sum: { estimatedValue: 0 } }),
        count: async () => 0,
      },
      visit: {
        count: async () => 0,
        findMany: async () => [],
      },
      followUpTask: {
        count: async () => 0,
        findMany: async () => [],
      },
      auditLog: {
        findMany: async () => [],
      },
    };

    moduleRef = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        DashboardService,
        {
          provide: PrismaService,
          useValue: prismaStub,
        },
        {
          provide: SellerGoalsService,
          useValue: {},
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => {
            getRequest: () => { headers: Record<string, string | string[]>; user?: unknown };
          };
        }) => {
          const request = context.switchToHttp().getRequest();
          const role =
            request.headers["x-test-role"] === UserRole.comercial
              ? UserRole.comercial
              : UserRole.administrador;
          const sub = role === UserRole.comercial ? "seller-1" : "admin-user-id";
          request.user = {
            sub,
            email: role === UserRole.comercial ? "laura@norgtech.local" : "admin@norgtech.local",
            role,
          };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
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
    if (moduleRef) {
      await moduleRef.close();
    }
    jest.useRealTimers();
  });

  it("returns advanced commercial aggregates for the requested window", async () => {
    const response = await request(app.getHttpServer())
      .get("/dashboard/commercial-advanced?days=30")
      .set("Authorization", "Bearer test-token")
      .expect(200);

    expect(response.body.window.days).toBe(30);
    expect(response.body.totals).toMatchObject({
      orders: 2,
      revenue: 3000,
      units: 30,
      customers: 2,
      products: 1,
    });
    expect(response.body.bySeller[0]).toMatchObject({
      sellerId: "seller-2",
      sellerName: "Carlos Comercial",
      orders: 1,
      revenue: 2000,
    });
    expect(response.body.customerRanking[0]).toMatchObject({
      rank: 1,
      customerId: "customer-2",
      customerName: "Cultivos Sur",
      revenue: 2000,
    });
    expect(response.body.byProduct[0]).toMatchObject({
      productId: "product-fast",
      sku: "FERT-001",
      name: "Fertilizante Plus",
      quantity: 30,
      revenue: 3000,
    });
    expect(response.body.byZone).toEqual([
      expect.objectContaining({ zone: "Cundinamarca", orders: 1, revenue: 2000 }),
      expect.objectContaining({ zone: "Antioquia", orders: 1, revenue: 1000 }),
    ]);
    expect(response.body.lowRotationProducts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productId: "product-never-sold",
          sku: "NEW-001",
          name: "Producto Sin Ventas",
          quantity: 0,
        }),
        expect.objectContaining({
          productId: "product-slow",
          sku: "BIO-009",
          name: "Bioestimulante Lento",
          quantity: 0,
        }),
      ]),
    );
    expect(response.body.dormantCustomers).toEqual([
      expect.objectContaining({
        customerId: "customer-3",
        customerName: "Dormido Centro",
        sellerName: "Laura Comercial",
      }),
    ]);
  });

  it("scopes advanced aggregates to the current commercial user's customer portfolio", async () => {
    const response = await request(app.getHttpServer())
      .get("/dashboard/commercial-advanced?days=30")
      .set("Authorization", "Bearer test-token")
      .set("x-test-role", UserRole.comercial)
      .expect(200);

    expect(response.body.totals).toMatchObject({
      orders: 1,
      revenue: 1000,
      units: 10,
      customers: 1,
    });
    expect(response.body.bySeller).toEqual([
      expect.objectContaining({
        sellerId: "seller-1",
        sellerName: "Laura Comercial",
        orders: 1,
        revenue: 1000,
      }),
    ]);
    expect(response.body.customerRanking).toEqual([
      expect.objectContaining({
        customerId: "customer-1",
        customerName: "Agro Norte",
      }),
    ]);
    expect(response.body.customerRanking).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ customerId: "customer-2" })]),
    );
  });
});

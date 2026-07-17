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

/**
 * Matcher ESTRICTO para el `where` de Order.
 *
 * Un stub que ignora las claves que no conoce hace que un filtro nuevo
 * (companyId, sellerUserId) parezca funcionar mientras no hace nada: el test
 * pasa y el bug sigue vivo. Por eso este matcher LANZA ante cualquier clave que
 * no implemente, en vez de tragarsela.
 */
function matchesOrderWhere(order: Record<string, any>, where?: Record<string, any>): boolean {
  if (!where) return true;

  for (const [key, value] of Object.entries(where)) {
    switch (key) {
      case "orderDate": {
        if (value.gte && order.orderDate < value.gte) return false;
        if (value.lte && order.orderDate > value.lte) return false;
        break;
      }
      case "sellerUserId": {
        if (order.sellerUserId !== value) return false;
        break;
      }
      case "companyId": {
        if (order.companyId !== value) return false;
        break;
      }
      case "customer": {
        if (
          value.assignedToUserId &&
          order.customer?.assignedToUserId !== value.assignedToUserId
        ) {
          return false;
        }
        break;
      }
      default:
        throw new Error(
          `order where key no soportada por el stub: "${key}". Implementala o el filtro pasara sin filtrar.`,
        );
    }
  }

  return true;
}

/** Matcher estricto para el `where` de Return. Misma razon que el de Order. */
function matchesReturnWhere(ret: Record<string, any>, where?: Record<string, any>): boolean {
  if (!where) return true;

  for (const [key, value] of Object.entries(where)) {
    switch (key) {
      case "returnDate": {
        if (value.gte && ret.returnDate < value.gte) return false;
        if (value.lte && ret.returnDate > value.lte) return false;
        break;
      }
      case "order": {
        // `order: { sellerUserId }` -> devolucion sin pedido NO puede casar.
        if (value.sellerUserId !== undefined) {
          if (!ret.order || ret.order.sellerUserId !== value.sellerUserId) return false;
        }
        if (value.companyId !== undefined) {
          if (!ret.order || ret.order.companyId !== value.companyId) return false;
        }
        break;
      }
      case "OR": {
        if (!value.some((clause: any) => matchesReturnWhere(ret, clause))) return false;
        break;
      }
      case "invoice": {
        if (value.companyId !== undefined) {
          if (!ret.invoice || ret.invoice.companyId !== value.companyId) return false;
        }
        break;
      }
      default:
        throw new Error(
          `return where key no soportada por el stub: "${key}". Implementala o el filtro pasara sin filtrar.`,
        );
    }
  }

  return true;
}

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
        sellerUserId: "seller-1",
        companyId: "company-a",
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
        sellerUserId: "seller-2",
        companyId: "company-b",
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
        sellerUserId: "seller-1",
        companyId: "company-a",
        customer: customers[2],
        customerZone: { zone: { name: "Antioquia" } },
      },
      // DASH-04: seller-1 VENDE a customer-2, que esta asignado a seller-2.
      // Con la atribucion vieja (por cliente asignado) este pedido era invisible
      // para seller-1; con Order.sellerUserId le pertenece.
      {
        id: "order-cross-1",
        customerId: "customer-2",
        orderDate: new Date("2026-05-28T00:00:00.000Z"),
        zone: "Cundinamarca",
        total: 500,
        subtotal: 420,
        status: "recibido",
        sellerUserId: "seller-1",
        companyId: "company-a",
        customer: customers[1],
        customerZone: { zone: { name: "Cundinamarca" } },
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
        id: "item-cross-1",
        orderId: "order-cross-1",
        productId: "product-fast",
        productSnapshotName: "Fertilizante Plus",
        productSnapshotSku: "FERT-001",
        quantity: 5,
        totalWithTax: 500,
        subtotal: 420,
        order: orders[3],
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
    // RET-02: una devolucion no tiene companyId propio; la empresa se deriva de
    // su pedido o de su factura, y ambos son opcionales.
    const returns = [
      {
        id: "return-a",
        customerId: "customer-1",
        returnDate: new Date("2026-05-21T00:00:00.000Z"),
        amount: 100,
        // pedido de company-a, vendido por seller-1
        order: { sellerUserId: "seller-1", companyId: "company-a" },
        invoice: null,
      },
      {
        id: "return-b",
        customerId: "customer-2",
        returnDate: new Date("2026-05-26T00:00:00.000Z"),
        amount: 300,
        // pedido de company-b, vendido por seller-2
        order: { sellerUserId: "seller-2", companyId: "company-b" },
        invoice: null,
      },
      {
        id: "return-orphan",
        customerId: "customer-1",
        returnDate: new Date("2026-05-27T00:00:00.000Z"),
        amount: 50,
        // Sin pedido NI factura: no tiene empresa ni vendedor derivables.
        order: null,
        invoice: null,
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
        findMany: async ({ where }: { where?: Record<string, any> } = {}) =>
          orders.filter((order) => matchesOrderWhere(order, where)),
        count: async () => 0,
      },
      orderItem: {
        findMany: async ({ where }: { where?: Record<string, any> } = {}) =>
          orderItems.filter((item) => matchesOrderWhere(item.order, where?.order)),
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
      return: {
        findMany: async ({ where }: { where?: Record<string, any> } = {}) =>
          returns.filter((ret) => matchesReturnWhere(ret, where)),
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
      orders: 3,
      revenue: 3500,
      units: 35,
      customers: 2,
      products: 1,
    });
    expect(response.body.bySeller[0]).toMatchObject({
      sellerId: "seller-2",
      sellerName: "Carlos Comercial",
      orders: 1,
      revenue: 2000,
    });
    // seller-1 acumula su pedido propio (1000) mas la venta cruzada (500).
    expect(response.body.bySeller[1]).toMatchObject({
      sellerId: "seller-1",
      sellerName: "Laura Comercial",
      orders: 2,
      revenue: 1500,
    });
    expect(response.body.customerRanking[0]).toMatchObject({
      rank: 1,
      customerId: "customer-2",
      customerName: "Cultivos Sur",
      // 2000 de seller-2 + 500 de la venta cruzada de seller-1
      revenue: 2500,
    });
    expect(response.body.byProduct[0]).toMatchObject({
      productId: "product-fast",
      sku: "FERT-001",
      name: "Fertilizante Plus",
      quantity: 35,
      revenue: 3500,
    });
    expect(response.body.byZone).toEqual([
      expect.objectContaining({ zone: "Cundinamarca", orders: 2, revenue: 2500 }),
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

  // DASH-04: antes se acotaba por `customer.assignedToUserId`, asi que un
  // comercial solo veia lo vendido a SU cartera. La atribucion correcta es
  // Order.sellerUserId: lo que EL vendio, sea de quien sea el cliente.
  it("scopes advanced aggregates by Order.sellerUserId, not by customer assignment (DASH-04)", async () => {
    const response = await request(app.getHttpServer())
      .get("/dashboard/commercial-advanced?days=30")
      .set("Authorization", "Bearer test-token")
      .set("x-test-role", UserRole.comercial)
      .expect(200);

    // order-current-1 (1000, cliente propio) + order-cross-1 (500, cliente de
    // seller-2). El cruzado es el que la atribucion vieja perdia.
    expect(response.body.totals).toMatchObject({
      orders: 2,
      revenue: 1500,
      units: 15,
      customers: 2,
    });
    expect(response.body.bySeller).toEqual([
      expect.objectContaining({
        sellerId: "seller-1",
        sellerName: "Laura Comercial",
        orders: 2,
        revenue: 1500,
      }),
    ]);
    // El pedido de seller-2 (2000) NO se cuela.
    expect(response.body.totals.revenue).not.toBe(3500);
    expect(response.body.bySeller).toHaveLength(1);

    const rankedIds = response.body.customerRanking.map((c: { customerId: string }) => c.customerId);
    expect(rankedIds).toContain("customer-1");
    // customer-2 aparece porque seller-1 le vendio, aunque no sea su cartera.
    expect(rankedIds).toContain("customer-2");
  });

  it("a comercial who sells to another rep's customer no longer sees zeros (DASH-04)", async () => {
    const response = await request(app.getHttpServer())
      .get("/dashboard/commercial-advanced?days=30")
      .set("Authorization", "Bearer test-token")
      .set("x-test-role", UserRole.comercial)
      .expect(200);

    const crossSoldCustomer = response.body.customerRanking.find(
      (c: { customerId: string }) => c.customerId === "customer-2",
    );

    expect(crossSoldCustomer).toBeDefined();
    expect(crossSoldCustomer.revenue).toBe(500);
    expect(crossSoldCustomer.orders).toBe(1);
  });

  // RET-02: las devoluciones no se filtraban por companyId mientras los pedidos
  // si, asi que netRevenue = ventas(empresa X) - devoluciones(TODAS) y el neto
  // salia sub-reportado al elegir empresa.
  describe("returns scoping (RET-02)", () => {
    it("subtracts every return when no company is selected", async () => {
      const response = await request(app.getHttpServer())
        .get("/dashboard/commercial-advanced?days=30")
        .set("Authorization", "Bearer test-token")
        .expect(200);

      // 100 (company-a) + 300 (company-b) + 50 (huerfana) = 450
      expect(response.body.totals.returns).toBe(450);
      expect(response.body.totals.revenue).toBe(3500);
      expect(response.body.totals.netRevenue).toBe(3050);
    });

    it("subtracts only the selected company's returns, not every company's", async () => {
      const response = await request(app.getHttpServer())
        .get("/dashboard/commercial-advanced?days=30&companyId=company-a")
        .set("Authorization", "Bearer test-token")
        .expect(200);

      // Ventas de company-a: order-current-1 (1000) + order-cross-1 (500).
      expect(response.body.totals.revenue).toBe(1500);
      // Solo return-a (100). La de company-b (300) y la huerfana (50) quedan fuera.
      expect(response.body.totals.returns).toBe(100);
      expect(response.body.totals.netRevenue).toBe(1400);
      // El bug: restar las 450 de todas las empresas.
      expect(response.body.totals.returns).not.toBe(450);
      expect(response.body.totals.netRevenue).not.toBe(1050);
    });

    it("attributes a return to the seller of its order, not the customer's rep", async () => {
      const response = await request(app.getHttpServer())
        .get("/dashboard/commercial-advanced?days=30")
        .set("Authorization", "Bearer test-token")
        .expect(200);

      const laura = response.body.bySeller.find(
        (s: { sellerId: string }) => s.sellerId === "seller-1",
      );
      expect(laura).toMatchObject({ revenue: 1500, returns: 100, netRevenue: 1400 });

      const carlos = response.body.bySeller.find(
        (s: { sellerId: string }) => s.sellerId === "seller-2",
      );
      expect(carlos).toMatchObject({ revenue: 2000, returns: 300, netRevenue: 1700 });
    });

    it("states the window the returns total covers (RET-02)", async () => {
      const response = await request(app.getHttpServer())
        .get("/dashboard/commercial-advanced?days=30")
        .set("Authorization", "Bearer test-token")
        .expect(200);

      // El modulo de Devoluciones suma el historico completo; esta tarjeta suma
      // una ventana. Sin decir cual, los dos numeros parecen contradecirse.
      expect(response.body.totals.returnsWindowDays).toBe(30);
      expect(response.body.window.days).toBe(30);
    });
  });

  // DASH-05: solo Order tiene companyId; el resto de contadores no puede
  // acotarse sin inventar la relacion.
  it("scopes orders by the selected company (DASH-05)", async () => {
    const response = await request(app.getHttpServer())
      .get("/dashboard/commercial-advanced?days=30&companyId=company-b")
      .set("Authorization", "Bearer test-token")
      .expect(200);

    expect(response.body.totals.orders).toBe(1);
    expect(response.body.totals.revenue).toBe(2000);
    expect(response.body.bySeller).toEqual([
      expect.objectContaining({ sellerId: "seller-2", revenue: 2000 }),
    ]);
  });
});

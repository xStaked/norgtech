import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Prisma, UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { CreditService } from "../src/modules/credit/credit.service";
import { matchesOrderWhere, OrderWhereStub } from "./helpers/order-where";
import { refreshTokenStub } from "./helpers/login-as";

describe("Credit", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let token: string;

  const passwordHash = "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";
  const users = [
    {
      id: "admin-user-id",
      name: "Admin",
      email: "admin@norgtech.local",
      passwordHash,
      role: UserRole.administrador,
      active: true,
    },
  ];
  const companies = [
    { id: "company-a", name: "Norgtech A", prefix: "NTA", isActive: true },
    { id: "company-b", name: "Norgtech B", prefix: "NTB", isActive: true },
  ];
  const customers = [
    {
      id: "customer-high",
      displayName: "Agro Alto",
      taxId: "900111222-1",
      address: "Calle 1",
      creditLimit: new Prisma.Decimal(1000000),
      purchaseBudget: new Prisma.Decimal(2000000),
      createdBy: "admin-user-id",
      updatedBy: "admin-user-id",
      companyId: "company-a",
      segment: { discountPercent: new Prisma.Decimal(0), minGoalAmount: new Prisma.Decimal(0) },
    },
    {
      id: "customer-low",
      displayName: "Agro Bajo",
      taxId: "900333444-1",
      address: "Calle 2",
      creditLimit: new Prisma.Decimal(1000000),
      purchaseBudget: null,
      createdBy: "admin-user-id",
      updatedBy: "admin-user-id",
      segment: { discountPercent: new Prisma.Decimal(0), minGoalAmount: new Prisma.Decimal(0) },
    },
    {
      id: "customer-no-limit",
      displayName: "Agro Sin Cupo",
      taxId: "900555666-1",
      address: "Calle 3",
      creditLimit: null,
      purchaseBudget: null,
      createdBy: "admin-user-id",
      updatedBy: "admin-user-id",
      companyId: "company-a",
      segment: { discountPercent: new Prisma.Decimal(0), minGoalAmount: new Prisma.Decimal(0) },
    },
    {
      id: "customer-no-invoices",
      displayName: "Agro Nuevo",
      taxId: "900777888-1",
      address: "Calle 4",
      creditLimit: new Prisma.Decimal(500000),
      purchaseBudget: null,
      createdBy: "admin-user-id",
      updatedBy: "admin-user-id",
      segment: { discountPercent: new Prisma.Decimal(0), minGoalAmount: new Prisma.Decimal(0) },
    },
    {
      id: "customer-company-b",
      displayName: "Agro B",
      taxId: "900999000-1",
      address: "Calle 5",
      creditLimit: new Prisma.Decimal(1000000),
      purchaseBudget: null,
      createdBy: "admin-user-id",
      updatedBy: "admin-user-id",
      segment: { discountPercent: new Prisma.Decimal(0), minGoalAmount: new Prisma.Decimal(0) },
    },
    {
      id: "customer-exposure",
      displayName: "Agro Exposicion",
      taxId: "901111222-1",
      address: "Calle 6",
      creditLimit: new Prisma.Decimal(2000000),
      purchaseBudget: null,
      createdBy: "admin-user-id",
      updatedBy: "admin-user-id",
      segment: { discountPercent: new Prisma.Decimal(0), minGoalAmount: new Prisma.Decimal(0) },
    },
    {
      id: "customer-alert-orders",
      displayName: "Agro Alerta Pedidos",
      taxId: "901333444-1",
      address: "Calle 7",
      creditLimit: new Prisma.Decimal(1000000),
      purchaseBudget: null,
      createdBy: "admin-user-id",
      updatedBy: "admin-user-id",
      companyId: "company-a",
      segment: { discountPercent: new Prisma.Decimal(0), minGoalAmount: new Prisma.Decimal(0) },
    },
  ];
  const invoices: Array<{
    id: string;
    customerId: string;
    companyId: string;
    orderId?: string;
    status: string;
    totalAmount: Prisma.Decimal;
  }> = [
    {
      id: "invoice-high-a",
      customerId: "customer-high",
      companyId: "company-a",
      status: "emitida",
      totalAmount: new Prisma.Decimal(850000),
    },
    {
      id: "invoice-high-paid",
      customerId: "customer-high",
      companyId: "company-a",
      status: "pagada",
      totalAmount: new Prisma.Decimal(100000),
    },
    {
      id: "invoice-low-a",
      customerId: "customer-low",
      companyId: "company-a",
      status: "emitida",
      totalAmount: new Prisma.Decimal(250000),
    },
    {
      id: "invoice-b",
      customerId: "customer-company-b",
      companyId: "company-b",
      status: "emitida",
      totalAmount: new Prisma.Decimal(900000),
    },
    // Factura ACTIVA de order-exp-invoiced: el pedido no debe volver a sumar.
    {
      id: "invoice-exp-active",
      customerId: "customer-exposure",
      companyId: "company-a",
      orderId: "order-exp-invoiced",
      status: "emitida",
      totalAmount: new Prisma.Decimal(300000),
    },
    // Factura ANULADA de order-exp-voided: el pedido vuelve a contar como exposicion.
    {
      id: "invoice-exp-void",
      customerId: "customer-exposure",
      companyId: "company-a",
      orderId: "order-exp-voided",
      status: "anulada",
      totalAmount: new Prisma.Decimal(200000),
    },
  ];
  const orders: Array<Record<string, unknown>> = [
    // Pedido aprobado sin factura -> suma exposicion.
    {
      id: "order-exp-approved",
      customerId: "customer-exposure",
      companyId: "company-a",
      status: "orden_facturacion",
      total: new Prisma.Decimal(400000),
      subtotal: new Prisma.Decimal(400000),
    },
    // Borrador -> NO suma exposicion.
    {
      id: "order-exp-draft",
      customerId: "customer-exposure",
      companyId: "company-a",
      status: "recibido",
      total: new Prisma.Decimal(900000),
      subtotal: new Prisma.Decimal(900000),
    },
    // Facturado con factura activa -> cuenta una sola vez (via la factura).
    {
      id: "order-exp-invoiced",
      customerId: "customer-exposure",
      companyId: "company-a",
      status: "facturado",
      total: new Prisma.Decimal(300000),
      subtotal: new Prisma.Decimal(300000),
    },
    // Facturado pero con la factura anulada -> vuelve a contar como pedido.
    {
      id: "order-exp-voided",
      customerId: "customer-exposure",
      companyId: "company-a",
      status: "facturado",
      total: new Prisma.Decimal(200000),
      subtotal: new Prisma.Decimal(200000),
    },
    // Cliente cuya exposicion viene solo de pedidos (para alertas).
    {
      id: "order-alert",
      customerId: "customer-alert-orders",
      companyId: "company-a",
      status: "orden_facturacion",
      total: new Prisma.Decimal(950000),
      subtotal: new Prisma.Decimal(950000),
    },
  ];
  const auditLogs: Array<Record<string, unknown>> = [];

  const orderMatches = (order: Record<string, unknown>, where?: OrderWhereStub) =>
    matchesOrderWhere(order, where, invoices);

  beforeAll(async () => {
    const user = {
      findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email) return users.find((u) => u.email === where.email) ?? null;
        return users.find((u) => u.id === where.id) ?? null;
      },
    };

    const company = {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        companies.find((c) => c.id === id) ?? null,
    };

    const customer = {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        customers.find((c) => c.id === id) ?? null,
      findMany: async ({ where }: { where?: { invoices?: { some?: { companyId?: string } } } }) => {
        return customers.filter((c) => {
          if (!c.creditLimit || c.creditLimit.lte(0)) return false;
          const companyId = where?.invoices?.some?.companyId;
          if (!companyId) return true;
          return invoices.some((i) => i.customerId === c.id && i.companyId === companyId);
        });
      },
    };

    const invoice = {
      aggregate: async ({
        where,
      }: {
        where: { customerId: string; companyId?: string; status?: { notIn?: string[] } };
      }) => {
        const total = invoices
          .filter((i) => i.customerId === where.customerId)
          .filter((i) => !where.companyId || i.companyId === where.companyId)
          .filter((i) => !where.status?.notIn?.includes(i.status))
          .reduce((sum, i) => sum.plus(i.totalAmount), new Prisma.Decimal(0));

        return { _sum: { totalAmount: total } };
      },
      groupBy: async ({
        where,
      }: {
        where: {
          customerId: { in: string[] };
          companyId?: string;
          status?: { notIn?: string[] };
        };
      }) => {
        const totals = new Map<string, Prisma.Decimal>();

        for (const invoice of invoices) {
          if (!where.customerId.in.includes(invoice.customerId)) continue;
          if (where.companyId && invoice.companyId !== where.companyId) continue;
          if (where.status?.notIn?.includes(invoice.status)) continue;
          totals.set(
            invoice.customerId,
            (totals.get(invoice.customerId) ?? new Prisma.Decimal(0)).plus(invoice.totalAmount),
          );
        }

        return Array.from(totals, ([customerId, totalAmount]) => ({
          customerId,
          _sum: { totalAmount },
        }));
      },
    };

    const txStub = {
      order: {
        create: async ({ data, include }: { data: Record<string, any>; include?: Record<string, unknown> }) => {
          const order = {
            id: `order-${orders.length + 1}`,
            status: "recibido",
            ...data,
            items: data.items?.create ?? [],
            customer: include?.customer
              ? customers.find((c) => c.id === data.customerId)
              : undefined,
            opportunity: null,
            sourceQuote: null,
            sourceConversation: null,
            createdAt: new Date("2026-06-15T00:00:00.000Z"),
            updatedAt: new Date("2026-06-15T00:00:00.000Z"),
          };
          orders.push(order);
          return order;
        },
      },
      auditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const entry = { id: `audit-${auditLogs.length + 1}`, createdAt: new Date(), ...data };
          auditLogs.push(entry);
          return entry;
        },
      },
    };

    const prismaStub = {
      user,
      refreshToken: refreshTokenStub(),
      company,
      customer,
      invoice,
      order: {
        aggregate: async () => ({ _sum: { subtotal: new Prisma.Decimal(0) } }),
        count: async () => orders.length,
        findFirst: async () => null,
        findMany: async ({ where }: { where?: OrderWhereStub } = {}) =>
          orders.filter((o) => orderMatches(o, where)),
        groupBy: async ({ where }: { where?: OrderWhereStub } = {}) => {
          const totals = new Map<string, Prisma.Decimal>();
          for (const o of orders.filter((x) => orderMatches(x, where))) {
            const customerId = o.customerId as string;
            totals.set(
              customerId,
              (totals.get(customerId) ?? new Prisma.Decimal(0)).plus(
                (o.total as Prisma.Decimal) ?? 0,
              ),
            );
          }
          return Array.from(totals, ([customerId, total]) => ({
            customerId,
            _sum: { total },
          }));
        },
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          orders.find((o) => o.id === id) ?? null,
      },
      product: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          id === "product-costly"
            ? {
                id: "product-costly",
                name: "Insumo Caro",
                sku: "IC-1",
                unit: "unit",
                presentation: null,
                basePrice: new Prisma.Decimal(50000),
              }
            : null,
      },
      opportunity: {
        findUnique: async () => null,
      },
      quote: {
        findUnique: async () => null,
      },
      whatsAppConversation: {
        findUnique: async () => null,
      },
      auditLog: txStub.auditLog,
      $transaction: async <T>(callback: (tx: typeof txStub) => Promise<T>) => callback(txStub),
    };

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const loginResponse = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin@norgtech.local", password: "Admin123*" })
      .expect(200);
    token = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await moduleRef.close();
  });

  function api() {
    return request(app.getHttpServer());
  }

  function orderPayload(customerId: string, subtotal: number) {
    return {
      customerId,
      companyId: "company-a",
      items: [{ quantity: 1, unitPrice: subtotal }],
    };
  }

  it("returns a customer credit summary with utilization", async () => {
    const response = await api()
      .get("/credit/customers/customer-high/summary")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.creditLimit).toBe(1000000);
    expect(response.body.currentBalance).toBe(850000);
    expect(response.body.utilizationPercent).toBe(85);
    expect(response.body.availableCredit).toBe(150000);
  });

  it("returns null credit values for a customer without credit limit", async () => {
    const response = await api()
      .get("/credit/customers/customer-no-limit/summary")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.creditLimit).toBeNull();
    expect(response.body.availableCredit).toBeNull();
    expect(response.body.utilizationPercent).toBeNull();
  });

  it("returns zero current balance for a customer without invoices", async () => {
    const response = await api()
      .get("/credit/customers/customer-no-invoices/summary")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.creditLimit).toBe(500000);
    expect(response.body.currentBalance).toBe(0);
    expect(response.body.utilizationPercent).toBe(0);
  });

  it("returns only customers at or above 80 percent utilization in alerts", async () => {
    const response = await api()
      .get("/credit/dashboard/alerts")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual([
      // Exposicion solo por pedidos aprobados, sin ninguna factura.
      expect.objectContaining({
        customerId: "customer-alert-orders",
        currentBalance: 950000,
        utilizationPercent: 95,
      }),
      expect.objectContaining({
        customerId: "customer-company-b",
        currentBalance: 900000,
        utilizationPercent: 90,
      }),
      expect.objectContaining({
        customerId: "customer-high",
        currentBalance: 850000,
        utilizationPercent: 85,
      }),
    ]);
    expect(response.body).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ customerId: "customer-low" })]),
    );
  });

  it("filters dashboard alerts by company", async () => {
    const response = await api()
      .get("/credit/dashboard/alerts?companyId=company-a")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({
        customerId: "customer-high",
        currentBalance: 850000,
        utilizationPercent: 85,
      }),
    ]);
  });

  it("blocks order creation when subtotal exceeds available credit", async () => {
    const response = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .send(orderPayload("customer-high", 200000))
      .expect(400);

    expect(response.body.message).toContain("Credito excedido");
  });

  it("allows order creation when subtotal is within available credit", async () => {
    const response = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .send(orderPayload("customer-high", 100000))
      .expect(201);

    expect(response.body.customerId).toBe("customer-high");
    expect(Number(response.body.subtotal)).toBe(100000);
  });

  it("checks credit against the total with IVA, not the pre-tax subtotal", async () => {
    // customer-high tiene 150000 disponibles. Un subtotal de 130000 cabe, pero
    // el pedido realmente vale 130000 * 1.19 = 154700, que es lo que acabara en
    // invoice.totalAmount y en la exposicion. Validar el subtotal colaba el IVA
    // sin cupo (spec 3.5).
    const response = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .send(orderPayload("customer-high", 130000))
      .expect(400);

    expect(response.body.message).toContain("Credito excedido");
    expect(response.body.message).toContain("154700");
  });

  it("checks credit against the catalog price, not the client-supplied unitPrice", async () => {
    // customer-high has 150000 available. A catalog line is priced from
    // product.basePrice (50000 x 100 = 5000000), so a lying unitPrice of 1
    // must not buy its way past the limit.
    const response = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: "customer-high",
        companyId: "company-a",
        items: [{ productId: "product-costly", quantity: 100, unitPrice: 1 }],
      })
      .expect(400);

    expect(response.body.message).toContain("Credito excedido");
  });

  // ORD-01/ORD-02: la exposicion no puede ser solo-facturas.
  describe("customer exposure (ORD-01/ORD-02)", () => {
    function creditService() {
      return moduleRef.get(CreditService);
    }

    it("sums open invoices plus approved orders without an active invoice", async () => {
      // facturas abiertas: invoice-exp-active 300000 (la anulada no cuenta)
      // pedidos: order-exp-approved 400000 + order-exp-voided 200000
      //   - order-exp-draft (recibido) NO cuenta
      //   - order-exp-invoiced tiene factura activa -> ya contado via la factura
      const exposure = await creditService().getCustomerExposure("customer-exposure");
      expect(exposure.toNumber()).toBe(900000);
    });

    it("does not count draft (recibido) orders toward exposure", async () => {
      const exposure = await creditService().getCustomerExposure("customer-exposure");
      // order-exp-draft vale 900000; si contara, la exposicion seria 1800000.
      expect(exposure.toNumber()).not.toBe(1800000);
      expect(exposure.toNumber()).toBe(900000);
    });

    it("excludes the given order from exposure via excludeOrderId", async () => {
      const exposure = await creditService().getCustomerExposure("customer-exposure", undefined, {
        excludeOrderId: "order-exp-approved",
      });
      expect(exposure.toNumber()).toBe(500000);
    });

    it("reports available credit net of pending orders in the summary", async () => {
      const response = await api()
        .get("/credit/customers/customer-exposure/summary")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(response.body.creditLimit).toBe(2000000);
      expect(response.body.currentBalance).toBe(900000);
      expect(response.body.availableCredit).toBe(1100000);
      expect(response.body.utilizationPercent).toBe(45);
    });

    it("blocks an order when pending orders alone consume the credit limit", async () => {
      // customer-alert-orders: sin facturas, 950000 en pedidos aprobados, cupo 1000000.
      // Antes del fix la exposicion era 0 y esto pasaba.
      const response = await request(app.getHttpServer())
        .post("/orders")
        .set("Authorization", `Bearer ${token}`)
        .send(orderPayload("customer-alert-orders", 100000))
        .expect(400);

      expect(response.body.message).toContain("Credito excedido");
    });
  });

  it("allows order creation when customer has no credit limit", async () => {
    const response = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .send(orderPayload("customer-no-limit", 5000000))
      .expect(201);

    expect(response.body.customerId).toBe("customer-no-limit");
    expect(Number(response.body.subtotal)).toBe(5000000);
  });
});

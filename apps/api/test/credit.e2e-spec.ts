import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Prisma, UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
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
  ];
  const invoices = [
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
  ];
  const orders: Array<Record<string, unknown>> = [];
  const auditLogs: Array<Record<string, unknown>> = [];

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
        findMany: async () => orders,
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          orders.find((o) => o.id === id) ?? null,
      },
      product: {
        findUnique: async () => null,
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

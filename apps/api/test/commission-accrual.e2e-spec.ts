import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { PaymentMethod, Prisma, UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { R2StorageService } from "../src/shared/r2-storage.service";
import {
  authHeader,
  findMockUserByEmail,
  loginAs,
  MOCK_USERS,
} from "./helpers/login-as";
import { matchesOrderWhere, OrderWhereStub } from "./helpers/order-where";

/**
 * Task 2 (Frente 3, fase 2): causacion de comisiones al cobrar.
 * RED: este spec FALLA hasta que el pago cause la comision proporcional
 * dentro de la transaccion y la nota credito la reverse.
 *
 * Flujo: pago parcial del 50% -> comision del 50% de la base; pago total ->
 * 100%; nota credito posterior -> reverso.
 */
describe("Commission accrual on payment (RED)", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  const sellerId = MOCK_USERS[UserRole.comercial].id;
  const sellerWithoutRuleId = MOCK_USERS[UserRole.director_comercial].id;

  const invoices: Array<Record<string, unknown>> = [];
  const payments: Array<Record<string, unknown>> = [];
  const rules: Array<Record<string, unknown>> = [];
  const commissions: Array<Record<string, unknown>> = [];
  const returns: Array<Record<string, unknown>> = [];
  let ruleCounter = 0;

  const customers = [
    {
      id: "customer-1",
      displayName: "Agro Norte",
      taxId: "900111222-1",
      creditLimit: null,
      paymentDays: 30,
      createdBy: "admin-user-id",
      updatedBy: "admin-user-id",
      assignedToUserId: sellerId,
      companyId: "company-1",
    },
  ];

  const companies = [
    {
      id: "company-1",
      name: "Nortech",
      legalName: "Tecnologia de Nutricion Organica SAS",
      nit: "900999888-1",
      prefix: "NOR",
      isActive: true,
    },
  ];

  const orders = [
    {
      id: "order-accrual-1",
      customerId: "customer-1",
      orderNumber: "PED-ACC-001",
      status: "entregado",
      subtotal: new Prisma.Decimal(1000000),
      total: new Prisma.Decimal(1000000),
      sellerUserId: sellerId,
      createdBy: "admin-user-id",
      updatedBy: "admin-user-id",
    },
    {
      id: "order-accrual-2",
      customerId: "customer-1",
      orderNumber: "PED-ACC-002",
      status: "entregado",
      subtotal: new Prisma.Decimal(800000),
      total: new Prisma.Decimal(800000),
      sellerUserId: sellerId,
      createdBy: "admin-user-id",
      updatedBy: "admin-user-id",
    },
    {
      id: "order-accrual-3",
      customerId: "customer-1",
      orderNumber: "PED-ACC-003",
      status: "entregado",
      subtotal: new Prisma.Decimal(500000),
      total: new Prisma.Decimal(500000),
      sellerUserId: sellerWithoutRuleId,
      createdBy: "admin-user-id",
      updatedBy: "admin-user-id",
    },
    {
      id: "order-accrual-4",
      customerId: "customer-1",
      orderNumber: "PED-ACC-004",
      status: "entregado",
      subtotal: new Prisma.Decimal(1200000),
      total: new Prisma.Decimal(1200000),
      sellerUserId: sellerId,
      createdBy: "admin-user-id",
      updatedBy: "admin-user-id",
    },
    {
      id: "order-accrual-5",
      customerId: "customer-1",
      orderNumber: "PED-ACC-005",
      status: "entregado",
      subtotal: new Prisma.Decimal(1000000),
      total: new Prisma.Decimal(1000000),
      sellerUserId: sellerId,
      createdBy: "admin-user-id",
      updatedBy: "admin-user-id",
    },
    {
      id: "order-accrual-6",
      customerId: "customer-1",
      orderNumber: "PED-ACC-006",
      status: "entregado",
      subtotal: new Prisma.Decimal(1000000),
      total: new Prisma.Decimal(1000000),
      sellerUserId: sellerId,
      createdBy: "admin-user-id",
      updatedBy: "admin-user-id",
    },
    {
      id: "order-accrual-7",
      customerId: "customer-1",
      orderNumber: "PED-ACC-007",
      status: "entregado",
      subtotal: new Prisma.Decimal(1000000),
      total: new Prisma.Decimal(1000000),
      sellerUserId: sellerId,
      createdBy: "admin-user-id",
      updatedBy: "admin-user-id",
    },
    {
      id: "order-accrual-8",
      customerId: "customer-1",
      orderNumber: "PED-ACC-008",
      status: "entregado",
      subtotal: new Prisma.Decimal(1000000),
      total: new Prisma.Decimal(1000000),
      sellerUserId: sellerId,
      createdBy: "admin-user-id",
      updatedBy: "admin-user-id",
    },
    {
      id: "order-accrual-9",
      customerId: "customer-1",
      orderNumber: "PED-ACC-009",
      status: "entregado",
      subtotal: new Prisma.Decimal(1000000),
      total: new Prisma.Decimal(1000000),
      sellerUserId: sellerId,
      createdBy: "admin-user-id",
      updatedBy: "admin-user-id",
    },
  ];

  function matchesRule(
    rule: Record<string, unknown>,
    where?: {
      sellerUserId?: string;
      periodType?: string;
      periodValue?: string;
    },
  ) {
    if (!where) return true;
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
    const user = {
      findUnique: async ({
        where,
      }: {
        where: { email?: string; id?: string };
      }) => {
        if (where.email) return findMockUserByEmail(where.email);
        if (where.id) {
          const found = Object.values(MOCK_USERS).find(
            (u) => u.id === where.id,
          );
          return found ? { ...found } : null;
        }
        return null;
      },
    };

    const customer = {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        customers.find((c) => c.id === id) ?? null,
    };

    const company = {
      findUnique: async ({ where }: { where: { id?: string } }) =>
        companies.find((c) => c.id === where.id) ?? null,
    };

    const order = {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        orders.find((o) => o.id === id) ?? null,
      findMany: async ({ where }: { where?: OrderWhereStub } = {}) =>
        orders.filter((o) => matchesOrderWhere(o, where, invoices as any)),
    };

    const txStub: Record<string, any> = {
      user,
      refreshToken: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          id: "rt-test",
          revokedAt: null,
          expiresAt: new Date(Date.now() + 7 * 864e5),
          createdAt: new Date(),
          ...data,
        }),
        findUnique: async () => null,
        findFirst: async () => null,
        update: async ({ data }: { data: Record<string, unknown> }) => ({
          id: "rt-test",
          ...data,
        }),
        updateMany: async () => ({ count: 0 }),
      },
      customer,
      company,
      order,
      invoice: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const invoice = {
            id: `invoice-${invoices.length + 1}`,
            ...data,
            totalPaid: new Prisma.Decimal(0),
            creditNoteTotal: new Prisma.Decimal(0),
            status: "emitida",
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          invoices.push(invoice);
          return invoice;
        },
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          invoices.find((i) => (i as any).id === id) ?? null,
        findMany: async () => invoices,
        count: async () => invoices.length,
        aggregate: async () => ({ _sum: { totalAmount: 0 } }),
        update: async ({
          where: { id },
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const idx = invoices.findIndex((i) => (i as any).id === id);
          if (idx >= 0) {
            invoices[idx] = { ...invoices[idx], ...data, updatedAt: new Date() };
          }
          return invoices[idx];
        },
      },
      invoicePayment: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const payment = {
            id: `payment-${payments.length + 1}`,
            ...data,
            createdAt: new Date(),
            supports: [],
          };
          payments.push(payment);
          return payment;
        },
        findMany: async () => payments,
      },
      return: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const ret = {
            id: `return-${returns.length + 1}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          returns.push(ret);
          return ret;
        },
      },
      commissionRule: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          ruleCounter += 1;
          const rule = {
            id: `commission-rule-${ruleCounter}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          rules.push(rule);
          return { ...rule };
        },
        findFirst: async ({ where }: { where?: any }) =>
          rules.find((rule) => matchesRule(rule, where)) ?? null,
        findMany: async ({ where }: { where?: any } = {}) =>
          rules.filter((rule) => matchesRule(rule, where)),
        findUnique: async ({ where }: { where: { id: string } }) =>
          rules.find((rule) => rule.id === where.id) ?? null,
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
      commission: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = {
            id: `commission-${commissions.length + 1}`,
            reversedAmount: new Prisma.Decimal(0),
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          commissions.push(row);
          return row;
        },
        findMany: async ({
          where,
          orderBy,
        }: {
          where?: { invoiceId?: string; status?: string };
          orderBy?: { createdAt?: string };
        }) => {
          const rows = commissions.filter((c) => {
            if (where?.invoiceId && c.invoiceId !== where.invoiceId) {
              return false;
            }
            if (where?.status && c.status !== where.status) return false;
            return true;
          });
          if (orderBy?.createdAt === "asc") {
            rows.sort(
              (a, b) =>
                new Date(a.createdAt as string).getTime() -
                new Date(b.createdAt as string).getTime(),
            );
          }
          return rows;
        },
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const found = commissions.find((c) => c.id === where.id);
          if (!found) throw new Error("Commission not found in stub");
          Object.assign(found, data);
          return { ...found };
        },
      },
      auditLog: {
        create: async () => undefined,
        findMany: async () => [],
      },
      $queryRaw: async () => [{ id: "locked" }],
    };

    const prismaStub = {
      ...txStub,
      $transaction: async (fn: any) => fn(txStub),
    };

    const storageStub = {
      uploadFile: async () => ({ bucket: "test-bucket", objectKey: "test-key" }),
      deleteObject: async () => undefined,
    };

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .overrideProvider(R2StorageService)
      .useValue(storageStub)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  async function createInvoice(orderId: string, totalAmount: number) {
    const token = await loginAs(app, UserRole.facturacion);
    const response = await request(app.getHttpServer())
      .post("/invoices")
      .set(authHeader(token))
      .send({
        companyId: "company-1",
        customerId: "customer-1",
        orderId,
        subtotal: totalAmount,
        taxAmount: 0,
        totalAmount,
      })
      .expect(201);
    return response.body.id as string;
  }

  async function pay(invoiceId: string, amount: number, paymentDate: string) {
    const token = await loginAs(app, UserRole.facturacion);
    const response = await request(app.getHttpServer())
      .post("/invoices/payments")
      .set(authHeader(token))
      .send({
        invoiceId,
        amount,
        method: PaymentMethod.transferencia,
        paymentDate,
      })
      .expect(201);
    return response.body.payment.id as string;
  }

  it("accrues 50% of the base commission on a 50% partial payment", async () => {
    const adminToken = await loginAs(app, UserRole.administrador);
    await request(app.getHttpServer())
      .post("/commissions/rules")
      .set(authHeader(adminToken))
      .send({
        sellerUserId: sellerId,
        periodType: "mensual",
        periodValue: "2026-06",
        percent: 10,
      })
      .expect(201);

    const invoiceId = await createInvoice("order-accrual-1", 1000000);
    const paymentId = await pay(invoiceId, 500000, "2026-06-15");

    const rows = commissions.filter((c) => c.invoiceId === invoiceId);
    expect(rows).toHaveLength(1);
    expect(rows[0].sellerUserId).toBe(sellerId);
    expect(rows[0].paymentId).toBe(paymentId);
    expect(Number(rows[0].base)).toBe(500000);
    expect(Number(rows[0].percent)).toBe(10);
    expect(Number(rows[0].amount)).toBe(50000);
    expect(rows[0].status).toBe("causada");
  });

  it("accrues the remaining 50% when the invoice is fully paid", async () => {
    const invoiceId = (invoices as Array<any>).find(
      (i) => i.orderId === "order-accrual-1",
    ).id;
    await pay(invoiceId, 500000, "2026-06-20");

    const rows = commissions.filter((c) => c.invoiceId === invoiceId);
    expect(rows).toHaveLength(2);
    const total = rows.reduce((sum, c) => sum + Number(c.amount), 0);
    expect(total).toBe(100000);
  });

  it("reverses the accrued commission on a subsequent credit note", async () => {
    const invoiceId = await createInvoice("order-accrual-2", 800000);
    await pay(invoiceId, 400000, "2026-06-15");

    expect(
      commissions.filter(
        (c) => c.invoiceId === invoiceId && c.status === "causada",
      ),
    ).toHaveLength(1);

    const token = await loginAs(app, UserRole.facturacion);
    await request(app.getHttpServer())
      .post("/returns")
      .set(authHeader(token))
      .send({
        customerId: "customer-1",
        invoiceId,
        amount: 400000,
        reason: "Devolucion de mercancia",
      })
      .expect(201);

    const rows = commissions.filter((c) => c.invoiceId === invoiceId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("reversada");
  });

  it("does not accrue when the seller has no rule for the period", async () => {
    const invoiceId = await createInvoice("order-accrual-3", 500000);
    await pay(invoiceId, 500000, "2026-06-15");

    expect(commissions.filter((c) => c.invoiceId === invoiceId)).toHaveLength(
      0,
    );
  });

  // Reverso proporcional: factura 1.2M pagada 2x500k al 10% (causado 100k) +
  // credito parcial de 100k -> revierte 100k x 10% = 10k, NO los 100k.
  // (La factura es de 1.2M y no de 1M exacto porque ReturnsService topa la
  // nota credito al saldo pendiente: sobre una factura totalmente pagada no
  // hay credito posible. La matematica del reverso es la misma.)
  it("reverses only the proportional slice on a partial credit note", async () => {
    const invoiceId = await createInvoice("order-accrual-4", 1200000);
    await pay(invoiceId, 500000, "2026-06-15");
    await pay(invoiceId, 500000, "2026-06-20");

    const before = commissions.filter((c) => c.invoiceId === invoiceId);
    expect(before).toHaveLength(2);
    expect(before.reduce((sum, c) => sum + Number(c.amount), 0)).toBe(100000);

    const token = await loginAs(app, UserRole.facturacion);
    await request(app.getHttpServer())
      .post("/returns")
      .set(authHeader(token))
      .send({
        customerId: "customer-1",
        invoiceId,
        amount: 100000,
        reason: "Devolucion parcial",
      })
      .expect(201);

    const rows = commissions.filter((c) => c.invoiceId === invoiceId);
    expect(rows).toHaveLength(2);
    // Ninguna fila se marca reversada: el reverso es parcial.
    expect(rows.map((c) => c.status)).toEqual(["causada", "causada"]);
    const reversed = rows.reduce((sum, c) => sum + Number(c.reversedAmount), 0);
    expect(reversed).toBe(10000);
    const net = rows.reduce(
      (sum, c) => sum + (Number(c.amount) - Number(c.reversedAmount)),
      0,
    );
    expect(net).toBe(90000);
  });

  it("marks rows reversada once partial credits cover the full accrual", async () => {
    const invoiceId = await createInvoice("order-accrual-8", 1000000);
    await pay(invoiceId, 500000, "2026-06-15");

    const token = await loginAs(app, UserRole.facturacion);
    async function credit(amount: number) {
      await request(app.getHttpServer())
        .post("/returns")
        .set(authHeader(token))
        .send({
          customerId: "customer-1",
          invoiceId,
          amount,
          reason: "Devolucion parcial",
        })
        .expect(201);
    }

    await credit(250000);
    let rows = commissions.filter((c) => c.invoiceId === invoiceId);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].reversedAmount)).toBe(25000);
    expect(rows[0].status).toBe("causada");

    await credit(250000);
    rows = commissions.filter((c) => c.invoiceId === invoiceId);
    expect(Number(rows[0].reversedAmount)).toBe(50000);
    expect(rows[0].status).toBe("reversada");
  });

  // Fallback mensual -> trimestral -> anual en la causacion.
  it("accrues with the trimestral rule when no mensual rule exists", async () => {
    const adminToken = await loginAs(app, UserRole.administrador);
    await request(app.getHttpServer())
      .post("/commissions/rules")
      .set(authHeader(adminToken))
      .send({
        sellerUserId: sellerId,
        periodType: "trimestral",
        periodValue: "2026-Q3",
        percent: 7.5,
      })
      .expect(201);

    // Julio: sin regla mensual 2026-07 -> cae al trimestral 2026-Q3.
    const invoiceId = await createInvoice("order-accrual-5", 1000000);
    await pay(invoiceId, 1000000, "2026-07-10");

    const rows = commissions.filter((c) => c.invoiceId === invoiceId);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].percent)).toBe(7.5);
    expect(Number(rows[0].amount)).toBe(75000);
  });

  it("prefers the mensual rule over trimestral/anual when it exists", async () => {
    const adminToken = await loginAs(app, UserRole.administrador);
    await request(app.getHttpServer())
      .post("/commissions/rules")
      .set(authHeader(adminToken))
      .send({
        sellerUserId: sellerId,
        periodType: "mensual",
        periodValue: "2026-07",
        percent: 10,
      })
      .expect(201);

    const invoiceId = await createInvoice("order-accrual-6", 1000000);
    await pay(invoiceId, 1000000, "2026-07-15");

    const rows = commissions.filter((c) => c.invoiceId === invoiceId);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].percent)).toBe(10);
    expect(Number(rows[0].amount)).toBe(100000);
  });

  it("accrues with the anual rule when no mensual/trimestral rule exists", async () => {
    const adminToken = await loginAs(app, UserRole.administrador);
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

    // Octubre (Q4): sin mensual 2026-10 ni trimestral 2026-Q4 -> anual 2026.
    const invoiceId = await createInvoice("order-accrual-7", 1000000);
    await pay(invoiceId, 1000000, "2026-10-05");

    const rows = commissions.filter((c) => c.invoiceId === invoiceId);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].percent)).toBe(4);
    expect(Number(rows[0].amount)).toBe(40000);
  });

  // Tope del reverso: factura 1M con solo 200k pagados (causado 20k al 10%) +
  // credito de 800k (cabe en el saldo pendiente de 800k) -> revierte 20k
  // (todo lo causado), nunca 800k x 10% = 80k.
  it("never reverses more than the accrued amount", async () => {
    const invoiceId = await createInvoice("order-accrual-9", 1000000);
    await pay(invoiceId, 200000, "2026-06-15");

    const token = await loginAs(app, UserRole.facturacion);
    await request(app.getHttpServer())
      .post("/returns")
      .set(authHeader(token))
      .send({
        customerId: "customer-1",
        invoiceId,
        amount: 800000,
        reason: "Devolucion mayor que lo pagado",
      })
      .expect(201);

    const rows = commissions.filter((c) => c.invoiceId === invoiceId);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].reversedAmount)).toBe(20000);
    expect(rows[0].status).toBe("reversada");
  });
});

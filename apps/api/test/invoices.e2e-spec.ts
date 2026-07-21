import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { InvoiceStatus, PaymentMethod, Prisma, UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { R2StorageService } from "../src/shared/r2-storage.service";
import { refreshTokenStub } from "./helpers/login-as";
import { matchesOrderWhere, OrderWhereStub } from "./helpers/order-where";

declare global {
  // eslint-disable-next-line no-var
  var __APP__: ReturnType<INestApplication["getHttpServer"]> | undefined;
}

describe("Invoices", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  const passwordHash =
    "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";
  const auditLogs: Array<Record<string, unknown>> = [];
  const invoices: Array<Record<string, unknown>> = [];
  const payments: Array<Record<string, unknown>> = [];

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
      id: "facturacion-user-id",
      name: "Facturacion",
      email: "facturacion@norgtech.local",
      passwordHash,
      role: UserRole.facturacion,
      active: true,
    },
    {
      id: "comercial-user-id",
      name: "Comercial",
      email: "comercial@norgtech.local",
      passwordHash,
      role: UserRole.comercial,
      active: true,
    },
  ];

  const customers = [
    {
      id: "customer-1",
      displayName: "Agro Norte",
      taxId: "900111222-1",
      creditLimit: new Prisma.Decimal(5000000),
      paymentDays: 30,
      createdBy: "admin-user-id",
      updatedBy: "admin-user-id",
      assignedToUserId: "comercial-user-id",
      companyId: "company-1",
    },
    {
      id: "customer-2",
      displayName: "Agro Sur",
      taxId: "900333444-1",
      creditLimit: null,
      paymentDays: null,
      createdBy: "admin-user-id",
      updatedBy: "admin-user-id",
      assignedToUserId: null,
      companyId: "company-1",
    },
    {
      id: "customer-tight",
      displayName: "Agro Cupo",
      taxId: "900555666-1",
      creditLimit: new Prisma.Decimal(1000000),
      paymentDays: 30,
      createdBy: "admin-user-id",
      updatedBy: "admin-user-id",
      assignedToUserId: null,
      companyId: "company-1",
    },
  ];

  const orders = [
    {
      id: "order-1",
      customerId: "customer-1",
      orderNumber: "PED-000001",
      status: "entregado",
      subtotal: new Prisma.Decimal(100000),
      total: new Prisma.Decimal(119000),
      createdBy: "admin-user-id",
      updatedBy: "admin-user-id",
    },
    // Pedido que ya agota el cupo de customer-tight (entregado => ya suma
    // exposicion) y que todavia no tiene factura.
    {
      id: "order-tight",
      customerId: "customer-tight",
      orderNumber: "PED-000900",
      status: "entregado",
      subtotal: new Prisma.Decimal(840336.13),
      total: new Prisma.Decimal(1000000),
      createdBy: "admin-user-id",
      updatedBy: "admin-user-id",
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
    {
      id: "company-2",
      name: "Otra Empresa",
      legalName: "Otra Empresa SAS",
      nit: "900777666-1",
      prefix: "OTR",
      isActive: true,
    },
  ];

  const listInvoices = (where: any, sourceInvoices: Array<Record<string, unknown>>) =>
    [...sourceInvoices].filter((invoice) => {
      const startsWith = where?.invoiceNumber?.startsWith;
      const statusFilter = where?.status;
      const statusNot = typeof statusFilter === "object" ? statusFilter?.not : undefined;
      const statusNotIn = typeof statusFilter === "object" ? statusFilter?.notIn : undefined;
      const exactStatus = typeof statusFilter === "string" ? statusFilter : undefined;
      if (where?.orderId && invoice.orderId !== where.orderId) return false;
      if (startsWith && !String(invoice.invoiceNumber).startsWith(startsWith)) return false;
      if (statusNot && invoice.status === statusNot) return false;
      if (statusNotIn?.includes(invoice.status)) return false;
      if (exactStatus && invoice.status !== exactStatus) return false;
      return true;
    });

  const hasInvoiceNumber = (invoiceNumber: string, sourceInvoices: Array<Record<string, unknown>>) =>
    sourceInvoices.some((invoice) => invoice.invoiceNumber === invoiceNumber);

  const hasActiveOrderInvoice = (orderId: string, sourceInvoices: Array<Record<string, unknown>>) =>
    sourceInvoices.some((invoice) => invoice.orderId === orderId && invoice.status !== InvoiceStatus.anulada);

  beforeAll(async () => {
    const user = {
      findUnique: async ({
        where,
      }: {
        where: { email?: string; id?: string };
      }) => {
        if (where.email) {
          return users.find((u) => u.email === where.email) ?? null;
        }
        return users.find((u) => u.id === where.id) ?? null;
      },
    };

    const customer = {
      findUnique: async ({ where: { id } }: { where: { id: string } }) => {
        return customers.find((c) => c.id === id) ?? null;
      },
    };

    const company = {
      findUnique: async ({
        where,
      }: {
        where: { id?: string; prefix?: string };
      }) => {
        if (where.id) {
          return companies.find((c) => c.id === where.id) ?? null;
        }
        if (where.prefix) {
          return companies.find((c) => c.prefix === where.prefix) ?? null;
        }
        return companies[0] ?? null;
      },
    };

    const order = {
      findUnique: async ({ where: { id } }: { where: { id: string } }) => {
        return orders.find((o) => o.id === id) ?? null;
      },
      // CreditService.getCustomerExposure suma pedidos aprobados sin factura activa.
      findMany: async ({ where }: { where?: OrderWhereStub } = {}) =>
        orders.filter((o) => matchesOrderWhere(o, where, invoices as any)),
    };

    const txStub = {
      user,
      refreshToken: refreshTokenStub(),
      customer,
      company,
      order,
      invoice: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          if (hasInvoiceNumber(String(data.invoiceNumber), invoices)) {
            throw new Prisma.PrismaClientKnownRequestError(
              "Unique constraint failed on the fields: (`invoiceNumber`)",
              {
                code: "P2002",
                clientVersion: "test",
                meta: { target: ["invoiceNumber"] },
              },
            );
          }
          if (data.orderId && hasActiveOrderInvoice(String(data.orderId), invoices)) {
            throw new Prisma.PrismaClientKnownRequestError(
              "Unique constraint failed on the fields: (`orderId`)",
              {
                code: "P2002",
                clientVersion: "test",
                meta: { target: ["orderId"] },
              },
            );
          }
          const invoice = {
            id: `invoice-${invoices.length + 1}`,
            ...data,
            totalPaid: 0,
            status: "emitida",
            createdAt: new Date(),
            updatedAt: new Date(),
            company: companies.find((c) => c.id === data.companyId) ?? null,
            customer: customers.find((c) => c.id === data.customerId),
            order: orders.find((o) => o.id === data.orderId) ?? null,
            payments: [],
          };
          invoices.push(invoice);
          return invoice;
        },
        findUnique: async ({ where: { id } }: { where: { id: string } }) => {
          return invoices.find((i) => (i as any).id === id) ?? null;
        },
        findMany: async ({ where }: { where?: any }) => listInvoices(where ?? {}, invoices),
        count: async () => invoices.length,
        aggregate: async ({ where }: { where: any }) => ({
          _sum: {
            totalAmount: invoices
              // Honrar customerId: sin esto la exposicion de un cliente incluia
              // las facturas de todos los demas y de cualquier test previo.
              .filter((invoice) => !where?.customerId || (invoice as any).customerId === where.customerId)
              .filter((invoice) => !where?.status?.notIn?.includes(invoice.status))
              .reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0),
          },
        }),
        update: async ({
          where: { id },
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const idx = invoices.findIndex((i) => (i as any).id === id);
          if (idx >= 0) {
            invoices[idx] = {
              ...invoices[idx],
              ...data,
              updatedAt: new Date(),
            };
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
      auditLog: {
        create: async () => undefined,
        findMany: async () => auditLogs,
      },
      // Row lock de CreditService.assertCreditLimit. El stub no tiene
      // transacciones reales, asi que solo debe devolver una fila (no vacia,
      // o el lock lanzaria "Cliente no encontrado").
      $queryRaw: async () => [{ id: "locked" }],
    };

    const prismaStub = {
      ...txStub,
      $transaction: async (fn: any) => fn(txStub),
    };

    const auditStub = {
      record: async (payload: Record<string, unknown>) => {
        auditLogs.push(payload);
      },
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
    await app.close();
  });

  async function getToken(email: string) {
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password: "Admin123*" });
    return res.body.accessToken;
  }

  it("should create an invoice", async () => {
    const token = await getToken("admin@norgtech.local");
    const response = await request(app.getHttpServer())
      .post("/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({
        companyId: "company-1",
        customerId: "customer-1",
        orderId: "order-1",
        subtotal: 100000,
        taxAmount: 19000,
        totalAmount: 119000,
        notes: "Test invoice",
      });

    expect(response.status).toBe(201);
    expect(response.body.customerId).toBe("customer-1");
    expect(response.body.status).toBe("emitida");
    expect(Number(response.body.totalAmount)).toBe(119000);
  });

  it("does not double-count the linked order when invoicing it directly (ORD-01)", async () => {
    // order-tight ya consume los 1.000.000 de cupo de customer-tight. Emitir su
    // factura por ese mismo importe no puede leerse como 2.000.000: sin
    // excludeOrderId el pedido y su factura se cuentan dos veces.
    const token = await getToken("admin@norgtech.local");
    const response = await request(app.getHttpServer())
      .post("/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({
        companyId: "company-1",
        customerId: "customer-tight",
        orderId: "order-tight",
        subtotal: 840336.13,
        taxAmount: 159663.87,
        totalAmount: 1000000,
      });

    expect(response.status).toBe(201);
    expect(Number(response.body.totalAmount)).toBe(1000000);
  });

  it("should reject invoice whose empresa does not match customer empresa", async () => {
    const token = await getToken("admin@norgtech.local");
    const response = await request(app.getHttpServer())
      .post("/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({
        companyId: "company-2",
        customerId: "customer-1",
        subtotal: 100000,
        taxAmount: 19000,
        totalAmount: 119000,
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invoice company does not match customer company");
  });

  it("should reject duplicate invoice numbers", async () => {
    const token = await getToken("admin@norgtech.local");
    const first = await request(app.getHttpServer())
      .post("/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({
        companyId: "company-1",
        customerId: "customer-1",
        invoiceNumber: "NOR-900",
        subtotal: 100000,
        taxAmount: 19000,
        totalAmount: 119000,
      });

    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post("/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({
        companyId: "company-1",
        customerId: "customer-1",
        invoiceNumber: "NOR-900",
        subtotal: 100000,
        taxAmount: 19000,
        totalAmount: 119000,
      });

    expect(second.status).toBe(400);
    expect(second.body.message).toBe("Invoice number already exists");
  });

  it("should reject invoice exceeding credit limit", async () => {
    const token = await getToken("admin@norgtech.local");
    const response = await request(app.getHttpServer())
      .post("/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({
        companyId: "company-1",
        customerId: "customer-1",
        subtotal: 6000000,
        taxAmount: 1140000,
        totalAmount: 7140000,
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("Credito excedido");
  });

  it("should list invoices", async () => {
    const token = await getToken("facturacion@norgtech.local");
    const response = await request(app.getHttpServer())
      .get("/invoices")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it("should update invoice status", async () => {
    const token = await getToken("admin@norgtech.local");
    const invoice = invoices[0];
    const response = await request(app.getHttpServer())
      .patch(`/invoices/${(invoice as any).id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "enviada" });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("enviada");
  });

  it("should reject invalid status transition", async () => {
    const token = await getToken("admin@norgtech.local");
    const invoice = invoices[0];
    const response = await request(app.getHttpServer())
      .patch(`/invoices/${(invoice as any).id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "emitida" });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("Invalid invoice status transition");
  });

  it("should register a payment and update invoice to pagada", async () => {
    const token = await getToken("admin@norgtech.local");
    const invoice = invoices[0];
    const response = await request(app.getHttpServer())
      .post("/invoices/payments")
      .set("Authorization", `Bearer ${token}`)
      .send({
        invoiceId: (invoice as any).id,
        amount: 119000,
        method: PaymentMethod.transferencia,
        reference: "TRX-123",
      });

    expect(response.status).toBe(201);
    expect(response.body.payment.amount).toBeDefined();
    expect(response.body.invoice.status).toBe("pagada");
  });

  it("should get invoice summary", async () => {
    const token = await getToken("facturacion@norgtech.local");
    const response = await request(app.getHttpServer())
      .get("/invoices/summary")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.totalInvoices).toBeGreaterThanOrEqual(0);
    expect(response.body.aging).toBeDefined();
  });

  it("should reject payment by comercial role", async () => {
    const token = await getToken("comercial@norgtech.local");
    const response = await request(app.getHttpServer())
      .post("/invoices/payments")
      .set("Authorization", `Bearer ${token}`)
      .send({
        invoiceId: "invoice-1",
        amount: 1000,
        method: PaymentMethod.efectivo,
      });

    expect(response.status).toBe(403);
  });
});

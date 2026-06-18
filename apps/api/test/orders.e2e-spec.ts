import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { InvoiceStatus, Prisma, UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

declare global {
  // eslint-disable-next-line no-var
  var __APP__: ReturnType<INestApplication["getHttpServer"]> | undefined;
  // eslint-disable-next-line no-var
  var __ADMIN_TOKEN__: string | undefined;
}

describe("Orders", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  const passwordHash = "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";
  const auditLogs: Array<Record<string, unknown>> = [];
  const orders: Array<Record<string, unknown>> = [];
  const invoices: Array<Record<string, any>> = [];
  const products: Array<Record<string, unknown>> = [
    {
      id: "product-1",
      name: "Fertilizante",
      sku: "FERT-001",
      unit: "kg",
      presentation: "Bulto 50kg",
      basePrice: 50000,
      active: true,
      createdBy: "admin-user-id",
      updatedBy: "admin-user-id",
      createdAt: new Date("2026-04-29T00:00:00.000Z"),
      updatedAt: new Date("2026-04-29T00:00:00.000Z"),
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
    {
      id: "logistics-user-id",
      name: "Logistics",
      email: "logistics@norgtech.local",
      passwordHash,
      role: UserRole.logistica,
      active: true,
    },
  ];
  const whatsAppConversations: Array<Record<string, unknown>> = [
    {
      id: "conversation-customer-1",
      customerId: "customer-1",
      contactId: "contact-1",
      senderType: "cliente",
    },
    {
      id: "conversation-customer-2",
      customerId: "customer-2",
      contactId: "contact-2",
      senderType: "cliente",
    },
    {
      id: "conversation-unassigned",
      customerId: null,
      contactId: null,
      senderType: "desconocido",
    },
  ];

  beforeAll(async () => {
    const user = {
      findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email) {
          return users.find((u) => u.email === where.email) ?? null;
        }
        return users.find((u) => u.id === where.id) ?? null;
      },
    };

    const customer = {
      findUnique: async ({ where: { id } }: { where: { id: string } }) => {
        if (id === "customer-1") {
          return {
            id: "customer-1",
            displayName: "Agro Norte",
            taxId: "900111222-1",
            address: "Calle 10 # 20-30",
            createdBy: "admin-user-id",
            updatedBy: "admin-user-id",
            creditLimit: new Prisma.Decimal(5000000),
            paymentDays: 30,
            assignedToUserId: "comercial-user-id",
            segment: { discountPercent: 0 },
          };
        }
        if (id === "customer-2") {
          return {
            id: "customer-2",
            displayName: "Agro Sur",
            taxId: "900333444-1",
            address: "Carrera 40 # 50-60",
            createdBy: "admin-user-id",
            updatedBy: "admin-user-id",
            creditLimit: null,
            paymentDays: null,
            assignedToUserId: null,
            segment: { discountPercent: 10 },
          };
        }
        return null;
      },
    };

    const prismaStub = {
      user,
      customer,
      company: {
        findUnique: async ({ where }: { where: { id?: string; prefix?: string } }) => {
          if (where.id) return companies.find((c) => c.id === where.id) ?? null;
          if (where.prefix) return companies.find((c) => c.prefix === where.prefix) ?? null;
          return companies[0] ?? null;
        },
      },
      invoice: {
        findFirst: async ({ where }: { where: any }) => {
          const startsWith = where.invoiceNumber?.startsWith;
          const statusFilter = where.status;
          const statusNot = typeof statusFilter === "object" ? statusFilter?.not : undefined;
          const statusNotIn = typeof statusFilter === "object" ? statusFilter?.notIn : undefined;
          const exactStatus = typeof statusFilter === "string" ? statusFilter : undefined;

          const matches = (invoice: Record<string, any>) => {
            if (where.orderId && invoice.orderId !== where.orderId) return false;
            if (startsWith && !String(invoice.invoiceNumber).startsWith(startsWith)) return false;
            if (statusNot && invoice.status === statusNot) return false;
            if (statusNotIn?.includes(invoice.status)) return false;
            if (exactStatus && invoice.status !== exactStatus) return false;
            return true;
          };

          return [...invoices]
            .filter(matches)
            .sort((a, b) => String(b.invoiceNumber).localeCompare(String(a.invoiceNumber)))[0] ?? null;
        },
        aggregate: async ({ where }: { where: any }) => {
          const total = invoices
            .filter((invoice) => invoice.customerId === where.customerId)
            .filter((invoice) => !where.status?.notIn?.includes(invoice.status))
            .reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0);
          return { _sum: { totalAmount: total } };
        },
      },
      product: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          products.find((p) => p.id === id) ?? null,
      },
      opportunity: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) => {
          if (id === "opportunity-customer-1") {
            return { id, customerId: "customer-1" };
          }
          if (id === "opportunity-customer-2") {
            return { id, customerId: "customer-2" };
          }
          return null;
        },
      },
      quote: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) => {
          if (id === "quote-customer-1") {
            return { id, customerId: "customer-1" };
          }
          if (id === "quote-customer-2") {
            return { id, customerId: "customer-2" };
          }
          return null;
        },
      },
      whatsAppConversation: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          whatsAppConversations.find((conversation) => conversation.id === id) ?? null,
      },
      order: {
        create: async () => {
          throw new Error("order.create must run inside a transaction");
        },
        count: async () => orders.length,
        findFirst: async ({ where }: { where: any }) => {
          const startsWith = where.orderNumber?.startsWith;
          if (!startsWith) return null;
          return [...orders]
            .filter((order) => String(order.orderNumber).startsWith(startsWith))
            .sort((a, b) => String(b.orderNumber).localeCompare(String(a.orderNumber)))[0] ?? null;
        },
        findUnique: async ({ where: { id } }: { where: { id: string } }) => {
          const found = orders.find((o) => o.id === id);
          return found ? JSON.parse(JSON.stringify(found)) : null;
        },
        findMany: async () => orders.map((o) => JSON.parse(JSON.stringify(o))),
        update: async ({ where: { id }, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const idx = orders.findIndex((o) => o.id === id);
          if (idx === -1) return null;
          orders[idx] = { ...orders[idx], ...data, updatedAt: new Date() };
          return JSON.parse(JSON.stringify(orders[idx]));
        },
      },
      orderItem: {
        createMany: async () => ({ count: 0 }),
      },
      billingRequest: {
        create: async () => {
          throw new Error("billingRequest.create must run inside a transaction");
        },
        findMany: async () => [],
      },
      auditLog: {
        create: async () => {
          throw new Error("auditLog.create must run inside a transaction");
        },
        findMany: async () => auditLogs,
      },
      $transaction: async <T>(
        callback: (tx: any) => Promise<T>,
      ) => {
        const pendingOrders: Array<Record<string, unknown>> = [];
        const pendingAuditLogs: Array<Record<string, unknown>> = [];
        const pendingBillingRequests: Array<Record<string, unknown>> = [];
        const pendingInvoices: Array<Record<string, any>> = [];

        const result = await callback({
          company: prismaStub.company,
          customer,
          invoice: {
            findFirst: prismaStub.invoice.findFirst,
            aggregate: prismaStub.invoice.aggregate,
            create: async ({ data, include }: { data: Record<string, any>; include?: Record<string, unknown> }) => {
              const invoice = {
                id: `invoice-${invoices.length + pendingInvoices.length + 1}`,
                ...data,
                status: data.status ?? InvoiceStatus.emitida,
                totalPaid: data.totalPaid ?? 0,
                createdAt: new Date("2026-04-29T00:00:00.000Z"),
                updatedAt: new Date("2026-04-29T00:00:00.000Z"),
                company: include?.company ? companies.find((c) => c.id === data.companyId) : undefined,
                customer: include?.customer ? { id: data.customerId, displayName: "Agro Norte" } : undefined,
                order: include?.order ? { id: data.orderId, orderNumber: "NOR-001", status: "facturado" } : undefined,
                payments: include?.payments ? [] : undefined,
              };
              pendingInvoices.push(invoice);
              return invoice;
            },
          },
          order: {
            create: async ({ data, include }: { data: Record<string, unknown>; include?: Record<string, unknown> }) => {
              const order = {
                id: `order-${orders.length + pendingOrders.length + 1}`,
                status: "recibido",
                ...data,
                companyId: data.companyId ?? "company-1",
                items: include?.items ? (data.items as { create: unknown[] }).create : undefined,
                company: include?.company ? companies[0] : undefined,
                invoices: include?.invoices ? [] : undefined,
                customer: include?.customer ? { id: "customer-1", displayName: "Agro Norte" } : undefined,
                opportunity: null,
                sourceQuote: null,
                sourceConversation: include?.sourceConversation
                  ? whatsAppConversations.find(
                      (conversation) => conversation.id === data.sourceConversationId,
                    ) ?? null
                  : undefined,
                createdAt: new Date("2026-04-29T00:00:00.000Z"),
                updatedAt: new Date("2026-04-29T00:00:00.000Z"),
              };
              pendingOrders.push(order);
              return order;
            },
            findUnique: async ({ where: { id } }: { where: { id: string } }) => {
              const found = orders.find((o) => o.id === id) ?? pendingOrders.find((o) => o.id === id);
              return found ? JSON.parse(JSON.stringify(found)) : null;
            },
            update: async ({ where: { id }, data }: { where: { id: string }; data: Record<string, unknown> }) => {
              let idx = orders.findIndex((o) => o.id === id);
              if (idx !== -1) {
                orders[idx] = { ...orders[idx], ...data, updatedAt: new Date() };
                return JSON.parse(JSON.stringify(orders[idx]));
              }
              idx = pendingOrders.findIndex((o) => o.id === id);
              if (idx !== -1) {
                pendingOrders[idx] = { ...pendingOrders[idx], ...data, updatedAt: new Date() };
                return JSON.parse(JSON.stringify(pendingOrders[idx]));
              }
              return null;
            },
          },
          auditLog: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              const entry = { id: `audit-${auditLogs.length + pendingAuditLogs.length + 1}`, createdAt: new Date(), ...data };
              pendingAuditLogs.push(entry);
              return entry;
            },
          },
          billingRequest: {
            create: async ({ data, include }: { data: Record<string, unknown>; include?: Record<string, unknown> }) => {
              const br = {
                id: `billing-request-${auditLogs.length + pendingBillingRequests.length + 1}`,
                ...data,
                customer: include?.customer ? { id: "customer-1", displayName: "Agro Norte" } : undefined,
                opportunity: null,
                sourceOrder: include?.sourceOrder ? { id: data.sourceOrderId } : undefined,
                sourceQuote: null,
                status: "pendiente",
                createdAt: new Date("2026-04-29T00:00:00.000Z"),
                updatedAt: new Date("2026-04-29T00:00:00.000Z"),
              };
              pendingBillingRequests.push(br);
              return br;
            },
          },
        });

        orders.push(...pendingOrders);
        invoices.push(...pendingInvoices);
        auditLogs.push(...pendingAuditLogs);
        return result;
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

  async function getToken(email: string) {
    const response = await request(globalThis.__APP__)
      .post("/auth/login")
      .send({ email, password: "Admin123*" })
      .expect(200);
    return response.body.accessToken;
  }

  afterAll(async () => {
    globalThis.__ADMIN_TOKEN__ = undefined;
    globalThis.__APP__ = undefined;
    if (app) {
      await app.close();
    }
  });

  it("creates an order with items", async () => {
    const response = await request(globalThis.__APP__)
      .post("/orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        companyId: "company-1",
        items: [
          { productId: "product-1", quantity: 2, unitPrice: 50000 },
        ],
      })
      .expect(201);

    expect(response.body.items).toHaveLength(1);
    expect(Number(response.body.subtotal)).toBe(100000);
    expect(Number(response.body.items[0].taxAmount)).toBe(9500);
    expect(Number(response.body.items[0].totalWithTax)).toBe(119000);
    expect(Number(response.body.total)).toBe(119000);
  });

  it("creates a product-backed order with automatic segment discount pricing", async () => {
    const response = await request(globalThis.__APP__)
      .post("/orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-2",
        companyId: "company-1",
        items: [
          { productId: "product-1", quantity: 2, unitPrice: 99999 },
        ],
      })
      .expect(201);

    expect(response.body.items).toHaveLength(1);
    expect(Number(response.body.subtotal)).toBe(90000);
    expect(Number(response.body.items[0].taxAmount)).toBe(8550);
    expect(Number(response.body.items[0].totalWithTax)).toBe(107100);
    expect(Number(response.body.total)).toBe(107100);
    expect(Number(response.body.items[0].originalUnitPrice)).toBe(50000);
    expect(Number(response.body.items[0].discountPercent)).toBe(10);
    expect(Number(response.body.items[0].unitPrice)).toBe(45000);
    expect(response.body.items[0].presentationSnapshot).toBe("Bulto 50kg");
  });

  it("creates an order with custom item without discount", async () => {
    const response = await request(globalThis.__APP__)
      .post("/orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-2",
        companyId: "company-1",
        items: [
          { quantity: 3, unitPrice: 25000, notes: "Servicio especial" },
        ],
      })
      .expect(201);

    expect(response.body.items).toHaveLength(1);
    expect(Number(response.body.subtotal)).toBe(75000);
    expect(Number(response.body.total)).toBe(89250);
    expect(response.body.items[0].originalUnitPrice).toBeNull();
    expect(response.body.items[0].discountPercent).toBeNull();
    expect(Number(response.body.items[0].unitPrice)).toBe(25000);
  });

  it("creates an order with customer format fields and tax totals", async () => {
    const response = await request(globalThis.__APP__)
      .post("/orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        companyId: "company-1",
        sourceQuoteId: "quote-customer-1",
        purchaseOrderNumber: "OC-7788",
        orderDate: "2026-05-22",
        billingCompanyNameSnapshot: "Norgtech Facturacion SAS",
        branchNameSnapshot: "Sede Norte",
        dispatchAddressSnapshot: "Bodega cliente",
        requesterName: "Laura Cliente",
        requesterEmail: "laura@example.com",
        requesterRole: "Compras",
        requesterPhone: "3174407575",
        approvedQuoteConsecutive: "COT-900",
        deliveryInstructions: "Entregar en horario de oficina",
        receiverName: "Carlos Bodega",
        receiverEmail: "carlos@example.com",
        receiverPhone: "3150000000",
        receiverRole: "Almacenista",
        invoiceFilingPlace: "Oficina principal",
        approvalStatus: "aprobado",
        approvalReason: "Compra autorizada",
        approvalName: "Diana Gerente",
        reviewDate: "2026-05-23",
        preparedByName: "Admin",
        preparedByRole: "Comercial",
        items: [
          {
            productName: "Servicio de diagnostico",
            presentation: "Jornada",
            quantity: 1,
            unitPrice: 100000,
            taxPercent: 19,
          },
        ],
      })
      .expect(201);

    expect(response.body.orderNumber).toMatch(/^NOR-\d{3}$/);
    expect(response.body.purchaseOrderNumber).toBe("OC-7788");
    expect(response.body.customerNameSnapshot).toBe("Agro Norte");
    expect(response.body.customerNitSnapshot).toBe("900111222-1");
    expect(response.body.billingCompanyNameSnapshot).toBe("Norgtech Facturacion SAS");
    expect(response.body.branchNameSnapshot).toBe("Sede Norte");
    expect(response.body.dispatchAddressSnapshot).toBe("Bodega cliente");
    expect(response.body.requesterName).toBe("Laura Cliente");
    expect(response.body.receiverName).toBe("Carlos Bodega");
    expect(response.body.invoiceFilingPlace).toBe("Oficina principal");
    expect(Number(response.body.subtotal)).toBe(100000);
    expect(Number(response.body.items[0].taxAmount)).toBe(19000);
    expect(Number(response.body.items[0].totalWithTax)).toBe(119000);
    expect(Number(response.body.total)).toBe(119000);
    expect(response.body.items[0].productSnapshotName).toBe("Servicio de diagnostico");
    expect(response.body.items[0].presentationSnapshot).toBe("Jornada");
    expect(response.body.items[0].customProductName).toBe("Servicio de diagnostico");
  });

  it("creates an order linked to a WhatsApp conversation", async () => {
    const response = await request(globalThis.__APP__)
      .post("/orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        companyId: "company-1",
        sourceConversationId: "conversation-customer-1",
        items: [{ productId: "product-1", quantity: 1, unitPrice: 50000 }],
      })
      .expect(201);

    expect(response.body.sourceConversationId).toBe("conversation-customer-1");
    expect(response.body.sourceConversation.id).toBe("conversation-customer-1");
  });

  it("allows an unassigned WhatsApp conversation to seed an order", async () => {
    const response = await request(globalThis.__APP__)
      .post("/orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        companyId: "company-1",
        sourceConversationId: "conversation-unassigned",
        items: [{ productId: "product-1", quantity: 1, unitPrice: 50000 }],
      })
      .expect(201);

    expect(response.body.sourceConversationId).toBe("conversation-unassigned");
  });

  it("rejects WhatsApp conversations assigned to another customer", async () => {
    const response = await request(globalThis.__APP__)
      .post("/orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        companyId: "company-1",
        sourceConversationId: "conversation-customer-2",
        items: [{ productId: "product-1", quantity: 1, unitPrice: 50000 }],
      })
      .expect(400);

    expect(response.body.message).toBe("Conversation customer does not match order customer");
  });

  it("rejects missing WhatsApp conversations on orders", async () => {
    const response = await request(globalThis.__APP__)
      .post("/orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        companyId: "company-1",
        sourceConversationId: "missing-conversation",
        items: [{ productId: "product-1", quantity: 1, unitPrice: 50000 }],
      })
      .expect(404);

    expect(response.body.message).toBe("WhatsApp conversation not found");
  });

  it("rejects opportunities that do not belong to the order customer", async () => {
    const response = await request(globalThis.__APP__)
      .post("/orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        companyId: "company-1",
        opportunityId: "opportunity-customer-2",
        items: [{ productId: "product-1", quantity: 1, unitPrice: 50000 }],
      })
      .expect(400);

    expect(response.body.message).toBe("Opportunity does not belong to customer");
  });

  it("rejects quotes that do not belong to the order customer", async () => {
    const response = await request(globalThis.__APP__)
      .post("/orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        companyId: "company-1",
        sourceQuoteId: "quote-customer-2",
        items: [{ productId: "product-1", quantity: 1, unitPrice: 50000 }],
      })
      .expect(400);

    expect(response.body.message).toBe("Quote does not belong to customer");
  });

  it("transitions order status and sets dispatch/delivery dates", async () => {
    const createResponse = await request(globalThis.__APP__)
      .post("/orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        companyId: "company-1",
        items: [{ productId: "product-1", quantity: 1, unitPrice: 50000 }],
      })
      .expect(201);

    const orderId = createResponse.body.id;

    const step1 = await request(globalThis.__APP__)
      .patch(`/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "orden_facturacion" })
      .expect(200);
    expect(step1.body.status).toBe("orden_facturacion");

    const step2 = await request(globalThis.__APP__)
      .patch(`/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "facturado" })
      .expect(200);
    expect(step2.body.status).toBe("facturado");

    const step3 = await request(globalThis.__APP__)
      .patch(`/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "despachado" })
      .expect(200);
    expect(step3.body.status).toBe("despachado");
    expect(step3.body.dispatchDate).toBeTruthy();

    const step4 = await request(globalThis.__APP__)
      .patch(`/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "en_transito" })
      .expect(200);
    expect(step4.body.status).toBe("en_transito");

    const step5 = await request(globalThis.__APP__)
      .patch(`/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "entregado" })
      .expect(200);
    expect(step5.body.status).toBe("entregado");
    expect(step5.body.deliveryDate).toBeTruthy();
  });

  it("rejects invalid status transitions", async () => {
    const createResponse = await request(globalThis.__APP__)
      .post("/orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        companyId: "company-1",
        items: [{ productId: "product-1", quantity: 1, unitPrice: 50000 }],
      })
      .expect(201);

    await request(globalThis.__APP__)
      .patch(`/orders/${createResponse.body.id}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "entregado" })
      .expect(400);
  });

  it("updates logistics fields", async () => {
    const createResponse = await request(globalThis.__APP__)
      .post("/orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        companyId: "company-1",
        items: [{ productId: "product-1", quantity: 1, unitPrice: 50000 }],
      })
      .expect(201);

    const orderId = createResponse.body.id;

    const response = await request(globalThis.__APP__)
      .patch(`/orders/${orderId}/logistics`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        assignedLogisticsUserId: "logistics-user-id",
        committedDeliveryDate: "2026-05-01",
        carrierName: "Transportes Norte",
        trackingNumber: "GUIA-123",
        trackingUrl: "https://tracking.example.com/GUIA-123",
        deliveredToName: "Carlos Bodega",
        deliveryConfirmationNotes: "Recibido sin novedad",
        logisticsNotes: "Entrega prioritaria",
      })
      .expect(200);

    expect(response.body.assignedLogisticsUserId).toBe("logistics-user-id");
    expect(response.body.carrierName).toBe("Transportes Norte");
    expect(response.body.trackingNumber).toBe("GUIA-123");
    expect(response.body.trackingUrl).toBe("https://tracking.example.com/GUIA-123");
    expect(response.body.deliveredToName).toBe("Carlos Bodega");
    expect(response.body.deliveryConfirmationNotes).toBe("Recibido sin novedad");
    expect(response.body.logisticsNotes).toBe("Entrega prioritaria");
  });

  it("creates billing request from order when status is entregado", async () => {
    const createResponse = await request(globalThis.__APP__)
      .post("/orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        companyId: "company-1",
        items: [{ productId: "product-1", quantity: 1, unitPrice: 50000 }],
      })
      .expect(201);

    const orderId = createResponse.body.id;

    await request(globalThis.__APP__)
      .patch(`/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "orden_facturacion" })
      .expect(200);

    await request(globalThis.__APP__)
      .patch(`/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "facturado" })
      .expect(200);

    await request(globalThis.__APP__)
      .patch(`/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "despachado" })
      .expect(200);

    await request(globalThis.__APP__)
      .patch(`/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "en_transito" })
      .expect(200);

    await request(globalThis.__APP__)
      .patch(`/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "entregado" })
      .expect(200);

    const response = await request(globalThis.__APP__)
      .post(`/orders/${orderId}/billing-request`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .expect(201);

    expect(response.body.sourceType).toBe("order");
    expect(response.body.sourceOrderId).toBe(orderId);
  });

  it("exports an order using the customer XLSX format", async () => {
    const createResponse = await request(globalThis.__APP__)
      .post("/orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        companyId: "company-1",
        purchaseOrderNumber: "OC-EXPORT",
        requesterName: "Laura Cliente",
        requesterEmail: "laura@example.com",
        receiverName: "Carlos Bodega",
        invoiceFilingPlace: "Oficina principal",
        items: [{ productId: "product-1", quantity: 1, unitPrice: 50000 }],
      })
      .expect(201);

    const response = await request(globalThis.__APP__)
      .get(`/orders/${createResponse.body.id}/export`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .buffer()
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(response.headers["content-type"]).toContain("spreadsheetml.sheet");
    expect(response.body.length).toBeGreaterThan(1000);
  });

  it("creates an invoice from an order and marks it facturado", async () => {
    const token = await getToken("facturacion@norgtech.local");
    const createResponse = await request(globalThis.__APP__)
      .post("/orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        companyId: "company-1",
        items: [{ productId: "product-1", quantity: 2, unitPrice: 50000 }],
      })
      .expect(201);

    await request(globalThis.__APP__)
      .patch(`/orders/${createResponse.body.id}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "orden_facturacion" })
      .expect(200);

    const response = await request(globalThis.__APP__)
      .post(`/orders/${createResponse.body.id}/invoice`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    expect(response.body.id).toMatch(/^invoice-/);
    expect(response.body.orderId).toBe(createResponse.body.id);
    expect(response.body.customerId).toBe("customer-1");
    expect(response.body.companyId).toBe("company-1");
    expect(response.body.invoiceNumber).toMatch(/^NOR-\d{3}$/);
    expect(Number(response.body.subtotal)).toBe(100000);
    expect(Number(response.body.taxAmount)).toBe(19000);
    expect(Number(response.body.totalAmount)).toBe(119000);
    expect(response.body.status).toBe("emitida");

    const updatedOrder = orders.find((order) => order.id === createResponse.body.id);
    expect(updatedOrder?.status).toBe("facturado");
  });

  it("blocks a second active invoice for the same order", async () => {
    const token = await getToken("facturacion@norgtech.local");
    const createResponse = await request(globalThis.__APP__)
      .post("/orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        companyId: "company-1",
        items: [{ productId: "product-1", quantity: 1, unitPrice: 50000 }],
      })
      .expect(201);

    await request(globalThis.__APP__)
      .patch(`/orders/${createResponse.body.id}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "orden_facturacion" })
      .expect(200);

    await request(globalThis.__APP__)
      .post(`/orders/${createResponse.body.id}/invoice`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    const duplicate = await request(globalThis.__APP__)
      .post(`/orders/${createResponse.body.id}/invoice`)
      .set("Authorization", `Bearer ${token}`)
      .expect(400);

    expect(duplicate.body.message).toBe("Order already has an active invoice");
  });

  it("allows a new invoice when previous order invoice is anulada", async () => {
    const token = await getToken("facturacion@norgtech.local");
    const createResponse = await request(globalThis.__APP__)
      .post("/orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        companyId: "company-1",
        items: [{ productId: "product-1", quantity: 1, unitPrice: 50000 }],
      })
      .expect(201);

    await request(globalThis.__APP__)
      .patch(`/orders/${createResponse.body.id}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "orden_facturacion" })
      .expect(200);

    const first = await request(globalThis.__APP__)
      .post(`/orders/${createResponse.body.id}/invoice`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    const stored = invoices.find((invoice) => invoice.id === first.body.id);
    expect(stored).toBeDefined();
    stored!.status = InvoiceStatus.anulada;

    const second = await request(globalThis.__APP__)
      .post(`/orders/${createResponse.body.id}/invoice`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    expect(second.body.id).not.toBe(first.body.id);
  });

  it("calculates invoice due date from customer payment days", async () => {
    const token = await getToken("facturacion@norgtech.local");
    const createResponse = await request(globalThis.__APP__)
      .post("/orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        companyId: "company-1",
        items: [{ productId: "product-1", quantity: 1, unitPrice: 50000 }],
      })
      .expect(201);

    await request(globalThis.__APP__)
      .patch(`/orders/${createResponse.body.id}/status`)
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({ status: "orden_facturacion" })
      .expect(200);

    const response = await request(globalThis.__APP__)
      .post(`/orders/${createResponse.body.id}/invoice`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    const issue = new Date(response.body.issueDate);
    const due = new Date(response.body.dueDate);
    expect(Math.round((due.getTime() - issue.getTime()) / 86_400_000)).toBe(30);
  });

  it("does not move delivered orders backwards when invoicing", async () => {
    const token = await getToken("facturacion@norgtech.local");
    const createResponse = await request(globalThis.__APP__)
      .post("/orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        companyId: "company-1",
        items: [{ productId: "product-1", quantity: 1, unitPrice: 50000 }],
      })
      .expect(201);

    const stored = orders.find((order) => order.id === createResponse.body.id);
    expect(stored).toBeDefined();
    stored!.status = "entregado";

    await request(globalThis.__APP__)
      .post(`/orders/${createResponse.body.id}/invoice`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    expect(stored?.status).toBe("entregado");
  });

  it("rejects direct invoice creation from order for comercial role", async () => {
    const comercialToken = await getToken("comercial@norgtech.local");
    const createResponse = await request(globalThis.__APP__)
      .post("/orders")
      .set("Authorization", `Bearer ${globalThis.__ADMIN_TOKEN__}`)
      .send({
        customerId: "customer-1",
        companyId: "company-1",
        items: [{ productId: "product-1", quantity: 1, unitPrice: 50000 }],
      })
      .expect(201);

    await request(globalThis.__APP__)
      .post(`/orders/${createResponse.body.id}/invoice`)
      .set("Authorization", `Bearer ${comercialToken}`)
      .expect(403);
  });
});

import { CommercialExpenseStatus, NotificationType, OrderStatus } from "@prisma/client";
import { NotificationsService } from "../src/modules/notifications/notifications.service";
import { OrdersService } from "../src/modules/orders/orders.service";
import { CustomersService } from "../src/modules/customers/customers.service";
import { CommercialExpensesService } from "../src/modules/commercial-expenses/commercial-expenses.service";

describe("Emisor de pedido_hito", () => {
  const emitted: Array<Record<string, unknown>> = [];
  const emittedWriters: Array<unknown> = [];

  function makeOrdersService(order: Record<string, unknown>) {
    const tx = {
      order: {
        findUnique: async () => order,
        update: async ({ data }: { data: Record<string, unknown> }) => ({
          ...order,
          ...data,
          customer: { assignedToUserId: "seller-1", displayName: "Agro Norte" },
        }),
      },
      auditLog: { create: async () => ({}) },
    };

    const prisma = {
      $transaction: async (fn: (client: unknown) => Promise<unknown>) => fn(tx),
    };

    const notifications = {
      emit: async (input: Record<string, unknown>, writer: unknown) => {
        emitted.push(input);
        emittedWriters.push(writer);
        return { count: 1 };
      },
    } as unknown as NotificationsService;

    // Orden real del constructor de OrdersService:
    // (prisma, auditService, orderXlsxExportService, credit, whatsApp,
    //  pricingService, notifications)
    return {
      service: new OrdersService(
        prisma as never,
        { record: async () => ({}) } as never,
        {} as never,
        { assertCreditLimit: async () => undefined } as never,
        {} as never,
        {} as never,
        notifications,
      ),
      prisma,
      tx,
    };
  }

  beforeEach(() => {
    emitted.length = 0;
    emittedWriters.length = 0;
  });

  it("emite al pasar a facturado, con el estado como discriminante", async () => {
    const { service, prisma, tx } = makeOrdersService({
      id: "order-1",
      orderNumber: "NN-1042",
      status: OrderStatus.orden_facturacion,
      customerId: "customer-1",
      sellerUserId: "seller-1",
      total: 100,
      trackingNumber: null,
    });

    await service.updateStatus(
      { id: "admin-1" } as never,
      "order-1",
      { status: OrderStatus.facturado } as never,
    );

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      userIds: ["seller-1"],
      type: NotificationType.pedido_hito,
      entityType: "order",
      entityId: "order-1",
      discriminator: OrderStatus.facturado,
    });
    expect(emitted[0].title).toContain("NN-1042");

    // El emit debe recibir el mismo cliente transaccional que
    // OrdersService.updateStatus usa para el cambio de estado, no el
    // cliente de nivel superior ni nada indefinido.
    expect(emittedWriters[0]).toBeDefined();
    expect(emittedWriters[0]).toBe(tx);
    expect(emittedWriters[0]).not.toBe(prisma);
  });

  it("no emite en las transiciones intermedias", async () => {
    const { service } = makeOrdersService({
      id: "order-2",
      orderNumber: "NN-1043",
      status: OrderStatus.recibido,
      customerId: "customer-1",
      sellerUserId: "seller-1",
      total: 100,
      trackingNumber: null,
    });

    await service.updateStatus(
      { id: "admin-1" } as never,
      "order-2",
      { status: OrderStatus.orden_facturacion } as never,
    );

    expect(emitted).toHaveLength(0);
  });
});

describe("Emisor de cliente_asignado", () => {
  const emitted: Array<Record<string, unknown>> = [];
  const emittedWriters: Array<unknown> = [];

  beforeEach(() => {
    emitted.length = 0;
    emittedWriters.length = 0;
  });

  function makeCustomersService(existing: Record<string, unknown>) {
    const tx = {
      customer: {
        update: async ({ data }: { data: Record<string, unknown> }) => ({
          ...existing,
          ...data,
          contacts: [],
        }),
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          id: "customer-new-1",
          ...data,
          contacts: [],
        }),
      },
      customerGoal: { create: async () => ({}) },
      auditLog: { create: async () => ({}) },
    };

    const prisma = {
      customer: { findUnique: async () => existing },
      customerSegment: { findUnique: async () => ({ id: "seg-1" }) },
      company: { findUnique: async () => ({ id: "company-1", isActive: true }) },
      user: { findUnique: async () => ({ id: "seller-2", active: true }) },
      $transaction: async (fn: (client: unknown) => Promise<unknown>) => fn(tx),
    };

    const notifications = {
      emit: async (input: Record<string, unknown>, writer: unknown) => {
        emitted.push(input);
        emittedWriters.push(writer);
        return { count: 1 };
      },
    } as unknown as NotificationsService;

    return {
      service: new CustomersService(
        prisma as never,
        { record: async () => ({}) } as never,
        notifications,
      ),
      prisma,
      tx,
    };
  }

  it("emite cuando el cliente cambia de responsable", async () => {
    const { service, prisma, tx } = makeCustomersService({
      id: "customer-1",
      displayName: "Agro Norte",
      assignedToUserId: "seller-1",
    });

    await service.update({ id: "admin-1" } as never, "customer-1", {
      assignedToUserId: "seller-2",
    } as never);

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      userIds: ["seller-2"],
      type: NotificationType.cliente_asignado,
      entityType: "customer",
      entityId: "customer-1",
    });

    // El emit debe recibir el mismo cliente transaccional que
    // CustomersService.update usa para el cambio de responsable, no el
    // cliente de nivel superior ni nada indefinido.
    expect(emittedWriters[0]).toBeDefined();
    expect(emittedWriters[0]).toBe(tx);
    expect(emittedWriters[0]).not.toBe(prisma);
  });

  it("no emite si el responsable no cambia", async () => {
    const { service } = makeCustomersService({
      id: "customer-1",
      displayName: "Agro Norte",
      assignedToUserId: "seller-2",
    });

    await service.update({ id: "admin-1" } as never, "customer-1", {
      assignedToUserId: "seller-2",
    } as never);

    expect(emitted).toHaveLength(0);
  });

  it("emite cuando el cliente nace con responsable", async () => {
    const { service, prisma, tx } = makeCustomersService({});

    const created = await service.create({ id: "admin-1" } as never, {
      legalName: "Agro Sur SA",
      displayName: "Agro Sur",
      segmentId: "seg-1",
      companyId: "company-1",
      assignedToUserId: "seller-2",
      contacts: [
        {
          fullName: "Juan Perez",
          isPrimary: true,
          phone: "3000000000",
          email: "juan@example.com",
        },
      ],
    } as never);

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      userIds: ["seller-2"],
      type: NotificationType.cliente_asignado,
      entityType: "customer",
      entityId: (created as Record<string, unknown>).id,
    });

    // Sin discriminante: una sola notificacion por (usuario, cliente) para
    // siempre, igual que en el emisor de update().
    expect(emitted[0].discriminator).toBeUndefined();

    // El emit debe recibir el mismo cliente transaccional que
    // CustomersService.create usa para crear el cliente, no el cliente de
    // nivel superior ni nada indefinido.
    expect(emittedWriters[0]).toBeDefined();
    expect(emittedWriters[0]).toBe(tx);
    expect(emittedWriters[0]).not.toBe(prisma);
  });
});

describe("Emisor de gasto_resuelto", () => {
  const emitted: Array<Record<string, unknown>> = [];
  const emittedWriters: Array<unknown> = [];

  beforeEach(() => {
    emitted.length = 0;
    emittedWriters.length = 0;
  });

  it("emite al aprobar, hacia quien reporto el gasto", async () => {
    const expense = {
      id: "exp-1",
      status: CommercialExpenseStatus.pendiente as CommercialExpenseStatus,
      submittedByUserId: "seller-1",
      amount: 120000,
      category: "transporte",
    };

    const tx = {
      commercialExpense: {
        findUnique: async () => ({
          ...expense,
          status: expense.status,
        }),
        updateMany: async () => ({ count: 1 }),
      },
      auditLog: { create: async () => ({}) },
    };

    let calls = 0;
    tx.commercialExpense.findUnique = async () => {
      calls++;
      return calls === 1
        ? { ...expense }
        : { ...expense, status: CommercialExpenseStatus.aprobado };
    };

    const prisma = {
      $transaction: async (fn: (client: unknown) => Promise<unknown>) => fn(tx),
    };

    const notifications = {
      emit: async (input: Record<string, unknown>, writer: unknown) => {
        emitted.push(input);
        emittedWriters.push(writer);
        return { count: 1 };
      },
    } as unknown as NotificationsService;

    // Orden real: (prisma, auditService, storageService, exportService,
    //              whatsAppService, notifications)
    const service = new CommercialExpensesService(
      prisma as never,
      { record: async () => ({}) } as never,
      {} as never,
      {} as never,
      { notifyExpenseCorrection: async () => undefined } as never,
      notifications,
    );

    await service.updateStatus(
      { id: "admin-1", role: "administrador" } as never,
      "exp-1",
      { status: CommercialExpenseStatus.aprobado } as never,
    );

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      userIds: ["seller-1"],
      type: NotificationType.gasto_resuelto,
      entityType: "commercial_expense",
      entityId: "exp-1",
      discriminator: CommercialExpenseStatus.aprobado,
    });

    // Igual que en los otros dos emisores: el emit debe recibir el cliente
    // transaccional de updateStatus, no el cliente de nivel superior.
    expect(emittedWriters[0]).toBeDefined();
    expect(emittedWriters[0]).toBe(tx);
    expect(emittedWriters[0]).not.toBe(prisma);
  });
});

import { NotificationType, OrderStatus } from "@prisma/client";
import { NotificationsService } from "../src/modules/notifications/notifications.service";
import { OrdersService } from "../src/modules/orders/orders.service";

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

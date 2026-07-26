import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma, UserRole, VisitStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  MAX_RANGE_DAYS,
  bogotaDate,
  dayBoundary,
  shiftDays,
} from "../analytics/analytics.shared";
import {
  FOLLOW_UP_TASK_SETTLED_STATUSES,
  dayRangeInZone,
  followUpTaskOverdueWhere,
  weekRangeInZone,
} from "../../shared/overdue";
import { AuthUser } from "../auth/types/authenticated-request";

type CommercialCustomer = {
  id: string;
  displayName: string;
  assignedToUserId?: string | null;
  assignedToUser?: { id: string; name: string } | null;
  active?: boolean;
};

type CommercialOrder = {
  id: string;
  customerId: string;
  orderDate: Date;
  zone?: string | null;
  total: unknown;
  sellerUserId?: string | null;
  customer?: CommercialCustomer | null;
  customerZone?: { zone: { name: string }; assignedTo?: { name: string } | null } | null;
};

type CommercialOrderItem = {
  id: string;
  orderId: string;
  productId?: string | null;
  productSnapshotName: string;
  productSnapshotSku: string;
  quantity: unknown;
  totalWithTax?: unknown;
  subtotal?: unknown;
  order: CommercialOrder;
};

type CommercialUser = {
  id: string;
  name: string;
};

type CommercialProduct = {
  id: string;
  sku: string;
  name: string;
};

type ProductAccumulator = {
  productId: string | null;
  sku: string;
  name: string;
  quantity: number;
  revenue: number;
  orders: Set<string>;
  lastOrderDate: Date | null;
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ALCANCE POR EMPRESA (DASH-05).
   *
   * El selector de empresa manda `companyId` a los tres endpoints, pero solo
   * `activeOrders` puede honrarlo: en el schema, la UNICA entidad de este
   * resumen con relacion a `Company` es `Order` (`Order.companyId`, no nulo).
   *
   * NO son company-scoped, porque NO EXISTE la relacion en el modelo de datos:
   *   - openQuotes        (Quote        -> customer; sin companyId)
   *   - pipelineValue     (Opportunity  -> customer; sin companyId)
   *   - closedDeals       (Opportunity  -> customer; sin companyId)
   *   - weeklyVisits      (Visit        -> customer; sin companyId)
   *   - pendingFollowUps  (FollowUpTask -> customer; sin companyId)
   *   - overdueFollowUps  (FollowUpTask -> customer; sin companyId)
   *   - todayVisits       (Visit        -> customer; sin companyId)
   *   - myQueue           (FollowUpTask + Visit; idem)
   *   - recentActivity    (AuditLog; no tiene entidad de negocio tipada)
   *
   * Se podria derivar una empresa indirecta (p.ej. Opportunity -> orders ->
   * companyId), pero seria INVENTARLA: una oportunidad sin pedidos desapareceria
   * del pipeline al elegir empresa, que es peor que no filtrar. La decision es
   * explicita: estos contadores son globales aunque haya empresa seleccionada.
   */
  async getSummary(user: AuthUser, companyId?: string) {
    const now = new Date();

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Los limites de dia/semana se calculan en America/Bogota, NO en la zona del
    // proceso: en un host UTC (produccion) "hoy" empezaba 5 horas antes y la
    // agenda mostraba el dia equivocado (clase de bug VIS-03/FUP-01).
    const { start: startOfWeek, end: endOfWeek } = weekRangeInZone(now);
    const { start: todayStart, end: todayEnd } = dayRangeInZone(now);

    const [
      openQuotes,
      pipelineAgg,
      closedDeals,
      activeOrders,
      weeklyVisits,
      pendingFollowUps,
      overdueFollowUps,
      todayVisits,
      myUpcomingTasks,
      myUpcomingVisits,
      recentLogs,
    ] = await Promise.all([
      this.prisma.quote.count({
        where: {
          status: { in: ["abierta", "en_negociacion"] },
        },
      }),
      this.prisma.opportunity.aggregate({
        where: {
          stage: { notIn: ["venta_cerrada", "perdida"] },
        },
        _sum: { estimatedValue: true },
      }),
      this.prisma.opportunity.count({
        where: {
          stage: "venta_cerrada",
          closedAt: { gte: thirtyDaysAgo },
        },
      }),
      this.prisma.order.count({
        where: {
          status: { not: "entregado" },
          ...(companyId ? { companyId } : {}),
        },
      }),
      this.prisma.visit.count({
        where: {
          scheduledAt: { gte: startOfWeek, lte: endOfWeek },
        },
      }),
      // PENDIENTE = abierta y AUN NO vencida.
      // Antes contaba `status=pendiente AND dueAt <= now`, que es EXACTAMENTE el
      // conjunto de vencidas: las dos tarjetas estaban intercambiadas.
      this.prisma.followUpTask.count({
        where: {
          status: { notIn: FOLLOW_UP_TASK_SETTLED_STATUSES },
          dueAt: { gte: now },
        },
      }),
      // VENCIDA se deriva con la regla compartida (src/shared/overdue.ts), no
      // leyendo la columna `status=vencida`: no hay scheduler que la escriba, asi
      // que ese contador solo veia filas del difunto markOverdue.
      this.prisma.followUpTask.count({
        where: followUpTaskOverdueWhere(now),
      }),
      this.prisma.visit.count({
        where: {
          scheduledAt: { gte: todayStart, lte: todayEnd },
          status: VisitStatus.programada,
        },
      }),
      // DASH-03: la cola se llena porque create() ya asigna al creador por
      // defecto; antes ninguna tarea/visita creada desde la UI tenia
      // assignedToUserId y esto salia vacio para todo el mundo.
      // "Abierta" = no zanjada por un humano (regla compartida), en vez de
      // enumerar [pendiente, vencida] a mano.
      this.prisma.followUpTask.findMany({
        where: {
          assignedToUserId: user.id,
          status: { notIn: FOLLOW_UP_TASK_SETTLED_STATUSES },
        },
        orderBy: { dueAt: "asc" },
        take: 5,
        include: { customer: true },
      }),
      this.prisma.visit.findMany({
        where: {
          assignedToUserId: user.id,
          status: VisitStatus.programada,
          scheduledAt: { gte: now },
        },
        orderBy: { scheduledAt: "asc" },
        take: 5,
        include: { customer: true },
      }),
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    const userIds = [...new Set(recentLogs.map((l) => l.actorUserId))];
    const users =
      userIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true },
          })
        : [];

    const userMap = new Map(users.map((u) => [u.id, u.name]));

    const recentActivity = recentLogs.map((log) => ({
      id: log.id,
      entityType: log.entityType,
      entityId: log.entityId,
      action: log.action,
      actorName: userMap.get(log.actorUserId) || "Desconocido",
      createdAt: log.createdAt,
    }));

    const myQueue = [
      ...myUpcomingTasks.map((t) => ({
        id: t.id,
        kind: "task" as const,
        title: t.title,
        customerName: t.customer?.displayName ?? "Sin cliente",
        scheduledAt: t.dueAt,
        status: t.status,
      })),
      ...myUpcomingVisits.map((v) => ({
        id: v.id,
        kind: "visit" as const,
        title: v.summary || "Visita programada",
        customerName: v.customer?.displayName ?? "Sin cliente",
        scheduledAt: v.scheduledAt,
        status: v.status,
      })),
    ].sort(
      (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    ).slice(0, 5);

    return {
      openQuotes,
      pipelineValue: Number(pipelineAgg._sum.estimatedValue ?? 0),
      closedDeals,
      activeOrders,
      weeklyVisits,
      pendingFollowUps,
      overdueFollowUps,
      todayVisits,
      myQueue,
      recentActivity,
    };
  }

  async getCommercialAdvancedSummary(
    user: AuthUser,
    daysQuery?: string,
    companyId?: string,
    fromQuery?: string,
    toQuery?: string,
  ) {
    const { from, to, days } = this.resolveWindow(daysQuery, fromQuery, toQuery);
    const isSellerScoped = user.role === UserRole.comercial;
    // La cartera (clientes dormidos) SI es un concepto de asignacion: son "mis
    // clientes", los tenga o no atendidos otro vendedor en un pedido suelto.
    const customerScope = isSellerScoped ? { assignedToUserId: user.id } : {};
    // DASH-04: la venta se atribuye por `Order.sellerUserId`, NO por el vendedor
    // asignado al cliente. Con el criterio viejo, un comercial que le vende a un
    // cliente asignado a otro veia CEROS en todo el panel. Es la misma regla que
    // usa seller-goals (`sellerUserId: goal.userId`), y hay indice compuesto
    // [sellerUserId, orderDate] para sostenerla.
    const orderSellerScope = isSellerScoped ? { sellerUserId: user.id } : {};
    const orderWhereExtra = companyId ? { companyId } : {};

    const [orders, orderItems, customers, activeProducts] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          orderDate: { gte: from, lte: to },
          ...orderSellerScope,
          ...orderWhereExtra,
        },
        include: {
          customer: {
            select: {
              id: true,
              displayName: true,
              assignedToUserId: true,
            },
          },
          customerZone: {
            include: {
              zone: { select: { name: true } },
            },
          },
        },
      }) as Promise<CommercialOrder[]>,
      this.prisma.orderItem.findMany({
        where: {
          order: {
            orderDate: { lte: to },
            ...orderSellerScope,
            ...orderWhereExtra,
          },
        },
        include: {
          order: {
            include: {
              customer: {
                select: {
                  id: true,
                  displayName: true,
                  assignedToUserId: true,
                },
              },
            },
          },
        },
      }) as Promise<CommercialOrderItem[]>,
      this.prisma.customer.findMany({
        where: { active: true, ...customerScope },
        include: {
          assignedToUser: {
            select: { id: true, name: true },
          },
        },
      }) as Promise<CommercialCustomer[]>,
      this.prisma.product.findMany({
        where: { active: true },
        select: { id: true, sku: true, name: true },
      }) as Promise<CommercialProduct[]>,
    ]);

    // Los nombres deben cubrir DOS conjuntos distintos: el vendedor asignado a
    // cada cliente (cartera / dormantCustomers) y el vendedor de cada pedido
    // (bySeller, ahora atribuido por Order.sellerUserId). Un comercial que vende
    // a un cliente ajeno solo aparece en el segundo: si no se resolviera aqui,
    // saldria como "Sin nombre".
    const sellerIds = [
      ...new Set(
        [
          ...customers.map((customer) => customer.assignedToUserId),
          ...orders.map((order) => order.sellerUserId),
        ].filter((id): id is string => !!id),
      ),
    ];
    const sellers =
      sellerIds.length > 0
        ? ((await this.prisma.user.findMany({
            where: { id: { in: sellerIds } },
            select: { id: true, name: true },
          })) as CommercialUser[])
        : [];
    const sellerNameById = new Map(sellers.map((seller) => [seller.id, seller.name]));
    for (const customer of customers) {
      if (customer.assignedToUser) {
        sellerNameById.set(customer.assignedToUser.id, customer.assignedToUser.name);
      }
    }

    const customerById = new Map(customers.map((customer) => [customer.id, customer]));
    const windowOrderIds = new Set(orders.map((order) => order.id));
    const windowItems = orderItems.filter((item) => windowOrderIds.has(item.orderId));

    const bySellerMap = new Map<
      string,
      {
        sellerId: string | null;
        sellerName: string;
        orders: number;
        revenue: number;
        customerIds: Set<string>;
      }
    >();
    const byCustomerMap = new Map<
      string,
      {
        customerId: string;
        customerName: string;
        orders: number;
        revenue: number;
        lastOrderDate: Date | null;
      }
    >();
    const byZoneMap = new Map<
      string,
      { zone: string; orders: number; revenue: number; customerIds: Set<string> }
    >();

    for (const order of orders) {
      const revenue = this.toNumber(order.total);
      const customer = order.customer ?? customerById.get(order.customerId);
      // DASH-04: quien VENDIO el pedido, no a quien esta asignado el cliente.
      const sellerId = order.sellerUserId ?? null;
      const sellerKey = sellerId ?? "unassigned";
      const sellerBucket = this.getOrSet(bySellerMap, sellerKey, {
        sellerId,
        sellerName: sellerId ? sellerNameById.get(sellerId) ?? "Sin nombre" : "Sin vendedor",
        orders: 0,
        revenue: 0,
        customerIds: new Set<string>(),
      });
      sellerBucket.orders += 1;
      sellerBucket.revenue += revenue;
      sellerBucket.customerIds.add(order.customerId);

      const customerBucket = this.getOrSet(byCustomerMap, order.customerId, {
        customerId: order.customerId,
        customerName: customer?.displayName ?? order.customerId,
        orders: 0,
        revenue: 0,
        lastOrderDate: null,
      });
      customerBucket.orders += 1;
      customerBucket.revenue += revenue;
      customerBucket.lastOrderDate = this.maxDate(customerBucket.lastOrderDate, order.orderDate);

      const zoneName = order.customerZone?.zone?.name?.trim() || "Sin zona";
      const zoneBucket = this.getOrSet(byZoneMap, zoneName, {
        zone: zoneName,
        orders: 0,
        revenue: 0,
        customerIds: new Set<string>(),
      });
      zoneBucket.orders += 1;
      zoneBucket.revenue += revenue;
      zoneBucket.customerIds.add(order.customerId);
    }

    const productCatalog = new Map<string, ProductAccumulator>();
    const windowProductMap = new Map<string, ProductAccumulator>();
    for (const product of activeProducts) {
      productCatalog.set(product.id, {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        quantity: 0,
        revenue: 0,
        orders: new Set<string>(),
        lastOrderDate: null,
      });
    }

    for (const item of orderItems) {
      const productKey = this.productKey(item);
      const catalogBucket = this.getOrSet(productCatalog, productKey, {
        productId: item.productId ?? null,
        sku: item.productSnapshotSku,
        name: item.productSnapshotName,
        quantity: 0,
        revenue: 0,
        orders: new Set<string>(),
        lastOrderDate: null,
      });
      catalogBucket.lastOrderDate = this.maxDate(catalogBucket.lastOrderDate, item.order.orderDate);

      if (!windowOrderIds.has(item.orderId)) {
        continue;
      }

      const quantity = this.toNumber(item.quantity);
      const revenue = this.toNumber(item.totalWithTax ?? item.subtotal);
      catalogBucket.quantity += quantity;
      catalogBucket.revenue += revenue;
      catalogBucket.orders.add(item.orderId);

      const productBucket = this.getOrSet(windowProductMap, productKey, {
        productId: item.productId ?? null,
        sku: item.productSnapshotSku,
        name: item.productSnapshotName,
        quantity: 0,
        revenue: 0,
        orders: new Set<string>(),
        lastOrderDate: null,
      });
      productBucket.quantity += quantity;
      productBucket.revenue += revenue;
      productBucket.orders.add(item.orderId);
      productBucket.lastOrderDate = this.maxDate(productBucket.lastOrderDate, item.order.orderDate);
    }

    const lastOrderByCustomer = new Map<string, Date>();
    for (const item of orderItems) {
      const current = lastOrderByCustomer.get(item.order.customerId) ?? null;
      lastOrderByCustomer.set(
        item.order.customerId,
        this.maxDate(current, item.order.orderDate) ?? item.order.orderDate,
      );
    }

    // DEVOLUCIONES (RET-02). Restan de la venta neta, asi que DEBEN acotarse con
    // el mismo criterio que los pedidos o la resta cruza universos:
    // `netRevenue = ventas(empresa X) - devoluciones(TODAS las empresas)`
    // sub-reportaba el neto de cada empresa. Igual con el vendedor.
    //
    // Una devolucion no tiene `companyId` propio: la empresa se deriva de su
    // pedido o de su factura (ambos opcionales en el schema).
    //
    // REGLA para devoluciones SIN pedido NI factura (sin empresa derivable):
    // con empresa seleccionada NO se cuentan. No se pueden atribuir a la empresa
    // elegida sin adivinar, y contarlas en todas restaria el mismo dinero varias
    // veces (una por empresa), inflando la perdida. Sin empresa seleccionada si
    // cuentan: la vista global las incluye todas. Es decir, filtran igual que los
    // pedidos, que siempre tienen empresa.
    const returnCompanyScope: Prisma.ReturnWhereInput = companyId
      ? { OR: [{ order: { companyId } }, { invoice: { companyId } }] }
      : {};
    // El vendedor de una devolucion es el del pedido devuelto (misma regla de
    // atribucion que la venta). Una devolucion sin pedido no tiene vendedor
    // determinable y por eso no entra en el panel de un comercial.
    const returnSellerScope: Prisma.ReturnWhereInput = isSellerScoped
      ? { order: { sellerUserId: user.id } }
      : {};
    const returns = await this.prisma.return.findMany({
      where: {
        returnDate: { gte: from, lte: to },
        ...returnCompanyScope,
        ...returnSellerScope,
      },
      select: {
        amount: true,
        customerId: true,
        order: { select: { sellerUserId: true } },
      },
    });
    const returnsByCustomer = new Map<string, number>();
    const returnsBySeller = new Map<string, number>();
    let returnsTotal = 0;
    for (const ret of returns) {
      const amount = this.toNumber(ret.amount);
      returnsTotal += amount;
      returnsByCustomer.set(
        ret.customerId,
        (returnsByCustomer.get(ret.customerId) ?? 0) + amount,
      );
      // Debe usar la MISMA clave que `bySellerMap` (Order.sellerUserId). Con
      // customer.assignedToUserId, la devolucion se le restaba a un vendedor
      // distinto del que registro la venta.
      const sellerKey = ret.order?.sellerUserId ?? "unassigned";
      returnsBySeller.set(sellerKey, (returnsBySeller.get(sellerKey) ?? 0) + amount);
    }

    const bySeller = [...bySellerMap.values()]
      .map((bucket) => {
        const returnsAmount = returnsBySeller.get(bucket.sellerId ?? "unassigned") ?? 0;
        return {
          sellerId: bucket.sellerId,
          sellerName: bucket.sellerName,
          orders: bucket.orders,
          revenue: this.roundMoney(bucket.revenue),
          returns: this.roundMoney(returnsAmount),
          netRevenue: this.roundMoney(bucket.revenue - returnsAmount),
          customers: bucket.customerIds.size,
        };
      })
      .sort((a, b) => b.netRevenue - a.netRevenue);

    const byCustomer = [...byCustomerMap.values()]
      .map((bucket) => {
        const returnsAmount = returnsByCustomer.get(bucket.customerId) ?? 0;
        return {
          ...bucket,
          revenue: this.roundMoney(bucket.revenue),
          returns: this.roundMoney(returnsAmount),
          netRevenue: this.roundMoney(bucket.revenue - returnsAmount),
          lastOrderDate: bucket.lastOrderDate?.toISOString() ?? null,
        };
      })
      .sort((a, b) => b.netRevenue - a.netRevenue);

    // Recompra: clientes con >=2 pedidos en la ventana recompraron; los de 1 solo pedido, no.
    const repeatCustomers = byCustomer.filter((customer) => customer.orders >= 2);
    const noRepurchaseCustomers = byCustomer.filter((customer) => customer.orders === 1);
    const repurchase = {
      repeatCount: repeatCustomers.length,
      noRepurchaseCount: noRepurchaseCustomers.length,
      repurchaseRate: byCustomer.length
        ? this.roundMoney((repeatCustomers.length / byCustomer.length) * 100)
        : 0,
      repeatCustomers,
      noRepurchaseCustomers,
    };

    const byProduct = [...windowProductMap.values()]
      .map((bucket) => this.serializeProductBucket(bucket))
      .sort((a, b) => b.revenue - a.revenue);

    const byZone = [...byZoneMap.values()]
      .map((bucket) => ({
        zone: bucket.zone,
        orders: bucket.orders,
        revenue: this.roundMoney(bucket.revenue),
        customers: bucket.customerIds.size,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      window: {
        days,
        from: from.toISOString(),
        to: to.toISOString(),
      },
      totals: {
        orders: orders.length,
        revenue: this.roundMoney(
          orders.reduce((sum, order) => sum + this.toNumber(order.total), 0),
        ),
        returns: this.roundMoney(returnsTotal),
        // RET-02: este total es de la VENTANA (`window.days`), no historico. El
        // modulo de Devoluciones suma todas las devoluciones de siempre, asi que
        // los dos numeros no tienen por que coincidir; ninguno esta mal, pero la
        // tarjeta debe decir de que ventana habla. `returnsWindowDays` existe
        // para que el front lo etiquete sin recalcularlo.
        returnsWindowDays: days,
        netRevenue: this.roundMoney(
          orders.reduce((sum, order) => sum + this.toNumber(order.total), 0) - returnsTotal,
        ),
        units: this.roundQuantity(
          windowItems.reduce((sum, item) => sum + this.toNumber(item.quantity), 0),
        ),
        customers: new Set(orders.map((order) => order.customerId)).size,
        products: windowProductMap.size,
      },
      bySeller,
      byCustomer,
      byProduct,
      byZone,
      repurchase,
      customerRanking: byCustomer.map((customer, index) => ({ rank: index + 1, ...customer })),
      lowRotationProducts: [...productCatalog.values()]
        .map((bucket) => this.serializeProductBucket(bucket))
        .sort((a, b) => {
          if (a.quantity !== b.quantity) {
            return a.quantity - b.quantity;
          }
          const aDate = a.lastOrderDate ? new Date(a.lastOrderDate).getTime() : 0;
          const bDate = b.lastOrderDate ? new Date(b.lastOrderDate).getTime() : 0;
          return aDate - bDate;
        })
        .slice(0, 10),
      dormantCustomers: customers
        .map((customer) => {
          const lastOrderDate = lastOrderByCustomer.get(customer.id) ?? null;
          return {
            customerId: customer.id,
            customerName: customer.displayName,
            sellerId: customer.assignedToUserId ?? null,
            sellerName: customer.assignedToUserId
              ? sellerNameById.get(customer.assignedToUserId) ?? "Sin nombre"
              : "Sin vendedor",
            lastOrderDate: lastOrderDate?.toISOString() ?? null,
            daysSinceLastOrder: lastOrderDate
              ? Math.floor((to.getTime() - lastOrderDate.getTime()) / 86_400_000)
              : null,
          };
        })
        .filter((customer) => !customer.lastOrderDate || new Date(customer.lastOrderDate) < from)
        .sort(
          (a, b) =>
            (b.daysSinceLastOrder ?? Number.MAX_SAFE_INTEGER) -
            (a.daysSinceLastOrder ?? Number.MAX_SAFE_INTEGER),
        )
        .slice(0, 25),
    };
  }

  /**
   * Ventana del panel comercial.
   *
   * `days` es la ventana movil de siempre (lo que usa el portal). Si llega
   * `from` y/o `to` (YYYY-MM-DD), manda el rango explicito — asi un comercial
   * puede preguntar por "junio" o "el trimestre pasado" sin necesitar
   * /analytics/*, que le esta vedado por rol.
   *
   * Los limites de dia, el formato y el tope de rango salen de
   * `analytics.shared`: el criterio de fechas (y la zona horaria de Bogota) es
   * uno solo para toda la app, no una copia por modulo.
   */
  private resolveWindow(daysQuery?: string, fromQuery?: string, toQuery?: string) {
    if (!fromQuery && !toQuery) {
      const days = this.normalizeDays(daysQuery);
      const to = new Date();
      const from = new Date(to);
      from.setDate(to.getDate() - days);
      return { from, to, days };
    }

    // Rango parcial: `to` sin `from` cierra hacia atras con la ventana de `days`;
    // `from` sin `to` llega hasta hoy.
    const toDate = toQuery ?? bogotaDate(new Date());
    const fromDate = fromQuery ?? shiftDays(toDate, -this.normalizeDays(daysQuery));

    const from = dayBoundary(fromDate, "start");
    const to = dayBoundary(toDate, "end");
    if (from > to) {
      throw new BadRequestException("El rango es invalido: `from` es posterior a `to`.");
    }
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
    if (days > MAX_RANGE_DAYS) {
      throw new BadRequestException(`El rango no puede superar ${MAX_RANGE_DAYS} dias.`);
    }
    return { from, to, days };
  }

  private normalizeDays(daysQuery?: string) {
    const parsed = Number.parseInt(daysQuery ?? "", 10);
    if (!Number.isFinite(parsed)) {
      return 90;
    }
    return Math.min(Math.max(parsed, 1), 365);
  }

  private toNumber(value: unknown) {
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string") {
      return Number(value);
    }
    if (value && typeof value === "object" && "toNumber" in value) {
      return (value as { toNumber: () => number }).toNumber();
    }
    if (value && typeof value === "object" && "toString" in value) {
      return Number(value.toString());
    }
    return 0;
  }

  private roundMoney(value: number) {
    return Math.round(value * 100) / 100;
  }

  private roundQuantity(value: number) {
    return Math.round(value * 10_000) / 10_000;
  }

  private getOrSet<TKey, TValue>(map: Map<TKey, TValue>, key: TKey, fallback: TValue) {
    const existing = map.get(key);
    if (existing) {
      return existing;
    }
    map.set(key, fallback);
    return fallback;
  }

  private maxDate(a: Date | null, b: Date) {
    return !a || b > a ? b : a;
  }

  private productKey(
    item: Pick<CommercialOrderItem, "productId" | "productSnapshotSku" | "productSnapshotName">,
  ) {
    return item.productId ?? `${item.productSnapshotSku}:${item.productSnapshotName}`;
  }

  private serializeProductBucket(bucket: ProductAccumulator) {
    return {
      productId: bucket.productId,
      sku: bucket.sku,
      name: bucket.name,
      quantity: this.roundQuantity(bucket.quantity),
      revenue: this.roundMoney(bucket.revenue),
      orders: bucket.orders.size,
      lastOrderDate: bucket.lastOrderDate?.toISOString() ?? null,
    };
  }
}

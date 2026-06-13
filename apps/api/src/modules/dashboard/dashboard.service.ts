import { Injectable } from "@nestjs/common";
import { FollowUpTaskStatus, UserRole, VisitStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
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
  customer?: CommercialCustomer | null;
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

  async getSummary(user: AuthUser, companyId?: string) {
    const now = new Date();

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() + diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

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
      this.prisma.followUpTask.count({
        where: {
          status: FollowUpTaskStatus.pendiente,
          dueAt: { lte: now },
        },
      }),
      this.prisma.followUpTask.count({
        where: {
          status: FollowUpTaskStatus.vencida,
        },
      }),
      this.prisma.visit.count({
        where: {
          scheduledAt: { gte: todayStart, lte: todayEnd },
          status: VisitStatus.programada,
        },
      }),
      this.prisma.followUpTask.findMany({
        where: {
          assignedToUserId: user.id,
          status: { in: [FollowUpTaskStatus.pendiente, FollowUpTaskStatus.vencida] },
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

  async getCommercialAdvancedSummary(user: AuthUser, daysQuery?: string, companyId?: string) {
    const days = this.normalizeDays(daysQuery);
    const to = new Date();
    const from = new Date(to);
    from.setDate(to.getDate() - days);
    const isSellerScoped = user.role === UserRole.comercial;
    const customerScope = isSellerScoped ? { assignedToUserId: user.id } : {};
    const orderCustomerScope = isSellerScoped ? { customer: { assignedToUserId: user.id } } : {};
    const orderWhereExtra = companyId ? { companyId } : {};

    const [orders, orderItems, customers, activeProducts] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          orderDate: { gte: from, lte: to },
          ...orderCustomerScope,
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
        },
      }) as Promise<CommercialOrder[]>,
      this.prisma.orderItem.findMany({
        where: {
          order: {
            orderDate: { lte: to },
            ...orderCustomerScope,
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

    const sellerIds = [
      ...new Set(
        customers
          .map((customer) => customer.assignedToUserId)
          .filter((id): id is string => !!id),
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
      const sellerId = customer?.assignedToUserId ?? null;
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

      const zone = order.zone?.trim() || "Sin zona";
      const zoneBucket = this.getOrSet(byZoneMap, zone, {
        zone,
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

    const bySeller = [...bySellerMap.values()]
      .map((bucket) => ({
        sellerId: bucket.sellerId,
        sellerName: bucket.sellerName,
        orders: bucket.orders,
        revenue: this.roundMoney(bucket.revenue),
        customers: bucket.customerIds.size,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const byCustomer = [...byCustomerMap.values()]
      .map((bucket) => ({
        ...bucket,
        revenue: this.roundMoney(bucket.revenue),
        lastOrderDate: bucket.lastOrderDate?.toISOString() ?? null,
      }))
      .sort((a, b) => b.revenue - a.revenue);

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

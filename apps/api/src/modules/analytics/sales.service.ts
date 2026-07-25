import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  CsvColumn,
  ResolvedFilters,
  bucketKey,
  bucketsBetween,
  envelope,
  money,
  orderWhere,
  percent,
  previousYearRange,
  quantity,
  ratio,
  returnWhere,
  toNumber,
} from "./analytics.shared";

/** Filas por breakdown antes de truncar. El CSV siempre lleva todo. */
const TOP_ROWS = 20;

type Bucket = { gross: number; net: number; orders: number };

interface Accumulator {
  key: string;
  label: string;
  extra?: Record<string, unknown>;
  revenue: number;
  orders: Set<string>;
  customers: Set<string>;
  quantity: number;
  lastOrderDate: Date | null;
}

function bump(map: Map<string, Accumulator>, key: string, label: string, extra?: Record<string, unknown>) {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = {
      key,
      label,
      extra,
      revenue: 0,
      orders: new Set(),
      customers: new Set(),
      quantity: 0,
      lastOrderDate: null,
    };
    map.set(key, bucket);
  }
  return bucket;
}

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  async getSales(filters: ResolvedFilters) {
    const previous = previousYearRange(filters);

    const [orders, returns, previousOrders, previousReturns] = await Promise.all([
      this.prisma.order.findMany({
        where: orderWhere(filters),
        select: {
          id: true,
          orderDate: true,
          total: true,
          customerId: true,
          companyId: true,
          sellerUserId: true,
          seller: { select: { id: true, name: true } },
          company: { select: { id: true, name: true, prefix: true } },
          customerZone: { select: { zoneId: true, zone: { select: { name: true } } } },
          customer: {
            select: {
              id: true,
              displayName: true,
              city: true,
              department: true,
              segmentId: true,
              segment: { select: { id: true, name: true } },
            },
          },
          items: {
            select: {
              productId: true,
              productSnapshotSku: true,
              productSnapshotName: true,
              presentationSnapshot: true,
              quantity: true,
              unitPrice: true,
              originalUnitPrice: true,
              subtotal: true,
            },
          },
        },
      }),
      this.prisma.return.findMany({
        where: returnWhere(filters),
        select: { amount: true, returnDate: true },
      }),
      this.prisma.order.findMany({
        where: { ...orderWhere(filters), orderDate: { gte: previous.from, lte: previous.to } },
        select: { id: true, orderDate: true, total: true },
      }),
      this.prisma.return.findMany({
        where: { ...returnWhere(filters), returnDate: { gte: previous.from, lte: previous.to } },
        select: { amount: true, returnDate: true },
      }),
    ]);

    // --- totales ---------------------------------------------------------
    const grossRevenue = orders.reduce((sum, order) => sum + toNumber(order.total), 0);
    const returnsTotal = returns.reduce((sum, item) => sum + toNumber(item.amount), 0);

    let discountAmount = 0;
    let unitCount = 0;
    for (const order of orders) {
      for (const item of order.items) {
        const qty = toNumber(item.quantity);
        unitCount += qty;
        if (item.originalUnitPrice !== null) {
          discountAmount += (toNumber(item.originalUnitPrice) - toNumber(item.unitPrice)) * qty;
        }
      }
    }

    const netRevenue = grossRevenue - returnsTotal;

    // --- serie temporal --------------------------------------------------
    const current = new Map<string, Bucket>();
    for (const key of bucketsBetween(filters.from, filters.to, filters.granularity)) {
      current.set(key, { gross: 0, net: 0, orders: 0 });
    }
    for (const order of orders) {
      const bucket = current.get(bucketKey(order.orderDate, filters.granularity));
      if (!bucket) continue;
      const total = toNumber(order.total);
      bucket.gross += total;
      bucket.net += total;
      bucket.orders += 1;
    }
    for (const item of returns) {
      const bucket = current.get(bucketKey(item.returnDate, filters.granularity));
      if (bucket) bucket.net -= toNumber(item.amount);
    }

    // El bucket del año anterior se indexa por su clave desplazada un año, para
    // que "Ene 2026" se compare contra "Ene 2025" y no contra el bucket n-esimo.
    const shiftKey = (key: string) => `${Number(key.slice(0, 4)) + 1}${key.slice(4)}`;
    const previousBuckets = new Map<string, number>();
    for (const order of previousOrders) {
      const key = shiftKey(bucketKey(order.orderDate, filters.granularity));
      previousBuckets.set(key, (previousBuckets.get(key) ?? 0) + toNumber(order.total));
    }
    for (const item of previousReturns) {
      const key = shiftKey(bucketKey(item.returnDate, filters.granularity));
      previousBuckets.set(key, (previousBuckets.get(key) ?? 0) - toNumber(item.amount));
    }

    const series = [...current.entries()].map(([bucket, value]) => ({
      bucket,
      grossRevenue: money(value.gross),
      netRevenue: money(value.net),
      orderCount: value.orders,
      avgTicket: ratio(value.gross, value.orders),
      previousNetRevenue: previousBuckets.has(bucket)
        ? money(previousBuckets.get(bucket) as number)
        : null,
    }));

    const previousNet =
      previousOrders.reduce((sum, order) => sum + toNumber(order.total), 0) -
      previousReturns.reduce((sum, item) => sum + toNumber(item.amount), 0);

    // --- breakdowns ------------------------------------------------------
    const bySeller = new Map<string, Accumulator>();
    const byCustomer = new Map<string, Accumulator>();
    const byProduct = new Map<string, Accumulator>();
    const byZone = new Map<string, Accumulator>();
    const bySegment = new Map<string, Accumulator>();
    const byCompany = new Map<string, Accumulator>();
    const byCity = new Map<string, Accumulator>();
    // Fuga por descuento: por vendedor, y dentro de cada uno por cliente para
    // poder señalar en donde se esta yendo la plata.
    const leaks = new Map<
      string,
      { name: string; discount: number; base: number; orders: Set<string>; byCustomer: Map<string, number> }
    >();

    for (const order of orders) {
      const total = toNumber(order.total);
      const add = (bucket: Accumulator) => {
        bucket.revenue += total;
        bucket.orders.add(order.id);
        bucket.customers.add(order.customerId);
        bucket.lastOrderDate =
          !bucket.lastOrderDate || order.orderDate > bucket.lastOrderDate
            ? order.orderDate
            : bucket.lastOrderDate;
      };

      add(
        bump(
          bySeller,
          order.sellerUserId ?? "sin-vendedor",
          order.seller?.name ?? "Sin vendedor",
          { sellerId: order.sellerUserId ?? null },
        ),
      );
      add(
        bump(byCustomer, order.customerId, order.customer?.displayName ?? "Sin cliente", {
          customerId: order.customerId,
        }),
      );
      add(
        bump(
          byZone,
          order.customerZone?.zoneId ?? "sin-zona",
          order.customerZone?.zone.name ?? "Sin zona",
          { zoneId: order.customerZone?.zoneId ?? null },
        ),
      );
      add(
        bump(
          bySegment,
          order.customer?.segmentId ?? "sin-segmento",
          order.customer?.segment?.name ?? "Sin segmento",
          { segmentId: order.customer?.segmentId ?? null },
        ),
      );
      add(
        bump(byCompany, order.companyId, order.company?.name ?? "Sin empresa", {
          companyId: order.companyId,
          prefix: order.company?.prefix ?? null,
        }),
      );
      const city = order.customer?.city?.trim() || "Sin ciudad";
      add(
        bump(byCity, city.toLowerCase(), city, {
          department: order.customer?.department ?? null,
        }),
      );

      let orderDiscount = 0;
      for (const item of order.items) {
        const qty = toNumber(item.quantity);
        const key = `${item.productId ?? `${item.productSnapshotSku}:${item.productSnapshotName}`}|${item.presentationSnapshot ?? ""}`;
        const bucket = bump(byProduct, key, item.productSnapshotName, {
          productId: item.productId,
          sku: item.productSnapshotSku,
          presentation: item.presentationSnapshot,
        });
        bucket.revenue += toNumber(item.subtotal);
        bucket.quantity += qty;
        bucket.orders.add(order.id);
        bucket.customers.add(order.customerId);

        if (item.originalUnitPrice !== null) {
          orderDiscount += (toNumber(item.originalUnitPrice) - toNumber(item.unitPrice)) * qty;
        }
      }

      const sellerKey = order.sellerUserId ?? "sin-vendedor";
      let leak = leaks.get(sellerKey);
      if (!leak) {
        leak = {
          name: order.seller?.name ?? "Sin vendedor",
          discount: 0,
          base: 0,
          orders: new Set(),
          byCustomer: new Map(),
        };
        leaks.set(sellerKey, leak);
      }
      leak.discount += orderDiscount;
      leak.base += total;
      leak.orders.add(order.id);
      if (orderDiscount > 0) {
        const name = order.customer?.displayName ?? "Sin cliente";
        leak.byCustomer.set(name, (leak.byCustomer.get(name) ?? 0) + orderDiscount);
      }
    }

    const serialize = (map: Map<string, Accumulator>, idKey: string) =>
      [...map.values()]
        .map((bucket) => ({
          ...(bucket.extra ?? {}),
          [idKey]: bucket.extra?.[idKey] ?? bucket.key,
          name: bucket.label,
          netRevenue: money(bucket.revenue),
          orderCount: bucket.orders.size,
          customerCount: bucket.customers.size,
          sharePercent: percent(bucket.revenue, netRevenue),
        }))
        .sort((a, b) => b.netRevenue - a.netRevenue);

    const customers = serialize(byCustomer, "customerId").map((row) => ({
      ...row,
      customerName: row.name,
      lastOrderDate: byCustomer.get(row.customerId as string)?.lastOrderDate?.toISOString() ?? null,
    }));

    const products = [...byProduct.values()]
      .map((bucket) => ({
        productId: (bucket.extra?.productId as string | null) ?? null,
        sku: (bucket.extra?.sku as string) ?? "",
        name: bucket.label,
        presentation: (bucket.extra?.presentation as string | null) ?? null,
        quantity: quantity(bucket.quantity),
        revenue: money(bucket.revenue),
        orderCount: bucket.orders.size,
        sharePercent: percent(bucket.revenue, netRevenue),
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const discountLeaks = [...leaks.entries()]
      .filter(([, leak]) => leak.discount > 0)
      .map(([sellerId, leak]) => {
        const worst = [...leak.byCustomer.entries()].sort((a, b) => b[1] - a[1])[0];
        return {
          sellerId: sellerId === "sin-vendedor" ? null : sellerId,
          sellerName: leak.name,
          avgDiscountPercent: percent(leak.discount, leak.base + leak.discount),
          discountAmount: money(leak.discount),
          orderCount: leak.orders.size,
          worstCustomerName: worst ? worst[0] : null,
        };
      })
      .sort((a, b) => b.discountAmount - a.discountAmount);

    return {
      ...envelope(filters),
      totals: {
        grossRevenue: money(grossRevenue),
        returnsTotal: money(returnsTotal),
        netRevenue: money(netRevenue),
        orderCount: orders.length,
        customerCount: new Set(orders.map((order) => order.customerId)).size,
        unitCount: quantity(unitCount),
        avgTicket: ratio(grossRevenue, orders.length),
        avgDiscountPercent: percent(discountAmount, grossRevenue + discountAmount),
        discountAmount: money(discountAmount),
      },
      previous: {
        label: "mismo periodo del año anterior",
        from: previous.fromDate,
        to: previous.toDate,
        netRevenue: money(previousNet),
        orderCount: previousOrders.length,
        changePercent: previousNet ? percent(netRevenue - previousNet, Math.abs(previousNet)) : 0,
      },
      series,
      breakdowns: {
        bySeller: serialize(bySeller, "sellerId").map((row) => ({ ...row, sellerName: row.name })),
        byCustomer: customers.slice(0, TOP_ROWS),
        byCustomerTruncated: customers.length > TOP_ROWS,
        byCustomerTotal: customers.length,
        byProduct: products.slice(0, TOP_ROWS),
        byProductTruncated: products.length > TOP_ROWS,
        byProductTotal: products.length,
        byZone: serialize(byZone, "zoneId").map((row) => ({ ...row, zoneName: row.name })),
        bySegment: serialize(bySegment, "segmentId").map((row) => ({ ...row, segmentName: row.name })),
        byCompany: serialize(byCompany, "companyId").map((row) => ({ ...row, companyName: row.name })),
        byCity: serialize(byCity, "city").map((row) => ({ ...row, city: row.name })),
        discountLeaks: discountLeaks.slice(0, TOP_ROWS),
        discountLeaksTruncated: discountLeaks.length > TOP_ROWS,
      },
      // El CSV exporta el breakdown completo, no el truncado (§2.5).
      csvRows: customers,
    };
  }

  static csvColumns(): CsvColumn<{
    customerName: string;
    netRevenue: number;
    orderCount: number;
    customerCount: number;
    lastOrderDate: string | null;
    sharePercent: number;
  }>[] {
    return [
      { header: "Cliente", value: (row) => row.customerName },
      { header: "Venta neta", value: (row) => row.netRevenue },
      { header: "Pedidos", value: (row) => row.orderCount },
      { header: "Ultima compra", value: (row) => row.lastOrderDate?.slice(0, 10) ?? "" },
      { header: "Participacion %", value: (row) => row.sharePercent },
    ];
  }
}

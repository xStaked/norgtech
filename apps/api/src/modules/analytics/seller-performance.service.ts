import { Injectable } from "@nestjs/common";
import {
  CommercialExpenseCategory,
  CommercialExpenseStatus,
  Prisma,
  VisitStatus,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { followUpTaskOverdueWhere } from "../../shared/overdue";
import {
  ResolvedFilters,
  customerWhere,
  envelope,
  money,
  orderWhere,
  percent,
  ratio,
  returnWhere,
  toNumber,
} from "./analytics.shared";

/** Gasto que SI pesa en los calculos: lo demas todavia no es un costo real. */
const COUNTABLE: CommercialExpenseStatus[] = [
  CommercialExpenseStatus.aprobado,
  CommercialExpenseStatus.contabilizado,
];

/** Gasto que espera decision humana: se muestra aparte, nunca dentro del ratio. */
const PENDING: CommercialExpenseStatus[] = [
  CommercialExpenseStatus.pendiente,
  CommercialExpenseStatus.requiere_correccion,
];

const CATEGORY_LABELS: Record<CommercialExpenseCategory, string> = {
  alimentacion: "Alimentación",
  transporte: "Transporte",
  hospedaje: "Hospedaje",
  combustible: "Combustible",
  peajes: "Peajes",
  parqueadero: "Parqueadero",
  atencion_comercial: "Atención comercial",
  otros: "Otros",
};

interface SellerRow {
  sellerId: string | null;
  sellerName: string;
  netRevenue: number;
  orderCount: number;
  customers: Set<string>;
  expenseTotal: number;
  pendingExpenseTotal: number;
  visitsScheduled: number;
  visitsCompleted: number;
  tasksOverdue: number;
  dormantCustomers: number;
}

@Injectable()
export class SellerPerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getSellerPerformance(filters: ResolvedFilters) {
    // El gasto se atribuye a quien lo REPORTO (`submittedByUserId`), y su
    // empresa se deriva del cliente. Un gasto sin cliente no se puede atribuir
    // a una empresa: con empresa seleccionada no cuenta (misma regla que las
    // devoluciones huerfanas).
    const expenseWhere: Prisma.CommercialExpenseWhereInput = {
      expenseDate: { gte: filters.from, lte: filters.to },
      currency: filters.currency,
      ...(filters.sellerUserId ? { submittedByUserId: filters.sellerUserId } : {}),
      ...(filters.companyId || filters.segmentId || filters.zoneId
        ? { customer: customerWhere(filters) }
        : {}),
    };

    const [orders, returns, expenses, visits, overdueTasks, customers, lastOrders] =
      await Promise.all([
        this.prisma.order.findMany({
          where: orderWhere(filters),
          select: {
            id: true,
            total: true,
            customerId: true,
            sellerUserId: true,
            seller: { select: { id: true, name: true } },
          },
        }),
        this.prisma.return.findMany({
          where: returnWhere(filters),
          select: { amount: true, order: { select: { sellerUserId: true } } },
        }),
        this.prisma.commercialExpense.findMany({
          where: { ...expenseWhere, status: { in: [...COUNTABLE, ...PENDING] } },
          select: {
            amount: true,
            category: true,
            status: true,
            submittedByUserId: true,
            submittedBy: { select: { id: true, name: true } },
          },
        }),
        this.prisma.visit.findMany({
          where: {
            scheduledAt: { gte: filters.from, lte: filters.to },
            customer: customerWhere(filters),
            ...(filters.sellerUserId ? { assignedToUserId: filters.sellerUserId } : {}),
          },
          select: { status: true, assignedToUserId: true },
        }),
        this.prisma.followUpTask.findMany({
          // "Vencida" se DERIVA de la fecha con la regla compartida, no se lee
          // de la columna `status` (no hay proceso que la escriba).
          where: {
            ...followUpTaskOverdueWhere(new Date()),
            customer: customerWhere(filters),
            ...(filters.sellerUserId ? { assignedToUserId: filters.sellerUserId } : {}),
          },
          select: { assignedToUserId: true },
        }),
        this.prisma.customer.findMany({
          where: {
            ...customerWhere(filters),
            active: true,
            ...(filters.sellerUserId ? { assignedToUserId: filters.sellerUserId } : {}),
          },
          select: {
            id: true,
            assignedToUserId: true,
            assignedToUser: { select: { id: true, name: true } },
          },
        }),
        // "Dormido" = el cliente no compro, se lo haya vendido quien se lo haya
        // vendido. Por eso este barrido ignora el filtro de vendedor: con el
        // puesto, un cliente de A al que le vendio B saldria como dormido de A.
        this.prisma.order.findMany({
          where: orderWhere({ ...filters, sellerUserId: null }),
          select: { customerId: true },
          distinct: ["customerId"],
        }),
      ]);

    const rows = new Map<string, SellerRow>();
    const row = (id: string | null, name: string) => {
      const key = id ?? "sin-vendedor";
      let bucket = rows.get(key);
      if (!bucket) {
        bucket = {
          sellerId: id,
          sellerName: name,
          netRevenue: 0,
          orderCount: 0,
          customers: new Set(),
          expenseTotal: 0,
          pendingExpenseTotal: 0,
          visitsScheduled: 0,
          visitsCompleted: 0,
          tasksOverdue: 0,
          dormantCustomers: 0,
        };
        rows.set(key, bucket);
      } else if (bucket.sellerName === "Sin vendedor" && name !== "Sin vendedor") {
        bucket.sellerName = name;
      }
      return bucket;
    };

    for (const order of orders) {
      const bucket = row(order.sellerUserId, order.seller?.name ?? "Sin vendedor");
      bucket.netRevenue += toNumber(order.total);
      bucket.orderCount += 1;
      bucket.customers.add(order.customerId);
    }
    for (const item of returns) {
      // La devolucion se le resta al vendedor del pedido devuelto: misma clave
      // de atribucion que la venta.
      row(item.order?.sellerUserId ?? null, "Sin vendedor").netRevenue -= toNumber(item.amount);
    }

    let expenseTotal = 0;
    let pendingExpenseTotal = 0;
    const byCategory = new Map<CommercialExpenseCategory, { amount: number; count: number }>();
    for (const expense of expenses) {
      const bucket = row(expense.submittedByUserId, expense.submittedBy?.name ?? "Sin vendedor");
      const amount = toNumber(expense.amount);
      if (COUNTABLE.includes(expense.status)) {
        bucket.expenseTotal += amount;
        expenseTotal += amount;
        const category = byCategory.get(expense.category) ?? { amount: 0, count: 0 };
        category.amount += amount;
        category.count += 1;
        byCategory.set(expense.category, category);
      } else {
        bucket.pendingExpenseTotal += amount;
        pendingExpenseTotal += amount;
      }
    }

    for (const visit of visits) {
      const bucket = row(visit.assignedToUserId, "Sin vendedor");
      bucket.visitsScheduled += 1;
      if (visit.status === VisitStatus.completada) bucket.visitsCompleted += 1;
    }
    for (const task of overdueTasks) {
      row(task.assignedToUserId, "Sin vendedor").tasksOverdue += 1;
    }

    const boughtInRange = new Set(lastOrders.map((order) => order.customerId));
    for (const customer of customers) {
      if (boughtInRange.has(customer.id)) continue;
      row(customer.assignedToUserId, customer.assignedToUser?.name ?? "Sin vendedor")
        .dormantCustomers += 1;
    }

    // Visitas y tareas solo traen `assignedToUserId` (no hay relacion en el
    // schema): un vendedor que solo tiene visitas quedaria como "Sin vendedor".
    const unnamed = [...rows.values()].filter(
      (bucket) => bucket.sellerId !== null && bucket.sellerName === "Sin vendedor",
    );
    if (unnamed.length > 0) {
      const names = await this.prisma.user.findMany({
        where: { id: { in: unnamed.map((bucket) => bucket.sellerId as string) } },
        select: { id: true, name: true },
      });
      const byId = new Map(names.map((user) => [user.id, user.name]));
      for (const bucket of unnamed) {
        bucket.sellerName = byId.get(bucket.sellerId as string) ?? "Sin nombre";
      }
    }

    const netRevenue = [...rows.values()].reduce((sum, bucket) => sum + bucket.netRevenue, 0);
    const visitsScheduled = visits.length;
    const visitsCompleted = visits.filter((visit) => visit.status === VisitStatus.completada).length;

    const bySeller = [...rows.values()]
      .map((bucket) => ({
        sellerId: bucket.sellerId,
        sellerName: bucket.sellerName,
        netRevenue: money(bucket.netRevenue),
        orderCount: bucket.orderCount,
        customerCount: bucket.customers.size,
        expenseTotal: money(bucket.expenseTotal),
        // NO es margen: es cuanto de la venta costo venderla. No hay costo de
        // producto en el sistema, asi que la utilidad real no es calculable.
        expenseRatio: percent(bucket.expenseTotal, bucket.netRevenue),
        costPerOrder: ratio(bucket.expenseTotal, bucket.orderCount),
        pendingExpenseTotal: money(bucket.pendingExpenseTotal),
        visitsScheduled: bucket.visitsScheduled,
        visitsCompleted: bucket.visitsCompleted,
        visitCompliance: percent(bucket.visitsCompleted, bucket.visitsScheduled),
        revenuePerVisit: ratio(bucket.netRevenue, bucket.visitsCompleted),
        tasksOverdue: bucket.tasksOverdue,
        dormantCustomers: bucket.dormantCustomers,
      }))
      .sort((a, b) => b.netRevenue - a.netRevenue);

    return {
      ...envelope(filters),
      totals: {
        netRevenue: money(netRevenue),
        expenseTotal: money(expenseTotal),
        expenseRatio: percent(expenseTotal, netRevenue),
        pendingExpenseTotal: money(pendingExpenseTotal),
        visitsScheduled,
        visitsCompleted,
        visitCompliance: percent(visitsCompleted, visitsScheduled),
        tasksOverdue: overdueTasks.length,
      },
      expenseByCategory: [...byCategory.entries()]
        .map(([category, bucket]) => ({
          category,
          label: CATEGORY_LABELS[category],
          amount: money(bucket.amount),
          count: bucket.count,
          sharePercent: percent(bucket.amount, expenseTotal),
        }))
        .sort((a, b) => b.amount - a.amount),
      breakdowns: { bySeller },
      csvRows: bySeller,
    };
  }
}

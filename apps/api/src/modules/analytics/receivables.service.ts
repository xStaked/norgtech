import { Injectable } from "@nestjs/common";
import { InvoiceStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  ResolvedFilters,
  average,
  customerWhere,
  days,
  envelope,
  money,
  percent,
  ratio,
  toNumber,
} from "./analytics.shared";

const TOP_ROWS = 30;
/** Con menos facturas pagadas el promedio de dias no dice nada. */
const MIN_PAID_INVOICES = 3;
const PAYMENT_BEHAVIOR_WINDOW_DAYS = 90;
/** Ventana de facturacion sobre la que se calcula el DSO. */
const DSO_WINDOW_DAYS = 90;

/**
 * Estados que ya no dejan viva una factura. `vencida` NO esta aqui: es un
 * marcador de tiempo, no una resolucion — y ademas el vencimiento se DERIVA de
 * `dueDate`, nunca se lee de la columna (no hay proceso que la escriba).
 */
const SETTLED: InvoiceStatus[] = [InvoiceStatus.pagada, InvoiceStatus.anulada];

const AGING_BUCKETS = [
  { bucket: "por_vencer", label: "Por vencer", max: 0 },
  { bucket: "1-30", label: "1 a 30 días", max: 30 },
  { bucket: "31-60", label: "31 a 60 días", max: 60 },
  { bucket: "61-90", label: "61 a 90 días", max: 90 },
  { bucket: "90+", label: "Más de 90 días", max: Number.POSITIVE_INFINITY },
] as const;

export interface ReceivablesFilters extends ResolvedFilters {
  asOf: Date;
  asOfDate: string;
}

@Injectable()
export class ReceivablesService {
  constructor(private readonly prisma: PrismaService) {}

  async getReceivables(filters: ReceivablesFilters) {
    const windowStart = new Date(
      filters.asOf.getTime() - PAYMENT_BEHAVIOR_WINDOW_DAYS * 86_400_000,
    );

    const where: Prisma.InvoiceWhereInput = {
      issueDate: { lte: filters.asOf },
      customer: customerWhere(filters),
      ...(filters.companyId ? { companyId: filters.companyId } : {}),
      ...(filters.sellerUserId
        ? {
            // El vendedor de una factura es el del pedido; si la factura no
            // tiene pedido, el vendedor asignado al cliente (§2.3).
            OR: [
              { order: { sellerUserId: filters.sellerUserId } },
              { order: null, customer: { assignedToUserId: filters.sellerUserId } },
            ],
          }
        : {}),
    };

    const invoices = await this.prisma.invoice.findMany({
      where,
      select: {
        id: true,
        issueDate: true,
        dueDate: true,
        status: true,
        totalAmount: true,
        totalPaid: true,
        creditNoteTotal: true,
        customerId: true,
        companyId: true,
        company: { select: { id: true, name: true, prefix: true } },
        order: { select: { sellerUserId: true, seller: { select: { id: true, name: true } } } },
        customer: {
          select: {
            id: true,
            displayName: true,
            creditLimit: true,
            paymentCondition: true,
            paymentDays: true,
            assignedToUserId: true,
            assignedToUser: { select: { id: true, name: true } },
          },
        },
        payments: {
          where: { paymentDate: { gte: windowStart, lte: filters.asOf } },
          select: { paymentDate: true },
          orderBy: { paymentDate: "desc" },
          take: 1,
        },
      },
    });

    const balanceOf = (invoice: (typeof invoices)[number]) =>
      toNumber(invoice.totalAmount) - toNumber(invoice.totalPaid) - toNumber(invoice.creditNoteTotal);

    const live = invoices.filter(
      (invoice) => !SETTLED.includes(invoice.status) && balanceOf(invoice) > 0,
    );

    // --- aging -----------------------------------------------------------
    const aging = AGING_BUCKETS.map((definition) => ({
      bucket: definition.bucket,
      label: definition.label,
      amount: 0,
      invoiceCount: 0,
      customers: new Set<string>(),
    }));

    const bucketFor = (daysPastDue: number) =>
      aging[AGING_BUCKETS.findIndex((definition) => daysPastDue <= definition.max)];

    interface CustomerRow {
      customerId: string;
      customerName: string;
      sellerName: string;
      outstanding: number;
      overdue: number;
      oldestDueDate: Date | null;
      maxDaysPastDue: number;
      creditLimit: number | null;
      paymentCondition: string | null;
    }
    const byCustomer = new Map<string, CustomerRow>();
    const bySeller = new Map<
      string,
      { sellerId: string | null; sellerName: string; outstanding: number; overdue: number; customers: Set<string> }
    >();
    const byCompany = new Map<
      string,
      { companyId: string; companyName: string; prefix: string | null; outstanding: number; overdue: number }
    >();

    let outstandingTotal = 0;
    let overdueTotal = 0;

    for (const invoice of live) {
      const balance = balanceOf(invoice);
      const daysPastDue = days(invoice.dueDate, filters.asOf);
      const overdue = daysPastDue > 0 ? balance : 0;

      outstandingTotal += balance;
      overdueTotal += overdue;

      const bucket = bucketFor(daysPastDue);
      bucket.amount += balance;
      bucket.invoiceCount += 1;
      bucket.customers.add(invoice.customerId);

      const sellerId = invoice.order?.sellerUserId ?? invoice.customer.assignedToUserId ?? null;
      const sellerName =
        invoice.order?.seller?.name ?? invoice.customer.assignedToUser?.name ?? "Sin vendedor";

      let customerRow = byCustomer.get(invoice.customerId);
      if (!customerRow) {
        customerRow = {
          customerId: invoice.customerId,
          customerName: invoice.customer.displayName,
          sellerName,
          outstanding: 0,
          overdue: 0,
          oldestDueDate: null,
          maxDaysPastDue: 0,
          creditLimit:
            invoice.customer.creditLimit === null ? null : toNumber(invoice.customer.creditLimit),
          paymentCondition: invoice.customer.paymentCondition,
        };
        byCustomer.set(invoice.customerId, customerRow);
      }
      customerRow.outstanding += balance;
      customerRow.overdue += overdue;
      if (daysPastDue > 0) {
        customerRow.maxDaysPastDue = Math.max(customerRow.maxDaysPastDue, daysPastDue);
        if (!customerRow.oldestDueDate || invoice.dueDate < customerRow.oldestDueDate) {
          customerRow.oldestDueDate = invoice.dueDate;
        }
      }

      const sellerKey = sellerId ?? "sin-vendedor";
      let sellerRow = bySeller.get(sellerKey);
      if (!sellerRow) {
        sellerRow = { sellerId, sellerName, outstanding: 0, overdue: 0, customers: new Set() };
        bySeller.set(sellerKey, sellerRow);
      }
      sellerRow.outstanding += balance;
      sellerRow.overdue += overdue;
      sellerRow.customers.add(invoice.customerId);

      let companyRow = byCompany.get(invoice.companyId);
      if (!companyRow) {
        companyRow = {
          companyId: invoice.companyId,
          companyName: invoice.company.name,
          prefix: invoice.company.prefix,
          outstanding: 0,
          overdue: 0,
        };
        byCompany.set(invoice.companyId, companyRow);
      }
      companyRow.outstanding += balance;
      companyRow.overdue += overdue;
    }

    // --- DSO --------------------------------------------------------------
    const dsoWindowStart = new Date(filters.asOf.getTime() - DSO_WINDOW_DAYS * 86_400_000);
    const billedInWindow = invoices
      .filter((invoice) => invoice.issueDate >= dsoWindowStart && invoice.status !== InvoiceStatus.anulada)
      .reduce((sum, invoice) => sum + toNumber(invoice.totalAmount), 0);

    // --- comportamiento de pago -------------------------------------------
    const paid = invoices.filter(
      (invoice) => invoice.payments.length > 0 && balanceOf(invoice) <= 0,
    );
    const behavior = new Map<
      string,
      { customerId: string; customerName: string; agreedDays: number; actual: number[] }
    >();
    for (const invoice of paid) {
      const lastPayment = invoice.payments[0];
      let row = behavior.get(invoice.customerId);
      if (!row) {
        row = {
          customerId: invoice.customerId,
          customerName: invoice.customer.displayName,
          agreedDays: invoice.customer.paymentDays ?? 0,
          actual: [],
        };
        behavior.set(invoice.customerId, row);
      }
      row.actual.push(days(invoice.issueDate, lastPayment.paymentDate));
    }

    const paymentBehavior = [...behavior.values()]
      .filter((row) => row.actual.length >= MIN_PAID_INVOICES)
      .map((row) => {
        const avgActualDays = average(row.actual);
        return {
          customerId: row.customerId,
          customerName: row.customerName,
          agreedDays: row.agreedDays,
          avgActualDays,
          deviationDays: Math.round((avgActualDays - row.agreedDays) * 10) / 10,
          invoicesPaid: row.actual.length,
          onTimePercent: percent(
            row.actual.filter((value) => value <= row.agreedDays).length,
            row.actual.length,
          ),
        };
      })
      .sort((a, b) => b.deviationDays - a.deviationDays)
      .slice(0, TOP_ROWS);

    const customerRows = [...byCustomer.values()]
      .map((row) => ({
        ...row,
        outstanding: money(row.outstanding),
        overdue: money(row.overdue),
        oldestDueDate: row.oldestDueDate?.toISOString() ?? null,
        creditUsagePercent:
          row.creditLimit && row.creditLimit > 0 ? percent(row.outstanding, row.creditLimit) : null,
        overLimit: row.creditLimit !== null && row.creditLimit > 0 && row.outstanding > row.creditLimit,
      }))
      .sort((a, b) => b.overdue - a.overdue || b.outstanding - a.outstanding);

    return {
      ...envelope(filters),
      asOf: filters.asOfDate,
      paymentBehaviorWindowDays: PAYMENT_BEHAVIOR_WINDOW_DAYS,
      paymentBehaviorMinInvoices: MIN_PAID_INVOICES,
      totals: {
        outstandingTotal: money(outstandingTotal),
        overdueTotal: money(overdueTotal),
        overduePercent: percent(overdueTotal, outstandingTotal),
        dso: billedInWindow ? ratio(outstandingTotal * DSO_WINDOW_DAYS, billedInWindow) : 0,
        invoiceCount: live.length,
        customerCount: byCustomer.size,
        customersOverCreditLimit: customerRows.filter((row) => row.overLimit).length,
      },
      aging: aging.map((bucket) => ({
        bucket: bucket.bucket,
        label: bucket.label,
        amount: money(bucket.amount),
        invoiceCount: bucket.invoiceCount,
        customerCount: bucket.customers.size,
        sharePercent: percent(bucket.amount, outstandingTotal),
      })),
      breakdowns: {
        byCustomer: customerRows.slice(0, TOP_ROWS),
        byCustomerTruncated: customerRows.length > TOP_ROWS,
        byCustomerTotal: customerRows.length,
        bySeller: [...bySeller.values()]
          .map((row) => ({
            sellerId: row.sellerId,
            sellerName: row.sellerName,
            outstanding: money(row.outstanding),
            overdue: money(row.overdue),
            overduePercent: percent(row.overdue, row.outstanding),
            customerCount: row.customers.size,
          }))
          .sort((a, b) => b.outstanding - a.outstanding),
        byCompany: [...byCompany.values()]
          .map((row) => ({
            ...row,
            outstanding: money(row.outstanding),
            overdue: money(row.overdue),
            overduePercent: percent(row.overdue, row.outstanding),
          }))
          .sort((a, b) => b.outstanding - a.outstanding),
        paymentBehavior,
      },
      csvRows: customerRows,
    };
  }
}

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { OrderStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreditSummaryDto, PurchaseProgressDto } from "./dto/credit-summary.dto";
import { CreditAlertDto } from "./dto/credit-alert.dto";

const ALERT_THRESHOLD_PERCENT = 80;

/**
 * Estados en los que un pedido ya compromete cupo (ORD-01/ORD-02).
 *
 * `recibido` queda FUERA: es un borrador y no consume cupo de otros pedidos.
 * `facturado` queda DENTRO a proposito: si su factura se anula, el pedido debe
 * volver a contar como exposicion. Mientras la factura este viva, el filtro
 * `invoices: { none: { status: { not: "anulada" } } }` evita el doble conteo.
 */
export const ORDER_EXPOSURE_STATUSES: OrderStatus[] = [
  "orden_facturacion",
  "facturado",
  "despachado",
  "en_transito",
  "entregado",
];

@Injectable()
export class CreditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Exposicion real de credito del cliente:
   *   facturas abiertas + pedidos aprobados SIN factura activa.
   *
   * Antes solo se miraban facturas, por lo que un cliente con pedidos pendientes
   * enormes mostraba el cupo entero disponible (ORD-01) y el disponible no bajaba
   * al crear un pedido (ORD-02).
   */
  async getCustomerExposure(
    customerId: string,
    tx?: Prisma.TransactionClient,
    opts?: { excludeOrderId?: string },
  ): Promise<Prisma.Decimal> {
    const client = tx ?? this.prisma;

    const invoiceTotal = await this.getOpenInvoiceTotal(customerId, tx);

    const orders = await client.order.findMany({
      where: {
        customerId,
        status: { in: ORDER_EXPOSURE_STATUSES },
        invoices: { none: { status: { not: "anulada" } } },
        ...(opts?.excludeOrderId ? { id: { not: opts.excludeOrderId } } : {}),
      },
      select: { total: true },
    });

    const ordersTotal = orders.reduce(
      (sum, order) => sum.plus(order.total),
      new Prisma.Decimal(0),
    );

    return invoiceTotal.plus(ordersTotal);
  }

  private async getOpenInvoiceTotal(
    customerId: string,
    tx?: Prisma.TransactionClient,
    companyId?: string,
  ): Promise<Prisma.Decimal> {
    const client = tx ?? this.prisma;
    const agg = await client.invoice.aggregate({
      where: {
        customerId,
        status: { notIn: ["pagada", "anulada"] },
        ...(companyId ? { companyId } : {}),
      },
      _sum: { totalAmount: true },
    });
    return new Prisma.Decimal(agg._sum.totalAmount ?? 0);
  }

  async assertCreditLimit(
    customerId: string,
    amount: Prisma.Decimal,
    tx?: Prisma.TransactionClient,
    opts?: { excludeOrderId?: string },
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const customer = await client.customer.findUnique({
      where: { id: customerId },
      select: { creditLimit: true },
    });

    if (!customer) throw new NotFoundException("Cliente no encontrado");
    if (!customer.creditLimit || customer.creditLimit.lte(0)) return;

    const currentTotal = await this.getCustomerExposure(customerId, tx, opts);

    if (currentTotal.plus(amount).gt(customer.creditLimit)) {
      const available = customer.creditLimit.minus(currentTotal);
      throw new BadRequestException(
        `Credito excedido. Disponible: $${available.toFixed(0)}, Pedido: $${amount.toFixed(0)}`,
      );
    }
  }

  async getCreditSummary(customerId: string): Promise<CreditSummaryDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { creditLimit: true, purchaseBudget: true },
    });

    if (!customer) throw new NotFoundException("Cliente no encontrado");

    const currentBalance = (await this.getCustomerExposure(customerId)).toNumber();
    const creditLimit = customer.creditLimit ? customer.creditLimit.toNumber() : null;

    const availableCredit = creditLimit != null && creditLimit > 0
      ? creditLimit - currentBalance
      : null;

    const utilizationPercent = creditLimit != null && creditLimit > 0
      ? (currentBalance / creditLimit) * 100
      : null;

    const isNearLimit = utilizationPercent != null && utilizationPercent >= ALERT_THRESHOLD_PERCENT;

    let purchaseProgress: PurchaseProgressDto = {
      currentMonthSales: 0,
      budget: customer.purchaseBudget ? customer.purchaseBudget.toNumber() : null,
      percent: null,
    };

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const orderAgg = await this.prisma.order.aggregate({
      where: {
        customerId,
        createdAt: { gte: startOfMonth },
      },
      _sum: { subtotal: true },
    });

    purchaseProgress.currentMonthSales = new Prisma.Decimal(orderAgg._sum.subtotal ?? 0).toNumber();

    if (purchaseProgress.budget != null && purchaseProgress.budget > 0) {
      purchaseProgress.percent = (purchaseProgress.currentMonthSales / purchaseProgress.budget) * 100;
    }

    return {
      creditLimit,
      purchaseBudget: customer.purchaseBudget ? customer.purchaseBudget.toNumber() : null,
      currentBalance,
      availableCredit,
      utilizationPercent,
      isNearLimit,
      purchaseProgress,
    };
  }

  async getCreditAlerts(companyId?: string): Promise<CreditAlertDto[]> {
    const customers = await this.prisma.customer.findMany({
      where: {
        creditLimit: { gt: 0 },
        ...(companyId
          ? { invoices: { some: { companyId } } }
          : {}),
      },
      select: {
        id: true,
        displayName: true,
        creditLimit: true,
      },
    });

    if (customers.length === 0) return [];

    const customerIds = customers.map((c) => c.id);

    const groupByResult = await this.prisma.invoice.groupBy({
      by: ["customerId"],
      where: {
        customerId: { in: customerIds },
        status: { notIn: ["pagada", "anulada"] },
        ...(companyId ? { companyId } : {}),
      },
      _sum: { totalAmount: true },
    });

    // Pedidos aprobados sin factura activa, en UNA sola query para todos los
    // clientes (nada de recorrer cliente por cliente).
    const orderGroupByResult = await this.prisma.order.groupBy({
      by: ["customerId"],
      where: {
        customerId: { in: customerIds },
        status: { in: ORDER_EXPOSURE_STATUSES },
        invoices: { none: { status: { not: "anulada" } } },
        ...(companyId ? { companyId } : {}),
      },
      _sum: { total: true },
    });

    const balanceMap = new Map<string, Prisma.Decimal>();
    for (const row of groupByResult) {
      balanceMap.set(
        row.customerId,
        new Prisma.Decimal(row._sum.totalAmount ?? 0),
      );
    }
    for (const row of orderGroupByResult) {
      balanceMap.set(
        row.customerId,
        (balanceMap.get(row.customerId) ?? new Prisma.Decimal(0)).plus(
          new Prisma.Decimal(row._sum.total ?? 0),
        ),
      );
    }

    const alerts: CreditAlertDto[] = [];

    for (const customer of customers) {
      const creditLimit = customer.creditLimit!.toNumber();
      const currentBalance = (balanceMap.get(customer.id) ?? new Prisma.Decimal(0)).toNumber();
      const utilizationPercent = (currentBalance / creditLimit) * 100;

      if (utilizationPercent >= ALERT_THRESHOLD_PERCENT) {
        alerts.push({
          customerId: customer.id,
          displayName: customer.displayName,
          creditLimit,
          currentBalance,
          utilizationPercent,
        });
      }
    }

    return alerts.sort((a, b) => b.utilizationPercent - a.utilizationPercent);
  }
}

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreditSummaryDto, PurchaseProgressDto } from "./dto/credit-summary.dto";
import { CreditAlertDto } from "./dto/credit-alert.dto";

const ALERT_THRESHOLD_PERCENT = 80;

@Injectable()
export class CreditService {
  constructor(private readonly prisma: PrismaService) {}

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
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const customer = await client.customer.findUnique({
      where: { id: customerId },
      select: { creditLimit: true },
    });

    if (!customer) throw new NotFoundException("Cliente no encontrado");
    if (!customer.creditLimit || customer.creditLimit.lte(0)) return;

    const currentTotal = await this.getOpenInvoiceTotal(customerId, tx);

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

    const currentBalance = (await this.getOpenInvoiceTotal(customerId)).toNumber();
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

    const balanceMap = new Map<string, number>();
    for (const row of groupByResult) {
      balanceMap.set(
        row.customerId,
        new Prisma.Decimal(row._sum.totalAmount ?? 0).toNumber(),
      );
    }

    const alerts: CreditAlertDto[] = [];

    for (const customer of customers) {
      const creditLimit = customer.creditLimit!.toNumber();
      const currentBalance = balanceMap.get(customer.id) ?? 0;
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

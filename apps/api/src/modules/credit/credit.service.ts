import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreditSummaryDto, PurchaseProgressDto } from "./dto/credit-summary.dto";
import { CreditAlertDto } from "./dto/credit-alert.dto";

@Injectable()
export class CreditService {
  constructor(private readonly prisma: PrismaService) {}

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

    if (!customer?.creditLimit || customer.creditLimit.lte(0)) return;

    const agg = await client.invoice.aggregate({
      where: {
        customerId,
        status: { notIn: ["pagada", "anulada"] },
      },
      _sum: { totalAmount: true },
    });

    const currentTotal = new Prisma.Decimal(agg._sum.totalAmount ?? 0);
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

    if (!customer) throw new BadRequestException("Customer not found");

    const invoiceAgg = await this.prisma.invoice.aggregate({
      where: {
        customerId,
        status: { notIn: ["pagada", "anulada"] },
      },
      _sum: { totalAmount: true },
    });

    const currentBalance = new Prisma.Decimal(invoiceAgg._sum.totalAmount ?? 0).toNumber();
    const creditLimit = customer.creditLimit ? customer.creditLimit.toNumber() : null;

    const availableCredit = creditLimit != null && creditLimit > 0
      ? creditLimit - currentBalance
      : null;

    const utilizationPercent = creditLimit != null && creditLimit > 0
      ? (currentBalance / creditLimit) * 100
      : null;

    const isNearLimit = utilizationPercent != null && utilizationPercent >= 80;

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

    const alerts: CreditAlertDto[] = [];

    for (const customer of customers) {
      const agg = await this.prisma.invoice.aggregate({
        where: {
          customerId: customer.id,
          status: { notIn: ["pagada", "anulada"] },
        },
        _sum: { totalAmount: true },
      });

      const creditLimit = customer.creditLimit!.toNumber();
      const currentBalance = new Prisma.Decimal(agg._sum.totalAmount ?? 0).toNumber();
      const utilizationPercent = (currentBalance / creditLimit) * 100;

      if (utilizationPercent >= 80) {
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

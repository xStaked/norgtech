import { Injectable, NotFoundException } from "@nestjs/common";
import { OrderStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  PricedLine,
  PricingCustomer,
  PricingItemInput,
  PricingMode,
  PricingPreview,
  SegmentDiscountResolution,
} from "./pricing.types";

/**
 * Order statuses considered "in progress or completed" for the purposes of
 * counting a customer's accumulated sales toward their segment goal.
 * Kept as a named constant so the window/definition is trivially changeable.
 */
export const PROGRESS_STATUSES: OrderStatus[] = [
  OrderStatus.facturado,
  OrderStatus.despachado,
  OrderStatus.en_transito,
  OrderStatus.entregado,
];

/**
 * Default sales-goal window: current calendar year (YTD) by orderDate.
 * ASSUMPTION (spec §6): flagged for future revisit if the business wants a
 * rolling window instead of a calendar-year window.
 */
export function currentYearRange(now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0));
  return { start, end: now };
}

interface RawPricedLine {
  productId: string | null;
  productSnapshotName: string;
  productSnapshotSku: string;
  unit: string;
  quantity: number;
  originalUnitPrice: Prisma.Decimal | null;
  discountPercent: Prisma.Decimal | null;
  unitPrice: Prisma.Decimal;
  taxPercent: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  totalWithTax: Prisma.Decimal;
  notes?: string;
  productPresentation?: string | null;
}

export interface PriceLinesResult {
  rawItems: RawPricedLine[];
  effectiveDiscount: Prisma.Decimal;
  meetsGoal: boolean;
  salesYTD: Prisma.Decimal;
  goalThreshold: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  total: Prisma.Decimal;
}

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves the effective segment discount for a customer, conditional on
   * whether they have met their segment's sales goal (YTD). If the customer
   * has no segment, or the segment's discount is not positive, the goal is
   * never checked and the discount is 0.
   */
  async resolveSegmentDiscount(customer: PricingCustomer): Promise<SegmentDiscountResolution> {
    const zero = new Prisma.Decimal(0);
    const seg = customer.segment;

    if (!seg || new Prisma.Decimal(seg.discountPercent).lte(0)) {
      return {
        discountPercent: zero,
        meetsGoal: false,
        salesYTD: zero,
        goalThreshold: seg ? new Prisma.Decimal(seg.minGoalAmount) : zero,
      };
    }

    const { start, end } = currentYearRange();
    const agg = await this.prisma.order.aggregate({
      where: {
        customerId: customer.id,
        status: { in: PROGRESS_STATUSES },
        orderDate: { gte: start, lte: end },
      },
      _sum: { total: true },
    });

    const salesYTD = new Prisma.Decimal(agg._sum.total ?? 0);
    const goalThreshold = new Prisma.Decimal(seg.minGoalAmount);
    const meetsGoal = salesYTD.gte(goalThreshold);

    return {
      discountPercent: meetsGoal ? new Prisma.Decimal(seg.discountPercent) : zero,
      meetsGoal,
      salesYTD,
      goalThreshold,
    };
  }

  /**
   * Ports the exact line-valuation math from quotes.service.create (no tax)
   * and orders.service.create (with tax), but always uses the
   * goal-conditional effective discount instead of the raw segment discount.
   */
  async priceLines(
    customer: PricingCustomer,
    items: PricingItemInput[],
    mode: PricingMode,
  ): Promise<PriceLinesResult> {
    const { discountPercent: effectiveDiscount, meetsGoal, salesYTD, goalThreshold } =
      await this.resolveSegmentDiscount(customer);

    const discountMultiplier = new Prisma.Decimal(1).minus(
      new Prisma.Decimal(effectiveDiscount).dividedBy(100),
    );

    const rawItems: RawPricedLine[] = await Promise.all(
      items.map(async (item) => {
        const taxPercent =
          mode === "order"
            ? new Prisma.Decimal(item.taxPercent ?? 19).toDecimalPlaces(2)
            : new Prisma.Decimal(0);

        if (item.productId) {
          const product = await this.prisma.product.findUnique({
            where: { id: item.productId },
          });
          if (!product) {
            throw new NotFoundException(`Product ${item.productId} not found`);
          }

          const basePrice = product.basePrice;
          const unitPriceRounded = new Prisma.Decimal(basePrice)
            .times(discountMultiplier)
            .toDecimalPlaces(2);
          const taxAmount = unitPriceRounded.times(taxPercent).dividedBy(100).toDecimalPlaces(2);
          const subtotal = new Prisma.Decimal(item.quantity)
            .times(unitPriceRounded)
            .toDecimalPlaces(2);
          const totalWithTax = new Prisma.Decimal(item.quantity)
            .times(unitPriceRounded.plus(taxAmount))
            .toDecimalPlaces(2);

          return {
            productId: item.productId,
            productSnapshotName: product.name,
            productSnapshotSku: product.sku,
            unit: product.unit,
            quantity: item.quantity,
            originalUnitPrice: new Prisma.Decimal(basePrice),
            discountPercent: new Prisma.Decimal(effectiveDiscount),
            unitPrice: unitPriceRounded,
            taxPercent,
            taxAmount,
            subtotal,
            totalWithTax,
            notes: item.notes,
            productPresentation: product.presentation ?? null,
          };
        }

        const unitPriceRounded = new Prisma.Decimal(item.unitPrice ?? 0).toDecimalPlaces(2);
        const taxAmount = unitPriceRounded.times(taxPercent).dividedBy(100).toDecimalPlaces(2);
        const subtotal = new Prisma.Decimal(item.quantity)
          .times(unitPriceRounded)
          .toDecimalPlaces(2);
        const totalWithTax = new Prisma.Decimal(item.quantity)
          .times(unitPriceRounded.plus(taxAmount))
          .toDecimalPlaces(2);

        return {
          productId: null,
          productSnapshotName: "Custom item",
          productSnapshotSku: "CUSTOM",
          unit: "unit",
          quantity: item.quantity,
          originalUnitPrice: null,
          discountPercent: null,
          unitPrice: unitPriceRounded,
          taxPercent,
          taxAmount,
          subtotal,
          totalWithTax,
          notes: item.notes,
        };
      }),
    );

    const subtotal = rawItems.reduce(
      (sum, line) => sum.plus(line.subtotal),
      new Prisma.Decimal(0),
    );
    const taxAmount = rawItems.reduce(
      (sum, line) => sum.plus(line.taxAmount.times(line.quantity)),
      new Prisma.Decimal(0),
    );
    const total = rawItems.reduce(
      (sum, line) => sum.plus(line.totalWithTax),
      new Prisma.Decimal(0),
    );

    return {
      rawItems,
      effectiveDiscount,
      meetsGoal,
      salesYTD,
      goalThreshold,
      subtotal,
      taxAmount,
      total,
    };
  }

  /**
   * Builds a client-facing pricing preview: same math as priceLines, but
   * projected to plain numbers (Decimal -> number) so callers never have to
   * deal with Decimal instances, and never emit NaN.
   */
  async buildPreview(
    customer: PricingCustomer,
    items: PricingItemInput[],
    mode: PricingMode,
  ): Promise<PricingPreview> {
    const result = await this.priceLines(customer, items, mode);

    const lines: PricedLine[] = result.rawItems.map((line) => ({
      productId: line.productId,
      originalUnitPrice: line.originalUnitPrice ? line.originalUnitPrice.toNumber() : null,
      discountPercent: line.discountPercent ? line.discountPercent.toNumber() : 0,
      unitPrice: line.unitPrice.toNumber(),
      quantity: line.quantity,
      subtotal: line.subtotal.toNumber(),
      taxPercent: line.taxPercent.toNumber(),
      taxAmount: line.taxAmount.toNumber(),
      totalWithTax: line.totalWithTax.toNumber(),
    }));

    const discountAmount = result.rawItems.reduce((sum, line) => {
      if (!line.originalUnitPrice) {
        return sum;
      }
      return sum.plus(
        new Prisma.Decimal(line.originalUnitPrice).minus(line.unitPrice).times(line.quantity),
      );
    }, new Prisma.Decimal(0));

    return {
      segmentName: customer.segment?.name ?? null,
      discountPercent: result.effectiveDiscount.toNumber(),
      meetsGoal: result.meetsGoal,
      salesYTD: result.salesYTD.toNumber(),
      goalThreshold: result.goalThreshold.toNumber(),
      lines,
      subtotal: result.subtotal.toNumber(),
      taxAmount: result.taxAmount.toNumber(),
      total: result.total.toNumber(),
      discountAmount: discountAmount.toNumber(),
    };
  }
}

import { Injectable, NotFoundException } from "@nestjs/common";
import { OrderStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  PricedLine,
  PricingCustomer,
  PricingItemInput,
  PricingMode,
  PricingPreview,
  PriceSource,
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

    if (!seg) {
      return { discountPercent: zero, meetsGoal: false, salesYTD: zero, goalThreshold: zero };
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
    const segmentDiscount = new Prisma.Decimal(seg.discountPercent);

    return {
      discountPercent: meetsGoal && segmentDiscount.gt(0) ? segmentDiscount : zero,
      meetsGoal,
      salesYTD,
      goalThreshold,
    };
  }

  /**
   * Precio efectivo de un producto para un cliente.
   *
   * El precio de lista es el precio ya negociado con ese cliente, así que gana
   * sobre `basePrice` y NO lleva el descuento de segmento encima: aplicárselo
   * sería descontar dos veces sobre un precio que el cliente ya acordó.
   *
   * Sin lista (o si el producto no está en ella) se cae al comportamiento
   * histórico: basePrice × descuento de segmento condicionado a la meta.
   */
  async resolvePrice(
    customer: PricingCustomer,
    product: { id: string; basePrice: Prisma.Decimal },
    presentationId?: string,
  ) {
    const matches = await this.findListPrices(customer.priceListId, product.id, presentationId);

    if (matches.length > 1) {
      return {
        productId: product.id,
        customerId: customer.id,
        source: "ambiguous" as PriceSource,
        priceListId: customer.priceListId ?? null,
        priceListName: matches[0].priceList.name,
        currency: matches[0].priceList.currency,
        // El producto tiene varias presentaciones con precio en esta lista;
        // quien cotiza elige. Devolver una al azar cotizaría un empaque
        // distinto al que se va a despachar.
        options: matches.map((item) => ({
          presentationId: item.presentationId,
          empaque: item.presentation.empaque,
          form: item.presentation.form,
          priceSinIva: item.priceSinIva,
          priceConIva: item.priceConIva,
          taxPercent: item.taxPercent,
        })),
      };
    }

    const match = matches[0];
    if (match && match.priceSinIva !== null) {
      return {
        productId: product.id,
        customerId: customer.id,
        source: "price_list" as PriceSource,
        priceListId: match.priceListId,
        priceListName: match.priceList.name,
        currency: match.priceList.currency,
        presentationId: match.presentationId,
        empaque: match.presentation.empaque,
        basePrice: product.basePrice,
        priceSinIva: match.priceSinIva,
        priceConIva: match.priceConIva,
        taxPercent: match.taxPercent,
        discountPercent: new Prisma.Decimal(0),
        finalPrice: match.priceSinIva,
      };
    }

    const { discountPercent, meetsGoal, salesYTD, goalThreshold } =
      await this.resolveSegmentDiscount(customer);

    const discountMultiplier = new Prisma.Decimal(1).minus(
      new Prisma.Decimal(discountPercent).dividedBy(100),
    );

    return {
      productId: product.id,
      customerId: customer.id,
      source: "base_price" as PriceSource,
      basePrice: product.basePrice,
      discountPercent,
      finalPrice: new Prisma.Decimal(product.basePrice)
        .times(discountMultiplier)
        .toDecimalPlaces(2),
      meetsGoal,
      salesYTD,
      goalThreshold,
    };
  }

  /**
   * Ítems de la lista del cliente que corresponden a este producto. Con
   * `presentationId` es a lo sumo uno; sin él pueden ser varios (el producto
   * tiene varios empaques con precio en esa lista).
   */
  private async findListPrices(
    priceListId: string | null | undefined,
    productId: string,
    presentationId?: string,
  ) {
    if (!priceListId) {
      return [];
    }

    return this.prisma.priceListItem.findMany({
      where: {
        priceListId,
        presentation: {
          productId,
          active: true,
          ...(presentationId ? { id: presentationId } : {}),
        },
        priceList: { active: true },
      },
      include: {
        priceList: { select: { name: true, currency: true } },
        presentation: { select: { empaque: true, form: true } },
      },
      orderBy: { presentation: { empaque: "asc" } },
    });
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

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
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
  /** Lista de la que salió el precio, o null si vino de basePrice. */
  priceListName?: string | null;
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
    const matches = await this.resolveListMatches(customer.priceListId, product.id, {
      presentationId,
    });

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
   * Ítems de la lista del cliente para este producto, reducidos por lo que se
   * sepa de la presentación. Escalera, de más a menos explícito:
   *
   *   1. `presentationId` — quien cotiza ya eligió.
   *   2. `presentation` en texto — lo que escribió el cliente (WhatsApp).
   *      Solo cuenta si empata con UN empaque; "bolsa" contra tres bolsas no
   *      desambigua nada.
   *   3. Nada — si el producto tiene un solo empaque con precio, es ese.
   *
   * Si quedan varios, el llamador decide qué hacer: no hay un precio correcto
   * que adivinar, y cotizar el empaque equivocado despacha el producto
   * equivocado.
   */
  private async resolveListMatches(
    priceListId: string | null | undefined,
    productId: string,
    hint: { presentationId?: string | null; presentation?: string | null },
  ) {
    if (!priceListId) {
      return [];
    }

    const matches = await this.prisma.priceListItem.findMany({
      where: {
        priceListId,
        presentation: {
          productId,
          active: true,
          ...(hint.presentationId ? { id: hint.presentationId } : {}),
        },
        priceList: { active: true },
      },
      include: {
        priceList: { select: { name: true, currency: true } },
        presentation: { select: { empaque: true, form: true } },
      },
      orderBy: { presentation: { empaque: "asc" } },
    });

    if (matches.length <= 1 || hint.presentationId) {
      return matches;
    }

    const wanted = normalizeEmpaque(hint.presentation);
    if (!wanted) {
      return matches;
    }

    const byText = matches.filter(
      (item) => normalizeEmpaque(item.presentation.empaque) === wanted,
    );
    return byText.length === 1 ? byText : matches;
  }

  /**
   * El ítem de lista que aplica a esta línea, o null si el cliente no tiene
   * lista / el producto no está en ella (→ se cae a basePrice).
   *
   * Si quedan varias presentaciones con precio y nadie dijo cuál, se rechaza
   * la línea en vez de escoger. No hay precio correcto que adivinar: cada
   * empaque vale distinto y el que se cotiza es el que se despacha.
   */
  private async requireSingleListMatch(
    customer: PricingCustomer,
    product: { id: string; name: string },
    item: PricingItemInput,
  ) {
    const matches = await this.resolveListMatches(customer.priceListId, product.id, {
      presentationId: item.presentationId,
      presentation: item.presentation,
    });

    if (matches.length <= 1) {
      return matches[0] ?? null;
    }

    const options = matches.map((match) => match.presentation.empaque).join(", ");
    throw new BadRequestException(
      `${product.name} tiene varias presentaciones con precio en la lista ` +
        `${matches[0].priceList.name}: ${options}. Indica cuál con presentationId.`,
    );
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

          const listItem = await this.requireSingleListMatch(customer, product, item);

          // El precio de lista ya es el negociado con este cliente: gana sobre
          // basePrice y no lleva el descuento de segmento encima.
          const usesList = listItem !== null && listItem.priceSinIva !== null;
          const basePrice = usesList
            ? new Prisma.Decimal(listItem.priceSinIva!)
            : new Prisma.Decimal(product.basePrice);
          const lineDiscount = usesList
            ? new Prisma.Decimal(0)
            : new Prisma.Decimal(effectiveDiscount);
          const unitPriceRounded = usesList
            ? basePrice.toDecimalPlaces(2)
            : basePrice.times(discountMultiplier).toDecimalPlaces(2);

          // El IVA de la lista manda sobre el 19% por defecto, que en este
          // catálogo no existe (es 0%, 5% o 10%).
          const lineTax =
            mode === "order" && item.taxPercent === undefined && listItem?.taxPercent !== null
              ? new Prisma.Decimal(listItem?.taxPercent ?? taxPercent).toDecimalPlaces(2)
              : taxPercent;

          const taxAmount = unitPriceRounded.times(lineTax).dividedBy(100).toDecimalPlaces(2);
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
            originalUnitPrice: basePrice,
            discountPercent: lineDiscount,
            unitPrice: unitPriceRounded,
            taxPercent: lineTax,
            taxAmount,
            subtotal,
            totalWithTax,
            notes: item.notes,
            productPresentation:
              listItem?.presentation.empaque ?? product.presentation ?? null,
            priceListName: listItem?.priceList.name ?? null,
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
      priceListName: line.priceListName ?? null,
      presentation: line.productPresentation ?? null,
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

/** Empaques como "Bolsa x 500 g" vs "bolsa x 500 g" son el mismo. */
function normalizeEmpaque(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

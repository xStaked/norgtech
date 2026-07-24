import { Prisma } from "@prisma/client";

export type PricingMode = "quote" | "order";

export interface PricingCustomerSegment {
  name?: string;
  discountPercent: Prisma.Decimal;
  minGoalAmount: Prisma.Decimal;
}

export interface PricingCustomer {
  id: string;
  segment: PricingCustomerSegment | null;
  /** Lista de precios negociada. Si existe, gana sobre basePrice + descuento. */
  priceListId?: string | null;
}

/**
 * De dónde salió el precio:
 * - `price_list`: precio negociado del cliente. Es final, no lleva descuento.
 * - `base_price`: no hay lista (o el producto no está en ella) → basePrice
 *   con el descuento de segmento condicionado a la meta, como siempre.
 * - `ambiguous`: hay lista y el producto tiene varias presentaciones con
 *   precio en ella. Quien cotiza debe elegir cuál; `options` las trae.
 */
export type PriceSource = "price_list" | "base_price" | "ambiguous";

export interface PricingItemInput {
  productId?: string | null;
  quantity: number;
  unitPrice?: number | Prisma.Decimal;
  taxPercent?: number | Prisma.Decimal | null;
  notes?: string;
  /** Presentación elegida. Es lo que desambigua el precio de lista. */
  presentationId?: string | null;
  /**
   * Empaque en texto (lo que escribió el cliente por WhatsApp, p.ej.). Se usa
   * como segundo intento cuando no viene `presentationId`.
   */
  presentation?: string | null;
}

export interface SegmentDiscountResolution {
  discountPercent: Prisma.Decimal;
  meetsGoal: boolean;
  salesYTD: Prisma.Decimal;
  goalThreshold: Prisma.Decimal;
}

export interface PricedLine {
  productId: string | null;
  /** Lista de la que salió el precio; null si vino de basePrice. */
  priceListName: string | null;
  /** Empaque cotizado, cuando el precio salió de una lista. */
  presentation: string | null;
  originalUnitPrice: number | null;
  discountPercent: number;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  taxPercent: number;
  taxAmount: number;
  totalWithTax: number;
}

export interface PricingPreview {
  segmentName: string | null;
  discountPercent: number;
  meetsGoal: boolean;
  salesYTD: number;
  goalThreshold: number;
  lines: PricedLine[];
  subtotal: number;
  taxAmount: number;
  total: number;
  discountAmount: number;
}

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
}

export interface PricingItemInput {
  productId?: string | null;
  quantity: number;
  unitPrice?: number | Prisma.Decimal;
  taxPercent?: number | Prisma.Decimal | null;
  notes?: string;
}

export interface SegmentDiscountResolution {
  discountPercent: Prisma.Decimal;
  meetsGoal: boolean;
  salesYTD: Prisma.Decimal;
  goalThreshold: Prisma.Decimal;
}

export interface PricedLine {
  productId: string | null;
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

import { apiFetchClient } from "./api.client";

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

export interface PreviewItemInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  taxPercent?: number;
}

/**
 * The backend is the only authority on price: the segment discount is
 * conditional on the customer meeting their goal, so anything computed here
 * would diverge from what create() persists.
 */
export async function fetchPricingPreview(
  endpoint: "/quotes/preview" | "/orders/preview",
  customerId: string,
  items: PreviewItemInput[],
): Promise<PricingPreview | null> {
  const response = await apiFetchClient(endpoint, {
    method: "POST",
    body: JSON.stringify({ customerId, items }),
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as PricingPreview;
}

export function formatMoney(value: number): string {
  return `$${value.toLocaleString("es-CO")}`;
}

/** Always 2 decimals, never NaN — QUO-02/I18N-02. */
export function formatPercent(value: number | null | undefined): string {
  const n = Number(value);
  return `${(Number.isFinite(n) ? n : 0).toFixed(2)}%`;
}

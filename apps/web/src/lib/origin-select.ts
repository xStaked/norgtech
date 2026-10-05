/** Autocompletes de origen (pedido/cotización) filtrados por cliente. */

export interface OriginOrder {
  id: string;
  customerId?: string | null;
  customer?: { id: string } | null;
  orderNumber?: string | null;
  total?: string | number | null;
}

export interface OriginQuote {
  id: string;
  customerId?: string | null;
  customer?: { id: string } | null;
  total?: string | number | null;
  status?: string | null;
}

export interface OriginOption {
  value: string;
  label: string;
  meta?: string;
}

function belongsTo(item: OriginOrder | OriginQuote, customerId: string): boolean {
  if (!customerId) return false;
  const owner = item.customerId ?? item.customer?.id ?? null;
  return owner === customerId;
}

function shortId(id: string): string {
  return `#${id.slice(-6)}`;
}

export function orderOptionsForCustomer(
  orders: OriginOrder[],
  customerId: string,
): OriginOption[] {
  if (!customerId) return [];
  return orders
    .filter((o) => belongsTo(o, customerId))
    .map((o) => ({
      value: o.id,
      label: o.orderNumber ? `Pedido ${o.orderNumber}` : `Pedido ${shortId(o.id)}`,
      meta: o.total !== null && o.total !== undefined ? `$${Number(o.total).toLocaleString("es-CO")}` : undefined,
    }));
}

export function quoteOptionsForCustomer(
  quotes: OriginQuote[],
  customerId: string,
): OriginOption[] {
  if (!customerId) return [];
  return quotes
    .filter((q) => belongsTo(q, customerId))
    .map((q) => ({
      value: q.id,
      label: `Cotización ${shortId(q.id)}`,
      meta:
        [
          q.total !== null && q.total !== undefined
            ? `$${Number(q.total).toLocaleString("es-CO")}`
            : null,
          q.status ?? null,
        ]
          .filter(Boolean)
          .join(" · ") || undefined,
    }));
}

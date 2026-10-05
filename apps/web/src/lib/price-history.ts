/**
 * Presentación pura del historial de precios (timeline solo lectura).
 *
 * Sin imports: testable con `node --test src/lib/price-history.test.ts`.
 * El formato con moneda/locale lo pone la página con `formatPrice`; aquí solo
 * va la lógica de antes/después y orden.
 */

export interface PriceState {
  presentationId?: string;
  empaque?: string | null;
  priceSinIva?: string | number | null;
}

export interface PriceHistoryEntry {
  id: string;
  actorUserId?: string;
  createdAt: string;
  action?: string;
  previousState: PriceState | null;
  nextState: PriceState | null;
}

export interface PriceHistoryRow extends PriceHistoryEntry {
  change: string;
}

/** Sin antes = la presentación entra por primera vez a la lista. */
export function isCreation(entry: Pick<PriceHistoryEntry, "previousState">): boolean {
  return entry.previousState === null || entry.previousState === undefined;
}

function displayPrice(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return String(value);
}

/** "100 → 120"; creación: "— → 120 (nuevo)". */
export function describePriceChange(
  before: PriceState | null,
  after: PriceState | null,
): string {
  const from = displayPrice(before?.priceSinIva);
  const to = displayPrice(after?.priceSinIva);
  if (isCreation({ previousState: before })) {
    return `${from} → ${to} (nuevo)`;
  }
  return `${from} → ${to}`;
}

/** Entradas más recientes primero, cada una con su `change` ya calculado. */
export function summarizeHistory(entries: PriceHistoryEntry[]): PriceHistoryRow[] {
  return [...entries]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .map((entry) => ({
      ...entry,
      change: describePriceChange(entry.previousState, entry.nextState),
    }));
}

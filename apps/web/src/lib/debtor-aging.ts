/** Aging de deudores: agrupa saldos por cliente y moneda en buckets por dias de mora. */

export interface AgingInvoice {
  id: string;
  customerId: string;
  customerName: string;
  totalAmount: string | number;
  totalPaid: string | number;
  creditNoteTotal?: string | number | null;
  dueDate: string;
  status: string;
  invoiceNumber: string;
  currency?: string | null;
}

export interface DebtorRow {
  customerId: string;
  customerName: string;
  currency: string;
  balance: number;
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90plus: number;
  oldestDueDate: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toDayUTC(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function bucketAging(invoices: AgingInvoice[], asOfISO: string): DebtorRow[] {
  const asOf = toDayUTC(asOfISO);
  const byCustomer = new Map<string, DebtorRow>();

  for (const inv of invoices) {
    if (inv.status === "anulada") continue;
    const balance =
      Number(inv.totalAmount) -
      Number(inv.totalPaid) -
      Number(inv.creditNoteTotal ?? 0);
    if (balance <= 0) continue;

    const currency = inv.currency ?? "COP";
    const key = `${inv.customerId}|${currency}`;
    let row = byCustomer.get(key);
    if (!row) {
      row = {
        customerId: inv.customerId,
        customerName: inv.customerName,
        currency,
        balance: 0,
        current: 0,
        d1_30: 0,
        d31_60: 0,
        d61_90: 0,
        d90plus: 0,
        oldestDueDate: inv.dueDate,
      };
      byCustomer.set(key, row);
    }

    row.balance += balance;
    if (inv.dueDate < row.oldestDueDate) row.oldestDueDate = inv.dueDate;

    const overdueDays = Math.floor((asOf - toDayUTC(inv.dueDate)) / DAY_MS);
    if (overdueDays <= 0) row.current += balance;
    else if (overdueDays <= 30) row.d1_30 += balance;
    else if (overdueDays <= 60) row.d31_60 += balance;
    else if (overdueDays <= 90) row.d61_90 += balance;
    else row.d90plus += balance;
  }

  return [...byCustomer.values()].sort((a, b) => b.balance - a.balance);
}

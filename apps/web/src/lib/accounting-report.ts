/** Reporte contable de solo lectura: ventas por tarifa de IVA, pagos y notas. */

export interface AccountingPayment {
  paymentDate: string;
  amount: string | number;
}

export interface AccountingInvoice {
  id: string;
  issueDate: string;
  status: string;
  subtotal: string | number;
  taxAmount: string | number;
  totalAmount: string | number;
  creditNoteTotal?: string | number | null;
  payments?: AccountingPayment[] | null;
}

export interface TaxBucket {
  base: number;
  tax: number;
  total: number;
  count: number;
}

export interface AccountingSummary {
  salesByTax: { rate0: TaxBucket; rate5: TaxBucket };
  paymentsReceived: number;
  creditNotes: number;
}

function emptyBucket(): TaxBucket {
  return { base: 0, tax: 0, total: 0, count: 0 };
}

function inRange(dayISO: string, fromISO: string, toISO: string): boolean {
  const day = dayISO.slice(0, 10);
  return day >= fromISO && day <= toISO;
}

export function summarizeAccounting(
  invoices: AccountingInvoice[],
  fromISO: string,
  toISO: string,
): AccountingSummary {
  const from = fromISO.slice(0, 10);
  const to = toISO.slice(0, 10);
  const summary: AccountingSummary = {
    salesByTax: { rate0: emptyBucket(), rate5: emptyBucket() },
    paymentsReceived: 0,
    creditNotes: 0,
  };

  for (const invoice of invoices) {
    if (invoice.status === "anulada") continue;

    if (inRange(invoice.issueDate, from, to)) {
      // GET /invoices no trae lineas: la tarifa se infiere por factura
      // (taxAmount > 0 -> 5%, = 0 -> 0%). Sin retenciones ni DIAN.
      const bucket =
        Number(invoice.taxAmount) > 0 ? summary.salesByTax.rate5 : summary.salesByTax.rate0;
      bucket.base += Number(invoice.subtotal);
      bucket.tax += Number(invoice.taxAmount);
      bucket.total += Number(invoice.totalAmount);
      bucket.count += 1;
      // El API no expone fecha de nota credito: se atribuye a la factura,
      // por fecha de emision en el rango.
      summary.creditNotes += Number(invoice.creditNoteTotal ?? 0);
    }

    // Pagos por fecha de pago en el rango, vengan de la factura que vengan.
    for (const payment of invoice.payments ?? []) {
      if (inRange(payment.paymentDate, from, to)) {
        summary.paymentsReceived += Number(payment.amount);
      }
    }
  }

  return summary;
}

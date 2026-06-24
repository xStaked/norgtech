import { InvoiceStatus, PaymentMethod, Prisma } from "@prisma/client";

type Decimalish = Prisma.Decimal | number | string;

/** Outstanding cartera balance: total minus payments and credit notes. */
export function invoiceBalance(
  totalAmount: Decimalish,
  totalPaid: Decimalish,
  creditNoteTotal: Decimalish = 0,
): Prisma.Decimal {
  return new Prisma.Decimal(totalAmount)
    .minus(new Prisma.Decimal(totalPaid))
    .minus(new Prisma.Decimal(creditNoteTotal));
}

/**
 * Recompute invoice status from settled amount (payments + credit notes).
 * Never overrides a terminal anulada; keeps current when nothing is settled.
 */
export function computeInvoiceStatus(
  current: InvoiceStatus,
  totalAmount: Decimalish,
  totalPaid: Decimalish,
  creditNoteTotal: Decimalish = 0,
): InvoiceStatus {
  if (current === "anulada") return "anulada";
  const settled = new Prisma.Decimal(totalPaid).plus(new Prisma.Decimal(creditNoteTotal));
  if (settled.gte(new Prisma.Decimal(totalAmount))) return "pagada";
  if (settled.gt(0)) return "parcialmente_pagada";
  return current;
}

export const invoiceStatusTransitions: Record<
  InvoiceStatus,
  InvoiceStatus[]
> = {
  emitida: ["enviada", "anulada"],
  enviada: ["parcialmente_pagada", "pagada", "vencida", "anulada"],
  parcialmente_pagada: ["pagada", "vencida"],
  pagada: [],
  vencida: ["pagada", "parcialmente_pagada"],
  anulada: [],
};

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  emitida: "Emitida",
  enviada: "Enviada",
  parcialmente_pagada: "Parcialmente pagada",
  pagada: "Pagada",
  vencida: "Vencida",
  anulada: "Anulada",
};

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  consignacion: "Consignacion",
  cheque: "Cheque",
  deposito: "Deposito",
  tarjeta: "Tarjeta",
  otro: "Otro",
};

export const customerTypeLabels: Record<string, string> = {
  distribuidor: "Distribuidor",
  cliente_directo: "Cliente directo",
  planta_balanceados: "Planta de balanceados",
  maquila: "Maquila",
  otro: "Otro",
};

export const paymentConditionLabels: Record<string, string> = {
  contado: "Contado",
  credito_15: "Credito 15 dias",
  credito_30: "Credito 30 dias",
  credito_60: "Credito 60 dias",
  credito_90: "Credito 90 dias",
};

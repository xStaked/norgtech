import { InvoiceStatus, PaymentMethod } from "@prisma/client";

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

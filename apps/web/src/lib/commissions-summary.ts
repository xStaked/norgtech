/**
 * Liquidacion de comisiones (Frente 3, fase 2): montos y totales por estado
 * sobre las filas del API. Helper puro y libre de dependencias, testeado con
 * `npx -y tsx --test` (el alias @/ no aplica: solo importaciones relativas).
 *
 * El "estado" de liquidacion vive en `paidAt` (marcado por admin/director), no
 * en el status de causacion: una fila con nota credito parcial sigue pendiente
 * por el neto, y una totalmente revertida tiene neto 0 aunque siga `causada`.
 */

export interface CommissionRowLike {
  amount: string | number;
  reversedAmount?: string | number | null;
  paidAt?: string | null;
}

export interface CommissionTotals {
  /** Pendiente de liquidar: suma neta de las filas sin `paidAt`. */
  pendiente: number;
  /** Ya liquidada: suma neta de las filas con `paidAt`. */
  pagada: number;
  /** Informativo: todo lo revertido por notas credito del periodo. */
  revertido: number;
}

/** Centavos sin ruido de flotantes: los montos son Decimal(14,2). */
function toCents(value: number): number {
  return Math.round(value * 100);
}

/** Neto liquidable de una fila: causado menos lo revertido por nota credito. */
export function netCommissionAmount(
  amount: string | number,
  reversedAmount?: string | number | null,
): number {
  const net = toCents(Number(amount)) - toCents(Number(reversedAmount ?? 0));
  return net / 100;
}

export function summarizeCommissions(
  rows: CommissionRowLike[],
): CommissionTotals {
  const totals: CommissionTotals = { pendiente: 0, pagada: 0, revertido: 0 };

  for (const row of rows) {
    const net = netCommissionAmount(row.amount, row.reversedAmount);
    totals.revertido += Number(row.reversedAmount ?? 0);
    if (row.paidAt) {
      totals.pagada += net;
    } else {
      totals.pendiente += net;
    }
  }

  totals.revertido = toCents(totals.revertido) / 100;
  totals.pendiente = toCents(totals.pendiente) / 100;
  totals.pagada = toCents(totals.pagada) / 100;

  return totals;
}

/**
 * Fila de liquidacion para la tabla y el CSV de /commissions. `estadoLabel` ya
 * viene resuelto en es-CO ("Causada", "Pagada", "Reversada") para que el CSV
 * muestre lo mismo que la pantalla.
 */
export interface CommissionLiquidationRow {
  id: string;
  sellerName: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  customerName: string | null;
  paymentDate: string;
  base: number;
  percent: number;
  amount: number;
  reversedAmount: number;
  net: number;
  estadoLabel: string;
}

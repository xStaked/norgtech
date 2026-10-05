/**
 * Bonificaciones por línea (fase 2 comercial): 10/20/30/40%.
 *
 * Puro y sin dependencias: no importa nada, para poder correrlo con
 * `node --test` directo. La regla fiscal la fija el Ruling 1: las unidades
 * bonificadas van a $0 pero SÍ causan IVA, calculado sobre el precio de
 * lista sin bonificar (tasa del ítem × precio lista × cant. bonificada).
 */

export type BonusPercent = 10 | 20 | 30 | 40;

export const BONUS_PERCENTS: BonusPercent[] = [10, 20, 30, 40];

export interface BonusLineInput {
  /** Cantidad total de la línea (cobradas + bonificadas). */
  quantity: number;
  /** Precio de lista sin bonificar, sin IVA. Base del IVA (Ruling 1). */
  unitPrice: number;
  /** Tasa de IVA del ítem (p. ej. 19). */
  taxPercent: number;
  bonusPercent?: number | null;
}

export interface BonusLineResult {
  chargedQty: number;
  bonusQty: number;
  /** Las unidades bonificadas siempre van a $0. */
  bonusUnitPrice: 0;
  /** Lo que se cobra: chargedQty × precio de lista. */
  chargedSubtotal: number;
  /**
   * IVA total de la línea: tasa × precio de lista × cantidad total
   * (cobradas + bonificadas). Ver Ruling 1.
   */
  taxAmount: number;
  totalWithTax: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function applyBonus(line: BonusLineInput): BonusLineResult {
  const bonusPercent = line.bonusPercent ?? null;
  if (bonusPercent !== null && !(BONUS_PERCENTS as number[]).includes(bonusPercent)) {
    throw new Error(
      `bonusPercent inválido: ${bonusPercent}. Permitidos: 10, 20, 30, 40.`,
    );
  }

  const bonusQty = bonusPercent === null ? 0 : round2((line.quantity * bonusPercent) / 100);
  const chargedQty = round2(line.quantity - bonusQty);
  const chargedSubtotal = round2(chargedQty * line.unitPrice);
  const taxAmount = round2((line.unitPrice * line.taxPercent * line.quantity) / 100);

  return {
    chargedQty,
    bonusQty,
    bonusUnitPrice: 0,
    chargedSubtotal,
    taxAmount,
    totalWithTax: round2(chargedSubtotal + taxAmount),
  };
}

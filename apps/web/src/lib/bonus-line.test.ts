// node --test src/lib/bonus-line.test.ts   (desde apps/web)
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyBonus, BONUS_PERCENTS } from "./bonus-line.ts";

test("linea de 10 uds al 20% → 8 cobradas + 2 bonificadas a $0", () => {
  const result = applyBonus({ quantity: 10, unitPrice: 100, taxPercent: 19, bonusPercent: 20 });

  assert.equal(result.chargedQty, 8);
  assert.equal(result.bonusQty, 2);
  assert.equal(result.bonusUnitPrice, 0);
});

test("el total cobrado no incluye bonificadas pero el IVA si (Ruling 1)", () => {
  const result = applyBonus({ quantity: 10, unitPrice: 100, taxPercent: 19, bonusPercent: 20 });

  // Cobrado: 8 × 100 = 800 (las 2 bonificadas van a $0).
  assert.equal(result.chargedSubtotal, 800);
  // IVA: 19% × 100 × (8 cobradas + 2 bonificadas) = 190.
  assert.equal(result.taxAmount, 190);
  assert.equal(result.totalWithTax, 990);
});

test("sin bonificacion la linea queda intacta", () => {
  const result = applyBonus({ quantity: 3, unitPrice: 50, taxPercent: 19 });

  assert.equal(result.chargedQty, 3);
  assert.equal(result.bonusQty, 0);
  assert.equal(result.chargedSubtotal, 150);
  assert.equal(result.taxAmount, 28.5);
  assert.equal(result.totalWithTax, 178.5);
});

test("solo se permiten 10/20/30/40", () => {
  assert.deepEqual([...BONUS_PERCENTS], [10, 20, 30, 40]);
  assert.throws(() => applyBonus({ quantity: 10, unitPrice: 100, taxPercent: 19, bonusPercent: 15 }), /bonusPercent/);
});

// npx -y tsx --test src/lib/commissions-summary.test.ts   (desde apps/web)
// El helper es libre de dependencias, asi que con Node >= 22 tambien corre:
//   node --test src/lib/commissions-summary.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { netCommissionAmount, summarizeCommissions } from "./commissions-summary.ts";

test("neto por fila = causado menos lo revertido, sin ruido de flotantes", () => {
  assert.equal(netCommissionAmount("25000", "0"), 25000);
  assert.equal(netCommissionAmount(25000, 10000), 15000);
  // Decimal(14,2): los centavos son exactos a 2 decimales.
  assert.equal(netCommissionAmount("100.10", "0.05"), 100.05);
});

test("totales por estado: pendiente (sin pagada) y pagada (con paidAt)", () => {
  const totals = summarizeCommissions([
    // Causada, sin reverso: pendiente completa.
    { amount: "25000", reversedAmount: "0", paidAt: null },
    // Causada con reverso parcial: pendiente el neto (15000).
    { amount: "25000", reversedAmount: "10000", paidAt: null },
    // Pagada al vendedor.
    { amount: "30000", reversedAmount: "0", paidAt: "2026-07-01T12:00:00.000Z" },
    // Totalmente revertida (sin paidAt): neto 0, no aporte a pendiente.
    { amount: "5000", reversedAmount: "5000", paidAt: null },
  ]);

  assert.equal(totals.pendiente, 40000);
  assert.equal(totals.pagada, 30000);
  assert.equal(totals.revertido, 15000); // 10000 + 5000, informativo
});

test("lista vacia da totales en cero", () => {
  assert.deepEqual(summarizeCommissions([]), {
    pendiente: 0,
    pagada: 0,
    revertido: 0,
  });
});

test("reversedAmount ausente o null se trata como 0", () => {
  const totals = summarizeCommissions([
    { amount: "12000", paidAt: "2026-07-02T12:00:00.000Z" },
    { amount: "8000", reversedAmount: null, paidAt: null },
  ]);
  assert.equal(totals.pendiente, 8000);
  assert.equal(totals.pagada, 12000);
});

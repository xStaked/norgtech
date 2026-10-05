// node --test src/lib/accounting-report.test.ts   (desde apps/web)
import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeAccounting } from "./accounting-report.ts";

test("agrega ventas por tarifa 0%/5% y suma pagos y notas en el rango", () => {
  const summary = summarizeAccounting(
    [
      {
        id: "a",
        issueDate: "2026-09-10",
        status: "emitida",
        subtotal: "100",
        taxAmount: "5",
        totalAmount: "105",
        creditNoteTotal: "10",
        payments: [
          { paymentDate: "2026-09-12", amount: "20" },
          { paymentDate: "2026-10-01", amount: "50" },
        ],
      },
      {
        id: "b",
        issueDate: "2026-09-15",
        status: "emitida",
        subtotal: "200",
        taxAmount: "0",
        totalAmount: "200",
        payments: [],
      },
      {
        id: "c",
        issueDate: "2026-08-01",
        status: "emitida",
        subtotal: "1000",
        taxAmount: "50",
        totalAmount: "1050",
        payments: [{ paymentDate: "2026-09-20", amount: "100" }],
      },
      {
        id: "d",
        issueDate: "2026-09-20",
        status: "anulada",
        subtotal: "500",
        taxAmount: "25",
        totalAmount: "525",
        payments: [],
      },
    ],
    "2026-09-01",
    "2026-09-30",
  );

  assert.equal(summary.salesByTax.rate5.base, 100);
  assert.equal(summary.salesByTax.rate5.tax, 5);
  assert.equal(summary.salesByTax.rate0.base, 200);
  assert.equal(summary.salesByTax.rate0.tax, 0);
  // Pagos por fecha de pago en el rango: 20 (a) + 100 (c, factura de agosto
  // cobrada en septiembre). El pago de octubre queda fuera.
  assert.equal(summary.paymentsReceived, 120);
  // Notas por fecha de emision de la factura en el rango (el API no expone
  // fecha de nota): solo la factura a.
  assert.equal(summary.creditNotes, 10);
});

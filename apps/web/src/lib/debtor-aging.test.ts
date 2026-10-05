// node --test src/lib/debtor-aging.test.ts   (desde apps/web)
import assert from "node:assert/strict";
import { test } from "node:test";
import { bucketAging } from "./debtor-aging.ts";

test("excluye anuladas y resta notas credito", () => {
  const rows = bucketAging([
    { id: "a", customerId: "c1", customerName: "A", totalAmount: "100", totalPaid: "20", creditNoteTotal: "10", dueDate: "2026-09-01", status: "emitida", invoiceNumber: "F1" },
    { id: "b", customerId: "c1", customerName: "A", totalAmount: "50", totalPaid: "0", dueDate: "2026-09-01", status: "anulada", invoiceNumber: "F2" },
  ], "2026-10-05");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].balance, 70);
});

test("ubica saldos en el bucket correcto", () => {
  const rows = bucketAging([
    { id: "a", customerId: "c1", customerName: "A", totalAmount: "100", totalPaid: "0", dueDate: "2026-09-20", status: "emitida", invoiceNumber: "F1" },
  ], "2026-10-05");
  assert.equal(rows[0].d1_30, 100);
  assert.equal(rows[0].d31_60, 0);
});

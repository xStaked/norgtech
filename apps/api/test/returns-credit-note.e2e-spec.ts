import {
  computeInvoiceStatus,
  invoiceBalance,
} from "../src/modules/invoices/invoice-constants";

// Pure-logic check for the cartera adjustment driven by return credit notes.
describe("invoice credit-note math", () => {
  it("a credit note reduces the outstanding balance", () => {
    expect(invoiceBalance(1000, 0, 0).toNumber()).toBe(1000);
    expect(invoiceBalance(1000, 200, 300).toNumber()).toBe(500);
  });

  it("settles the invoice when payments + credit notes cover the total", () => {
    expect(computeInvoiceStatus("enviada", 1000, 1000, 0)).toBe("pagada");
    expect(computeInvoiceStatus("enviada", 1000, 400, 600)).toBe("pagada");
  });

  it("marks partial when settled but not fully covered", () => {
    expect(computeInvoiceStatus("enviada", 1000, 0, 300)).toBe("parcialmente_pagada");
  });

  it("keeps current status when nothing is settled, never overrides anulada", () => {
    expect(computeInvoiceStatus("emitida", 1000, 0, 0)).toBe("emitida");
    expect(computeInvoiceStatus("anulada", 1000, 0, 1000)).toBe("anulada");
  });
});

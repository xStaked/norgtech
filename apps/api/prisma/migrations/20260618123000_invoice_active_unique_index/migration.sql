-- Enforce one active invoice per order while allowing annulled invoices to remain historical records.
CREATE UNIQUE INDEX "Invoice_orderId_active_key"
ON "Invoice"("orderId")
WHERE "orderId" IS NOT NULL
  AND "status" <> 'anulada';

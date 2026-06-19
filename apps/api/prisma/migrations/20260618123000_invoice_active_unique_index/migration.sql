-- Enforce one active invoice per order while allowing annulled invoices to remain historical records.
-- If this migration finds multiple active invoices for the same order, stop here and clean them up
-- manually before applying the unique index below. We do not rewrite accounting state implicitly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Invoice"
    WHERE "orderId" IS NOT NULL
      AND "status" <> 'anulada'
    GROUP BY "orderId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Found duplicate active invoices per order. Clean them up before applying the index.';
  END IF;
END $$;

CREATE UNIQUE INDEX "Invoice_orderId_active_key"
ON "Invoice"("orderId")
WHERE "orderId" IS NOT NULL
  AND "status" <> 'anulada';

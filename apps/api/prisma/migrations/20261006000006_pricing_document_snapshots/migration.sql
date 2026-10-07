ALTER TABLE "Quote" ADD COLUMN "currencySnapshot" TEXT NOT NULL DEFAULT 'COP';
ALTER TABLE "QuoteItem" ADD COLUMN "priceSource" TEXT DEFAULT 'legacy';
ALTER TABLE "QuoteItem" ADD COLUMN "priceListIdSnapshot" TEXT;
ALTER TABLE "QuoteItem" ADD COLUMN "priceListNameSnapshot" TEXT;
ALTER TABLE "QuoteItem" ADD COLUMN "currencySnapshot" TEXT DEFAULT 'COP';
ALTER TABLE "QuoteItem" ADD COLUMN "taxPercentSnapshot" DECIMAL(5,2);
ALTER TABLE "Order" ADD COLUMN "currencySnapshot" TEXT NOT NULL DEFAULT 'COP';
ALTER TABLE "OrderItem" ADD COLUMN "priceSource" TEXT DEFAULT 'legacy';
ALTER TABLE "OrderItem" ADD COLUMN "priceListIdSnapshot" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "priceListNameSnapshot" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "currencySnapshot" TEXT DEFAULT 'COP';
ALTER TABLE "Invoice" ADD COLUMN "currencySnapshot" TEXT NOT NULL DEFAULT 'COP';

-- Backfill currency from Customer where possible; keep COP default otherwise.
UPDATE "Quote" q SET "currencySnapshot" = c."currency" FROM "Customer" c WHERE c."id" = q."customerId" AND c."currency" IN ('COP','USD');
UPDATE "Order" o SET "currencySnapshot" = c."currency" FROM "Customer" c WHERE c."id" = o."customerId" AND c."currency" IN ('COP','USD');
UPDATE "Invoice" i SET "currencySnapshot" = c."currency" FROM "Customer" c WHERE c."id" = i."customerId" AND c."currency" IN ('COP','USD');

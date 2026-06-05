ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'en_transito';

ALTER TABLE "Order"
  ADD COLUMN "carrierName" TEXT,
  ADD COLUMN "trackingNumber" TEXT,
  ADD COLUMN "trackingUrl" TEXT,
  ADD COLUMN "deliveredToName" TEXT,
  ADD COLUMN "deliveryConfirmationNotes" TEXT;

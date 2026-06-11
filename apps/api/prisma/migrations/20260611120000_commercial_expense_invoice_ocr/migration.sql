ALTER TABLE "CommercialExpense"
ADD COLUMN "supplierName" TEXT,
ADD COLUMN "supplierNit" TEXT,
ADD COLUMN "invoiceNumber" TEXT,
ADD COLUMN "paymentMethod" TEXT,
ADD COLUMN "extractionConfidence" DECIMAL(5, 4),
ADD COLUMN "extractionModel" TEXT,
ADD COLUMN "extractionReviewedAt" TIMESTAMP(3);

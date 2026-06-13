-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "nit" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_prefix_key" ON "Company"("prefix");

-- Insert default company record
INSERT INTO "Company" ("id", "name", "legalName", "nit", "prefix", "isActive", "createdAt", "updatedAt")
VALUES ('clx_default_norgtech', 'Norgtech', 'Norgtech S.A.S.', '900000000-0', 'NT', true, NOW(), NOW());

-- AlterTable (nullable first to set defaults from existing data)
ALTER TABLE "BillingRequest" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Order" ADD COLUMN "companyId" TEXT;

-- Backfill existing rows with the default company
UPDATE "BillingRequest" SET "companyId" = 'clx_default_norgtech' WHERE "companyId" IS NULL;
UPDATE "Invoice" SET "companyId" = 'clx_default_norgtech' WHERE "companyId" IS NULL;
UPDATE "Order" SET "companyId" = 'clx_default_norgtech' WHERE "companyId" IS NULL;

-- Make columns NOT NULL
ALTER TABLE "BillingRequest" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Invoice" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "companyId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingRequest" ADD CONSTRAINT "BillingRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

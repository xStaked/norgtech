-- AlterTable
ALTER TABLE "Order"
ADD COLUMN "billingCompanyNameSnapshot" TEXT,
ADD COLUMN "branchNameSnapshot" TEXT;

CREATE INDEX "Order_orderDate_idx" ON "Order"("orderDate");

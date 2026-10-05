-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "sellerUserId" TEXT NOT NULL,
    "periodType" TEXT NOT NULL,
    "periodValue" TEXT NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommissionRule_sellerUserId_periodType_periodValue_key" ON "CommissionRule"("sellerUserId", "periodType", "periodValue");

-- CreateIndex
CREATE INDEX "CommissionRule_periodType_periodValue_idx" ON "CommissionRule"("periodType", "periodValue");

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

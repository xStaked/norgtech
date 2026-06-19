-- CreateTable
CREATE TABLE "SellerGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodType" TEXT NOT NULL,
    "periodValue" TEXT NOT NULL,
    "targetAmount" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SellerGoal_userId_periodType_periodValue_key" ON "SellerGoal"("userId", "periodType", "periodValue");

-- CreateIndex
CREATE INDEX "SellerGoal_periodType_periodValue_idx" ON "SellerGoal"("periodType", "periodValue");

-- AddForeignKey
ALTER TABLE "SellerGoal" ADD CONSTRAINT "SellerGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

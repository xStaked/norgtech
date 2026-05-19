-- CreateTable
CREATE TABLE "CustomerGoal" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "periodType" TEXT NOT NULL DEFAULT 'anual',
    "periodValue" TEXT NOT NULL,
    "targetAmount" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerGoal_customerId_idx" ON "CustomerGoal"("customerId");

-- AddForeignKey
ALTER TABLE "CustomerGoal" ADD CONSTRAINT "CustomerGoal_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

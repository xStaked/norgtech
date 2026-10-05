-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('causada', 'reversada');

-- CreateTable
CREATE TABLE "Commission" (
    "id" TEXT NOT NULL,
    "sellerUserId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "base" DECIMAL(14,2) NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'causada',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Commission_paymentId_key" ON "Commission"("paymentId");

-- CreateIndex
CREATE INDEX "Commission_sellerUserId_idx" ON "Commission"("sellerUserId");

-- CreateIndex
CREATE INDEX "Commission_invoiceId_idx" ON "Commission"("invoiceId");

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "InvoicePayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

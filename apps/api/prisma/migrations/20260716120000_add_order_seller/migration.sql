-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "sellerUserId" TEXT;

-- CreateIndex
CREATE INDEX "Order_sellerUserId_orderDate_idx" ON "Order"("sellerUserId", "orderDate");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

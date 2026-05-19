-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "discountPercent" DECIMAL(5,2),
ADD COLUMN     "originalUnitPrice" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "bonusPercent" INTEGER,
ADD COLUMN     "bonusQty" DECIMAL(14,4);

-- AlterTable
ALTER TABLE "QuoteItem" ADD COLUMN     "bonusPercent" INTEGER,
ADD COLUMN     "bonusQty" DECIMAL(14,4);

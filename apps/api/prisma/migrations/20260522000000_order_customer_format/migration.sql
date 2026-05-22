-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "orderNumber" TEXT,
ADD COLUMN     "purchaseOrderNumber" TEXT,
ADD COLUMN     "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "customerNameSnapshot" TEXT,
ADD COLUMN     "customerNitSnapshot" TEXT,
ADD COLUMN     "dispatchAddressSnapshot" TEXT,
ADD COLUMN     "requesterName" TEXT,
ADD COLUMN     "requesterEmail" TEXT,
ADD COLUMN     "requesterRole" TEXT,
ADD COLUMN     "requesterPhone" TEXT,
ADD COLUMN     "approvedQuoteConsecutive" TEXT,
ADD COLUMN     "deliveryInstructions" TEXT,
ADD COLUMN     "receiverName" TEXT,
ADD COLUMN     "receiverEmail" TEXT,
ADD COLUMN     "receiverPhone" TEXT,
ADD COLUMN     "receiverRole" TEXT,
ADD COLUMN     "invoiceFilingPlace" TEXT,
ADD COLUMN     "approvalStatus" TEXT,
ADD COLUMN     "approvalReason" TEXT,
ADD COLUMN     "approvalName" TEXT,
ADD COLUMN     "reviewDate" TIMESTAMP(3),
ADD COLUMN     "preparedByName" TEXT,
ADD COLUMN     "zone" TEXT,
ADD COLUMN     "preparedByRole" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "presentationSnapshot" TEXT,
ADD COLUMN     "customProductName" TEXT,
ADD COLUMN     "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 19,
ADD COLUMN     "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalWithTax" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

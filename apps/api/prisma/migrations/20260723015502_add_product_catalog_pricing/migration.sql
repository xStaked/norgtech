-- CreateEnum
CREATE TYPE "PriceListKind" AS ENUM ('segmento', 'cliente', 'export', 'linea');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "priceListId" TEXT;

-- CreateTable
CREATE TABLE "ProductPresentation" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "empaque" TEXT NOT NULL,
    "form" TEXT,
    "dosage" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductPresentation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceList" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PriceListKind" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceListItem" (
    "id" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "presentationId" TEXT NOT NULL,
    "priceSinIva" DECIMAL(14,2),
    "priceConIva" DECIMAL(14,2),
    "taxPercent" DECIMAL(5,2),
    "priceSinIva2" DECIMAL(14,2),
    "priceConIva2" DECIMAL(14,2),
    "priceSinIva3" DECIMAL(14,2),
    "priceConIva3" DECIMAL(14,2),

    CONSTRAINT "PriceListItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductPresentation_productId_empaque_key" ON "ProductPresentation"("productId", "empaque");

-- CreateIndex
CREATE UNIQUE INDEX "PriceList_name_key" ON "PriceList"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PriceListItem_priceListId_presentationId_key" ON "PriceListItem"("priceListId", "presentationId");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPresentation" ADD CONSTRAINT "ProductPresentation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "ProductPresentation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('distribuidor', 'cliente_directo', 'planta_balanceados', 'maquila', 'otro');

-- CreateEnum
CREATE TYPE "PaymentCondition" AS ENUM ('contado', 'credito_15', 'credito_30', 'credito_60', 'credito_90');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('emitida', 'enviada', 'parcialmente_pagada', 'pagada', 'vencida', 'anulada');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('efectivo', 'transferencia', 'consignacion', 'cheque', 'deposito', 'tarjeta', 'otro');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "creditLimit" DECIMAL(14,2),
ADD COLUMN     "customerType" "CustomerType" DEFAULT 'cliente_directo',
ADD COLUMN     "paymentCondition" "PaymentCondition" DEFAULT 'contado',
ADD COLUMN     "paymentDays" INTEGER DEFAULT 0;

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "totalPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'emitida',
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoicePayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoicePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSupport" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentSupport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_customerId_status_idx" ON "Invoice"("customerId", "status");

-- CreateIndex
CREATE INDEX "Invoice_dueDate_status_idx" ON "Invoice"("dueDate", "status");

-- CreateIndex
CREATE INDEX "Invoice_orderId_idx" ON "Invoice"("orderId");

-- CreateIndex
CREATE INDEX "InvoicePayment_invoiceId_paymentDate_idx" ON "InvoicePayment"("invoiceId", "paymentDate");

-- CreateIndex
CREATE INDEX "PaymentSupport_paymentId_idx" ON "PaymentSupport"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSupport_bucket_objectKey_key" ON "PaymentSupport"("bucket", "objectKey");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSupport" ADD CONSTRAINT "PaymentSupport_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "InvoicePayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSupport" ADD CONSTRAINT "PaymentSupport_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

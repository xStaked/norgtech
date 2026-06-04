-- CreateEnum
CREATE TYPE "CommercialExpenseStatus" AS ENUM ('pendiente', 'requiere_correccion', 'aprobado', 'rechazado', 'contabilizado');

-- CreateEnum
CREATE TYPE "CommercialExpenseCategory" AS ENUM ('alimentacion', 'transporte', 'hospedaje', 'combustible', 'peajes', 'parqueadero', 'atencion_comercial', 'otros');

-- CreateTable
CREATE TABLE "CommercialExpense" (
    "id" TEXT NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "category" "CommercialExpenseCategory" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "description" TEXT NOT NULL,
    "status" "CommercialExpenseStatus" NOT NULL DEFAULT 'pendiente',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "submittedByUserId" TEXT NOT NULL,
    "customerId" TEXT,
    "visitId" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialExpenseSupport" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT,
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialExpenseSupport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommercialExpense_submittedByUserId_expenseDate_idx" ON "CommercialExpense"("submittedByUserId", "expenseDate");

-- CreateIndex
CREATE INDEX "CommercialExpense_status_expenseDate_idx" ON "CommercialExpense"("status", "expenseDate");

-- CreateIndex
CREATE INDEX "CommercialExpense_category_expenseDate_idx" ON "CommercialExpense"("category", "expenseDate");

-- CreateIndex
CREATE INDEX "CommercialExpense_customerId_idx" ON "CommercialExpense"("customerId");

-- CreateIndex
CREATE INDEX "CommercialExpense_visitId_idx" ON "CommercialExpense"("visitId");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialExpenseSupport_bucket_objectKey_key" ON "CommercialExpenseSupport"("bucket", "objectKey");

-- CreateIndex
CREATE INDEX "CommercialExpenseSupport_expenseId_idx" ON "CommercialExpenseSupport"("expenseId");

-- CreateIndex
CREATE INDEX "CommercialExpenseSupport_uploadedByUserId_idx" ON "CommercialExpenseSupport"("uploadedByUserId");

-- AddForeignKey
ALTER TABLE "CommercialExpense" ADD CONSTRAINT "CommercialExpense_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialExpense" ADD CONSTRAINT "CommercialExpense_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialExpense" ADD CONSTRAINT "CommercialExpense_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialExpense" ADD CONSTRAINT "CommercialExpense_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialExpenseSupport" ADD CONSTRAINT "CommercialExpenseSupport_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "CommercialExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialExpenseSupport" ADD CONSTRAINT "CommercialExpenseSupport_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

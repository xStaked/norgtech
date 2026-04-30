-- AlterEnum
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('administrador', 'director_comercial', 'comercial', 'tecnico', 'facturacion', 'logistica');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "public"."UserRole_old";
COMMIT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "assignedLogisticsUserId" TEXT,
ADD COLUMN     "committedDeliveryDate" TIMESTAMP(3),
ADD COLUMN     "deliveryDate" TIMESTAMP(3),
ADD COLUMN     "dispatchDate" TIMESTAMP(3),
ADD COLUMN     "logisticsNotes" TEXT;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_assignedLogisticsUserId_fkey" FOREIGN KEY ("assignedLogisticsUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


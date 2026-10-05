-- CreateEnum
CREATE TYPE "PriceListStatus" AS ENUM ('borrador', 'en_revision', 'aprobada', 'rechazada');

-- AlterTable
ALTER TABLE "PriceList" ADD COLUMN "status" "PriceListStatus" NOT NULL DEFAULT 'borrador';

-- Las listas existentes ya están en producción cotizando: quedan aprobadas
-- para que la regla "solo aprobada libera precio" no les corte el precio.
-- Las nuevas nacen en borrador (default del schema) hasta su aprobación.
UPDATE "PriceList" SET "status" = 'aprobada';

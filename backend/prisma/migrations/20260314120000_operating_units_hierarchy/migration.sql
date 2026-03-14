-- CreateTable
CREATE TABLE "operating_units" (
    "id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT,
    "species_type" TEXT NOT NULL,
    "unit_type" TEXT,
    "capacity" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operating_units_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "cases"
ADD COLUMN "operating_unit_id" UUID;

-- AlterTable
ALTER TABLE "technical_visits"
ADD COLUMN "operating_unit_id" UUID;

-- AlterTable
ALTER TABLE "fca_calculations"
ADD COLUMN "operating_unit_id" UUID;

-- AlterTable
ALTER TABLE "roi_calculations"
ADD COLUMN "operating_unit_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "operating_units_farm_id_name_key" ON "operating_units"("farm_id", "name");

-- CreateIndex
CREATE INDEX "operating_units_organization_id_idx" ON "operating_units"("organization_id");

-- CreateIndex
CREATE INDEX "operating_units_client_id_idx" ON "operating_units"("client_id");

-- CreateIndex
CREATE INDEX "operating_units_farm_id_idx" ON "operating_units"("farm_id");

-- CreateIndex
CREATE INDEX "operating_units_status_idx" ON "operating_units"("status");

-- CreateIndex
CREATE INDEX "operating_units_species_type_idx" ON "operating_units"("species_type");

-- CreateIndex
CREATE INDEX "cases_operating_unit_id_idx" ON "cases"("operating_unit_id");

-- CreateIndex
CREATE INDEX "technical_visits_operating_unit_id_idx" ON "technical_visits"("operating_unit_id");

-- CreateIndex
CREATE INDEX "fca_calculations_operating_unit_id_idx" ON "fca_calculations"("operating_unit_id");

-- CreateIndex
CREATE INDEX "roi_calculations_operating_unit_id_idx" ON "roi_calculations"("operating_unit_id");

-- AddForeignKey
ALTER TABLE "operating_units"
ADD CONSTRAINT "operating_units_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operating_units"
ADD CONSTRAINT "operating_units_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases"
ADD CONSTRAINT "cases_operating_unit_id_fkey" FOREIGN KEY ("operating_unit_id") REFERENCES "operating_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_visits"
ADD CONSTRAINT "technical_visits_operating_unit_id_fkey" FOREIGN KEY ("operating_unit_id") REFERENCES "operating_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fca_calculations"
ADD CONSTRAINT "fca_calculations_operating_unit_id_fkey" FOREIGN KEY ("operating_unit_id") REFERENCES "operating_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roi_calculations"
ADD CONSTRAINT "roi_calculations_operating_unit_id_fkey" FOREIGN KEY ("operating_unit_id") REFERENCES "operating_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

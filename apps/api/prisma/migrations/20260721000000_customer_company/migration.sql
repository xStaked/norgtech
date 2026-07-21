-- 1. Nanonutricion tiene que existir antes de poder referenciarla en el backfill.
INSERT INTO "Company" (id, name, "legalName", nit, prefix, "isActive", "createdAt", "updatedAt")
VALUES (
  'clx_default_nanonutricion',
  'Nanonutrición',
  'Nanonutrición S.A.S.',
  '902040575-6',
  'NN',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (prefix) DO NOTHING;

-- 2. Columna nullable para no romper las filas existentes.
ALTER TABLE "Customer" ADD COLUMN "companyId" TEXT;

-- 3. Backfill: el import dejo la hoja de origen en notes.
UPDATE "Customer"
SET "companyId" = 'clx_default_nanonutricion'
WHERE notes LIKE '%hoja Nanonutrición%';

-- Todo lo demas (incluido lo que no vino del import) va a la empresa por defecto.
UPDATE "Customer"
SET "companyId" = 'clx_default_norgtech'
WHERE "companyId" IS NULL;

-- 4. Recien ahora se puede exigir.
ALTER TABLE "Customer" ALTER COLUMN "companyId" SET NOT NULL;

ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"(id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Customer_companyId_idx" ON "Customer"("companyId");

-- 5. Empresas de prueba: ya no quedan ordenes ni facturas apuntando a ellas.
DELETE FROM "Company" WHERE prefix IN ('EP', 'INAC', 'EPP');

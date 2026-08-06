-- Los segmentos dejan de ser niveles con descuento y meta: el cliente solo
-- quiere una etiqueta, Distribuidor o Directo. Se crean los dos, se reasignan
-- todos los clientes segun su customerType y los viejos quedan inactivos.
--
-- Las columnas discountPercent/minGoalAmount/maxGoalAmount se quedan como
-- estan: el motor de precios ya no descuenta nada con 0, y si algun dia se
-- vuelven a necesitar los niveles no hay que reconstruir el modelo.

INSERT INTO "CustomerSegment" (
  "id", "name", "description", "discountPercent", "minGoalAmount", "maxGoalAmount",
  "active", "createdBy", "updatedBy", "createdAt", "updatedAt"
)
VALUES
  ('seg_distribuidor', 'Distribuidor', 'Etiqueta comercial. Sin descuento ni meta.', 0, 0, NULL, true, 'system', 'system', NOW(), NOW()),
  ('seg_directo', 'Directo', 'Etiqueta comercial. Sin descuento ni meta.', 0, 0, NULL, true, 'system', 'system', NOW(), NOW())
ON CONFLICT ("name") DO UPDATE
SET "discountPercent" = 0,
    "minGoalAmount" = 0,
    "maxGoalAmount" = NULL,
    "active" = true,
    "updatedAt" = NOW();

UPDATE "Customer"
SET "segmentId" = (SELECT "id" FROM "CustomerSegment" WHERE "name" = 'Distribuidor')
WHERE "customerType" = 'distribuidor';

-- IS DISTINCT FROM, no <>: customerType es nullable y esos clientes tambien
-- son Directo.
UPDATE "Customer"
SET "segmentId" = (SELECT "id" FROM "CustomerSegment" WHERE "name" = 'Directo')
WHERE "customerType" IS DISTINCT FROM 'distribuidor';

UPDATE "CustomerSegment"
SET "active" = false, "updatedAt" = NOW()
WHERE "name" NOT IN ('Distribuidor', 'Directo');

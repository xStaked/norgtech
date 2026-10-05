-- Liquidacion de comisiones (Frente 3, fase 2, Task 3): paidAt/paidBy marcan
-- que el neto ya se le pago al vendedor. Columnas separadas del enum
-- CommissionStatus a proposito: el reverso de Task 2 solo toca filas status
-- causada, asi que una nota credito posterior a la liquidacion sigue revirtiendo
-- el neto sin tocar la maquina de causacion/reversion.
ALTER TABLE "Commission" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "Commission" ADD COLUMN "paidBy" TEXT;

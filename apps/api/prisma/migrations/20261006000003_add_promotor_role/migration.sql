-- Nuevo rol de campo: capta prospectos en eventos y visitas, con permisos
-- equivalentes a comercial salvo analitica agregada ajena (Task 2+ del plan
-- rol-promotor). Va sola porque el valor del enum debe quedar aplicado antes
-- de que migraciones posteriores (o el codigo) lo usen.
ALTER TYPE "UserRole" ADD VALUE 'promotor';

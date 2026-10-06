-- Nuevo rol de campo: capta prospectos en eventos y visitas, con permisos
-- equivalentes a comercial salvo analitica agregada ajena (Task 2+ del plan
-- rol-promotor). ALTER TYPE ... ADD VALUE no puede correr dentro de un bloque
-- de transaccion con otros DDL, por eso esta migracion va sola.
ALTER TYPE "UserRole" ADD VALUE 'promotor';

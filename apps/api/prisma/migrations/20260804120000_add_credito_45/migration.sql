-- El listado de clientes de Melissa trae 14 clientes a "45 DIAS", un plazo que
-- el enum no contemplaba.
ALTER TYPE "PaymentCondition" ADD VALUE IF NOT EXISTS 'credito_45' AFTER 'credito_30';

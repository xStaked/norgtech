-- ============================================================
-- 013_feed_record_stage.sql — Etapa productiva en costos de alimento
-- ============================================================

ALTER TABLE public.monthly_feed_records
  ADD COLUMN IF NOT EXISTS production_stage TEXT NOT NULL DEFAULT 'engorde';

ALTER TABLE public.monthly_feed_records
  DROP CONSTRAINT IF EXISTS monthly_feed_records_production_stage_check;

ALTER TABLE public.monthly_feed_records
  ADD CONSTRAINT monthly_feed_records_production_stage_check
  CHECK (production_stage IN ('levante', 'engorde'));

ALTER TABLE public.monthly_feed_records
  DROP CONSTRAINT IF EXISTS monthly_feed_records_batch_id_concentrate_id_year_month_key;

ALTER TABLE public.monthly_feed_records
  ADD CONSTRAINT monthly_feed_records_batch_id_concentrate_id_year_month_stage_key
  UNIQUE (batch_id, concentrate_id, year, month, production_stage);

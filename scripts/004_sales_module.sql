-- ============================================================
-- 004_sales_module.sql — Módulo de Ventas y Control de Costos
-- ============================================================

-- 1. Columnas adicionales en batches
ALTER TABLE public.batches
  ADD COLUMN IF NOT EXISTS avg_weight_at_seeding_g   NUMERIC          DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fingerling_cost_per_unit   NUMERIC          DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sale_price_per_kg           NUMERIC,
  ADD COLUMN IF NOT EXISTS target_profitability_pct   NUMERIC          DEFAULT 30,
  ADD COLUMN IF NOT EXISTS labor_cost_per_month        NUMERIC          DEFAULT 0;

-- 2. Columnas de costo en production_records (si no existen)
ALTER TABLE public.production_records
  ADD COLUMN IF NOT EXISTS feed_cost   NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_cost  NUMERIC DEFAULT 0;

-- ============================================================
-- 3. Concentrados (alimento) — gestionables por el productor
-- ============================================================
CREATE TABLE IF NOT EXISTS public.feed_concentrates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  brand           TEXT,
  price_per_kg    NUMERIC     NOT NULL DEFAULT 0,
  protein_pct     NUMERIC,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.feed_concentrates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "concentrates_select" ON public.feed_concentrates FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "concentrates_insert" ON public.feed_concentrates FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "concentrates_update" ON public.feed_concentrates FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "concentrates_delete" ON public.feed_concentrates FOR DELETE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE profiles.id = auth.uid()));

-- ============================================================
-- 4. Registros mensuales de alimento por lote
-- ============================================================
CREATE TABLE IF NOT EXISTS public.monthly_feed_records (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id         UUID        NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  concentrate_id   UUID        REFERENCES public.feed_concentrates(id) ON DELETE SET NULL,
  concentrate_name TEXT        NOT NULL,
  year             INTEGER     NOT NULL,
  month            INTEGER     NOT NULL CHECK (month BETWEEN 1 AND 12),
  kg_used          NUMERIC     NOT NULL DEFAULT 0,
  cost_per_kg      NUMERIC     NOT NULL DEFAULT 0,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, concentrate_id, year, month)
);
ALTER TABLE public.monthly_feed_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feed_records_select" ON public.monthly_feed_records FOR SELECT TO authenticated
  USING (batch_id IN (
    SELECT b.id FROM public.batches b
    JOIN public.ponds p ON p.id = b.pond_id
    JOIN public.profiles pr ON pr.organization_id = p.organization_id
    WHERE pr.id = auth.uid()
  ));
CREATE POLICY "feed_records_insert" ON public.monthly_feed_records FOR INSERT TO authenticated
  WITH CHECK (batch_id IN (
    SELECT b.id FROM public.batches b
    JOIN public.ponds p ON p.id = b.pond_id
    JOIN public.profiles pr ON pr.organization_id = p.organization_id
    WHERE pr.id = auth.uid()
  ));
CREATE POLICY "feed_records_update" ON public.monthly_feed_records FOR UPDATE TO authenticated
  USING (batch_id IN (
    SELECT b.id FROM public.batches b
    JOIN public.ponds p ON p.id = b.pond_id
    JOIN public.profiles pr ON pr.organization_id = p.organization_id
    WHERE pr.id = auth.uid()
  ));
CREATE POLICY "feed_records_delete" ON public.monthly_feed_records FOR DELETE TO authenticated
  USING (batch_id IN (
    SELECT b.id FROM public.batches b
    JOIN public.ponds p ON p.id = b.pond_id
    JOIN public.profiles pr ON pr.organization_id = p.organization_id
    WHERE pr.id = auth.uid()
  ));

-- ============================================================
-- 5. Registros de cosecha (merma real)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.harvest_records (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id                  UUID        NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  harvest_date              DATE        NOT NULL,
  total_animals             INTEGER     NOT NULL,
  avg_weight_whole_g        NUMERIC     NOT NULL,       -- peso promedio entero
  avg_weight_eviscerated_g  NUMERIC,                   -- peso promedio eviscerado
  labor_cost                NUMERIC     NOT NULL DEFAULT 0,
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.harvest_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "harvest_select" ON public.harvest_records FOR SELECT TO authenticated
  USING (batch_id IN (
    SELECT b.id FROM public.batches b
    JOIN public.ponds p ON p.id = b.pond_id
    JOIN public.profiles pr ON pr.organization_id = p.organization_id
    WHERE pr.id = auth.uid()
  ));
CREATE POLICY "harvest_insert" ON public.harvest_records FOR INSERT TO authenticated
  WITH CHECK (batch_id IN (
    SELECT b.id FROM public.batches b
    JOIN public.ponds p ON p.id = b.pond_id
    JOIN public.profiles pr ON pr.organization_id = p.organization_id
    WHERE pr.id = auth.uid()
  ));
CREATE POLICY "harvest_update" ON public.harvest_records FOR UPDATE TO authenticated
  USING (batch_id IN (
    SELECT b.id FROM public.batches b
    JOIN public.ponds p ON p.id = b.pond_id
    JOIN public.profiles pr ON pr.organization_id = p.organization_id
    WHERE pr.id = auth.uid()
  ));
CREATE POLICY "harvest_delete" ON public.harvest_records FOR DELETE TO authenticated
  USING (batch_id IN (
    SELECT b.id FROM public.batches b
    JOIN public.ponds p ON p.id = b.pond_id
    JOIN public.profiles pr ON pr.organization_id = p.organization_id
    WHERE pr.id = auth.uid()
  ));

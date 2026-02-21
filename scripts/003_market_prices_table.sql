-- Market Prices from SIPSA
CREATE TABLE IF NOT EXISTS public.market_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  species TEXT NOT NULL,
  price_min NUMERIC NOT NULL,
  price_max NUMERIC NOT NULL,
  price_avg NUMERIC NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kg',
  city TEXT,
  source TEXT NOT NULL DEFAULT 'SIPSA - DANE',
  market_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.market_prices ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Cualquier usuario autenticado puede leer precios de mercado
CREATE POLICY "market_prices_select" ON public.market_prices
  FOR SELECT TO authenticated
  USING (true);

-- Cualquier usuario autenticado puede insertar/actualizar precios de mercado
-- (en producción, limitar solo a rol 'admin' o 'service_role')
CREATE POLICY "market_prices_insert" ON public.market_prices
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "market_prices_update" ON public.market_prices
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Index for faster lookups by species and date
CREATE INDEX IF NOT EXISTS idx_market_prices_species ON public.market_prices(species);
CREATE INDEX IF NOT EXISTS idx_market_prices_date ON public.market_prices(market_date);

-- Unique constraint for UPSERT
ALTER TABLE public.market_prices ADD CONSTRAINT unique_market_price UNIQUE (species, city, market_date);

-- Rate Libraries: enterprise-wide reference market rates by discipline (STR/MEP/ARC)
-- Populated from seed files in docs/03-Business-Modules/12-Quantity-Surveying/

CREATE TABLE IF NOT EXISTS public.rate_libraries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discipline    TEXT NOT NULL CHECK (discipline IN ('STR','MEP','ARC')),
  code          TEXT NOT NULL,
  description   TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('material','labor','plant')),
  unit          TEXT NOT NULL,
  unit_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'USD',
  supplier_name TEXT,
  quote_ref     TEXT,
  quote_date    DATE,
  valid_until   DATE,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(discipline, code)
);

CREATE INDEX IF NOT EXISTS idx_rate_libraries_discipline ON public.rate_libraries(discipline);
CREATE INDEX IF NOT EXISTS idx_rate_libraries_category ON public.rate_libraries(category);
CREATE INDEX IF NOT EXISTS idx_rate_libraries_code ON public.rate_libraries(code);

ALTER TABLE public.rate_libraries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Rate libraries: auth read" ON public.rate_libraries
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Rate libraries: auth insert" ON public.rate_libraries
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Rate libraries: auth update" ON public.rate_libraries
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Rate libraries: auth delete" ON public.rate_libraries
  FOR DELETE TO authenticated USING (true);

-- updated_at trigger (inline function if not exists)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_rate_libraries_updated_at ON public.rate_libraries;
CREATE TRIGGER set_rate_libraries_updated_at
  BEFORE UPDATE ON public.rate_libraries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

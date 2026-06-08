-- Account/Finance Phase 1: Financial Periods

CREATE TABLE IF NOT EXISTS public.account_financial_periods (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_code TEXT NOT NULL UNIQUE,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  is_open     BOOLEAN NOT NULL DEFAULT true,
  closed_at   TIMESTAMPTZ,
  closed_by   UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.account_financial_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_periods_auth" ON public.account_financial_periods TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_account_periods_code ON public.account_financial_periods(period_code);

-- Seed: 24 rolling months
DO $$
DECLARE
  d DATE := DATE_TRUNC('month', CURRENT_DATE)::DATE;
  i INTEGER;
BEGIN
  FOR i IN 0..23 LOOP
    INSERT INTO public.account_financial_periods (period_code, start_date, end_date)
    VALUES (
      TO_CHAR(d + (i || ' months')::INTERVAL, 'YYYY-MM'),
      d + (i || ' months')::INTERVAL,
      (d + (i || ' months')::INTERVAL + INTERVAL '1 month' - INTERVAL '1 day')::DATE
    )
    ON CONFLICT (period_code) DO NOTHING;
  END LOOP;
END $$;

-- QS: Time-phased planned cost baseline (S-curve monthly distribution)
CREATE TABLE IF NOT EXISTS public.qs_cost_baseline (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  period_date DATE NOT NULL,          -- First day of the month
  planned_cost NUMERIC(15,2) NOT NULL DEFAULT 0,
  cumulative_planned NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes       TEXT,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, period_date)
);

ALTER TABLE public.qs_cost_baseline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qs_cost_baseline_auth" ON public.qs_cost_baseline
  TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_qs_cost_baseline_project ON public.qs_cost_baseline(project_id);
CREATE INDEX idx_qs_cost_baseline_period  ON public.qs_cost_baseline(period_date);

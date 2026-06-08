-- QS: Contingency drawdown register
CREATE TABLE IF NOT EXISTS public.qs_contingency_drawdowns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  boq_item_id UUID REFERENCES public.qs_boq_items(id) ON DELETE SET NULL,
  amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  reason      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.qs_contingency_drawdowns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qs_contingency_auth" ON public.qs_contingency_drawdowns
  TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_qs_contingency_project ON public.qs_contingency_drawdowns(project_id);

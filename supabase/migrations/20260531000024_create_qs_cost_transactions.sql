-- QS Module Phase 1: Actual cost transactions

CREATE TABLE IF NOT EXISTS public.qs_cost_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  boq_item_id      UUID REFERENCES public.qs_boq_items(id) ON DELETE SET NULL,
  wbs_node_id      UUID REFERENCES public.wbs_nodes(id) ON DELETE SET NULL,
  transaction_type TEXT NOT NULL DEFAULT 'invoice'
    CHECK (transaction_type IN ('invoice','po','timesheet','delivery','other')),
  cost_category    TEXT NOT NULL DEFAULT 'material'
    CHECK (cost_category IN ('labor','material','equipment','subcontract','other')),
  description      TEXT NOT NULL,
  quantity         NUMERIC(15,3),
  unit             TEXT,
  unit_cost        NUMERIC(12,2),
  total_cost       NUMERIC(15,2) NOT NULL,
  reference_number TEXT,
  vendor_name      TEXT,
  cost_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  invoice_date     DATE,
  payment_status   TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','approved','paid')),
  approved_by      UUID REFERENCES auth.users(id),
  approved_at      TIMESTAMPTZ,
  notes            TEXT,
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.qs_cost_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qs_cost_tx_auth" ON public.qs_cost_transactions TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_qs_cost_tx_project  ON public.qs_cost_transactions(project_id);
CREATE INDEX idx_qs_cost_tx_boq_item ON public.qs_cost_transactions(boq_item_id);
CREATE INDEX idx_qs_cost_tx_date     ON public.qs_cost_transactions(cost_date);

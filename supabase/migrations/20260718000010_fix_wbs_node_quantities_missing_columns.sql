-- Fix: ensure wbs_node_quantities table and all columns exist in production.
-- This migration is fully idempotent — safe to run multiple times.

-- 1. Create table if it doesn't exist at all
CREATE TABLE IF NOT EXISTS public.wbs_node_quantities (
  id              uuid primary key default gen_random_uuid(),
  wbs_node_id     uuid not null references public.wbs_nodes(id) on delete cascade,
  metric_code     text not null,
  value           numeric(14,2) not null default 0,
  unit            text not null default 'm2',
  source          text,
  revision_reason text,
  created_by      uuid references auth.users(id),
  updated_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 2. Add missing columns (safe ALTERs)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wbs_node_quantities' AND column_name='source') THEN
    ALTER TABLE public.wbs_node_quantities ADD COLUMN source text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wbs_node_quantities' AND column_name='revision_reason') THEN
    ALTER TABLE public.wbs_node_quantities ADD COLUMN revision_reason text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wbs_node_quantities' AND column_name='created_by') THEN
    ALTER TABLE public.wbs_node_quantities ADD COLUMN created_by uuid references auth.users(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wbs_node_quantities' AND column_name='updated_by') THEN
    ALTER TABLE public.wbs_node_quantities ADD COLUMN updated_by uuid references auth.users(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wbs_node_quantities' AND column_name='updated_at') THEN
    ALTER TABLE public.wbs_node_quantities ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END
$$;

-- 3. Unique constraint (safe to add)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public'
    AND table_name='wbs_node_quantities'
    AND constraint_type='UNIQUE'
  ) THEN
    ALTER TABLE public.wbs_node_quantities
      ADD CONSTRAINT wbs_node_quantities_wbs_node_id_metric_code_key
      UNIQUE (wbs_node_id, metric_code);
  END IF;
END
$$;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_wbs_node_quantities_wbs_node_id ON public.wbs_node_quantities(wbs_node_id);
CREATE INDEX IF NOT EXISTS idx_wbs_node_quantities_metric_code ON public.wbs_node_quantities(metric_code);

-- 5. RLS
ALTER TABLE public.wbs_node_quantities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view wbs node quantities" ON public.wbs_node_quantities;
CREATE POLICY "Authenticated users can view wbs node quantities"
  ON public.wbs_node_quantities FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can create wbs node quantities" ON public.wbs_node_quantities;
CREATE POLICY "Authenticated users can create wbs node quantities"
  ON public.wbs_node_quantities FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update wbs node quantities" ON public.wbs_node_quantities;
CREATE POLICY "Authenticated users can update wbs node quantities"
  ON public.wbs_node_quantities FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can delete wbs node quantities" ON public.wbs_node_quantities;
CREATE POLICY "Admins can delete wbs node quantities"
  ON public.wbs_node_quantities FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- 6. Audit trigger
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_schema='public' AND routine_name='qs_audit_trigger_fn') THEN
    DROP TRIGGER IF EXISTS qs_audit_wbs_node_quantities ON public.wbs_node_quantities;
    CREATE TRIGGER qs_audit_wbs_node_quantities
      AFTER INSERT OR UPDATE OR DELETE ON public.wbs_node_quantities
      FOR EACH ROW EXECUTE FUNCTION public.qs_audit_trigger_fn();
  END IF;
END
$$;

-- 7. updated_at trigger
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_schema='public' AND routine_name='set_updated_at') THEN
    DROP TRIGGER IF EXISTS set_wbs_node_quantities_updated_at ON public.wbs_node_quantities;
    CREATE TRIGGER set_wbs_node_quantities_updated_at
      BEFORE UPDATE ON public.wbs_node_quantities
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END
$$;

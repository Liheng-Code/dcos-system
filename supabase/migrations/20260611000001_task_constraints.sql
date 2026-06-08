-- Task Constraints table for Lookahead (Level 5) scheduling.
-- Each row records whether a required resource/input is available for a task.

CREATE TABLE IF NOT EXISTS public.task_constraints (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID NOT NULL REFERENCES public.wbs_tasks(id) ON DELETE CASCADE,
  constraint_type TEXT NOT NULL CHECK (constraint_type IN ('drawings','materials','crew','permits','equipment','predecessor')),
  status          TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('ok','missing','unknown','pending')),
  notes           TEXT,
  updated_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, constraint_type)
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_task_constraints_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_task_constraints_updated_at ON public.task_constraints;
CREATE TRIGGER trg_task_constraints_updated_at
  BEFORE UPDATE ON public.task_constraints
  FOR EACH ROW EXECUTE FUNCTION public.set_task_constraints_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_task_constraints_task_id ON public.task_constraints(task_id);
CREATE INDEX IF NOT EXISTS idx_task_constraints_status   ON public.task_constraints(status);

-- RLS
ALTER TABLE public.task_constraints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_constraints_select"
  ON public.task_constraints FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "task_constraints_insert"
  ON public.task_constraints FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "task_constraints_update"
  ON public.task_constraints FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "task_constraints_delete"
  ON public.task_constraints FOR DELETE
  TO authenticated
  USING (true);

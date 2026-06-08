-- Planning & Scheduling Module — Phase 6
-- Multi-predecessor dependencies, constraints, milestones, work calendars

-- ── 1. Extend wbs_tasks ─────────────────────────────────────────────────────────
-- Multi-predecessor (parallel arrays)
ALTER TABLE public.wbs_tasks ADD COLUMN IF NOT EXISTS dependency_task_ids  UUID[];
ALTER TABLE public.wbs_tasks ADD COLUMN IF NOT EXISTS dependency_types      TEXT[];
ALTER TABLE public.wbs_tasks ADD COLUMN IF NOT EXISTS dependency_lag_days   NUMERIC[];

-- Schedule constraints
ALTER TABLE public.wbs_tasks ADD COLUMN IF NOT EXISTS constraint_type TEXT
  CHECK (constraint_type IS NULL OR constraint_type IN (
    'as_soon_as_possible','as_late_as_possible',
    'must_start_on','must_finish_on',
    'start_no_earlier_than','start_no_later_than',
    'finish_no_earlier_than','finish_no_later_than'
  ));
ALTER TABLE public.wbs_tasks ADD COLUMN IF NOT EXISTS constraint_date DATE;

-- Milestone flag (zero-duration tasks)
ALTER TABLE public.wbs_tasks ADD COLUMN IF NOT EXISTS is_milestone BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_wbs_tasks_dep_ids ON public.wbs_tasks USING GIN (dependency_task_ids);

-- ── 2. Work Calendars ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_calendars (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  monday      BOOLEAN NOT NULL DEFAULT true,
  tuesday     BOOLEAN NOT NULL DEFAULT true,
  wednesday   BOOLEAN NOT NULL DEFAULT true,
  thursday    BOOLEAN NOT NULL DEFAULT true,
  friday      BOOLEAN NOT NULL DEFAULT true,
  saturday    BOOLEAN NOT NULL DEFAULT false,
  sunday      BOOLEAN NOT NULL DEFAULT false,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.plan_calendar_exceptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id    UUID NOT NULL REFERENCES public.plan_calendars(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL,
  is_working     BOOLEAN NOT NULL DEFAULT false,
  reason         TEXT,
  UNIQUE (calendar_id, exception_date)
);

CREATE INDEX IF NOT EXISTS idx_plan_calendars_project   ON public.plan_calendars(project_id);
CREATE INDEX IF NOT EXISTS idx_calendar_exceptions_cal  ON public.plan_calendar_exceptions(calendar_id);

-- ── 3. RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.plan_calendars            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_calendar_exceptions  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_plan_calendars"            ON public.plan_calendars           TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_plan_calendar_exceptions"  ON public.plan_calendar_exceptions TO authenticated USING (true) WITH CHECK (true);

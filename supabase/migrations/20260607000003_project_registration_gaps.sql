-- Project Registration gap fields (SOP-PS-001 §7)
-- Adds: location, time_zone, contract_number, project_director_id,
--       engineering_manager_id, planning_manager_id
-- Fixes: project_status values to match SOP §23 names

-- ─── 1. Missing registration fields ─────────────────────────────────────────

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS location               text,
  ADD COLUMN IF NOT EXISTS time_zone              text DEFAULT 'Asia/Phnom_Penh',
  ADD COLUMN IF NOT EXISTS contract_number        text,
  ADD COLUMN IF NOT EXISTS project_director_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS engineering_manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS planning_manager_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ─── 2. Fix project_status to match SOP §23 ─────────────────────────────────
-- SOP: Draft | Pending Approval | Active | On Hold | Completed | Archived
-- Was: tender | (missing)       | active | on_hold  | completed | closed

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_project_status_check;

UPDATE public.projects SET project_status = 'draft'
  WHERE project_status = 'tender';

UPDATE public.projects SET project_status = 'archived'
  WHERE project_status = 'closed';

ALTER TABLE public.projects
  ADD CONSTRAINT projects_project_status_check
  CHECK (project_status IN (
    'draft',
    'pending_approval',
    'active',
    'on_hold',
    'completed',
    'archived'
  ));

-- Backfill default for any NULLs
UPDATE public.projects SET project_status = 'draft'
  WHERE project_status IS NULL;

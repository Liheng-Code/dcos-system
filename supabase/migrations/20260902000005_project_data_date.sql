-- Schedule "data date" (a.k.a. status / as-of date) for a project.
-- The Planning ▸ Gantt Chart reads this to draw the data-date marker, and CPM /
-- progress reporting evaluates the schedule up to this date. Referenced by
-- gantt-view.tsx and the Hattha Bank Tower seed; the column was missing, which
-- caused a 400 on  GET /rest/v1/projects?select=data_date...

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS data_date date;

COMMENT ON COLUMN public.projects.data_date IS
  'Schedule data date (status / as-of date). Progress, earned value and CPM are evaluated up to this date.';

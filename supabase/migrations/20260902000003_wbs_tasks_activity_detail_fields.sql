-- Planning ▸ Gantt Chart: fields surfaced in the activity detail panel that
-- opens when a user clicks a task on the timeline (Properties / Links / Progress).

ALTER TABLE public.wbs_tasks
  ADD COLUMN IF NOT EXISTS activity_type           text,
  ADD COLUMN IF NOT EXISTS actual_start_date       date,
  ADD COLUMN IF NOT EXISTS actual_finish_date      date,
  ADD COLUMN IF NOT EXISTS field_observation_notes text;

COMMENT ON COLUMN public.wbs_tasks.activity_type IS
  'Schedule activity classification (normal, loe, hammock, start_milestone, finish_milestone).';
COMMENT ON COLUMN public.wbs_tasks.actual_start_date IS
  'Actual start captured from a field progress update in the Gantt progress tab.';
COMMENT ON COLUMN public.wbs_tasks.actual_finish_date IS
  'Actual finish captured when physical progress reaches 100%.';
COMMENT ON COLUMN public.wbs_tasks.field_observation_notes IS
  'Latest site field observation / progress narrative from the Gantt progress tab.';

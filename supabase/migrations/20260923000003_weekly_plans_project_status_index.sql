-- Planning module perf fix: use-sheet-data.ts's fetchAll() filters
-- weekly_plans on (project_id, status) to find the latest approved PCR, but
-- only an index on department_id existed (idx_weekly_plans_department,
-- 20260824000004_team_weekly_planning.sql) — that query was seq-scanning the
-- whole table on every Planning page load.
create index if not exists idx_weekly_plans_project_status
  on public.weekly_plans(project_id, status);

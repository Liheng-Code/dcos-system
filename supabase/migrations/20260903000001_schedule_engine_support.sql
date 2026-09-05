-- Planning ▸ Gantt Chart: MS-Project-style working-day scheduling engine support.
--
-- 1. `manually_scheduled` — the per-task override that pins dates against the
--    auto-scheduler (MS Project's "Manually Scheduled" task mode).
-- 2. Integrity CHECKs on the three parallel dependency arrays, which until now
--    could silently drift out of step.
-- 3. `apply_schedule_dates()` — applies a whole reschedule ripple in one round-trip.

-- ---------------------------------------------------------------------------
-- 1. Manual scheduling override
-- ---------------------------------------------------------------------------
alter table public.wbs_tasks
  add column if not exists manually_scheduled boolean not null default false;

comment on column public.wbs_tasks.manually_scheduled is
  'When true the auto-scheduler leaves this task''s start_date/end_date alone; its successors still ripple from them.';

-- ---------------------------------------------------------------------------
-- 2. Dependency-array integrity
--
-- NOT VALID so pre-existing rows cannot block the migration — every new INSERT
-- or UPDATE is still checked. Validate later once legacy data has been cleaned.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.wbs_tasks'::regclass and conname = 'wbs_tasks_dep_arrays_len'
  ) then
    alter table public.wbs_tasks
      add constraint wbs_tasks_dep_arrays_len check (
        coalesce(array_length(dependency_task_ids, 1), 0)
          = coalesce(array_length(dependency_types, 1), 0)
        and coalesce(array_length(dependency_task_ids, 1), 0)
          = coalesce(array_length(dependency_lag_days, 1), 0)
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.wbs_tasks'::regclass and conname = 'wbs_tasks_dep_no_self'
  ) then
    alter table public.wbs_tasks
      add constraint wbs_tasks_dep_no_self check (
        dependency_task_ids is null or not (id = any(dependency_task_ids))
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.wbs_tasks'::regclass and conname = 'wbs_tasks_dep_types_valid'
  ) then
    alter table public.wbs_tasks
      add constraint wbs_tasks_dep_types_valid check (
        dependency_types is null
        or dependency_types <@ array['fs', 'ss', 'ff', 'sf']::text[]
      ) not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Batch date application
--
-- SECURITY INVOKER: the caller's RLS on wbs_tasks still governs the write, so
-- this grants no extra privilege — it only saves N round-trips per ripple.
-- ---------------------------------------------------------------------------
create or replace function public.apply_schedule_dates(
  p_project_id uuid,
  p_rows       jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return 0;
  end if;

  update public.wbs_tasks t
     set start_date = r.start_date,
         end_date   = r.end_date,
         updated_at = now()
    from jsonb_to_recordset(p_rows)
      as r(id uuid, start_date date, end_date date)
   where t.id = r.id
     and t.project_id = p_project_id
     and (t.start_date is distinct from r.start_date
          or t.end_date is distinct from r.end_date);

  get diagnostics v_count = row_count;
  return v_count;
end $$;

comment on function public.apply_schedule_dates(uuid, jsonb) is
  'Applies a batch of scheduled start/end dates for one project in a single statement. Rows: [{"id":uuid,"start_date":date,"end_date":date}].';

revoke all on function public.apply_schedule_dates(uuid, jsonb) from public;
grant execute on function public.apply_schedule_dates(uuid, jsonb) to authenticated;

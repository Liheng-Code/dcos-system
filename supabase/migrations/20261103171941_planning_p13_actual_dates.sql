-- doc 22 P1.3 (Wave 1 gate): an activity with progress carries actual dates, whichever path set the progress
-- (Sheet, Gantt, review decision, daily-report sync, task transition).
-- When progress first rises above 0 and no actual start is recorded, the actual start is the planned start, or the
-- data date (today when none is set) if the planned start is still ahead of it. When progress reaches 100 and no
-- actual finish is recorded, the actual finish is the planned finish, or the data date if that is earlier, never
-- before the actual start. Dates entered by hand are kept (the trigger only fills what is empty).
-- Backfill: existing activities with progress and no actual dates get them the same way (one row on 2026-11-03).

create or replace function public.wbs_tasks_fill_actual_dates()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_as_at date;
begin
  if tg_op = 'UPDATE' and new.progress is not distinct from old.progress then
    return new;
  end if;
  if coalesce(new.progress, 0) <= 0
     or (new.actual_start_date is not null and (coalesce(new.progress, 0) < 100 or new.actual_finish_date is not null)) then
    return new;
  end if;
  select coalesce(p.data_date, current_date) into v_as_at from public.projects p where p.id = new.project_id;
  v_as_at := coalesce(v_as_at, current_date);
  if new.actual_start_date is null then
    new.actual_start_date := least(coalesce(new.start_date, v_as_at), v_as_at);
  end if;
  if coalesce(new.progress, 0) >= 100 and new.actual_finish_date is null then
    new.actual_finish_date := greatest(new.actual_start_date, least(coalesce(new.end_date, v_as_at), v_as_at));
  end if;
  return new;
end;
$$;
revoke all on function public.wbs_tasks_fill_actual_dates() from public, anon, authenticated;

-- named to run before the lock and schedule guards (triggers fire in name order), so they see the filled dates
drop trigger if exists trg_wbs_tasks_actual_dates on public.wbs_tasks;
create trigger trg_wbs_tasks_actual_dates
  before insert or update of progress on public.wbs_tasks
  for each row execute function public.wbs_tasks_fill_actual_dates();

-- backfill (migrations run without a user, which the schedule guard lets through)
update public.wbs_tasks t
   set actual_start_date = least(coalesce(t.start_date, coalesce(p.data_date, current_date)), coalesce(p.data_date, current_date))
  from public.projects p
 where p.id = t.project_id and coalesce(t.progress, 0) > 0 and t.actual_start_date is null;
update public.wbs_tasks t
   set actual_finish_date = greatest(t.actual_start_date, least(coalesce(t.end_date, coalesce(p.data_date, current_date)), coalesce(p.data_date, current_date)))
  from public.projects p
 where p.id = t.project_id and coalesce(t.progress, 0) >= 100 and t.actual_finish_date is null;

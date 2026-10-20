-- Migration: 20261020000002_activity_step_template_matches.sql
-- Purpose: Bulk-applying Activity Step Templates to a project's activities.
--   1. activity_step_template_match: remembered "activity name → template"
--      choices, company-wide, so the next project gets the same suggestion.
--      name_key is the normalised activity name (lower case, level prefixes
--      such as "B1"/"L3"/"GF" removed) made by
--      apps/web/lib/planning/step-template-matching.ts.
--   2. recalc_task_progress_from_steps(): skip the wbs_tasks UPDATE when the
--      progress would not change, so inserting hundreds of 0% steps at once
--      does not run the WBS/project roll-up once per step.
-- Depends on: 20260918000001_activity_step_templates.sql

create table if not exists public.activity_step_template_match (
  name_key text primary key,
  template_id uuid not null references public.activity_step_template_master(id) on delete cascade,
  example_name text,
  updated_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now()
);

comment on table public.activity_step_template_match is
  'Remembered Activity Step Template per activity name (company-wide). Written by Planning > Activity Step Templates > Apply to Activities when "Remember matches" is on; read first when suggesting templates.';
comment on column public.activity_step_template_match.name_key is
  'Normalised activity name: lower case, punctuation folded, level prefixes (B1, L3, GF, Level 2) removed. See normaliseActivityName() in lib/planning/step-template-matching.ts.';

create index if not exists idx_activity_step_template_match_template
  on public.activity_step_template_match(template_id);

alter table public.activity_step_template_match enable row level security;

drop policy if exists "activity_step_template_match view" on public.activity_step_template_match;
drop policy if exists "activity_step_template_match write" on public.activity_step_template_match;

create policy "activity_step_template_match view"
  on public.activity_step_template_match for select to authenticated
  using (true);

create policy "activity_step_template_match write"
  on public.activity_step_template_match for all to authenticated
  using (public.has_permission('planning', 'schedule', 'edit') or public.can_manage_master_libraries())
  with check (public.has_permission('planning', 'schedule', 'edit') or public.can_manage_master_libraries());

drop trigger if exists set_activity_step_template_match_updated_at on public.activity_step_template_match;
create trigger set_activity_step_template_match_updated_at
  before update on public.activity_step_template_match
  for each row execute function public.set_updated_at();

-- Same roll-up as 20260918000001, but only writes when the value changes.
create or replace function public.recalc_task_progress_from_steps()
returns trigger
language plpgsql
as $$
declare
  v_task_id uuid := coalesce(new.task_id, old.task_id);
  v_weighted numeric;
  v_total_weight numeric;
  v_progress numeric;
begin
  select sum(progress * weight), sum(weight)
    into v_weighted, v_total_weight
  from public.wbs_task_steps
  where task_id = v_task_id;

  if v_total_weight is not null and v_total_weight > 0 then
    v_progress := round(v_weighted / v_total_weight, 2);
    -- Plain UPDATE so trg_task_collect_dirty / trg_task_flush_dirty cascade the
    -- roll-up (see 20260918000001). Skipped when nothing changes.
    update public.wbs_tasks
    set progress = v_progress
    where id = v_task_id
      and progress is distinct from v_progress;
  end if;

  return coalesce(new, old);
end;
$$;

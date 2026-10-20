-- Migration: 20261020000001_activity_step_duration_basis.sql
-- Purpose: Make Activity Step durations follow the activity's real duration
--          (which follows its quantity via plan_task_work) instead of a fixed
--          number of days typed into the template.
--
--          Each step now has a duration basis:
--            'fixed'  — takes the same time on every activity (setting out,
--                       inspection / hold point, curing, testing).
--                       est_duration_days holds those days.
--            'scaled' — grows with quantity. duration_share_pct is its share of
--                       the time left after the fixed steps.
--          On a task: scaled step days = (task duration − fixed days) × share.
--          The spread is done by the app (lib/planning/activity-step-spread.ts)
--          when a template is assigned and when the user clicks Re-spread;
--          wbs_task_steps.est_duration_days stores the result.
--
--          Existing template steps are converted: hold points and setting-out /
--          inspection / curing / test steps become fixed and keep their days;
--          the rest become scaled with shares in proportion to their old days.
-- Depends on: 20260918000002_activity_step_template_fields.sql

alter table public.activity_step_template_item
  add column if not exists duration_basis text not null default 'scaled',
  add column if not exists duration_share_pct numeric;

alter table public.wbs_task_steps
  add column if not exists duration_basis text not null default 'scaled',
  add column if not exists duration_share_pct numeric;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'activity_step_template_item_duration_basis_chk') then
    alter table public.activity_step_template_item
      add constraint activity_step_template_item_duration_basis_chk
        check (duration_basis in ('fixed', 'scaled')),
      add constraint activity_step_template_item_duration_share_chk
        check (duration_share_pct is null or duration_share_pct >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wbs_task_steps_duration_basis_chk') then
    alter table public.wbs_task_steps
      add constraint wbs_task_steps_duration_basis_chk
        check (duration_basis in ('fixed', 'scaled')),
      add constraint wbs_task_steps_duration_share_chk
        check (duration_share_pct is null or duration_share_pct >= 0);
  end if;
end $$;

comment on column public.activity_step_template_item.duration_basis is
  'fixed = same days on every activity (est_duration_days); scaled = share of the activity''s quantity-driven time left after fixed steps (duration_share_pct).';
comment on column public.activity_step_template_item.duration_share_pct is
  'Scaled steps only: share (%) of the activity time left after fixed steps. Scaled shares in a template should total 100.';
comment on column public.activity_step_template_item.est_duration_days is
  'Fixed steps only: days this step takes on every activity. Null for scaled steps (their days come from the activity duration).';
comment on column public.wbs_task_steps.duration_basis is
  'Copied from the template on assignment: fixed or scaled (see activity_step_template_item.duration_basis).';
comment on column public.wbs_task_steps.duration_share_pct is
  'Scaled steps only: share (%) of the activity time left after fixed steps.';
comment on column public.wbs_task_steps.est_duration_days is
  'Days for this step on this activity. Fixed steps: as entered. Scaled steps: calculated by the spread from the activity duration.';

-- ── Convert existing rows (only rows never converted: share is null) ─────────
-- Fixed: hold points, and steps that are only setting out / inspection /
-- curing / testing (not "Setting out & excavation" etc., which scale).
create or replace function pg_temp.step_is_fixed(p_name text, p_hold boolean)
returns boolean language sql immutable as $$
  select coalesce(p_hold, false)
      or (
        p_name ~* '^(setting out|curing|inspection|final inspection|client inspection|pressure test|pressure / |leak|flood test|function test|insulation resistance test|load test|certificate)'
        and p_name !~* 'excavation|foundation|pile points|backfill|support|fixing|starter bars|guide wall|formwork|surface finish|joint cutting|flushing'
      )
$$;

-- Templates
with base as (
  select id, template_id,
         pg_temp.step_is_fixed(step_name, inspection_hold_point) as is_fixed,
         coalesce(est_duration_days, 0) as days
  from public.activity_step_template_item
  where duration_share_pct is null
), totals as (
  select template_id, sum(days) filter (where not is_fixed) as scaled_days,
         count(*) filter (where not is_fixed) as scaled_n
  from base group by template_id
)
update public.activity_step_template_item i
set duration_basis = case when b.is_fixed then 'fixed' else 'scaled' end,
    duration_share_pct = case
      when b.is_fixed then null
      when t.scaled_days > 0 then round(b.days / t.scaled_days * 100, 1)
      else round(100.0 / t.scaled_n, 1)
    end,
    est_duration_days = case when b.is_fixed then i.est_duration_days else null end
from base b join totals t on t.template_id = b.template_id
where i.id = b.id;

-- Steps already on tasks: same classification; days stay as they are.
with base as (
  select id, task_id,
         pg_temp.step_is_fixed(step_name, inspection_hold_point) as is_fixed,
         coalesce(est_duration_days, 0) as days
  from public.wbs_task_steps
  where duration_share_pct is null
), totals as (
  select task_id, sum(days) filter (where not is_fixed) as scaled_days,
         count(*) filter (where not is_fixed) as scaled_n
  from base group by task_id
)
update public.wbs_task_steps s
set duration_basis = case when b.is_fixed then 'fixed' else 'scaled' end,
    duration_share_pct = case
      when b.is_fixed then null
      when t.scaled_days > 0 then round(b.days / t.scaled_days * 100, 1)
      else round(100.0 / t.scaled_n, 1)
    end
from base b join totals t on t.task_id = b.task_id
where s.id = b.id;

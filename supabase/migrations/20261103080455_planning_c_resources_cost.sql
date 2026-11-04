-- Phase C (doc 35; PRD MOD-06 / MOD-07): resources and cost.
--   C1  plan_resource_capacity: a resource's capacity can change by date. get_resource_loading flags over-allocation
--       against the capacity on each day (falls back to plan_resources.max_units).
--   C2  plan_material_histogram: material quantities per period from the BOQ programme.
--   C3  plan_cost_components: labour / material / equipment / subcontract cost per activity and per period.
--   C4  cash-flow settings on plan_schedule_settings (the curve itself is pure: lib/planning/cost/cash-flow.ts).
--   C5  plan_budget_reconciliation: activity budgets against the QS approved budget (approved BOQ + approved VOs).
-- Additive only.

-- ───────────────────────────────────────────────────────────── C1 capacity by date
create table if not exists public.plan_resource_capacity (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  resource_id uuid not null references public.plan_resources(id) on delete cascade,
  from_date   date not null,
  to_date     date,
  max_units   numeric not null check (max_units >= 0),
  note        text,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint plan_resource_capacity_dates_chk check (to_date is null or to_date >= from_date)
);
create index if not exists idx_plan_resource_capacity_resource on public.plan_resource_capacity (resource_id, from_date);
create index if not exists idx_plan_resource_capacity_project on public.plan_resource_capacity (project_id);

comment on table public.plan_resource_capacity is
  'Capacity of a project resource over a date range (percent, 100 = one unit), overriding plan_resources.max_units on those days. Ranges of one resource may not overlap; to_date null = open-ended.';

-- One project per row (the resource's), and no overlapping ranges for a resource.
create or replace function public.plan_resource_capacity_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  select r.project_id into new.project_id from public.plan_resources r where r.id = new.resource_id;
  if new.project_id is null then
    raise exception 'Resource not found' using errcode = '23503';
  end if;
  if exists (
    select 1 from public.plan_resource_capacity c
     where c.resource_id = new.resource_id
       and c.id <> new.id
       and daterange(c.from_date, c.to_date, '[]') && daterange(new.from_date, new.to_date, '[]')
  ) then
    raise exception 'This period overlaps another capacity period of the resource' using errcode = '23P01';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.plan_resource_capacity_guard() from public, anon, authenticated;

drop trigger if exists plan_resource_capacity_guard on public.plan_resource_capacity;
create trigger plan_resource_capacity_guard before insert or update on public.plan_resource_capacity
  for each row execute function public.plan_resource_capacity_guard();

alter table public.plan_resource_capacity enable row level security;

drop policy if exists plan_resource_capacity_select on public.plan_resource_capacity;
create policy plan_resource_capacity_select on public.plan_resource_capacity
  for select to authenticated
  using (public.is_project_member(project_id) and public.has_permission('planning', 'resources', 'view'));

drop policy if exists plan_resource_capacity_insert on public.plan_resource_capacity;
create policy plan_resource_capacity_insert on public.plan_resource_capacity
  for insert to authenticated
  with check (public.is_project_member(project_id) and public.has_permission('planning', 'resources', 'edit'));

drop policy if exists plan_resource_capacity_update on public.plan_resource_capacity;
create policy plan_resource_capacity_update on public.plan_resource_capacity
  for update to authenticated
  using (public.is_project_member(project_id) and public.has_permission('planning', 'resources', 'edit'))
  with check (public.is_project_member(project_id) and public.has_permission('planning', 'resources', 'edit'));

drop policy if exists plan_resource_capacity_delete on public.plan_resource_capacity;
create policy plan_resource_capacity_delete on public.plan_resource_capacity
  for delete to authenticated
  using (public.is_project_member(project_id) and public.has_permission('planning', 'resources', 'delete'));

revoke all on public.plan_resource_capacity from anon;
grant select, insert, update, delete on public.plan_resource_capacity to authenticated;

-- Same signature and columns as before; max_units / is_overallocated now use the capacity on that day.
create or replace function public.get_resource_loading(p_project_id uuid, p_from date default null::date, p_to date default null::date)
 returns table(resource_id uuid, resource_name text, resource_type text, work_date date, total_allocation numeric, max_units numeric, is_overallocated boolean, hours_per_day numeric, work_hours numeric)
 language sql
 stable
as $function$
  with project_calendar as (
    select c.id
    from public.plan_calendars c
    where c.project_id = p_project_id
    order by c.is_default desc, c.created_at
    limit 1
  ),
  expanded as (
    select
      a.resource_id,
      a.allocation_percent,
      coalesce(r.calendar_id, (select id from project_calendar)) as calendar_id,
      gs.d::date as work_date
    from public.plan_task_assignments a
    join public.wbs_tasks      t on t.id = a.task_id
    join public.plan_resources r on r.id = a.resource_id
    cross join lateral generate_series(
      greatest(t.start_date, coalesce(p_from, t.start_date)),
      least(t.end_date,      coalesce(p_to,   t.end_date)),
      interval '1 day'
    ) as gs(d)
    where t.project_id = p_project_id
      and r.project_id = p_project_id
      and t.start_date is not null
      and t.end_date   is not null
  ),
  working as (
    select
      e.resource_id,
      e.allocation_percent,
      e.work_date,
      coalesce(c.hours_per_day, 8) as hours_per_day
    from expanded e
    left join public.plan_calendars c
           on c.id = e.calendar_id
    left join public.plan_calendar_exceptions x
           on x.calendar_id = e.calendar_id
          and x.exception_date = e.work_date
    where coalesce(
            x.is_working,
            case
              when c.id is null then extract(isodow from e.work_date) between 1 and 5
              else case extract(isodow from e.work_date)::int
                     when 1 then c.monday
                     when 2 then c.tuesday
                     when 3 then c.wednesday
                     when 4 then c.thursday
                     when 5 then c.friday
                     when 6 then c.saturday
                     when 7 then c.sunday
                   end
            end
          )
  ),
  summed as (
    select
      w.resource_id,
      w.work_date,
      sum(w.allocation_percent) as total_allocation,
      max(w.hours_per_day)      as hours_per_day
    from working w
    group by w.resource_id, w.work_date
  ),
  capped as (
    select s.*, r.name, r.resource_type,
           coalesce((select pc.max_units from public.plan_resource_capacity pc
                      where pc.resource_id = s.resource_id
                        and s.work_date >= pc.from_date
                        and (pc.to_date is null or s.work_date <= pc.to_date)
                      limit 1), r.max_units) as cap
      from summed s
      join public.plan_resources r on r.id = s.resource_id
  )
  select
    c.resource_id,
    c.name                                   as resource_name,
    c.resource_type,
    c.work_date,
    c.total_allocation,
    c.cap                                    as max_units,
    c.total_allocation > c.cap               as is_overallocated,
    c.hours_per_day,
    round(c.total_allocation / 100 * c.hours_per_day, 2) as work_hours
  from capped c
  order by c.name, c.work_date, c.resource_id
$function$;

-- ───────────────────────────────────────────────────────────── C4 cash-flow settings
alter table public.plan_schedule_settings
  add column if not exists cashflow_payment_lag_days      integer not null default 30,
  add column if not exists cashflow_retention_pct         numeric,
  add column if not exists cashflow_retention_limit_pct   numeric,
  add column if not exists cashflow_retention_release_pct numeric not null default 50,
  add column if not exists cashflow_dlp_months            integer not null default 12,
  add column if not exists cashflow_advance_pct           numeric,
  add column if not exists cashflow_advance_recovery_pct  numeric,
  add column if not exists cashflow_cost_lag_days         integer not null default 30;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plan_schedule_settings_cashflow_chk') then
    alter table public.plan_schedule_settings add constraint plan_schedule_settings_cashflow_chk check (
          cashflow_payment_lag_days between 0 and 365
      and cashflow_cost_lag_days between 0 and 365
      and cashflow_dlp_months between 0 and 60
      and cashflow_retention_release_pct between 0 and 100
      and (cashflow_retention_pct is null or cashflow_retention_pct between 0 and 100)
      and (cashflow_retention_limit_pct is null or cashflow_retention_limit_pct between 0 and 100)
      and (cashflow_advance_pct is null or cashflow_advance_pct between 0 and 100)
      and (cashflow_advance_recovery_pct is null or cashflow_advance_recovery_pct between 0 and 100));
  end if;
end $$;

comment on column public.plan_schedule_settings.cashflow_retention_pct is 'Retention % held on each certificate; null = projects.retention.';
comment on column public.plan_schedule_settings.cashflow_advance_pct is 'Advance payment % of the contract value; null = projects.advance_payment.';
comment on column public.plan_schedule_settings.cashflow_advance_recovery_pct is 'Advance recovered as % of each certificate; null = the advance %.';

-- ───────────────────────────────────────────────────────────── shared internals (not callable by users)

-- Hours in one unit of a rate, or null when the unit is not a time unit (same units as the BOQ programme planner).
create or replace function public.plan_rate_per_hour(p_rate numeric, p_unit text, p_hpd numeric)
returns numeric
language sql
immutable
as $$  -- no search_path / tables: inlined into the caller
  select case
    when p_rate is null then null
    when lower(btrim(coalesce(p_unit, ''))) in ('hr', 'hrs', 'hour', 'hours', 'h', 'mh', 'man-hour', 'man-hours', 'manhour', 'manhours', 'man hour', 'man hours') then p_rate
    when lower(btrim(coalesce(p_unit, ''))) in ('day', 'days', 'manday', 'man-day', 'md') then p_rate / nullif(p_hpd, 0)
    when lower(btrim(coalesce(p_unit, ''))) in ('week', 'weeks', 'wk') then p_rate / nullif(p_hpd * 6, 0)
    when lower(btrim(coalesce(p_unit, ''))) in ('month', 'months', 'mth', 'mo') then p_rate / nullif(p_hpd * 26, 0)
  end
$$;

-- The project's working hours per day (default calendar), 8 when none.
create or replace function public.plan_project_hours_per_day(p_project_id uuid)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((select nullif(c.hours_per_day, 0) from public.plan_calendars c
                    where c.project_id = p_project_id order by c.is_default desc, c.created_at limit 1), 8)
$$;

-- Every resource line behind each activity's cost:
--   time resources (labour / equipment hours) from plan_task_resource_hours, the BOQ programme's hours;
--   everything else (materials, subcontract, per-quantity labour / plant) from the activity's BOQ lines x the QS
--   work item's consumption per unit (materials with waste).
-- A BOQ line mapped over 100 % (counted more than once, see plan_boq_mapping_facts) counts once: its quantity is
-- scaled back to the BOQ quantity, and an activity's hours by the same factor (weighted by its lines' amounts, as
-- the programme already scales the amounts). raw_quantity = before that scaling.
-- Rate: the project resource's own rate when one is linked to the QS resource, else the QS costing rate, else
-- (labour hours) the QS daily labour rate. rate null = unpriced.
drop function if exists public.plan_cost_component_rows(uuid);
create function public.plan_cost_component_rows(p_project_id uuid)
returns table(task_id uuid, kind text, dwl_resource_id uuid, unit text, quantity numeric, raw_quantity numeric, rate numeric, currency text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with hpd as (select public.plan_project_hours_per_day(p_project_id) as v),
  ov as (
    select distinct on (pr.dwl_resource_id) pr.dwl_resource_id, pr.cost_per_unit, pr.unit_label
      from public.plan_resources pr
     where pr.project_id = p_project_id and pr.dwl_resource_id is not null and pr.cost_per_unit is not null and pr.is_active
     order by pr.dwl_resource_id, pr.created_at
  ),
  line_f as (
    select b.task_id, b.quantity::numeric as quantity, b.amount, b.qs_boq_item_id, b.tender_boq_item_id,
           greatest(1, sum(b.share_pct) over (partition by coalesce(b.qs_boq_item_id, b.tender_boq_item_id)) / 100) as f
      from public.plan_task_boq_lines b
     where b.project_id = p_project_id
  ),
  task_scale as (
    select task_id,
           case when sum(amount * f) > 0 then sum(amount) / sum(amount * f) else count(*) / sum(f) end as s
      from line_f group by task_id
  ),
  hourly as (
    select h.task_id, h.kind, h.dwl_resource_id, 'hr'::text as unit,
           h.hours::numeric * coalesce(ts.s, 1) as quantity, h.hours::numeric as raw_quantity,
           coalesce(public.plan_rate_per_hour(ov.cost_per_unit, coalesce(ov.unit_label, r.unit), hpd.v),
                    public.plan_rate_per_hour(cr.costing_rate, cr.unit, hpd.v),
                    case when h.kind = 'labor' then lr.daily_rate / hpd.v end) as rate,
           coalesce(cr.currency, lr.currency) as currency
      from public.plan_task_resource_hours h
      cross join hpd
      join public.dwl_resources r on r.id = h.dwl_resource_id
      left join ov on ov.dwl_resource_id = h.dwl_resource_id
      left join public.dwl_v_resource_costing_rates cr on cr.resource_id = h.dwl_resource_id
      left join lateral public.plan_resolve_labor_rate(h.dwl_resource_id) lr on h.kind = 'labor'
      left join task_scale ts on ts.task_id = h.task_id
     where h.project_id = p_project_id and h.hours > 0
  ),
  lines as (
    select b.task_id, b.quantity / b.f as qty, b.quantity as raw_qty,
           coalesce(q.dwl_work_item_id, tb.dwl_work_item_id) as work_item_id
      from line_f b
      join public.wbs_tasks t on t.id = b.task_id and t.project_id = p_project_id
      left join public.qs_boq_items q on q.id = b.qs_boq_item_id
      left join public.tender_boq_items tb on tb.id = b.tender_boq_item_id
  ),
  per_qty as (
    select l.task_id,
           case r.category when 'subcon' then 'subcontract' else r.category end as kind,
           r.id as dwl_resource_id, r.unit,
           l.qty * wir.consumption * case when r.category = 'material' then 1 + wir.waste_pct else 1 end as quantity,
           l.raw_qty * wir.consumption * case when r.category = 'material' then 1 + wir.waste_pct else 1 end as raw_quantity,
           case when ov.cost_per_unit is not null and (ov.unit_label is null or lower(btrim(ov.unit_label)) = lower(btrim(coalesce(r.unit, ''))))
                then ov.cost_per_unit else cr.costing_rate end as rate,
           cr.currency
      from lines l
      join public.dwl_work_item_resources wir on wir.work_item_id = l.work_item_id
      join public.dwl_resources r on r.id = wir.resource_id
      cross join hpd
      left join ov on ov.dwl_resource_id = r.id
      left join public.dwl_v_resource_costing_rates cr on cr.resource_id = r.id
     where l.work_item_id is not null
       and r.category in ('material', 'subcon', 'labor', 'equipment')
       -- time-unit labour / plant is already in plan_task_resource_hours
       and (r.category in ('material', 'subcon') or public.plan_rate_per_hour(1, r.unit, hpd.v) is null)
  )
  select task_id, kind, dwl_resource_id, unit, quantity, raw_quantity, rate, currency from hourly
  union all
  select task_id, kind, dwl_resource_id, unit, quantity, raw_quantity, rate, currency from per_qty where quantity > 0
$$;
revoke all on function public.plan_cost_component_rows(uuid) from public, anon, authenticated;

-- Each activity's share of each working day between its start and finish (shares add up to 1; an activity with no
-- working day in its span books everything on its start date). basis: current or baseline dates.
create or replace function public.plan_task_day_shares(p_project_id uuid, p_basis text)
returns table(task_id uuid, work_date date, share numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with t as (
    select wt.id,
           case when p_basis = 'baseline' then wt.baseline_start_date  else wt.start_date end as s,
           case when p_basis = 'baseline' then wt.baseline_finish_date else wt.end_date   end as f
      from public.wbs_tasks wt
     where wt.project_id = p_project_id
  ),
  dated as (select * from t where s is not null and f is not null and f >= s),
  span  as (select min(s) as lo, max(f) as hi from dated),
  wd    as (select w.work_date from span, public.plan_project_workdays(p_project_id, span.lo, span.hi) w where span.lo is not null),
  td    as (select d.id, w.work_date from dated d join wd w on w.work_date between d.s and d.f),
  n     as (select id, count(*)::numeric as c from td group by id)
  select td.id, td.work_date, 1 / n.c from td join n using (id)
  union all
  select d.id, d.s, 1::numeric from dated d where not exists (select 1 from n where n.id = d.id)
$$;
revoke all on function public.plan_task_day_shares(uuid, text) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────── C3 cost components
create or replace function public.plan_cost_components(p_project_id uuid, p_period text default 'month', p_basis text default 'current')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_period text := case when p_period in ('day', 'week', 'month') then p_period else 'month' end;
  v_basis  text := coalesce(p_basis, 'current');
  v_out    jsonb;
begin
  if not (public.is_project_member(p_project_id) and public.has_permission('planning', 'schedule', 'view')) then
    raise exception 'Not allowed to view this project''s programme' using errcode = '42501';
  end if;
  if v_basis not in ('current', 'baseline') then
    raise exception 'plan_cost_components: basis must be current or baseline';
  end if;

  with rows as (
    select r.*, r.quantity * r.rate as cost from public.plan_cost_component_rows(p_project_id) r
  ),
  per_task as (
    select task_id,
           sum(cost) filter (where kind = 'labor')       as labor,
           sum(cost) filter (where kind = 'material')    as material,
           sum(cost) filter (where kind = 'equipment')   as equipment,
           sum(cost) filter (where kind = 'subcontract') as subcontract,
           coalesce(sum(cost), 0)                        as total,
           count(*) filter (where rate is null)          as unpriced
      from rows group by task_id
  ),
  shares as (select * from public.plan_task_day_shares(p_project_id, v_basis)),
  sched as (select distinct task_id from shares),
  -- each activity's share per period (folded first: far fewer rows to join)
  pshare as (
    select task_id,
           case v_period when 'day' then work_date when 'week' then date_trunc('week', work_date)::date else date_trunc('month', work_date)::date end as p,
           sum(share) as share
      from shares group by 1, 2),
  alloc as (
    select s.p, r.kind, r.cost * s.share as v
      from rows r join pshare s on s.task_id = r.task_id
     where r.cost is not null
  ),
  span as (select min(p) as lo, max(p) as hi from alloc),
  periods as (
    select gs::date as p
      from span, generate_series(span.lo, span.hi,
                                 case v_period when 'day' then interval '1 day' when 'week' then interval '7 days' else interval '1 month' end) gs
     where span.lo is not null
  ),
  per as (
    select pr.p,
           coalesce(sum(a.v) filter (where a.kind = 'labor'), 0)       as labor,
           coalesce(sum(a.v) filter (where a.kind = 'material'), 0)    as material,
           coalesce(sum(a.v) filter (where a.kind = 'equipment'), 0)   as equipment,
           coalesce(sum(a.v) filter (where a.kind = 'subcontract'), 0) as subcontract,
           coalesce(sum(a.v), 0)                                       as total
      from periods pr left join alloc a on a.p = pr.p
     group by pr.p
  ),
  per_cum as (select per.*, sum(total) over (order by p) as cum from per),
  kinds as (
    select kind,
           coalesce(sum(cost), 0)                                   as cost,
           count(*)                                                 as lines,
           count(*) filter (where rate is null)                     as unpriced_lines,
           coalesce(sum(quantity) filter (where rate is null and unit = 'hr'), 0) as unpriced_hours
      from rows group by kind
  )
  select jsonb_build_object(
    'meta', jsonb_build_object(
      'period', v_period,
      'basis', v_basis,
      'currency', (select min(currency) from rows where currency is not null),
      'total_cost', (select round(coalesce(sum(cost), 0), 2) from rows),
      'scheduled_cost', (select round(coalesce(sum(r.cost), 0), 2) from rows r where r.task_id in (select task_id from sched)),
      'boq_value', (select round(coalesce(sum(wt.budget_cost), 0), 2) from public.wbs_tasks wt where wt.project_id = p_project_id),
      'task_count', (select count(*) from per_task),
      'unpriced_lines', (select count(*) from rows where rate is null),
      -- hours on BOQ lines counted more than once, left out of the cost (fix the mapping: BOQ Mapping Check)
      'hours_counted_once', (select round(coalesce(sum(raw_quantity - quantity), 0), 2) from rows where unit = 'hr'),
      'tasks_counted_once', (select count(distinct task_id) from rows where raw_quantity > quantity * 1.0001)
    ),
    'kinds', coalesce((select jsonb_agg(jsonb_build_object(
               'kind', kind, 'cost', round(cost, 2), 'lines', lines,
               'unpriced_lines', unpriced_lines, 'unpriced_hours', round(unpriced_hours, 2)) order by kind) from kinds), '[]'::jsonb),
    'periods', coalesce((select jsonb_agg(jsonb_build_object(
               'period', p, 'labor', round(labor, 2), 'material', round(material, 2), 'equipment', round(equipment, 2),
               'subcontract', round(subcontract, 2), 'total', round(total, 2),
               'cumulative', round(cum, 2)) order by p) from per_cum), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object(
               'task_id', pt.task_id, 'code', wt.task_code, 'name', wt.task_name, 'budget', round(coalesce(wt.budget_cost, 0), 2),
               'labor', round(coalesce(pt.labor, 0), 2), 'material', round(coalesce(pt.material, 0), 2),
               'equipment', round(coalesce(pt.equipment, 0), 2), 'subcontract', round(coalesce(pt.subcontract, 0), 2),
               'total', round(pt.total, 2), 'unpriced', pt.unpriced) order by pt.total desc, wt.task_code)
               from per_task pt join public.wbs_tasks wt on wt.id = pt.task_id), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;
revoke all on function public.plan_cost_components(uuid, text, text) from public, anon;
grant execute on function public.plan_cost_components(uuid, text, text) to authenticated;

-- ───────────────────────────────────────────────────────────── C2 material histogram
create or replace function public.plan_material_histogram(p_project_id uuid, p_period text default 'month', p_basis text default 'current')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_period text := case when p_period in ('day', 'week', 'month') then p_period else 'month' end;
  v_basis  text := coalesce(p_basis, 'current');
  v_out    jsonb;
begin
  if not (public.is_project_member(p_project_id) and public.has_permission('planning', 'schedule', 'view')) then
    raise exception 'Not allowed to view this project''s programme' using errcode = '42501';
  end if;
  if v_basis not in ('current', 'baseline') then
    raise exception 'plan_material_histogram: basis must be current or baseline';
  end if;

  with rows as (
    select r.* from public.plan_cost_component_rows(p_project_id) r where r.kind = 'material'
  ),
  shares as (select * from public.plan_task_day_shares(p_project_id, v_basis)),
  sched as (select distinct task_id from shares),
  pshare as (
    select task_id,
           case v_period when 'day' then work_date when 'week' then date_trunc('week', work_date)::date else date_trunc('month', work_date)::date end as p,
           sum(share) as share
      from shares group by 1, 2),
  alloc as (
    select s.p, r.dwl_resource_id, r.quantity * s.share as q, r.quantity * r.rate * s.share as c
      from rows r join pshare s on s.task_id = r.task_id
  ),
  cells as (select p, dwl_resource_id, sum(q) as q, sum(c) as c from alloc group by 1, 2),
  per_cost as (select p, sum(c) as c from cells group by p),
  mats as (
    select r.dwl_resource_id, sum(r.quantity) as q, sum(r.quantity * r.rate) as c, bool_and(r.rate is not null) as priced,
           sum(r.quantity) filter (where r.task_id not in (select task_id from sched)) as unscheduled
      from rows r group by r.dwl_resource_id
  ),
  span as (select min(p) as lo, max(p) as hi from cells),
  periods as (
    select gs::date as p
      from span, generate_series(span.lo, span.hi,
                                 case v_period when 'day' then interval '1 day' when 'week' then interval '7 days' else interval '1 month' end) gs
     where span.lo is not null
  )
  select jsonb_build_object(
    'meta', jsonb_build_object(
      'period', v_period, 'basis', v_basis,
      'start', (select lo from span), 'finish', (select hi from span),
      'material_cost', (select round(coalesce(sum(c), 0), 2) from mats),
      'materials', (select count(*) from mats),
      'unpriced_materials', (select count(*) from mats where not priced),
      'currency', (select min(currency) from rows where currency is not null)
    ),
    'periods', coalesce((select jsonb_agg(jsonb_build_object(
               'period', pr.p, 'cost', round(coalesce(pc.c, 0), 2)) order by pr.p)
               from periods pr left join per_cost pc on pc.p = pr.p), '[]'::jsonb),
    'materials', coalesce((select jsonb_agg(jsonb_build_object(
               'resource_id', m.dwl_resource_id, 'code', d.code, 'description', d.description, 'unit', d.unit,
               'quantity', round(m.q, 3), 'cost', round(m.c, 2), 'priced', m.priced,
               'unscheduled_quantity', round(coalesce(m.unscheduled, 0), 3)) order by m.c desc nulls last, m.q desc)
               from mats m join public.dwl_resources d on d.id = m.dwl_resource_id), '[]'::jsonb),
    'cells', coalesce((select jsonb_agg(jsonb_build_object(
               'period', c.p, 'resource_id', c.dwl_resource_id, 'quantity', round(c.q, 3), 'cost', round(c.c, 2)) order by c.p) from cells c), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;
revoke all on function public.plan_material_histogram(uuid, text, text) from public, anon;
grant execute on function public.plan_material_histogram(uuid, text, text) to authenticated;

-- ───────────────────────────────────────────────────────────── C5 budget reconciliation
-- The QS approved budget = approved / locked contract BOQ lines + approved variation orders (as the QS post-contract
-- KPIs count it). Per BOQ line: its amount against the value the programme's activities carry for it.
create or replace function public.plan_budget_reconciliation(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_out jsonb;
begin
  if not (public.is_project_member(p_project_id) and public.has_permission('planning', 'schedule', 'view')) then
    raise exception 'Not allowed to view this project''s programme' using errcode = '42501';
  end if;

  with tl as (
    select b.qs_boq_item_id, b.tender_boq_item_id, b.task_id, b.amount,
           (t.start_date is not null and t.end_date is not null) as scheduled
      from public.plan_task_boq_lines b
      join public.wbs_tasks t on t.id = b.task_id
     where b.project_id = p_project_id
  ),
  loaded as (
    select qs_boq_item_id as id, sum(amount) as amount, sum(amount) filter (where scheduled) as scheduled, count(distinct task_id) as tasks
      from tl where qs_boq_item_id is not null group by 1
  ),
  items as (
    select q.id, q.item_no, q.description, q.unit, q.quantity, coalesce(q.total_amount, 0) as amount,
           coalesce(q.baseline_status, 'draft') as status, coalesce(nullif(q.section, ''), s.title) as section, q.currency,
           coalesce(l.amount, 0) as loaded, coalesce(l.scheduled, 0) as scheduled, coalesce(l.tasks, 0) as tasks
      from public.qs_boq_items q
      left join public.qs_boq_sections s on s.id = q.boq_section_id
      left join loaded l on l.id = q.id
     where q.project_id = p_project_id
  ),
  task_budgets as (
    select t.id, t.task_code, t.task_name, coalesce(t.budget_cost, 0) as budget,
           coalesce((select sum(b.amount) from public.plan_task_boq_lines b where b.task_id = t.id), 0) as from_lines
      from public.wbs_tasks t
     where t.project_id = p_project_id
  )
  select jsonb_build_object(
    'meta', jsonb_build_object(
      'currency', (select min(currency) from items where currency is not null),
      'approved_boq', (select round(coalesce(sum(amount), 0), 2) from items where status in ('approved', 'locked')),
      'approved_boq_lines', (select count(*) from items where status in ('approved', 'locked')),
      'unapproved_boq', (select round(coalesce(sum(amount), 0), 2) from items where status not in ('approved', 'locked')),
      'unapproved_boq_lines', (select count(*) from items where status not in ('approved', 'locked')),
      'approved_vos', (select round(coalesce(sum(total_amount), 0), 2) from public.qs_variation_orders where project_id = p_project_id and status = 'approved'),
      'approved_vo_count', (select count(*) from public.qs_variation_orders where project_id = p_project_id and status = 'approved'),
      'task_budget_total', (select round(coalesce(sum(budget), 0), 2) from task_budgets),
      'task_budget_from_lines', (select round(coalesce(sum(from_lines), 0), 2) from task_budgets),
      'loaded_from_tender', (select round(coalesce(sum(amount), 0), 2) from tl where tender_boq_item_id is not null),
      'scheduled_budget', (select round(coalesce(sum(budget), 0), 2) from task_budgets tb
                            join public.wbs_tasks t on t.id = tb.id where t.start_date is not null and t.end_date is not null)
    ),
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
               'id', i.id, 'item_no', i.item_no, 'description', i.description, 'unit', i.unit, 'quantity', i.quantity,
               'section', i.section, 'status', i.status, 'amount', round(i.amount, 2), 'loaded', round(i.loaded, 2),
               'scheduled', round(i.scheduled, 2), 'tasks', i.tasks) order by i.section nulls last, i.item_no) from items i), '[]'::jsonb),
    -- activities whose budget is not the sum of their BOQ lines (typed by hand, or lines changed after Generate)
    'adjusted_tasks', coalesce((select jsonb_agg(jsonb_build_object(
               'task_id', tb.id, 'code', tb.task_code, 'name', tb.task_name, 'budget', round(tb.budget, 2), 'from_lines', round(tb.from_lines, 2))
               order by abs(tb.budget - tb.from_lines) desc)
               from task_budgets tb where abs(tb.budget - tb.from_lines) >= 0.01), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;
revoke all on function public.plan_budget_reconciliation(uuid) from public, anon;
grant execute on function public.plan_budget_reconciliation(uuid) to authenticated;

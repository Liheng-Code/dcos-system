-- doc 35 Phase I: setup and outbound integrations.
--   I1  plan_contract_milestones (+ history): contractual dates linked to activities; changing an agreed date
--       needs Baseline approve.
--   I3–I7 outbound feeds: plan_feed_rows computes each feed on the server (materials and equipment → Procurement,
--       manpower → HR, inspections → QA/QC, submissions → Document Control, cost → Finance); a planner previews it
--       and publishes a numbered, immutable version (plan_feed_publications) that the receiving module reads with
--       plan_latest_feed. Lead / buffer days are schedule settings.
--   I8  wbs_nodes.responsible_id; a WBS node that site, commercial, QA/QC, document or progress records point at
--       cannot be deleted (wbs_node_delete_check lists what blocks it).
-- I2 (calendar change preview) needs no schema. Additive only.

-- ───────────────────────────────────────────────────────────── I1 contract milestones
create table if not exists public.plan_contract_milestones (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  code          text not null check (btrim(code) <> ''),
  name          text not null check (btrim(name) <> ''),
  kind          text not null default 'key_date'
                check (kind in ('commencement', 'access', 'key_date', 'sectional_completion', 'practical_completion', 'handover', 'other')),
  contract_date date not null,
  revised_date  date,
  revision_ref  text,
  task_id       uuid references public.wbs_tasks(id) on delete set null,
  ld_rate       numeric(14, 2) check (ld_rate is null or ld_rate >= 0),
  ld_currency   text,
  ld_cap        numeric(16, 2) check (ld_cap is null or ld_cap >= 0),
  clause_ref    text,
  notes         text,
  sort_order    integer not null default 0,
  created_by    uuid references auth.users(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null,
  updated_at    timestamptz not null default now(),
  constraint plan_contract_milestones_code_key unique (project_id, code),
  constraint plan_contract_milestones_revised_ref check (revised_date is null or nullif(btrim(revision_ref), '') is not null)
);
create index if not exists idx_plan_contract_milestones_task on public.plan_contract_milestones (task_id) where task_id is not null;
comment on table public.plan_contract_milestones is
  'Contractual milestones (doc 35 I1): the agreed date, the date after an approved extension (revised_date + revision_ref), the activity that achieves it, and the liquidated damages rate. Forecast and achieved dates come from the linked activity.';

create table if not exists public.plan_contract_milestone_history (
  id           uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.plan_contract_milestones(id) on delete cascade,
  project_id   uuid not null references public.projects(id) on delete cascade,
  field        text not null,
  old_value    text,
  new_value    text,
  changed_by   uuid references auth.users(id) on delete set null,
  changed_at   timestamptz not null default now()
);
create index if not exists idx_plan_contract_milestone_history on public.plan_contract_milestone_history (milestone_id, changed_at desc);

create or replace function public.plan_contract_milestone_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  f text;
  o text;
  n text;
begin
  if new.task_id is not null and not exists (
    select 1 from public.wbs_tasks t where t.id = new.task_id and t.project_id = new.project_id) then
    raise exception 'The linked activity is not in this project' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if new.project_id <> old.project_id then
      raise exception 'A contract milestone cannot move to another project' using errcode = '42501';
    end if;
    -- an agreed date (or its extension) changes only with Baseline approve; the service role is not a user
    if v_uid is not null
       and (new.contract_date is distinct from old.contract_date or new.revised_date is distinct from old.revised_date)
       and not public.has_permission('planning', 'baseline', 'approve') then
      raise exception 'Changing a contract date or an extension needs Baseline approve permission' using errcode = '42501';
    end if;
    new.updated_at := now();
    new.updated_by := coalesce(v_uid, new.updated_by);
    foreach f in array array['code', 'name', 'kind', 'contract_date', 'revised_date', 'revision_ref', 'task_id', 'ld_rate', 'ld_currency', 'ld_cap', 'clause_ref'] loop
      o := to_jsonb(old) ->> f;
      n := to_jsonb(new) ->> f;
      if o is distinct from n then
        insert into public.plan_contract_milestone_history (milestone_id, project_id, field, old_value, new_value, changed_by)
        values (new.id, new.project_id, f, o, n, v_uid);
      end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.plan_contract_milestone_guard() from public, anon, authenticated;
drop trigger if exists plan_contract_milestone_guard on public.plan_contract_milestones;
create trigger plan_contract_milestone_guard before insert or update on public.plan_contract_milestones
  for each row execute function public.plan_contract_milestone_guard();

create or replace function public.plan_contract_milestone_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.plan_contract_milestone_history (milestone_id, project_id, field, old_value, new_value, changed_by)
  values (new.id, new.project_id, 'created', null, new.code || ' ' || new.contract_date::text, auth.uid());
  return null;
end;
$$;
revoke all on function public.plan_contract_milestone_created() from public, anon, authenticated;
drop trigger if exists plan_contract_milestone_created on public.plan_contract_milestones;
create trigger plan_contract_milestone_created after insert on public.plan_contract_milestones
  for each row execute function public.plan_contract_milestone_created();

alter table public.plan_contract_milestones enable row level security;
drop policy if exists plan_contract_milestones_select on public.plan_contract_milestones;
create policy plan_contract_milestones_select on public.plan_contract_milestones for select to authenticated
  using (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'view'));
drop policy if exists plan_contract_milestones_insert on public.plan_contract_milestones;
create policy plan_contract_milestones_insert on public.plan_contract_milestones for insert to authenticated
  with check (public.is_project_member(project_id) and public.has_permission('planning', 'baseline', 'edit'));
drop policy if exists plan_contract_milestones_update on public.plan_contract_milestones;
create policy plan_contract_milestones_update on public.plan_contract_milestones for update to authenticated
  using (public.is_project_member(project_id) and public.has_permission('planning', 'baseline', 'edit'))
  with check (public.is_project_member(project_id) and public.has_permission('planning', 'baseline', 'edit'));
drop policy if exists plan_contract_milestones_delete on public.plan_contract_milestones;
create policy plan_contract_milestones_delete on public.plan_contract_milestones for delete to authenticated
  using (public.is_project_member(project_id) and public.has_permission('planning', 'baseline', 'approve'));
revoke all on public.plan_contract_milestones from anon, authenticated;
grant select, insert, update, delete on public.plan_contract_milestones to authenticated;

alter table public.plan_contract_milestone_history enable row level security;
drop policy if exists plan_contract_milestone_history_select on public.plan_contract_milestone_history;
create policy plan_contract_milestone_history_select on public.plan_contract_milestone_history for select to authenticated
  using (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'view'));
revoke all on public.plan_contract_milestone_history from anon, authenticated;
grant select on public.plan_contract_milestone_history to authenticated;

-- ───────────────────────────────────────────────────────────── I8 WBS responsibility and delete guard
alter table public.wbs_nodes add column if not exists responsible_id uuid references public.profiles(id) on delete set null;
comment on column public.wbs_nodes.responsible_id is 'Person responsible for this part of the work (doc 35 I8).';

-- Records that point at a WBS node or its activities and would be orphaned or lost by deleting it.
-- p_subtree: include the node's descendants (the pre-check); the trigger checks one node, as a cascade fires it
-- for every descendant anyway. BOQ / QTO links are mappings, not records, and do not block.
create or replace function public.wbs_node_dependents(p_node_id uuid, p_subtree boolean default true)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_nodes uuid[];
  v_tasks uuid[];
  v_out   jsonb := '[]'::jsonb;
  v_n     bigint;
  r       record;
begin
  if p_subtree then
    with recursive sub as (
      select id from public.wbs_nodes where id = p_node_id
      union all
      select n.id from public.wbs_nodes n join sub on n.parent_id = sub.id)
    select array_agg(id) into v_nodes from sub;
  else
    v_nodes := array[p_node_id];
  end if;
  select coalesce(array_agg(id), '{}') into v_tasks from public.wbs_tasks where wbs_node_id = any(v_nodes);

  select count(*) into v_n from public.wbs_tasks
   where id = any(v_tasks) and (coalesce(progress, 0) > 0 or actual_start_date is not null or actual_finish_date is not null);
  if v_n > 0 then v_out := v_out || jsonb_build_object('label', 'activities with progress or actual dates', 'count', v_n); end if;

  for r in
    select * from (values
      ('procurement_prs',          'wbs_node_id', 'node', 'purchase requests'),
      ('procurement_prs',          'task_id',     'task', 'purchase requests'),
      ('procurement_pos',          'wbs_node_id', 'node', 'purchase orders'),
      ('inv_material_requisitions','wbs_node_id', 'node', 'material requisitions'),
      ('inv_material_requisitions','task_id',     'task', 'material requisitions'),
      ('inv_movements',            'wbs_node_id', 'node', 'stock movements'),
      ('inspection_requests',      'wbs_node_id', 'node', 'inspection requests'),
      ('inspection_requests',      'wbs_task_id', 'task', 'inspection requests'),
      ('itps',                     'wbs_node_id', 'node', 'ITPs'),
      ('ncrs',                     'wbs_node_id', 'node', 'NCRs'),
      ('submittal_packages',       'wbs_node_id', 'node', 'submittals'),
      ('documents',                'wbs_node_id', 'node', 'documents'),
      ('document_revision_task_links', 'task_id', 'task', 'document links'),
      ('dr_activity_progress',     'wbs_node_id', 'node', 'daily report progress entries'),
      ('dr_activity_progress',     'task_id',     'task', 'daily report progress entries'),
      ('dr_inspection_requests',   'wbs_node_id', 'node', 'daily report inspection requests'),
      ('dr_delay_events',          'wbs_node_id', 'node', 'daily report delay events'),
      ('dr_delay_events',          'task_id',     'task', 'daily report delay events'),
      ('site_daily_report_activities', 'task_id', 'task', 'site daily report entries'),
      ('site_manpower',            'wbs_node_id', 'node', 'site manpower records'),
      ('site_manpower',            'wbs_task_id', 'task', 'site manpower records'),
      ('site_progress_photos',     'wbs_node_id', 'node', 'progress photos'),
      ('site_progress_photos',     'wbs_task_id', 'task', 'progress photos'),
      ('timesheet_entries',        'wbs_node_id', 'node', 'timesheet entries'),
      ('timesheet_entries',        'task_id',     'task', 'timesheet entries'),
      ('overtime_requests',        'wbs_node_id', 'node', 'overtime requests'),
      ('delay_register',           'wbs_task_id', 'task', 'delay register entries'),
      ('delay_register_tasks',     'wbs_task_id', 'task', 'delay register entries'),
      ('plan_task_quantity_progress', 'task_id',  'task', 'quantity progress records'),
      ('qs_cost_transactions',     'wbs_node_id', 'node', 'cost transactions'),
      ('account_journal_lines',    'wbs_node_id', 'node', 'journal lines'),
      ('subcontract_items',        'wbs_node_id', 'node', 'subcontract items'),
      ('subcontract_back_charges', 'wbs_task_id', 'task', 'subcontract back-charges'),
      ('design_drawings',          'wbs_node_id', 'node', 'drawings'),
      ('design_rfi',               'wbs_node_id', 'node', 'RFIs')
    ) as v(tbl, col, scope, label)
  loop
    continue when to_regclass('public.' || r.tbl) is null;
    continue when r.scope = 'task' and cardinality(v_tasks) = 0;
    execute format('select count(*) from public.%I where %I = any($1)', r.tbl, r.col)
      into v_n using case when r.scope = 'node' then v_nodes else v_tasks end;
    if v_n > 0 then
      -- the same kind of record may be counted through the node and through its activities: add them up
      if exists (select 1 from jsonb_array_elements(v_out) e where e ->> 'label' = r.label) then
        select jsonb_agg(case when e ->> 'label' = r.label
                              then jsonb_set(e, '{count}', to_jsonb((e ->> 'count')::bigint + v_n)) else e end)
          into v_out from jsonb_array_elements(v_out) e;
      else
        v_out := v_out || jsonb_build_object('label', r.label, 'count', v_n);
      end if;
    end if;
  end loop;
  return v_out;
end;
$$;
revoke all on function public.wbs_node_dependents(uuid, boolean) from public, anon, authenticated;

-- Pre-check for the delete confirmation: what blocks deleting this node and everything under it.
create or replace function public.wbs_node_delete_check(p_node_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_project uuid;
begin
  select project_id into v_project from public.wbs_nodes where id = p_node_id;
  if v_project is null then return '[]'::jsonb; end if;
  if not public.is_project_member(v_project) then
    raise exception 'Not a member of this project' using errcode = '42501';
  end if;
  return public.wbs_node_dependents(p_node_id, true);
end;
$$;
revoke all on function public.wbs_node_delete_check(uuid) from public, anon;
grant execute on function public.wbs_node_delete_check(uuid) to authenticated;

create or replace function public.wbs_node_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deps jsonb;
begin
  -- deleting the whole project takes its WBS with it
  if not exists (select 1 from public.projects where id = old.project_id) then
    return old;
  end if;
  v_deps := public.wbs_node_dependents(old.id, false);
  if jsonb_array_length(v_deps) > 0 then
    raise exception 'WBS % "%" cannot be deleted. Records point at it: %. Move them to another WBS item or close them first.',
      coalesce(old.wbs_code, ''), old.wbs_name,
      (select string_agg((e ->> 'label') || ' (' || (e ->> 'count') || ')', ', ') from jsonb_array_elements(v_deps) e)
      using errcode = '23503';
  end if;
  return old;
end;
$$;
revoke all on function public.wbs_node_delete_guard() from public, anon, authenticated;
drop trigger if exists wbs_node_delete_guard on public.wbs_nodes;
create trigger wbs_node_delete_guard before delete on public.wbs_nodes
  for each row execute function public.wbs_node_delete_guard();

-- ───────────────────────────────────────────────────────────── I3–I7 outbound feeds
alter table public.plan_schedule_settings
  add column if not exists feed_material_lead_days    integer not null default 14,
  add column if not exists feed_site_buffer_days      integer not null default 3,
  add column if not exists feed_submission_review_days integer not null default 14,
  add column if not exists feed_submission_buffer_days integer not null default 7,
  add column if not exists feed_inspection_notice_days integer not null default 2;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plan_schedule_settings_feed_days_chk') then
    alter table public.plan_schedule_settings add constraint plan_schedule_settings_feed_days_chk check (
      feed_material_lead_days between 0 and 365 and feed_site_buffer_days between 0 and 365
      and feed_submission_review_days between 0 and 365 and feed_submission_buffer_days between 0 and 365
      and feed_inspection_notice_days between 0 and 60);
  end if;
end $$;

create table if not exists public.plan_feed_publications (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  feed           text not null check (feed in ('materials', 'manpower', 'inspections', 'submissions', 'cost')),
  version        integer not null,
  schema_version text not null,
  as_at          date not null,
  basis          jsonb not null,
  settings       jsonb not null,
  rows           jsonb not null,
  row_count      integer not null,
  content_hash   text not null,
  note           text,
  published_by   uuid references auth.users(id) on delete set null,
  published_at   timestamptz not null default now(),
  constraint plan_feed_publications_version_key unique (project_id, feed, version)
);
comment on table public.plan_feed_publications is
  'Planning outbound feeds as published (doc 35 I3-I7): the receiving module reads the latest version with plan_latest_feed, so programme changes reach it when a planner publishes, not mid-edit. Never updated or deleted.';

create or replace function public.plan_feed_publication_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.projects where id = old.project_id) then
    return old;
  end if;
  raise exception 'A published feed cannot be changed or deleted' using errcode = '42501';
end;
$$;
revoke all on function public.plan_feed_publication_immutable() from public, anon, authenticated;
drop trigger if exists plan_feed_publication_immutable on public.plan_feed_publications;
create trigger plan_feed_publication_immutable before update or delete on public.plan_feed_publications
  for each row execute function public.plan_feed_publication_immutable();

-- Who may read a feed: Planning (Schedule view) or the receiving module's own view permission.
create or replace function public.plan_feed_reader(p_project_id uuid, p_feed text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_project_member(p_project_id) and (
    public.has_permission('planning', 'schedule', 'view')
    or case p_feed
         when 'materials'   then public.has_permission('procurement', 'pr', 'view')
         when 'manpower'    then public.has_permission('hr', 'view_employee', 'view')
         when 'inspections' then public.has_permission('construction', 'daily_reporting', 'view')
         when 'submissions' then public.has_permission('document_control', 'view_document', 'view')
         when 'cost'        then public.has_permission('account_finance', 'cash_forecast', 'view')
         else false
       end)
$$;
revoke all on function public.plan_feed_reader(uuid, text) from public, anon;
grant execute on function public.plan_feed_reader(uuid, text) to authenticated;

alter table public.plan_feed_publications enable row level security;
drop policy if exists plan_feed_publications_select on public.plan_feed_publications;
create policy plan_feed_publications_select on public.plan_feed_publications for select to authenticated
  using (public.plan_feed_reader(project_id, feed));
revoke all on public.plan_feed_publications from anon, authenticated;
grant select on public.plan_feed_publications to authenticated;

create or replace function public.plan_feed_settings(p_project_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'material_lead_days',     coalesce(s.feed_material_lead_days, 14),
    'site_buffer_days',       coalesce(s.feed_site_buffer_days, 3),
    'submission_review_days', coalesce(s.feed_submission_review_days, 14),
    'submission_buffer_days', coalesce(s.feed_submission_buffer_days, 7),
    'inspection_notice_days', coalesce(s.feed_inspection_notice_days, 2))
  from (select 1) one
  left join public.plan_schedule_settings s on s.project_id = p_project_id
$$;
revoke all on function public.plan_feed_settings(uuid) from public, anon, authenticated;

-- One feed's rows, computed from the programme as it is now (internal). Only work not yet finished is fed.
-- Every row has a stable "key" so a later version can be compared with the one before.
create or replace function public.plan_feed_rows(p_project_id uuid, p_feed text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  st     jsonb := public.plan_feed_settings(p_project_id);
  v_asat date;
  v_out  jsonb;
begin
  select coalesce(p.data_date, current_date) into v_asat from public.projects p where p.id = p_project_id;

  if p_feed = 'materials' then
    -- materials and equipment per activity: on site by start − buffer, ordered by that − lead time
    with comp as (
      select r.task_id, r.kind, r.dwl_resource_id, r.unit, sum(r.quantity) as qty
        from public.plan_cost_component_rows(p_project_id) r
       where r.kind in ('material', 'equipment')
       group by 1, 2, 3, 4),
    lt as (
      select distinct on (resource_id) resource_id, lead_time_days
        from public.dwl_v_current_prices
       where lead_time_days is not null and not coalesce(is_expired, false)
       order by resource_id, valid_from desc nulls last),
    pr as (
      select task_id, min(required_date) as req, string_agg(pr_number, ', ' order by pr_number) as nums
        from public.procurement_prs
       where project_id = p_project_id and task_id is not null and approval_status not in ('rejected', 'cancelled')
       group by task_id),
    x as (
      select c.*, t.task_code, t.task_name, t.start_date, t.end_date, n.wbs_code,
             res.code as res_code, res.description as res_name,
             coalesce(lt.lead_time_days, (st ->> 'material_lead_days')::int) as lead,
             (lt.lead_time_days is not null) as lead_from_price,
             t.start_date - (st ->> 'site_buffer_days')::int as on_site,
             pr.req, pr.nums
        from comp c
        join public.wbs_tasks t on t.id = c.task_id
        left join public.wbs_nodes n on n.id = t.wbs_node_id
        join public.dwl_resources res on res.id = c.dwl_resource_id
        left join lt on lt.resource_id = c.dwl_resource_id
        left join pr on pr.task_id = c.task_id
       where t.start_date is not null and t.actual_finish_date is null and coalesce(t.progress, 0) < 100)
    select coalesce(jsonb_agg(jsonb_build_object(
             'key', task_id::text || ':' || dwl_resource_id::text,
             'task_id', task_id, 'task_code', task_code, 'task_name', task_name, 'wbs_code', wbs_code,
             'kind', kind, 'resource_id', dwl_resource_id, 'resource_code', res_code, 'resource', res_name,
             'unit', unit, 'quantity', round(qty, 3),
             'start', start_date, 'finish', end_date,
             'required_on_site', on_site, 'lead_time_days', lead, 'lead_time_source', case when lead_from_price then 'price' else 'default' end,
             'order_by', on_site - lead,
             'pr_numbers', nums, 'pr_required_date', req,
             'coverage', case when nums is null then 'no_pr' when req > on_site then 'pr_late' else 'covered' end)
           order by on_site - lead, task_code, res_code), '[]'::jsonb)
      into v_out from x;

  elsif p_feed = 'manpower' then
    -- remaining labour hours per trade per week, spread over the working days left in each activity
    with hpd as (select public.plan_project_hours_per_day(p_project_id) as v),
    hrs as (
      select r.task_id, r.dwl_resource_id, sum(r.quantity) as h
        from public.plan_cost_component_rows(p_project_id) r
       where r.kind = 'labor' and r.unit = 'hr'
       group by 1, 2),
    t as (
      select wt.id, greatest(wt.start_date, v_asat) as s, wt.end_date as f, 1 - coalesce(wt.progress, 0) / 100.0 as rem
        from public.wbs_tasks wt
       where wt.project_id = p_project_id and wt.start_date is not null and wt.end_date >= v_asat
         and wt.actual_finish_date is null and coalesce(wt.progress, 0) < 100
         and exists (select 1 from hrs where hrs.task_id = wt.id)),
    span as (select min(s) as lo, max(f) as hi from t),
    wd as (select w.work_date from span, public.plan_project_workdays(p_project_id, date_trunc('week', span.lo)::date, date_trunc('week', span.hi)::date + 6) w
            where span.lo is not null),
    td as (select t.id, t.rem, w.work_date from t join wd w on w.work_date between t.s and t.f),
    n  as (select id, count(*)::numeric as c from td group by id),
    alloc as (
      select date_trunc('week', td.work_date)::date as wk, h.dwl_resource_id, sum(h.h * td.rem / n.c) as hours
        from td join n using (id) join hrs h on h.task_id = td.id
       group by 1, 2),
    wk as (select date_trunc('week', work_date)::date as wk, count(*) as days from wd group by 1)
    select coalesce(jsonb_agg(jsonb_build_object(
             'key', a.wk::text || ':' || a.dwl_resource_id::text,
             'week', a.wk, 'resource_id', a.dwl_resource_id, 'trade_code', res.code, 'trade', res.description,
             'hours', round(a.hours, 1), 'working_days', wk.days,
             'headcount', round(a.hours / nullif(hpd.v * wk.days, 0), 1))
           order by a.wk, res.code), '[]'::jsonb)
      into v_out
      from alloc a join wk using (wk) cross join hpd join public.dwl_resources res on res.id = a.dwl_resource_id
     where a.hours > 0;

  elsif p_feed = 'inspections' then
    -- each T&C item an activity's master calls for, due when the activity finishes; inspection requests raised against it
    with req as (
      select t.id as task_id, t.task_code, t.task_name, t.start_date, t.end_date, n.wbs_code,
             ti.id as item_id, ti.code as item_code, ti.name as item_name, ti.tc_type
        from public.wbs_tasks t
        join public.plan_act_master_tc_items m on m.master_id = t.activity_master_id
        join public.plan_act_tc_items ti on ti.id = m.tc_item_id
        left join public.wbs_nodes n on n.id = t.wbs_node_id
       where t.project_id = p_project_id and t.end_date is not null
         and t.actual_finish_date is null and coalesce(t.progress, 0) < 100),
    ir as (
      select wbs_task_id, string_agg(ir_number, ', ' order by ir_number) as nums,
             min(inspection_date) as insp_date, bool_or(status in ('passed', 'closed')) as passed
        from public.inspection_requests
       where project_id = p_project_id and wbs_task_id is not null
       group by wbs_task_id),
    itp as (
      select distinct i.tc_item_id from public.itp_items i join public.itps p on p.id = i.itp_id
       where p.project_id = p_project_id and i.tc_item_id is not null)
    select coalesce(jsonb_agg(jsonb_build_object(
             'key', r.task_id::text || ':' || r.item_id::text,
             'task_id', r.task_id, 'task_code', r.task_code, 'task_name', r.task_name, 'wbs_code', r.wbs_code,
             'item_id', r.item_id, 'item_code', r.item_code, 'item', r.item_name, 'tc_type', r.tc_type,
             'planned_date', r.end_date,
             'request_by', r.end_date - (st ->> 'inspection_notice_days')::int,
             'in_itp', (itp.tc_item_id is not null),
             'ir_numbers', ir.nums, 'ir_inspection_date', ir.insp_date,
             'state', case when ir.passed then 'passed' when ir.nums is null then 'not_requested'
                           when ir.insp_date > r.end_date then 'ir_late' else 'requested' end)
           order by r.end_date, r.task_code, r.item_code), '[]'::jsonb)
      into v_out
      from req r left join ir on ir.wbs_task_id = r.task_id left join itp on itp.tc_item_id = r.item_id;

  elsif p_feed = 'submissions' then
    -- each shop drawing / method statement the remaining work needs, by its first activity:
    -- approved by start − buffer, submitted by that − the review period
    with need as (
      select 'shop_drawing'::text as kind, sd.id as item_id, sd.code, sd.name, t.id as task_id, t.task_code, t.start_date
        from public.wbs_tasks t
        join public.plan_act_master_shop_drawings m on m.master_id = t.activity_master_id
        join public.plan_act_shop_drawing_types sd on sd.id = m.shop_drawing_type_id
       where t.project_id = p_project_id and t.start_date is not null and t.actual_start_date is null
      union all
      select 'method_statement', ms.id, ms.code, ms.name, t.id, t.task_code, t.start_date
        from public.wbs_tasks t
        join public.plan_act_master_method_statements m on m.master_id = t.activity_master_id
        join public.plan_act_method_statements ms on ms.id = m.method_statement_id
       where t.project_id = p_project_id and t.start_date is not null and t.actual_start_date is null),
    first_need as (
      select kind, item_id, code, name, min(start_date) as first_start,
             (array_agg(task_code order by start_date, task_code))[1] as first_task, count(distinct task_id) as tasks
        from need group by 1, 2, 3, 4),
    sub as (
      select k.kind, k.item_id,
             string_agg(sp.submittal_number, ', ' order by sp.submittal_number) as nums,
             min(sp.target_submission_date) as target, min(sp.actual_submission_date) as submitted,
             bool_or(sp.consultant_status in ('code_a_approved', 'code_b_approved_as_noted')) as approved
        from public.submittal_packages sp
        cross join lateral (values ('shop_drawing', sp.shop_drawing_type_id), ('method_statement', sp.method_statement_id)) k(kind, item_id)
       where sp.project_id = p_project_id and k.item_id is not null
       group by 1, 2),
    x as (
      select f.*, f.first_start - (st ->> 'submission_buffer_days')::int as approve_by, s.nums, s.target, s.submitted, s.approved
        from first_need f left join sub s on s.kind = f.kind and s.item_id = f.item_id)
    select coalesce(jsonb_agg(jsonb_build_object(
             'key', kind || ':' || item_id::text,
             'kind', kind, 'item_id', item_id, 'item_code', code, 'item', name,
             'first_task', first_task, 'first_start', first_start, 'activities', tasks,
             'approve_by', approve_by, 'submit_by', approve_by - (st ->> 'submission_review_days')::int,
             'submittal_numbers', nums, 'target_submission_date', target, 'actual_submission_date', submitted,
             'state', case when approved then 'approved' when submitted is not null then 'submitted'
                           when nums is null then 'not_registered'
                           when target > approve_by - (st ->> 'submission_review_days')::int then 'target_late'
                           else 'planned' end)
           order by approve_by, code), '[]'::jsonb)
      into v_out from x;

  elsif p_feed = 'cost' then
    -- priced cost per month, cost code and kind (the activity's cost code, else its WBS item's)
    with rows as (
      select r.task_id, r.kind, coalesce(r.currency, '') as currency, sum(r.quantity * r.rate) as cost
        from public.plan_cost_component_rows(p_project_id) r
       where r.rate is not null
       group by 1, 2, 3),
    shares as (
      select task_id, date_trunc('month', work_date)::date as m, sum(share) as share
        from public.plan_task_day_shares(p_project_id, 'current') group by 1, 2),
    alloc as (
      select s.m, coalesce(nullif(t.cost_code, ''), nullif(n.cost_code, ''), '(none)') as cost_code, r.kind, r.currency,
             sum(r.cost * s.share) as amount
        from rows r
        join shares s on s.task_id = r.task_id
        join public.wbs_tasks t on t.id = r.task_id
        left join public.wbs_nodes n on n.id = t.wbs_node_id
       group by 1, 2, 3, 4)
    select coalesce(jsonb_agg(jsonb_build_object(
             'key', m::text || ':' || cost_code || ':' || kind || ':' || currency,
             'month', m, 'cost_code', cost_code, 'kind', kind, 'currency', nullif(currency, ''), 'amount', round(amount, 2))
           order by m, cost_code, kind, currency), '[]'::jsonb)
      into v_out from alloc where amount <> 0;

  else
    raise exception 'Unknown feed %', p_feed using errcode = '22023';
  end if;
  return v_out;
end;
$$;
revoke all on function public.plan_feed_rows(uuid, text) from public, anon, authenticated;

-- Live preview for planners.
create or replace function public.plan_feed_preview(p_project_id uuid, p_feed text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not (public.is_project_member(p_project_id) and public.has_permission('planning', 'schedule', 'view')) then
    raise exception 'Not allowed to view this project''s programme' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'feed', p_feed, 'schema_version', '1',
    'as_at', (select coalesce(data_date, current_date) from public.projects where id = p_project_id),
    'settings', public.plan_feed_settings(p_project_id),
    'rows', public.plan_feed_rows(p_project_id, p_feed));
end;
$$;
revoke all on function public.plan_feed_preview(uuid, text) from public, anon;
grant execute on function public.plan_feed_preview(uuid, text) to authenticated;

-- Publish the next version of a feed (Programme approve). Returns the new publication (without its rows).
create or replace function public.plan_publish_feed(p_project_id uuid, p_feed text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows jsonb;
  v_hash text;
  v_prev public.plan_feed_publications%rowtype;
  v_row  public.plan_feed_publications%rowtype;
begin
  if not (public.is_project_member(p_project_id) and public.has_permission('planning', 'programme', 'approve')) then
    raise exception 'Publishing a Planning feed needs Programme approve permission' using errcode = '42501';
  end if;
  if p_feed not in ('materials', 'manpower', 'inspections', 'submissions', 'cost') then
    raise exception 'Unknown feed %', p_feed using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('plan_feed:' || p_project_id::text || ':' || p_feed));

  v_rows := public.plan_feed_rows(p_project_id, p_feed);
  v_hash := encode(sha256(convert_to(v_rows::text, 'UTF8')), 'hex');
  select * into v_prev from public.plan_feed_publications
   where project_id = p_project_id and feed = p_feed order by version desc limit 1;

  insert into public.plan_feed_publications
    (project_id, feed, version, schema_version, as_at, basis, settings, rows, row_count, content_hash, note, published_by)
  values (p_project_id, p_feed, coalesce(v_prev.version, 0) + 1, '1',
          (select coalesce(data_date, current_date) from public.projects where id = p_project_id),
          public.plan_report_basis(p_project_id), public.plan_feed_settings(p_project_id),
          v_rows, jsonb_array_length(v_rows), v_hash, nullif(btrim(p_note), ''), auth.uid())
  returning * into v_row;

  return to_jsonb(v_row) - 'rows' || jsonb_build_object('unchanged', v_prev.content_hash = v_hash);
end;
$$;
revoke all on function public.plan_publish_feed(uuid, text, text) from public, anon;
grant execute on function public.plan_publish_feed(uuid, text, text) to authenticated;

-- The contract other modules read: the latest published version of a feed (null when none).
create or replace function public.plan_latest_feed(p_project_id uuid, p_feed text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  if not public.plan_feed_reader(p_project_id, p_feed) then
    raise exception 'Not allowed to read this feed' using errcode = '42501';
  end if;
  select to_jsonb(f) into v from public.plan_feed_publications f
   where f.project_id = p_project_id and f.feed = p_feed order by f.version desc limit 1;
  return v;
end;
$$;
revoke all on function public.plan_latest_feed(uuid, text) from public, anon;
grant execute on function public.plan_latest_feed(uuid, text) to authenticated;

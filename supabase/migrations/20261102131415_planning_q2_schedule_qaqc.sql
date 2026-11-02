-- Phase Q2 + Q3 gate (doc 35; PRD doc 34 MOD-10): stored schedule-quality checks.
--   * plan_schedule_qaqc_runs: one row per check run (the 14 DCMA results from
--     @dcos/scheduling-engine runScheduleQaqc, computed in the app).
--   * plan_schedule_qaqc_findings: one finding per failing check per project. It carries over between
--     runs (metric and affected activities updated), stays visible until the check passes (resolved)
--     or someone with Planning programme approve accepts it with a reason.
--   * Both tables are written only through record_schedule_qaqc_run / accept_schedule_qaqc_finding.
--   * Gate (plan_schedule_settings.qaqc_gate, 'warn' by default): with 'block', submitting a baseline
--     or a programme revision needs a check run in the last 60 minutes with no open critical finding.
--     A client-approved revision turning into a baseline is not gated again.

create table if not exists public.plan_schedule_qaqc_runs (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  engine_version  text not null,
  data_date       date,
  task_count      integer not null default 0,
  passed          integer not null default 0,
  failed          integer not null default 0,
  critical_failed integer not null default 0,
  results         jsonb not null default '[]'::jsonb,
  created_by      uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_plan_schedule_qaqc_runs_project on public.plan_schedule_qaqc_runs(project_id, created_at desc);

create table if not exists public.plan_schedule_qaqc_findings (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  check_code        text not null,
  check_number      integer not null,
  check_name        text not null,
  severity          text not null check (severity in ('critical', 'warning')),
  status            text not null default 'open' check (status in ('open', 'accepted', 'resolved')),
  message           text not null,
  metric            numeric,
  threshold         numeric,
  affected_task_ids uuid[] not null default '{}',
  first_run_id      uuid references public.plan_schedule_qaqc_runs(id) on delete set null,
  last_run_id       uuid references public.plan_schedule_qaqc_runs(id) on delete set null,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  accepted_by       uuid references public.profiles(id) on delete set null,
  accepted_at       timestamptz,
  accept_reason     text,
  resolved_at       timestamptz,
  resolved_run_id   uuid references public.plan_schedule_qaqc_runs(id) on delete set null
);
create unique index if not exists uq_plan_schedule_qaqc_findings_live
  on public.plan_schedule_qaqc_findings(project_id, check_code) where status <> 'resolved';
create index if not exists idx_plan_schedule_qaqc_findings_project on public.plan_schedule_qaqc_findings(project_id, status);

alter table public.plan_schedule_qaqc_runs enable row level security;
alter table public.plan_schedule_qaqc_findings enable row level security;

drop policy if exists plan_schedule_qaqc_runs_select on public.plan_schedule_qaqc_runs;
create policy plan_schedule_qaqc_runs_select on public.plan_schedule_qaqc_runs
  for select to authenticated
  using (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'view'));

drop policy if exists plan_schedule_qaqc_findings_select on public.plan_schedule_qaqc_findings;
create policy plan_schedule_qaqc_findings_select on public.plan_schedule_qaqc_findings
  for select to authenticated
  using (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'view'));

revoke all on public.plan_schedule_qaqc_runs, public.plan_schedule_qaqc_findings from anon;
grant select on public.plan_schedule_qaqc_runs, public.plan_schedule_qaqc_findings to authenticated;

alter table public.plan_schedule_settings
  add column if not exists qaqc_gate text not null default 'warn';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plan_schedule_settings_qaqc_gate_check') then
    alter table public.plan_schedule_settings
      add constraint plan_schedule_settings_qaqc_gate_check check (qaqc_gate in ('warn', 'block'));
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
create or replace function public.record_schedule_qaqc_run(
  p_project_id uuid, p_engine_version text, p_data_date date, p_task_count integer, p_results jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run  uuid;
  r      jsonb;
  v_ids  uuid[];
  v_live public.plan_schedule_qaqc_findings%rowtype;
begin
  if not public.is_project_member(p_project_id) or not public.has_permission('planning', 'schedule', 'edit') then
    raise exception 'Running the schedule check needs Planning schedule edit permission on this project'
      using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_results) <> 'array' then
    raise exception 'p_results must be the array of check results';
  end if;

  insert into public.plan_schedule_qaqc_runs (project_id, engine_version, data_date, task_count, passed, failed, critical_failed, results, created_by)
  select p_project_id, p_engine_version, p_data_date, coalesce(p_task_count, 0),
         count(*) filter (where (e ->> 'pass')::boolean),
         count(*) filter (where not (e ->> 'pass')::boolean),
         count(*) filter (where not (e ->> 'pass')::boolean and e ->> 'severity' = 'critical'),
         p_results, auth.uid()
    from jsonb_array_elements(p_results) e
  returning id into v_run;

  for r in select * from jsonb_array_elements(p_results) loop
    select * into v_live from public.plan_schedule_qaqc_findings
     where project_id = p_project_id and check_code = r ->> 'code' and status <> 'resolved';

    if (r ->> 'pass')::boolean then
      if v_live.id is not null then
        update public.plan_schedule_qaqc_findings
           set status = 'resolved', resolved_at = now(), resolved_run_id = v_run, last_run_id = v_run, last_seen_at = now()
         where id = v_live.id;
      end if;
      continue;
    end if;

    select coalesce(array_agg(x::uuid), '{}') into v_ids
      from (select jsonb_array_elements_text(coalesce(r -> 'affected', '[]'::jsonb)) x limit 500) a
     where x ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    if v_live.id is not null then
      update public.plan_schedule_qaqc_findings
         set message = r ->> 'message', metric = (r ->> 'metric')::numeric, threshold = (r ->> 'threshold')::numeric,
             severity = r ->> 'severity', affected_task_ids = v_ids, last_run_id = v_run, last_seen_at = now()
       where id = v_live.id;
    else
      insert into public.plan_schedule_qaqc_findings
        (project_id, check_code, check_number, check_name, severity, message, metric, threshold, affected_task_ids, first_run_id, last_run_id)
      values
        (p_project_id, r ->> 'code', (r ->> 'number')::int, r ->> 'name', r ->> 'severity', r ->> 'message',
         (r ->> 'metric')::numeric, (r ->> 'threshold')::numeric, v_ids, v_run, v_run);
    end if;
  end loop;

  return v_run;
end;
$$;

create or replace function public.accept_schedule_qaqc_finding(p_finding_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.plan_schedule_qaqc_findings%rowtype;
begin
  select * into v from public.plan_schedule_qaqc_findings where id = p_finding_id for update;
  if v.id is null then
    raise exception 'Finding not found';
  end if;
  if not public.is_project_member(v.project_id) or not public.has_permission('planning', 'programme', 'approve') then
    raise exception 'Accepting a schedule finding needs Planning programme approve permission on this project'
      using errcode = 'insufficient_privilege';
  end if;
  if v.status <> 'open' then
    raise exception 'Only an open finding can be accepted';
  end if;
  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'Give a reason of at least 10 characters for accepting this finding';
  end if;
  update public.plan_schedule_qaqc_findings
     set status = 'accepted', accepted_by = auth.uid(), accepted_at = now(), accept_reason = trim(p_reason)
   where id = p_finding_id;
  insert into public.wbs_audit_log (project_id, user_id, action, field_name, old_value, new_value)
  values (v.project_id, auth.uid(), 'Schedule Finding Accepted', v.check_code, 'open', trim(p_reason));
end;
$$;

revoke all on function public.record_schedule_qaqc_run(uuid, text, date, integer, jsonb) from public, anon;
grant execute on function public.record_schedule_qaqc_run(uuid, text, date, integer, jsonb) to authenticated;
revoke all on function public.accept_schedule_qaqc_finding(uuid, text) from public, anon;
grant execute on function public.accept_schedule_qaqc_finding(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Gate. Raises when the project blocks submission and the check is missing, old or failing.
create or replace function public.schedule_qaqc_gate_check(p_project_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gate     text;
  v_last     timestamptz;
  v_critical int;
begin
  select qaqc_gate into v_gate from public.plan_schedule_settings where project_id = p_project_id;
  if coalesce(v_gate, 'warn') <> 'block' then
    return;
  end if;
  select max(created_at) into v_last from public.plan_schedule_qaqc_runs where project_id = p_project_id;
  if v_last is null or v_last < now() - interval '60 minutes' then
    raise exception 'This project requires a schedule check before submission: run it on Planning > Schedule Check'
      using errcode = 'check_violation';
  end if;
  select count(*) into v_critical from public.plan_schedule_qaqc_findings
   where project_id = p_project_id and status = 'open' and severity = 'critical';
  if v_critical > 0 then
    raise exception '% critical schedule finding(s) are open: resolve them or have them accepted before submission', v_critical
      using errcode = 'check_violation';
  end if;
end;
$$;

revoke all on function public.schedule_qaqc_gate_check(uuid) from public, anon;
grant execute on function public.schedule_qaqc_gate_check(uuid) to authenticated;

create or replace function public.trg_baseline_qaqc_gate()
returns trigger
language plpgsql
as $$
declare
  v_ctx text;
begin
  if new.status <> 'pending' then
    return new;
  end if;
  get diagnostics v_ctx = pg_context;
  if v_ctx ~ 'function (public\.)?transition_revision\(' then
    return new; -- a client-approved revision: gated when it was submitted
  end if;
  perform public.schedule_qaqc_gate_check(new.project_id);
  return new;
end;
$$;

drop trigger if exists trg_wbs_baselines_qaqc_gate on public.wbs_baselines;
create trigger trg_wbs_baselines_qaqc_gate
  before insert on public.wbs_baselines
  for each row execute function public.trg_baseline_qaqc_gate();

create or replace function public.trg_revision_qaqc_gate()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'submitted_internal' and old.status is distinct from 'submitted_internal' then
    perform public.schedule_qaqc_gate_check((select project_id from public.plan_schedule_streams where id = new.stream_id));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_plan_schedule_revisions_qaqc_gate on public.plan_schedule_revisions;
create trigger trg_plan_schedule_revisions_qaqc_gate
  before update of status on public.plan_schedule_revisions
  for each row execute function public.trg_revision_qaqc_gate();

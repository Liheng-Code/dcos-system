-- Phase M (doc 35; PRD MOD-12 FR-119..FR-128): reporting.
--   M3  plan_report_basis(project): what every report states it is based on: data date, baseline reference,
--       programme revision, the calculation the dates came from, and the last recorded forecast.
--   M4  plan_report_snapshots: every generated report kept as generated (its content model, basis and files), never
--       overwritten or deleted, so a historical report can be reopened exactly. Written by the report route only.
-- Additive only.

create or replace function public.plan_report_basis(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_out     jsonb;
  v_changed timestamptz;
begin
  if not (public.is_project_member(p_project_id) and public.has_permission('planning', 'schedule', 'view')) then
    raise exception 'Not allowed to view this project''s programme' using errcode = '42501';
  end if;
  select max(updated_at) into v_changed from public.wbs_tasks where project_id = p_project_id;

  select jsonb_build_object(
    'project', (select jsonb_build_object('id', p.id, 'code', p.project_code, 'name', p.project_name,
                                          'data_date', p.data_date, 'start', p.start_date, 'contract_finish', p.end_date)
                  from public.projects p where p.id = p_project_id),
    -- the baseline the tasks' baseline dates come from: the newest approved, active one
    'baseline', (select jsonb_build_object('id', b.id, 'number', b.baseline_number, 'name', b.baseline_name, 'type', b.baseline_type,
                                           'date', b.baseline_date, 'approved_at', b.decided_at, 'client_accepted', b.client_accepted)
                   from public.wbs_baselines b
                  where b.project_id = p_project_id and b.status = 'approved' and b.is_active
                  order by b.baseline_number desc limit 1),
    'revision', (select jsonb_build_object('id', r.id, 'stream', s.name, 'number', r.revision_number, 'status', r.status, 'created_at', r.created_at)
                   from public.plan_schedule_revisions r join public.plan_schedule_streams s on s.id = r.stream_id
                  where s.project_id = p_project_id and r.status in ('approved_internal', 'submitted_client', 'approved_client')
                  order by r.created_at desc limit 1),
    'calculation', (select jsonb_build_object('id', c.id, 'at', c.created_at, 'engine_version', c.engine_version, 'input_hash', c.input_hash,
                                              'finish', c.project_finish, 'data_date', c.data_date,
                                              'current', v_changed is null or v_changed <= c.created_at + interval '5 seconds')
                      from public.plan_schedule_calculations c where c.project_id = p_project_id order by c.created_at desc limit 1),
    'forecast', (select jsonb_build_object('id', f.id, 'at', f.captured_at, 'label', coalesce(f.label, f.period), 'finish', f.forecast_finish)
                   from public.plan_forecast_snapshots f where f.project_id = p_project_id order by f.captured_at desc limit 1),
    'last_change', v_changed
  ) into v_out;
  return v_out;
end;
$$;
revoke all on function public.plan_report_basis(uuid) from public, anon;
grant execute on function public.plan_report_basis(uuid) to authenticated;

create table if not exists public.plan_report_snapshots (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  report_type       text not null check (report_type in ('master_programme', 'weekly', 'monthly', 'recovery')),
  period_label      text not null,
  period_start      date,
  period_end        date,
  data_date         date,
  basis             jsonb not null,
  content           jsonb not null,
  renderer_version  text not null,
  content_hash      text not null,
  pdf_path          text,
  html_path         text,
  page_count        integer,
  document_id       uuid references public.documents(id) on delete set null,
  document_number   text,
  document_revision integer,
  generated_by      uuid references auth.users(id) on delete set null,
  generated_at      timestamptz not null default now()
);
create index if not exists idx_plan_report_snapshots_project on public.plan_report_snapshots (project_id, generated_at desc);
comment on table public.plan_report_snapshots is
  'Every generated Planning report as generated (doc 35 M4): content = the report model rendered to the PDF / HTML, basis = data date, baseline, revision and calculation. Never updated or deleted.';

alter table public.plan_report_snapshots enable row level security;
drop policy if exists plan_report_snapshots_select on public.plan_report_snapshots;
create policy plan_report_snapshots_select on public.plan_report_snapshots for select to authenticated
  using (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'view'));
revoke all on public.plan_report_snapshots from anon, authenticated;
grant select on public.plan_report_snapshots to authenticated;

create or replace function public.plan_report_snapshot_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- the document it was filed as may go (document_id is set null); a project delete cascades
  if tg_op = 'UPDATE' and new.document_id is null and old.document_id is not null
     and (to_jsonb(new) - 'document_id') = (to_jsonb(old) - 'document_id') then
    return new;
  end if;
  if tg_op = 'DELETE' and not exists (select 1 from public.projects where id = old.project_id) then
    return old;
  end if;
  raise exception 'A generated report cannot be changed or deleted' using errcode = '42501';
end;
$$;
revoke all on function public.plan_report_snapshot_immutable() from public, anon, authenticated;
drop trigger if exists plan_report_snapshot_immutable on public.plan_report_snapshots;
create trigger plan_report_snapshot_immutable before update or delete on public.plan_report_snapshots
  for each row execute function public.plan_report_snapshot_immutable();

-- Dashboard & Reports — Phase 10
-- Report schedules, delivery logs, KPI materialization

-- ─────────────────────────────────────────────────────────────
-- 1. Report Schedules (user-configured recurring reports)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.report_schedules (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid references public.projects(id) on delete cascade,
  name            text not null,
  description     text,
  report_type     text not null check (report_type in (
    'executive_summary', 'project_status', 'financial_summary',
    'schedule_summary', 'procurement_status', 'hse_summary',
    'site_progress', 'document_status'
  )),
  frequency       text not null check (frequency in ('daily', 'weekly', 'monthly', 'quarterly')),
  day_of_week     int check (day_of_week between 0 and 6),
  day_of_month    int check (day_of_month between 1 and 31),
  format          text not null default 'html' check (format in ('html', 'pdf', 'csv')),
  recipients      jsonb not null default '[]'::jsonb,
  enabled         boolean not null default true,
  created_by      uuid not null references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_report_schedules_project on public.report_schedules(project_id);
create index if not exists idx_report_schedules_enabled on public.report_schedules(enabled);

alter table public.report_schedules enable row level security;

create policy "Authenticated users can view report schedules"
  on public.report_schedules for select to authenticated using (true);

create policy "Authenticated users can create report schedules"
  on public.report_schedules for insert to authenticated with check (true);

create policy "Authenticated users can update report schedules"
  on public.report_schedules for update to authenticated using (true) with check (true);

create policy "Authenticated users can delete report schedules"
  on public.report_schedules for delete to authenticated using (true);

-- ─────────────────────────────────────────────────────────────
-- 2. Report Delivery Log
-- ─────────────────────────────────────────────────────────────
create table if not exists public.report_logs (
  id              uuid primary key default gen_random_uuid(),
  schedule_id     uuid references public.report_schedules(id) on delete cascade,
  report_type     text not null,
  generated_at    timestamptz not null default now(),
  status          text not null default 'pending' check (status in ('pending', 'generating', 'completed', 'failed')),
  error_message   text,
  record_count    int,
  file_url        text,
  delivered_to    jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists idx_report_logs_schedule on public.report_logs(schedule_id, generated_at desc);
create index if not exists idx_report_logs_status   on public.report_logs(status);

alter table public.report_logs enable row level security;

create policy "Authenticated users can view report logs"
  on public.report_logs for select to authenticated using (true);

create policy "Authenticated users can create report logs"
  on public.report_logs for insert to authenticated with check (true);

-- ─────────────────────────────────────────────────────────────
-- 3. KPI Snapshot Table (materialized point-in-time KPI values)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.kpi_snapshots (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid references public.projects(id) on delete cascade,
  kpi_code        text not null,
  kpi_name        text not null,
  kpi_category    text not null check (kpi_category in (
    'project', 'task', 'financial', 'procurement', 'hse',
    'site', 'document', 'planning'
  )),
  value           numeric not null,
  previous_value  numeric,
  target_value    numeric,
  unit            text not null default 'count',
  trend           text check (trend in ('up', 'down', 'flat')),
  captured_at     timestamptz not null default now()
);

create index if not exists idx_kpi_snapshots_project on public.kpi_snapshots(project_id, kpi_category, captured_at desc);
create index if not exists idx_kpi_snapshots_code   on public.kpi_snapshots(kpi_code, captured_at desc);

alter table public.kpi_snapshots enable row level security;

create policy "Authenticated users can view KPI snapshots"
  on public.kpi_snapshots for select to authenticated using (true);

create policy "Authenticated users can create KPI snapshots"
  on public.kpi_snapshots for insert to authenticated with check (true);

-- ─────────────────────────────────────────────────────────────
-- 4. RPC: capture_current_kpi_snapshot()
-- ─────────────────────────────────────────────────────────────
create or replace function public.capture_kpi_snapshot(p_project_id uuid default null)
returns void
language plpgsql
security definer
as $$
declare
  v_project record;
  v_prev numeric;
begin
  for v_project in
    select id from public.projects
    where (p_project_id is null or id = p_project_id)
  loop
    -- Project count
    select value into v_prev from public.kpi_snapshots
      where project_id = v_project.id and kpi_code = 'project_count'
      order by captured_at desc limit 1;
    insert into public.kpi_snapshots (project_id, kpi_code, kpi_name, kpi_category, value, previous_value, unit)
    values (v_project.id, 'project_count', 'Active Projects', 'project', 1, v_prev, 'count');

    -- Task counts
    select value into v_prev from public.kpi_snapshots
      where project_id = v_project.id and kpi_code = 'task_total'
      order by captured_at desc limit 1;
    insert into public.kpi_snapshots (project_id, kpi_code, kpi_name, kpi_category,
      value, previous_value, unit)
    select v_project.id, 'task_total', 'Total Tasks', 'task',
      count(*), v_prev, 'count'
    from public.wbs_tasks where project_id = v_project.id;

    -- Tasks by status
    for v_prev in
      select value from public.kpi_snapshots
        where project_id = v_project.id and kpi_code like 'task_%'
        order by captured_at desc limit 1
    loop end loop;

    insert into public.kpi_snapshots (project_id, kpi_code, kpi_name, kpi_category,
      value, unit)
    select v_project.id, 'task_not_started', 'Not Started', 'task',
      count(*), 'count'
    from public.wbs_tasks where project_id = v_project.id and status = 'not_started';

    insert into public.kpi_snapshots (project_id, kpi_code, kpi_name, kpi_category,
      value, unit)
    select v_project.id, 'task_in_progress', 'In Progress', 'task',
      count(*), 'count'
    from public.wbs_tasks where project_id = v_project.id and status = 'in_progress';

    insert into public.kpi_snapshots (project_id, kpi_code, kpi_name, kpi_category,
      value, unit)
    select v_project.id, 'task_completed', 'Completed', 'task',
      count(*), 'count'
    from public.wbs_tasks where project_id = v_project.id and status = 'completed';

    -- Document counts
    insert into public.kpi_snapshots (project_id, kpi_code, kpi_name, kpi_category,
      value, unit)
    select v_project.id, 'doc_total', 'Total Documents', 'document',
      count(*), 'count'
    from public.documents where project_id = v_project.id;

    insert into public.kpi_snapshots (project_id, kpi_code, kpi_name, kpi_category,
      value, unit)
    select v_project.id, 'doc_pending_review', 'Pending Review', 'document',
      count(*), 'count'
    from public.documents where project_id = v_project.id and status in ('submitted', 'under_review');

    -- HSE counts
    insert into public.kpi_snapshots (project_id, kpi_code, kpi_name, kpi_category,
      value, unit)
    select v_project.id, 'hse_incidents', 'HSE Incidents', 'hse',
      count(*), 'count'
    from public.hse_incidents where project_id = v_project.id;

    -- Procurement counts
    insert into public.kpi_snapshots (project_id, kpi_code, kpi_name, kpi_category,
      value, unit)
    select v_project.id, 'pr_pending', 'Pending PRs', 'procurement',
      count(*), 'count'
    from public.procurement_prs where project_id = v_project.id and approval_status in ('draft', 'submitted', 'under_budget_review');
  end loop;
end;
$$;

comment on function public.capture_kpi_snapshot is 'Captures point-in-time KPI values for all projects (or a specific project). Call via cron or manually.';

-- Timesheet Management Tables

-- Timesheet entries
create table if not exists public.timesheets (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.profiles(id) on delete cascade,
  week_start_date date not null,
  week_end_date   date not null,
  status          text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected')),
  total_hours     numeric default 0,
  total_ot_hours  numeric default 0,
  submission_date timestamptz,
  submitted_by    uuid references public.profiles(id) on delete set null,
  approver_id     uuid references public.profiles(id) on delete set null,
  approval_date   timestamptz,
  approval_notes  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(employee_id, week_start_date)
);

-- Individual timesheet entries (per task)
create table if not exists public.timesheet_entries (
  id              uuid primary key default gen_random_uuid(),
  timesheet_id    uuid not null references public.timesheets(id) on delete cascade,
  entry_date      date not null,
  project_id      uuid references public.projects(id) on delete restrict,
  wbs_node_id     uuid references public.wbs_nodes(id) on delete set null,
  task_description text,
  hours_worked    numeric not null check (hours_worked > 0),
  ot_type         text check (ot_type in ('1.5x', '2.0x', 'holiday', null)),
  ot_hours        numeric default 0,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Timesheet approvals history
create table if not exists public.timesheet_approvals (
  id              uuid primary key default gen_random_uuid(),
  timesheet_id    uuid not null references public.timesheets(id) on delete cascade,
  approver_id     uuid not null references public.profiles(id) on delete restrict,
  action          text not null check (action in ('approved', 'rejected', 'sent_back')),
  action_date     timestamptz not null default now(),
  notes           text,
  created_at      timestamptz not null default now()
);

-- Overtime tracking
create table if not exists public.overtime_records (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.profiles(id) on delete cascade,
  overtime_date   date not null,
  ot_type         text not null check (ot_type in ('1.5x', '2.0x', 'holiday')),
  ot_hours        numeric not null check (ot_hours > 0),
  reason          text,
  approved        boolean default false,
  approved_by     uuid references public.profiles(id) on delete set null,
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique(employee_id, overtime_date, ot_type)
);

-- Create indexes for performance
create index if not exists idx_timesheets_employee on public.timesheets(employee_id);
create index if not exists idx_timesheets_week on public.timesheets(week_start_date, week_end_date);
create index if not exists idx_timesheets_status on public.timesheets(status);
create index if not exists idx_timesheets_submission on public.timesheets(submission_date);
create index if not exists idx_timesheet_entries_timesheet on public.timesheet_entries(timesheet_id);
create index if not exists idx_timesheet_entries_date on public.timesheet_entries(entry_date);
create index if not exists idx_timesheet_entries_project on public.timesheet_entries(project_id);
create index if not exists idx_timesheet_entries_wbs on public.timesheet_entries(wbs_node_id);
create index if not exists idx_timesheet_approvals_timesheet on public.timesheet_approvals(timesheet_id);
create index if not exists idx_timesheet_approvals_approver on public.timesheet_approvals(approver_id);
create index if not exists idx_overtime_records_employee on public.overtime_records(employee_id);
create index if not exists idx_overtime_records_date on public.overtime_records(overtime_date);
create index if not exists idx_overtime_records_approved on public.overtime_records(approved);

-- Enable RLS
alter table public.timesheets enable row level security;
alter table public.timesheet_entries enable row level security;
alter table public.timesheet_approvals enable row level security;
alter table public.overtime_records enable row level security;

-- RLS Policies
create policy "Users can view own timesheets"
  on public.timesheets for select to authenticated
  using (employee_id = auth.uid());

create policy "Approvers can view assigned timesheets"
  on public.timesheets for select to authenticated
  using (approver_id = auth.uid());

create policy "HR Manager can view all timesheets"
  on public.timesheets for select to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "Users can create own timesheets"
  on public.timesheets for insert to authenticated
  with check (employee_id = auth.uid());

create policy "Users can update own draft timesheets"
  on public.timesheets for update to authenticated
  using (employee_id = auth.uid() and status = 'draft')
  with check (employee_id = auth.uid() and status = 'draft');

create policy "Approvers can update timesheets"
  on public.timesheets for update to authenticated
  using (approver_id = auth.uid())
  with check (approver_id = auth.uid());

create policy "Users can view own entries"
  on public.timesheet_entries for select to authenticated
  using (
    exists(select 1 from timesheets where timesheets.id = timesheet_id and timesheets.employee_id = auth.uid())
  );

create policy "HR Manager can view all entries"
  on public.timesheet_entries for select to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "Users can create own entries"
  on public.timesheet_entries for insert to authenticated
  with check (
    exists(select 1 from timesheets where timesheets.id = timesheet_id and timesheets.employee_id = auth.uid())
  );

create policy "Users can update own entries"
  on public.timesheet_entries for update to authenticated
  using (
    exists(select 1 from timesheets where timesheets.id = timesheet_id and timesheets.employee_id = auth.uid() and timesheets.status = 'draft')
  )
  with check (
    exists(select 1 from timesheets where timesheets.id = timesheet_id and timesheets.employee_id = auth.uid() and timesheets.status = 'draft')
  );

create policy "Users can view own OT records"
  on public.overtime_records for select to authenticated
  using (employee_id = auth.uid());

create policy "HR Manager can view all OT"
  on public.overtime_records for select to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "Users can create own OT records"
  on public.overtime_records for insert to authenticated
  with check (employee_id = auth.uid());

create policy "HR Manager can approve OT"
  on public.overtime_records for update to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')))
  with check (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

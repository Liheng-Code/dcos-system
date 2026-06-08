-- Attendance Management Tables

-- Attendance types configuration
create table if not exists public.attendance_types (
  id              uuid primary key default gen_random_uuid(),
  type_code       text not null unique,
  type_name       text not null,
  description     text,
  is_working_day  boolean default true,
  created_at      timestamptz not null default now()
);

-- Attendance records (daily record per employee)
create table if not exists public.attendance_records (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.profiles(id) on delete cascade,
  attendance_date date not null,
  attendance_type text not null,
  check_in_time   time,
  check_out_time  time,
  hours_worked    numeric,
  notes           text,
  manager_id      uuid references public.profiles(id) on delete set null,
  verified        boolean default false,
  verified_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(employee_id, attendance_date)
);

-- Attendance logs (detailed check-in/check-out logs)
create table if not exists public.attendance_logs (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.profiles(id) on delete cascade,
  log_time        timestamptz not null default now(),
  log_type        text not null check (log_type in ('check_in', 'check_out')),
  method          text check (method in ('web', 'biometric', 'rfid', 'gps', 'qr', 'mobile')),
  location        text,
  latitude        numeric,
  longitude       numeric,
  device_id       text,
  notes           text,
  created_at      timestamptz not null default now()
);

-- Attendance adjustments (manager adjustments)
create table if not exists public.attendance_adjustments (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.profiles(id) on delete cascade,
  adjustment_date date not null,
  old_type        text,
  new_type        text not null,
  reason          text,
  adjusted_by     uuid not null references public.profiles(id) on delete restrict,
  approval_status text default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  approved_by     uuid references public.profiles(id) on delete set null,
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Seed attendance types
insert into public.attendance_types (type_code, type_name, description, is_working_day) values
  ('PRESENT', 'Present', 'Employee present at work', true),
  ('ABSENT', 'Absent', 'Employee absent without leave', false),
  ('LATE', 'Late Arrival', 'Employee arrived late', true),
  ('LEAVE', 'On Leave', 'Employee on approved leave', false),
  ('HOLIDAY', 'Holiday', 'Public or company holiday', false),
  ('BUSINESS_TRIP', 'Business Trip', 'On authorized business trip', true),
  ('WFH', 'Work From Home', 'Working from home', true),
  ('SITE_WORK', 'Site Work', 'Working on-site', true)
on conflict do nothing;

-- Create indexes for performance
create index if not exists idx_attendance_records_employee on public.attendance_records(employee_id);
create index if not exists idx_attendance_records_date on public.attendance_records(attendance_date);
create index if not exists idx_attendance_records_type on public.attendance_records(attendance_type);
create index if not exists idx_attendance_records_verified on public.attendance_records(verified);
create index if not exists idx_attendance_logs_employee on public.attendance_logs(employee_id);
create index if not exists idx_attendance_logs_time on public.attendance_logs(log_time);
create index if not exists idx_attendance_logs_type on public.attendance_logs(log_type);
create index if not exists idx_attendance_adjustments_employee on public.attendance_adjustments(employee_id);
create index if not exists idx_attendance_adjustments_date on public.attendance_adjustments(adjustment_date);
create index if not exists idx_attendance_adjustments_status on public.attendance_adjustments(approval_status);

-- Enable RLS
alter table public.attendance_types enable row level security;
alter table public.attendance_records enable row level security;
alter table public.attendance_logs enable row level security;
alter table public.attendance_adjustments enable row level security;

-- RLS Policies
create policy "Authenticated users can view attendance types"
  on public.attendance_types for select to authenticated using (true);

create policy "Users can view own attendance"
  on public.attendance_records for select to authenticated
  using (employee_id = auth.uid());

create policy "HR and managers can view all attendance"
  on public.attendance_records for select to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'HR', 'admin')));

create policy "Users can create own attendance"
  on public.attendance_records for insert to authenticated
  with check (employee_id = auth.uid());

create policy "HR Manager can create for others"
  on public.attendance_records for insert to authenticated
  with check (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "HR Manager can update attendance"
  on public.attendance_records for update to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')))
  with check (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "Users can view own logs"
  on public.attendance_logs for select to authenticated
  using (employee_id = auth.uid());

create policy "HR can view all logs"
  on public.attendance_logs for select to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'HR', 'admin')));

create policy "Users can create own logs"
  on public.attendance_logs for insert to authenticated
  with check (employee_id = auth.uid());

create policy "Users can view own adjustments"
  on public.attendance_adjustments for select to authenticated
  using (employee_id = auth.uid() or adjusted_by = auth.uid());

create policy "HR Manager can manage adjustments"
  on public.attendance_adjustments for all to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')))
  with check (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

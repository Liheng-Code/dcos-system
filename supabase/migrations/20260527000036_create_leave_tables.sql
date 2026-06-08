-- Leave Management Tables

-- Leave types configuration
create table if not exists public.leave_types (
  id              uuid primary key default gen_random_uuid(),
  leave_code      text not null unique,
  leave_name      text not null,
  description     text,
  max_days_per_year numeric not null default 0,
  is_paid         boolean default true,
  requires_approval boolean default true,
  carryover_allowed boolean default false,
  max_carryover   numeric default 0,
  created_at      timestamptz not null default now()
);

-- Employee leave balances
create table if not exists public.leave_balances (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.profiles(id) on delete cascade,
  leave_type_id   uuid not null references public.leave_types(id) on delete cascade,
  fiscal_year     int not null,
  allocated_days  numeric not null default 0,
  used_days       numeric not null default 0,
  carried_over_days numeric default 0,
  remaining_days  numeric not null default 0,
  last_updated    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique(employee_id, leave_type_id, fiscal_year)
);

-- Leave requests
create table if not exists public.leave_requests (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.profiles(id) on delete cascade,
  leave_type_id   uuid not null references public.leave_types(id) on delete restrict,
  start_date      date not null,
  end_date        date not null,
  days_requested  numeric not null,
  reason          text,
  status          text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected', 'cancelled')),
  submission_date timestamptz,
  requested_by_id uuid not null references public.profiles(id) on delete restrict,
  approver_1_id   uuid references public.profiles(id) on delete set null,
  approver_1_status text,
  approver_1_date timestamptz,
  approver_1_notes text,
  approver_2_id   uuid references public.profiles(id) on delete set null,
  approver_2_status text,
  approver_2_date timestamptz,
  approver_2_notes text,
  attachments     text[],
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Leave request comments/notes
create table if not exists public.leave_request_comments (
  id              uuid primary key default gen_random_uuid(),
  leave_request_id uuid not null references public.leave_requests(id) on delete cascade,
  commented_by    uuid not null references public.profiles(id) on delete restrict,
  comment_text    text not null,
  is_internal     boolean default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Seed leave types
insert into public.leave_types (leave_code, leave_name, description, max_days_per_year, is_paid, requires_approval, carryover_allowed, max_carryover) values
  ('ANNUAL', 'Annual Leave', 'Paid annual leave', 20, true, true, true, 5),
  ('SICK', 'Sick Leave', 'Paid sick leave', 10, true, false, false, 0),
  ('EMERGENCY', 'Emergency Leave', 'Unpaid emergency leave', 0, false, true, false, 0),
  ('MATERNITY', 'Maternity Leave', 'Maternity leave', 90, true, true, false, 0),
  ('PATERNITY', 'Paternity Leave', 'Paternity leave', 7, true, true, false, 0),
  ('COMPENSATION', 'Compensation Leave', 'Paid comp leave', 0, true, true, true, 0),
  ('UNPAID', 'Unpaid Leave', 'Unpaid leave', 0, false, true, false, 0),
  ('BUSINESS', 'Business Leave', 'Business trip leave', 0, true, true, false, 0)
on conflict do nothing;

-- Create indexes for performance
create index if not exists idx_leave_balances_employee on public.leave_balances(employee_id);
create index if not exists idx_leave_balances_year on public.leave_balances(fiscal_year);
create index if not exists idx_leave_requests_employee on public.leave_requests(employee_id);
create index if not exists idx_leave_requests_status on public.leave_requests(status);
create index if not exists idx_leave_requests_dates on public.leave_requests(start_date, end_date);
create index if not exists idx_leave_requests_submission on public.leave_requests(submission_date);
create index if not exists idx_leave_request_comments_request on public.leave_request_comments(leave_request_id);

-- Enable RLS
alter table public.leave_types enable row level security;
alter table public.leave_balances enable row level security;
alter table public.leave_requests enable row level security;
alter table public.leave_request_comments enable row level security;

-- RLS Policies
create policy "Authenticated users can view leave types"
  on public.leave_types for select to authenticated using (true);

create policy "Users can view own leave balance"
  on public.leave_balances for select to authenticated
  using (employee_id = auth.uid());

create policy "HR Manager can view all balances"
  on public.leave_balances for select to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "Users can view own leave requests"
  on public.leave_requests for select to authenticated
  using (employee_id = auth.uid() or requested_by_id = auth.uid() or approver_1_id = auth.uid() or approver_2_id = auth.uid());

create policy "HR Manager can view all leave requests"
  on public.leave_requests for select to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "Users can create own leave requests"
  on public.leave_requests for insert to authenticated
  with check (employee_id = auth.uid() and requested_by_id = auth.uid());

create policy "Users can update own draft requests"
  on public.leave_requests for update to authenticated
  using (employee_id = auth.uid() and status = 'draft')
  with check (employee_id = auth.uid() and status = 'draft');

create policy "Approvers can update requests"
  on public.leave_requests for update to authenticated
  using (approver_1_id = auth.uid() or approver_2_id = auth.uid())
  with check (approver_1_id = auth.uid() or approver_2_id = auth.uid());

create policy "Users can view own request comments"
  on public.leave_request_comments for select to authenticated
  using (
    exists(select 1 from leave_requests where leave_requests.id = leave_request_id and
      (leave_requests.employee_id = auth.uid() or leave_requests.requested_by_id = auth.uid()))
  );

create policy "Users can add comments to own requests"
  on public.leave_request_comments for insert to authenticated
  with check (
    exists(select 1 from leave_requests where leave_requests.id = leave_request_id and
      (leave_requests.employee_id = auth.uid() or leave_requests.requested_by_id = auth.uid()))
  );

create policy "HR Manager can manage comments"
  on public.leave_request_comments for all to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')))
  with check (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

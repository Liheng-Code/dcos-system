-- ============================================================
-- OT Management Module — Core Tables (DCOS-SOP-HR-OT-001 §27)
-- ============================================================

-- ============================================================
-- 1. overtime_requests — Core OT request table (§27)
-- ============================================================
create table if not exists public.overtime_requests (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null references public.profiles(id) on delete cascade,
  project_id        uuid references public.projects(id) on delete set null,
  wbs_node_id       uuid references public.wbs_nodes(id) on delete set null,
  task_id           uuid references public.wbs_tasks(id) on delete set null,
  department        text,
  ot_type           text not null check (ot_type in (
                      'weekday', 'weekend', 'public_holiday',
                      'night_shift', 'emergency', 'project_critical'
                    )),
  category          text not null default 'planned' check (category in (
                      'planned', 'emergency', 'mandatory', 'voluntary'
                    )),
  start_time        timestamptz not null,
  end_time          timestamptz not null,
  hours             numeric not null check (hours > 0),
  reason            text not null,
  remarks           text,
  status            text not null default 'draft' check (status in (
                      'draft', 'submitted', 'approved', 'rejected',
                      'in_progress', 'completed', 'verified', 'paid'
                    )),
  submitted_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint ot_end_after_start check (end_time > start_time)
);

create index idx_ot_req_employee   on public.overtime_requests(employee_id);
create index idx_ot_req_project    on public.overtime_requests(project_id);
create index idx_ot_req_status     on public.overtime_requests(status);
create index idx_ot_req_start_time on public.overtime_requests(start_time);
create index idx_ot_req_ot_type    on public.overtime_requests(ot_type);

alter table public.overtime_requests enable row level security;

-- ============================================================
-- 2. overtime_approvals — Multi-step approval trail (§27)
-- ============================================================
create table if not exists public.overtime_approvals (
  id                uuid primary key default gen_random_uuid(),
  ot_request_id     uuid not null references public.overtime_requests(id) on delete cascade,
  approver_id       uuid not null references public.profiles(id) on delete restrict,
  approver_level    int not null check (approver_level between 1 and 5),
  label             text not null default 'Manager' check (label in (
                      'Manager', 'Section Head', 'Project Manager', 'HR', 'Final'
                    )),
  status            text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  remarks           text,
  decided_at        timestamptz,
  created_at        timestamptz not null default now(),
  unique(ot_request_id, approver_level)
);

create index idx_ot_app_ot_request on public.overtime_approvals(ot_request_id);
create index idx_ot_app_approver   on public.overtime_approvals(approver_id);
create index idx_ot_app_status     on public.overtime_approvals(status);

alter table public.overtime_approvals enable row level security;

-- ============================================================
-- 3. overtime_rates — Configurable OT multipliers (§27, §13)
-- ============================================================
create table if not exists public.overtime_rates (
  id                uuid primary key default gen_random_uuid(),
  ot_type           text not null check (ot_type in (
                      'weekday', 'weekend', 'public_holiday',
                      'night_shift', 'emergency', 'project_critical'
                    )),
  multiplier        numeric(4,2) not null check (multiplier >= 1.0),
  effective_date    date not null default current_date,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  unique(ot_type, effective_date)
);

alter table public.overtime_rates enable row level security;

-- ============================================================
-- 4. overtime_payroll — Payroll integration records (§27)
-- ============================================================
create table if not exists public.overtime_payroll (
  id                uuid primary key default gen_random_uuid(),
  ot_request_id     uuid not null references public.overtime_requests(id) on delete cascade,
  employee_id       uuid not null references public.profiles(id) on delete cascade,
  payroll_period_id uuid references public.payroll_periods(id) on delete set null,
  payroll_month     text not null,
  hours             numeric not null check (hours > 0),
  rate_multiplier   numeric(4,2) not null,
  hourly_rate       numeric(12,2) not null,
  amount            numeric(12,2) not null check (amount >= 0),
  status            text not null default 'pending' check (status in ('pending', 'paid')),
  paid_at           timestamptz,
  created_at        timestamptz not null default now()
);

create index idx_ot_pay_employee  on public.overtime_payroll(employee_id);
create index idx_ot_pay_request   on public.overtime_payroll(ot_request_id);
create index idx_ot_pay_month     on public.overtime_payroll(payroll_month);
create index idx_ot_pay_status    on public.overtime_payroll(status);

alter table public.overtime_payroll enable row level security;

-- ============================================================
-- 5. overtime_attachments — File attachments
-- ============================================================
create table if not exists public.overtime_attachments (
  id                uuid primary key default gen_random_uuid(),
  ot_request_id     uuid not null references public.overtime_requests(id) on delete cascade,
  file_name         text not null,
  file_path         text not null,
  file_size         int,
  content_type      text,
  uploaded_by       uuid not null references public.profiles(id) on delete restrict,
  created_at        timestamptz not null default now()
);

create index idx_ot_att_request on public.overtime_attachments(ot_request_id);

alter table public.overtime_attachments enable row level security;

-- ============================================================
-- 6. overtime_limits — Configurable daily/weekly/monthly caps
-- ============================================================
create table if not exists public.overtime_limits (
  id                    uuid primary key default gen_random_uuid(),
  limit_type            text not null check (limit_type in ('daily', 'weekly', 'monthly')),
  max_hours             numeric not null check (max_hours > 0),
  escalation_required   boolean not null default false,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now()
);

alter table public.overtime_limits enable row level security;

-- ============================================================
-- 7. overtime_audit_log — Immutable audit trail (§30)
-- ============================================================
create table if not exists public.overtime_audit_log (
  id                uuid primary key default gen_random_uuid(),
  ot_request_id     uuid references public.overtime_requests(id) on delete set null,
  action            text not null check (action in (
                      'created', 'edited', 'submitted', 'approved', 'rejected',
                      'verified', 'completed', 'paid', 'cancelled', 'cost_allocated',
                      'payroll_transfer', 'clock_in', 'clock_out'
                    )),
  performed_by      uuid not null references public.profiles(id) on delete restrict,
  details           jsonb,
  created_at        timestamptz not null default now()
);

create index idx_ot_audit_request   on public.overtime_audit_log(ot_request_id);
create index idx_ot_audit_action    on public.overtime_audit_log(action);
create index idx_ot_audit_created   on public.overtime_audit_log(created_at);

alter table public.overtime_audit_log enable row level security;

-- ============================================================
-- 8. overtime_notifications — Notification queue
-- ============================================================
create table if not exists public.overtime_notifications (
  id                uuid primary key default gen_random_uuid(),
  ot_request_id     uuid not null references public.overtime_requests(id) on delete cascade,
  event_type        text not null check (event_type in (
                      'request_submitted', 'request_approved', 'request_rejected',
                      'request_verified', 'request_paid', 'request_cancelled'
                    )),
  recipient_id      uuid not null references public.profiles(id),
  recipient_email   text,
  recipient_name    text,
  subject           text,
  body              text,
  queued_at         timestamptz not null default now(),
  sent_at           timestamptz,
  error_message     text
);

create index idx_ot_notif_request   on public.overtime_notifications(ot_request_id);
create index idx_ot_notif_recipient on public.overtime_notifications(recipient_id);
create index idx_ot_notif_sent      on public.overtime_notifications(sent_at);

alter table public.overtime_notifications enable row level security;

-- ============================================================
-- RLS Policies — overtime_requests
-- ============================================================
create policy "Authenticated users can view overtime requests"
  on public.overtime_requests for select to authenticated using (true);

create policy "Employees can create their own OT requests"
  on public.overtime_requests for insert to authenticated
  with check (employee_id = auth.uid() or exists (
    select 1 from public.profiles where id = auth.uid()
    and level in ('HR_Manager','HR_Admin','HR_Officer','Super_Admin','Admin')
  ));

create policy "Employees can update their own draft OT requests"
  on public.overtime_requests for update to authenticated
  using (status = 'draft' and employee_id = auth.uid())
  with check (status = 'draft' and employee_id = auth.uid());

create policy "HR can update any OT request"
  on public.overtime_requests for update to authenticated
  using (exists (
    select 1 from public.profiles where id = auth.uid()
    and level in ('HR_Manager','HR_Admin','HR_Officer','Super_Admin','Admin')
  ));

-- ============================================================
-- RLS Policies — overtime_approvals
-- ============================================================
create policy "Users can view approvals they're involved in"
  on public.overtime_approvals for select to authenticated
  using (approver_id = auth.uid() or exists (
    select 1 from public.overtime_requests where id = ot_request_id
  ));

create policy "Approvers can update their own pending approvals"
  on public.overtime_approvals for update to authenticated
  using (approver_id = auth.uid() and status = 'pending')
  with check (approver_id = auth.uid() and status in ('approved', 'rejected'));

-- ============================================================
-- RLS Policies — Other tables (open read, restricted write)
-- ============================================================
create policy "Authenticated users can view overtime_rates"
  on public.overtime_rates for select to authenticated using (true);

create policy "HR admin can manage overtime_rates"
  on public.overtime_rates for all to authenticated
  using (exists (
    select 1 from public.profiles where id = auth.uid()
    and level in ('HR_Manager','HR_Admin','Super_Admin','Admin')
  ));

create policy "Authenticated users can view overtime_payroll"
  on public.overtime_payroll for select to authenticated using (true);

create policy "HR and payroll can manage overtime_payroll"
  on public.overtime_payroll for all to authenticated
  using (exists (
    select 1 from public.profiles where id = auth.uid()
    and level in ('HR_Manager','HR_Admin','HR_Officer','Payroll_Officer','Super_Admin','Admin')
  ));

create policy "Authenticated users can view overtime_attachments"
  on public.overtime_attachments for select to authenticated using (true);

create policy "Users can upload their own attachments"
  on public.overtime_attachments for insert to authenticated
  with check (uploaded_by = auth.uid());

create policy "Authenticated users can view overtime_limits"
  on public.overtime_limits for select to authenticated using (true);

create policy "HR admin can manage overtime_limits"
  on public.overtime_limits for all to authenticated
  using (exists (
    select 1 from public.profiles where id = auth.uid()
    and level in ('HR_Manager','HR_Admin','Super_Admin','Admin')
  ));

create policy "Authenticated users can view overtime_audit_log"
  on public.overtime_audit_log for select to authenticated using (true);

create policy "System can insert audit log entries"
  on public.overtime_audit_log for insert to authenticated
  with check (true);

create policy "Authenticated users can view overtime_notifications"
  on public.overtime_notifications for select to authenticated
  using (recipient_id = auth.uid());

create policy "System can insert notifications"
  on public.overtime_notifications for insert to authenticated
  with check (true);

-- ============================================================
-- Trigger: auto-update updated_at on overtime_requests
-- ============================================================
create or replace function public.update_overtime_requests_updated_at()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_overtime_requests_updated_at
  before update on public.overtime_requests
  for each row execute function public.update_overtime_requests_updated_at();

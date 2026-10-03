-- HR auto-match foundation (design: docs/04-Business-Modules/04-18-HR/04-18-0-HR-Auto-Match-Design.md)
--   hr_assignment_rules   HR-editable defaults matched on employee attributes
--   attendance_daily      one derived row per employee per day (feeds timesheet, OT, payroll)
--   overtime_type_rules   HR-editable conditions that suggest an OT type
--   overtime_rates.payroll_component_code   OT type -> payslip component by configuration
--   source on shift/site assignments       'manual' (HR) vs 'rule' (auto-provisioned)
-- Idempotent: safe to re-run.

create or replace function public.hr_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── 1. Assignment rules ─────────────────────────────────────────────────────
create table if not exists public.hr_assignment_rules (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  priority              integer not null default 100,   -- lower wins
  is_active             boolean not null default true,
  -- match (null = wildcard)
  m_employment_type     text,
  m_employment_category text,
  m_labor_category      text,
  m_department_id       uuid,
  m_position_id         uuid,
  m_company_id          uuid,
  -- outputs (null = leave unchanged)
  leave_group           text,
  payroll_group         text,
  shift_id              uuid references public.work_shifts(id) on delete set null,
  default_site_id       uuid references public.site_locations(id) on delete set null,
  ot_eligible           boolean,
  tax_applicable        boolean,
  nssf_applicable       boolean,
  payroll_type          text,
  currency              text check (currency is null or currency in ('USD','KHR')),
  note                  text,
  created_by            uuid default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists hr_assignment_rules_active_idx
  on public.hr_assignment_rules (priority) where is_active;

drop trigger if exists trg_hr_assignment_rules_updated_at on public.hr_assignment_rules;
create trigger trg_hr_assignment_rules_updated_at
  before update on public.hr_assignment_rules
  for each row execute function public.hr_set_updated_at();

alter table public.hr_assignment_rules enable row level security;
drop policy if exists hr_assignment_rules_read on public.hr_assignment_rules;
create policy hr_assignment_rules_read on public.hr_assignment_rules
  for select to authenticated using ((select public.is_hr()));
drop policy if exists hr_assignment_rules_write on public.hr_assignment_rules;
create policy hr_assignment_rules_write on public.hr_assignment_rules
  for all to authenticated
  using ((select public.is_hr())) with check ((select public.is_hr()));

-- ── 2. Daily attendance fact ────────────────────────────────────────────────
create table if not exists public.attendance_daily (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references public.profiles(id) on delete cascade,
  work_date        date not null,
  shift_id         uuid references public.work_shifts(id) on delete set null,
  site_id          uuid references public.site_locations(id) on delete set null,
  project_id       uuid references public.projects(id) on delete set null,
  status           text not null default 'ABSENT',      -- attendance_types.type_code
  first_in         timestamptz,
  last_out         timestamptz,
  worked_hours     numeric(5,2) not null default 0,
  regular_hours    numeric(5,2) not null default 0,
  ot_hours_actual  numeric(5,2) not null default 0,
  late_minutes     integer not null default 0,
  is_holiday       boolean not null default false,
  is_rest_day      boolean not null default false,
  leave_request_id uuid references public.leave_requests(id) on delete set null,
  ot_request_id    uuid references public.overtime_requests(id) on delete set null,
  needs_review     boolean not null default false,
  review_reason    text,
  review_resolved_by uuid references public.profiles(id) on delete set null,
  review_resolved_at timestamptz,
  source           text not null default 'auto' check (source in ('auto','manual')),
  built_at         timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (employee_id, work_date)
);
create index if not exists attendance_daily_date_idx on public.attendance_daily (work_date);
create index if not exists attendance_daily_review_idx
  on public.attendance_daily (work_date) where needs_review and review_resolved_at is null;

drop trigger if exists trg_attendance_daily_updated_at on public.attendance_daily;
create trigger trg_attendance_daily_updated_at
  before update on public.attendance_daily
  for each row execute function public.hr_set_updated_at();

alter table public.attendance_daily enable row level security;
drop policy if exists attendance_daily_read on public.attendance_daily;
create policy attendance_daily_read on public.attendance_daily
  for select to authenticated using (
    employee_id = (select auth.uid())
    or (select public.is_hr())
    or exists (
      select 1 from public.reporting_structure rs
      where rs.employee_id = attendance_daily.employee_id
        and rs.manager_id = (select auth.uid())
        and rs.effective_to is null
    )
  );
drop policy if exists attendance_daily_write on public.attendance_daily;
create policy attendance_daily_write on public.attendance_daily
  for all to authenticated
  using ((select public.is_hr())) with check ((select public.is_hr()));
-- The nightly builder runs with the service role (bypasses RLS).

-- ── 3. OT type rules ────────────────────────────────────────────────────────
-- kind: public_holiday | rest_day | night_window | default
-- params: night_window uses {"from":"22:00","to":"05:00"}
create table if not exists public.overtime_type_rules (
  id         uuid primary key default gen_random_uuid(),
  priority   integer not null default 100,               -- lower wins
  kind       text not null check (kind in ('public_holiday','rest_day','night_window','default')),
  params     jsonb not null default '{}'::jsonb,
  ot_type    text not null,                               -- an overtime_rates.ot_type
  is_active  boolean not null default true,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists overtime_type_rules_kind_uq
  on public.overtime_type_rules (kind) where kind <> 'night_window';

drop trigger if exists trg_overtime_type_rules_updated_at on public.overtime_type_rules;
create trigger trg_overtime_type_rules_updated_at
  before update on public.overtime_type_rules
  for each row execute function public.hr_set_updated_at();

alter table public.overtime_type_rules enable row level security;
drop policy if exists overtime_type_rules_read on public.overtime_type_rules;
create policy overtime_type_rules_read on public.overtime_type_rules
  for select to authenticated using (true);
drop policy if exists overtime_type_rules_write on public.overtime_type_rules;
create policy overtime_type_rules_write on public.overtime_type_rules
  for all to authenticated
  using ((select public.is_hr())) with check ((select public.is_hr()));

-- Defaults mirror the configured overtime_rates; HR can edit or reorder them.
insert into public.overtime_type_rules (priority, kind, params, ot_type, note)
select v.priority, v.kind, v.params::jsonb, v.ot_type, v.note
from (values
  (10, 'public_holiday', '{}',                                 'public_holiday', 'Date is a public holiday'),
  (20, 'rest_day',       '{}',                                 'weekend',        'Date is not a working day of the shift'),
  (30, 'night_window',   '{"from":"22:00","to":"05:00"}',      'night_shift',    'OT overlaps the night window'),
  (99, 'default',        '{}',                                 'weekday',        'Any other working day')
) as v(priority, kind, params, ot_type, note)
where not exists (select 1 from public.overtime_type_rules r where r.kind = v.kind)
  and exists (select 1 from public.overtime_rates o where o.ot_type = v.ot_type);

-- ── 4. OT type -> payslip component by configuration ────────────────────────
alter table public.overtime_rates add column if not exists payroll_component_code text;
comment on column public.overtime_rates.payroll_component_code is
  'payroll_component_types.code the OT of this type is paid under; set by HR in OT Rates.';

update public.overtime_rates
set payroll_component_code = case
    when ot_type = 'public_holiday' then 'OT_HOLIDAY'
    when multiplier >= 2 then 'OT_200'
    else 'OT_150'
  end
where payroll_component_code is null;

-- ── 5. Provenance of auto-provisioned assignments ───────────────────────────
alter table public.employee_attendance_site_assignments
  add column if not exists source text not null default 'manual' check (source in ('manual','rule'));
alter table public.employee_shift_assignments
  add column if not exists source text not null default 'manual' check (source in ('manual','rule'));

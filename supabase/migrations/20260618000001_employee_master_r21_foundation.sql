-- Employee Master R2.1 foundation
-- Adds compliance fields, controlled setup fields, HR history, document checklist,
-- lifecycle status values, and read-only Employee ID protection.

alter table public.profiles
  add column if not exists khmer_name text,
  add column if not exists english_name text,
  add column if not exists current_address text,
  add column if not exists permanent_address text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_relationship text,
  add column if not exists emergency_contact_phone text,
  add column if not exists emergency_contact_address text,
  add column if not exists national_id_number text,
  add column if not exists national_id_expiry date,
  add column if not exists passport_number text,
  add column if not exists passport_expiry date,
  add column if not exists visa_number text,
  add column if not exists visa_expiry date,
  add column if not exists work_permit_number text,
  add column if not exists work_permit_expiry date,
  add column if not exists tax_identification_number text,
  add column if not exists employment_contract_number text,
  add column if not exists contract_start_date date,
  add column if not exists contract_end_date date,
  add column if not exists seniority_start_date date,
  add column if not exists labor_category text,
  add column if not exists employment_category text,
  add column if not exists company text,
  add column if not exists division text,
  add column if not exists section text,
  add column if not exists cost_center text,
  add column if not exists leave_group text,
  add column if not exists payroll_group text,
  add column if not exists attendance_site text,
  add column if not exists shift_group text,
  add column if not exists rfid_card text,
  add column if not exists fingerprint_id text,
  add column if not exists face_recognition_id text,
  add column if not exists door_access_group text,
  add column if not exists parking_access text,
  add column if not exists shirt_size text,
  add column if not exists pant_size text,
  add column if not exists safety_shoe_size text,
  add column if not exists helmet_size text,
  add column if not exists vest_size text,
  add column if not exists last_status_change_at timestamptz,
  add column if not exists last_status_change_by uuid references public.profiles(id) on delete set null;

-- Keep status values aligned with Employee Master policy without rewriting data.
alter table public.profiles
  drop constraint if exists profiles_status_check;

alter table public.profiles
  add constraint profiles_status_check
  check (status in (
    'draft',
    'pending',
    'pending_approval',
    'approved',
    'probation',
    'active',
    'inactive',
    'suspended',
    'long_leave',
    'disabled',
    'resigned',
    'terminated',
    'retired',
    'deceased',
    'archived'
  ));

create unique index if not exists idx_profiles_employee_id_unique
  on public.profiles(employee_id)
  where employee_id is not null;

create index if not exists idx_profiles_contract_end_date on public.profiles(contract_end_date);
create index if not exists idx_profiles_seniority_start_date on public.profiles(seniority_start_date);
create index if not exists idx_profiles_leave_group on public.profiles(leave_group);
create index if not exists idx_profiles_payroll_group on public.profiles(payroll_group);
create index if not exists idx_profiles_attendance_site on public.profiles(attendance_site);

create or replace function public.fn_block_employee_id_change()
returns trigger as $$
begin
  if tg_op = 'UPDATE'
     and old.employee_id is not null
     and new.employee_id is distinct from old.employee_id then
    raise exception 'employee_id is read-only after assignment';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_block_employee_id_change on public.profiles;
create trigger trg_block_employee_id_change
  before update of employee_id on public.profiles
  for each row execute function public.fn_block_employee_id_change();

create table if not exists public.employee_master_lists (
  id          uuid primary key default gen_random_uuid(),
  list_type   text not null,
  code        text not null,
  name        text not null,
  description text,
  is_active   boolean not null default true,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(list_type, code)
);

create index if not exists idx_employee_master_lists_type_active
  on public.employee_master_lists(list_type, is_active, sort_order);

create table if not exists public.employee_document_checklist_items (
  id            uuid primary key default gen_random_uuid(),
  document_type text not null unique,
  label         text not null,
  is_mandatory  boolean not null default false,
  sort_order    integer not null default 100,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.employee_document_checklist_status (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null references public.profiles(id) on delete cascade,
  checklist_item_id uuid not null references public.employee_document_checklist_items(id) on delete cascade,
  document_id       uuid references public.employee_documents(id) on delete set null,
  status            text not null default 'missing'
    check (status in ('missing', 'uploaded', 'verified', 'expired', 'waived')),
  waived_reason     text,
  verified_by       uuid references public.profiles(id) on delete set null,
  verified_at       timestamptz,
  updated_at        timestamptz not null default now(),
  unique(employee_id, checklist_item_id)
);

create index if not exists idx_employee_document_checklist_status_employee
  on public.employee_document_checklist_status(employee_id);
create index if not exists idx_employee_document_checklist_status_status
  on public.employee_document_checklist_status(status);

create table if not exists public.employee_master_history (
  id                 uuid primary key default gen_random_uuid(),
  employee_id        uuid not null references public.profiles(id) on delete cascade,
  change_type        text not null,
  field_name         text,
  old_value          jsonb,
  new_value          jsonb,
  reason             text,
  effective_date     date,
  approval_reference text,
  changed_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now()
);

create index if not exists idx_employee_master_history_employee
  on public.employee_master_history(employee_id, created_at desc);
create index if not exists idx_employee_master_history_change_type
  on public.employee_master_history(change_type, created_at desc);

alter table public.employee_master_lists enable row level security;
alter table public.employee_document_checklist_items enable row level security;
alter table public.employee_document_checklist_status enable row level security;
alter table public.employee_master_history enable row level security;

drop policy if exists "employee_master_lists_read" on public.employee_master_lists;
create policy "employee_master_lists_read"
  on public.employee_master_lists for select to authenticated using (true);

drop policy if exists "employee_master_lists_manage" on public.employee_master_lists;
create policy "employee_master_lists_manage"
  on public.employee_master_lists for all to authenticated
  using (exists(select 1 from public.user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')))
  with check (exists(select 1 from public.user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

drop policy if exists "employee_document_checklist_items_read" on public.employee_document_checklist_items;
create policy "employee_document_checklist_items_read"
  on public.employee_document_checklist_items for select to authenticated using (true);

drop policy if exists "employee_document_checklist_items_manage" on public.employee_document_checklist_items;
create policy "employee_document_checklist_items_manage"
  on public.employee_document_checklist_items for all to authenticated
  using (exists(select 1 from public.user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')))
  with check (exists(select 1 from public.user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

drop policy if exists "employee_document_checklist_status_read" on public.employee_document_checklist_status;
create policy "employee_document_checklist_status_read"
  on public.employee_document_checklist_status for select to authenticated
  using (
    employee_id = auth.uid()
    or exists(select 1 from public.user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin'))
  );

drop policy if exists "employee_document_checklist_status_manage" on public.employee_document_checklist_status;
create policy "employee_document_checklist_status_manage"
  on public.employee_document_checklist_status for all to authenticated
  using (exists(select 1 from public.user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')))
  with check (exists(select 1 from public.user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

drop policy if exists "employee_master_history_read" on public.employee_master_history;
create policy "employee_master_history_read"
  on public.employee_master_history for select to authenticated
  using (
    employee_id = auth.uid()
    or exists(select 1 from public.user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin'))
  );

drop policy if exists "employee_master_history_manage" on public.employee_master_history;
create policy "employee_master_history_manage"
  on public.employee_master_history for all to authenticated
  using (exists(select 1 from public.user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')))
  with check (exists(select 1 from public.user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

insert into public.employee_document_checklist_items (document_type, label, is_mandatory, sort_order) values
  ('cv', 'CV', true, 10),
  ('employment_contract', 'Employment Contract', true, 20),
  ('national_id', 'National ID', true, 30),
  ('employee_photo', 'Employee Photo', true, 40),
  ('bank_information', 'Bank Information', true, 50),
  ('emergency_contact', 'Emergency Contact', true, 60),
  ('academic_certificate', 'Academic Certificate', true, 70),
  ('nssf_registration', 'NSSF Registration', true, 80),
  ('passport', 'Passport', false, 90),
  ('visa', 'Visa', false, 100),
  ('work_permit', 'Work Permit', false, 110),
  ('driving_license', 'Driving License', false, 120),
  ('medical_checkup', 'Medical Checkup', false, 130),
  ('professional_license', 'Professional License', false, 140),
  ('training_certificate', 'Training Certificate', false, 150)
on conflict (document_type) do update set
  label = excluded.label,
  is_mandatory = excluded.is_mandatory,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.employee_master_lists (list_type, code, name, sort_order) values
  ('employment_type', 'permanent', 'Permanent', 10),
  ('employment_type', 'contract', 'Contract', 20),
  ('employment_type', 'temporary', 'Temporary', 30),
  ('employment_type', 'intern', 'Intern', 40),
  ('employment_category', 'executive', 'Executive', 10),
  ('employment_category', 'management', 'Management', 20),
  ('employment_category', 'professional', 'Professional', 30),
  ('employment_category', 'technical', 'Technical', 40),
  ('employment_category', 'administration', 'Administration', 50),
  ('employment_category', 'site_staff', 'Site Staff', 60),
  ('employment_category', 'labor', 'Labor', 70),
  ('leave_group', 'office_staff', 'Office Staff', 10),
  ('leave_group', 'site_staff', 'Site Staff', 20),
  ('leave_group', 'manager', 'Manager', 30),
  ('leave_group', 'director', 'Director', 40),
  ('leave_group', 'intern', 'Intern', 50),
  ('leave_group', 'labor', 'Labor', 60),
  ('payroll_group', 'monthly_usd', 'Monthly USD', 10),
  ('payroll_group', 'monthly_khr', 'Monthly KHR', 20),
  ('payroll_group', 'daily_wage', 'Daily Wage', 30),
  ('payroll_group', 'executive', 'Executive', 40),
  ('payroll_group', 'project_staff', 'Project Staff', 50),
  ('work_location', 'office', 'Office', 10),
  ('work_location', 'site', 'Site', 20),
  ('work_location', 'hybrid', 'Hybrid', 30),
  ('labor_category', 'office_staff', 'Office Staff', 10),
  ('labor_category', 'site_staff', 'Site Staff', 20),
  ('labor_category', 'construction_labor', 'Construction Labor', 30),
  ('labor_category', 'foreign_worker', 'Foreign Worker', 40)
on conflict (list_type, code) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;

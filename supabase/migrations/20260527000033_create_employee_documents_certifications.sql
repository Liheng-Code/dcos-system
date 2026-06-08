-- Employee Documents and Certifications Tables

-- Employee Documents (Passport, ID, Contracts, etc.)
create table if not exists public.employee_documents (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.profiles(id) on delete cascade,
  document_type   text not null check (document_type in ('employment_contract', 'passport', 'national_id', 'work_permit', 'visa', 'engineering_license', 'training_certificate', 'other')),
  document_name   text not null,
  file_url        text not null,
  issue_date      date,
  expiry_date     date,
  issued_by       text,
  notes           text,
  verified        boolean default false,
  verified_by     uuid references public.profiles(id) on delete set null,
  verified_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Employee Certifications and Training Records
create table if not exists public.employee_certifications (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.profiles(id) on delete cascade,
  certification_name text not null,
  issuing_body    text,
  certificate_number text,
  issue_date      date not null,
  expiry_date     date,
  file_url        text,
  renewal_date    date,
  status          text default 'active' check (status in ('active', 'expired', 'pending_renewal')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Create indexes for performance
create index idx_employee_documents_employee on public.employee_documents(employee_id);
create index idx_employee_documents_type on public.employee_documents(document_type);
create index idx_employee_documents_expiry on public.employee_documents(expiry_date);
create index idx_employee_certifications_employee on public.employee_certifications(employee_id);
create index idx_employee_certifications_name on public.employee_certifications(certification_name);
create index idx_employee_certifications_expiry on public.employee_certifications(expiry_date);
create index idx_employee_certifications_status on public.employee_certifications(status);

-- Enable RLS
alter table public.employee_documents enable row level security;
alter table public.employee_certifications enable row level security;

-- RLS Policies - authenticated users can view own documents
create policy "Users can view own documents"
  on public.employee_documents for select to authenticated
  using (employee_id = auth.uid());

create policy "HR Manager can view all documents"
  on public.employee_documents for select to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "Users can view own certifications"
  on public.employee_certifications for select to authenticated
  using (employee_id = auth.uid());

create policy "HR Manager can view all certifications"
  on public.employee_certifications for select to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

-- RLS Policies - Users can manage own documents, HR Manager can manage all
create policy "Users can create own documents"
  on public.employee_documents for insert to authenticated
  with check (employee_id = auth.uid());

create policy "HR Manager can create documents for others"
  on public.employee_documents for insert to authenticated
  with check (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "Users can update own documents"
  on public.employee_documents for update to authenticated
  using (employee_id = auth.uid())
  with check (employee_id = auth.uid());

create policy "HR Manager can update all documents"
  on public.employee_documents for update to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')))
  with check (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "HR Manager can delete documents"
  on public.employee_documents for delete to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "Users can create own certifications"
  on public.employee_certifications for insert to authenticated
  with check (employee_id = auth.uid());

create policy "HR Manager can create certifications for others"
  on public.employee_certifications for insert to authenticated
  with check (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "Users can update own certifications"
  on public.employee_certifications for update to authenticated
  using (employee_id = auth.uid())
  with check (employee_id = auth.uid());

create policy "HR Manager can update all certifications"
  on public.employee_certifications for update to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')))
  with check (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "HR Manager can delete certifications"
  on public.employee_certifications for delete to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

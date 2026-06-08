create table public.stakeholders (
  id                uuid primary key default gen_random_uuid(),
  organization_name text not null,
  stakeholder_type  text not null check (stakeholder_type in (
    'client', 'project_manager', 'contractor', 'architect',
    'subcontractor', 'supplier', 'authority', 'consultant',
    'testing_agency', 'utility', 'insurance', 'internal_department'
  )),
  contact_person    text,
  email             text,
  phone             text,
  address           text,
  status            text not null default 'active' check (status in ('active', 'inactive', 'blacklisted', 'preferred')),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.stakeholders enable row level security;

create policy "Authenticated users can view stakeholders"
  on public.stakeholders
  for select
  to authenticated
  using (true);

create policy "Authenticated users can create stakeholders"
  on public.stakeholders
  for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update stakeholders"
  on public.stakeholders
  for update
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can delete stakeholders"
  on public.stakeholders
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

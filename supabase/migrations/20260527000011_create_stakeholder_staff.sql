create table public.stakeholder_staff (
  id                uuid primary key default gen_random_uuid(),
  stakeholder_id    uuid not null references public.stakeholders(id) on delete cascade,
  full_name         text not null,
  job_title         text,
  email             text,
  phone             text,
  is_primary_contact boolean not null default false,
  status            text not null default 'active' check (status in ('active', 'inactive')),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index idx_stakeholder_staff_one_primary
  on public.stakeholder_staff (stakeholder_id) where is_primary_contact = true;

alter table public.stakeholder_staff enable row level security;

create policy "Authenticated users can view stakeholder staff"
  on public.stakeholder_staff for select to authenticated using (true);

create policy "Authenticated users can create stakeholder staff"
  on public.stakeholder_staff for insert to authenticated with check (true);

create policy "Authenticated users can update stakeholder staff"
  on public.stakeholder_staff for update to authenticated using (true) with check (true);

create policy "Only admins can delete stakeholder staff"
  on public.stakeholder_staff for delete to authenticated using (
    exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

alter table public.stakeholders drop column if exists contact_person;

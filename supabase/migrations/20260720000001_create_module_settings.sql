-- Module Settings: admin-controlled feature toggles for production readiness
create table if not exists public.module_settings (
  module_key  text primary key,
  display_name text not null,
  description  text,
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null
);

comment on table public.module_settings is 'Admin-controlled module feature toggles. Controls which modules are visible in the sidebar and accessible via routes.';

-- RLS: only admins can read/write
alter table public.module_settings enable row level security;

create policy "Admins can read module_settings"
  on public.module_settings for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "Admins can update module_settings"
  on public.module_settings for update
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "Admins can insert module_settings"
  on public.module_settings for insert
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- Seed all 11 top-level modules (active by default)
insert into public.module_settings (module_key, display_name, description, is_active, sort_order) values
  ('project',          'Project',            'Dashboard, Projects, WBS, and Task management',                    true,  1),
  ('reporting',        'Reporting',          'Reports hub, scheduled reports, financial reports, and insights', true,  2),
  ('document_control', 'Document Control',   'Documents, transmittals, controller dashboard, and audit log',    true,  3),
  ('planning',         'Planning',           'Gantt chart, look-ahead, calendars, comparison, and resources',   true,  4),
  ('design',           'Design',             'Architecture, structure, MEP drawings, BIM, and coordination',     true,  5),
  ('procurement',      'Procurement',        'BOQ, suppliers, RFQs, purchase orders, inventory, and receipts',  true,  6),
  ('qs',               'Quantity Surveying', 'Tender & estimate, libraries, cost control, and variations',      true,  7),
  ('construction',     'Construction',       'Daily reports, manpower, equipment, inspections, and HSE',        true,  8),
  ('hr',               'HR Management',      'Workforce, employees, attendance, leave, payroll, and training',  true,  9),
  ('account',          'Account',            'Chart of accounts, AP/AR invoices, payments, and general ledger', true, 10),
  ('administration',   'Administration',     'Settings, stakeholders, and system configuration',                true, 11)
on conflict (module_key) do nothing;

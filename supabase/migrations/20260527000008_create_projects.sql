create table public.projects (
  id                  uuid primary key default gen_random_uuid(),
  project_code        text not null unique,
  project_name        text not null,
  project_type        text not null check (project_type in ('tender', 'awarded', 'internal')),
  client_id           uuid references public.stakeholders(id) on delete set null,
  contract_type       text,
  contract_value      numeric,
  currency            text not null default 'USD',
  start_date          date,
  end_date            date,
  project_status      text not null default 'tender' check (project_status in ('tender', 'active', 'on_hold', 'completed', 'closed')),
  project_manager_id  uuid references public.profiles(id) on delete set null,
  description         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Junction table linking stakeholders to projects
create table public.project_stakeholders (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  stakeholder_id  uuid not null references public.stakeholders(id) on delete cascade,
  role_in_project text,
  created_at      timestamptz not null default now(),
  unique(project_id, stakeholder_id)
);

alter table public.projects enable row level security;
alter table public.project_stakeholders enable row level security;

-- Projects: authenticated users can view all
create policy "Authenticated users can view projects"
  on public.projects
  for select
  to authenticated
  using (true);

-- Projects: authenticated users can create
create policy "Authenticated users can create projects"
  on public.projects
  for insert
  to authenticated
  with check (true);

-- Projects: authenticated users can update
create policy "Authenticated users can update projects"
  on public.projects
  for update
  to authenticated
  using (true)
  with check (true);

-- Projects: only admins can delete
create policy "Admins can delete projects"
  on public.projects
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- Project stakeholders: authenticated users can view
create policy "Authenticated users can view project stakeholders"
  on public.project_stakeholders
  for select
  to authenticated
  using (true);

-- Project stakeholders: authenticated users can manage
create policy "Authenticated users can manage project stakeholders"
  on public.project_stakeholders
  for all
  to authenticated
  using (true)
  with check (true);

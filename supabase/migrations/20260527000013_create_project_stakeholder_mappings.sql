-- Links template placeholders to real stakeholders for a project
create table public.project_stakeholder_mappings (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  placeholder_id  uuid not null references public.template_placeholders(id) on delete cascade,
  stakeholder_id  uuid not null references public.stakeholders(id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique(project_id, placeholder_id)
);

-- Teams copied from template to project context
create table public.project_stakeholder_teams (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  stakeholder_id  uuid not null references public.stakeholders(id) on delete cascade,
  team_name       text not null,
  description     text,
  created_at      timestamptz not null default now(),
  unique(project_id, stakeholder_id, team_name)
);

-- RLS
alter table public.project_stakeholder_mappings enable row level security;
alter table public.project_stakeholder_teams enable row level security;

create policy "Authenticated users can view project stakeholder mappings"
  on public.project_stakeholder_mappings for select to authenticated using (true);

create policy "Authenticated users can manage project stakeholder mappings"
  on public.project_stakeholder_mappings for all to authenticated using (true) with check (true);

create policy "Authenticated users can view project stakeholder teams"
  on public.project_stakeholder_teams for select to authenticated using (true);

create policy "Authenticated users can manage project stakeholder teams"
  on public.project_stakeholder_teams for all to authenticated using (true) with check (true);

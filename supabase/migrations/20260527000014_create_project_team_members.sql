-- Add placeholder_id to existing project_stakeholder_teams for traceability
alter table public.project_stakeholder_teams
  add column placeholder_id uuid references public.template_placeholders(id) on delete set null;

-- Junction linking project teams to stakeholder staff
create table public.project_team_members (
  id                          uuid primary key default gen_random_uuid(),
  project_stakeholder_team_id uuid not null references public.project_stakeholder_teams(id) on delete cascade,
  stakeholder_staff_id        uuid not null references public.stakeholder_staff(id) on delete cascade,
  role_on_project             text,
  created_at                  timestamptz not null default now(),
  unique(project_stakeholder_team_id, stakeholder_staff_id)
);

-- RLS
alter table public.project_team_members enable row level security;

create policy "Authenticated users can view project team members"
  on public.project_team_members for select to authenticated using (true);

create policy "Authenticated users can manage project team members"
  on public.project_team_members for all to authenticated using (true) with check (true);

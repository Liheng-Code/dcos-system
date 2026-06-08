-- Stakeholder templates: reusable company placeholder definitions
create table public.stakeholder_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Company role slots within a template (e.g. "Client/Owner", "Consultant")
create table public.template_placeholders (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references public.stakeholder_templates(id) on delete cascade,
  label         text not null,
  description   text,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Teams within each placeholder (e.g. "Client Approval Team", "Design Review Team")
create table public.template_placeholder_teams (
  id              uuid primary key default gen_random_uuid(),
  placeholder_id  uuid not null references public.template_placeholders(id) on delete cascade,
  name            text not null,
  description     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- RLS
alter table public.stakeholder_templates enable row level security;
alter table public.template_placeholders enable row level security;
alter table public.template_placeholder_teams enable row level security;

create policy "Authenticated users can view templates"
  on public.stakeholder_templates for select to authenticated using (true);

create policy "Authenticated users can create templates"
  on public.stakeholder_templates for insert to authenticated with check (true);

create policy "Authenticated users can update templates"
  on public.stakeholder_templates for update to authenticated using (true) with check (true);

create policy "Only admins can delete templates"
  on public.stakeholder_templates for delete to authenticated using (
    exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

create policy "Authenticated users can view placeholders"
  on public.template_placeholders for select to authenticated using (true);

create policy "Authenticated users can manage placeholders"
  on public.template_placeholders for all to authenticated using (true) with check (true);

create policy "Authenticated users can view placeholder teams"
  on public.template_placeholder_teams for select to authenticated using (true);

create policy "Authenticated users can manage placeholder teams"
  on public.template_placeholder_teams for all to authenticated using (true) with check (true);

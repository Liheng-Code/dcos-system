-- Phase U3 (doc 35; PRD FR-059): saved filters and grouping for the Sheet and Gantt.
-- One row per saved view: a name, the filter (jsonb, lib/planning/sheet-view.ts ViewFilter) and the group-by.
-- A view is the owner's; shared = every member of the project can use it (only the owner changes it).
-- Additive only.

create table if not exists public.plan_saved_views (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (btrim(name) <> '' and length(name) <= 80),
  filter      jsonb not null default '{}'::jsonb,
  group_by    text not null default 'wbs' check (group_by in ('wbs', 'status', 'priority', 'discipline', 'owner', 'critical')),
  shared      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists uq_plan_saved_views_owner_name on public.plan_saved_views (project_id, owner_id, lower(name));
create index if not exists idx_plan_saved_views_project on public.plan_saved_views (project_id);

drop trigger if exists set_plan_saved_views_updated_at on public.plan_saved_views;
create trigger set_plan_saved_views_updated_at before update on public.plan_saved_views
  for each row execute function public.set_updated_at();

alter table public.plan_saved_views enable row level security;

drop policy if exists plan_saved_views_select on public.plan_saved_views;
create policy plan_saved_views_select on public.plan_saved_views
  for select to authenticated
  using (owner_id = auth.uid()
         or (shared and public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'view')));

drop policy if exists plan_saved_views_insert on public.plan_saved_views;
create policy plan_saved_views_insert on public.plan_saved_views
  for insert to authenticated
  with check (owner_id = auth.uid() and public.is_project_member(project_id)
              and public.has_permission('planning', 'schedule', 'view'));

drop policy if exists plan_saved_views_update on public.plan_saved_views;
create policy plan_saved_views_update on public.plan_saved_views
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and public.is_project_member(project_id));

drop policy if exists plan_saved_views_delete on public.plan_saved_views;
create policy plan_saved_views_delete on public.plan_saved_views
  for delete to authenticated
  using (owner_id = auth.uid());

revoke all on public.plan_saved_views from anon;
grant select, insert, update, delete on public.plan_saved_views to authenticated;

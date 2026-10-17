-- Relax check constraints on projects table to support user-defined custom sectors & building types
alter table public.projects drop constraint if exists projects_category_check;
alter table public.projects drop constraint if exists projects_building_type_check;

-- Table to persist user-created sectors and building types across the system
create table if not exists public.project_custom_categories (
  id uuid primary key default gen_random_uuid(),
  category_type text not null check (category_type in ('sector', 'building_type')),
  sector_slug text,
  slug text not null,
  label text not null,
  created_at timestamptz default now()
);

create index if not exists idx_custom_cats_type on public.project_custom_categories (category_type, sector_slug);

alter table public.project_custom_categories enable row level security;

create policy "Allow select on project_custom_categories"
  on public.project_custom_categories for select
  to authenticated
  using (true);

create policy "Allow insert on project_custom_categories"
  on public.project_custom_categories for insert
  to authenticated
  with check (true);

create policy "Allow delete on project_custom_categories"
  on public.project_custom_categories for delete
  to authenticated
  using (true);

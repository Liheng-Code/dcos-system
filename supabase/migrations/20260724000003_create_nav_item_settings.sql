-- Migration: 20260724000003_create_nav_item_settings.sql
-- Purpose: Extend admin module-visibility controls to individual sidebar sub-group
--          headings and leaf nav links, without touching the existing module_settings
--          table (which only controls whole top-level sidebar sections).
-- Depends on: module_settings (20260720000001_create_module_settings.sql), profiles (already exist)
--
-- Semantics (important for application code): the ABSENCE of a row for a given
-- nav_key means that nav item is VISIBLE by default. The application reads this
-- table with an `is_active ?? true` fallback (mirroring module_settings' existing
-- isModuleActive default-true behavior). This migration intentionally does NOT seed
-- any rows -- seeding the full catalog of nav_key values is a separate follow-up
-- migration once the frontend's nav-item-catalog.ts finalizes the canonical list.

create table public.nav_item_settings (
  nav_key      text primary key,
  module_key   text not null references public.module_settings(module_key) on delete cascade,
  node_type    text not null check (node_type in ('group','item')),
  label        text not null,
  is_active    boolean not null default true,
  sort_order   int not null default 0,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles(id) on delete set null
);

comment on table public.nav_item_settings is 'Admin-controlled visibility for individual sidebar sub-group headings and leaf nav links within a module (finer-grained than module_settings, which only toggles whole top-level sections). Absence of a row for a given nav_key means the nav item is visible by default -- the application treats a missing row as is_active = true.';

comment on column public.nav_item_settings.nav_key is 'Two key formats: (1) for leaf links, the real href the link navigates to, e.g. ''/dashboard/qs/boq'' or ''/dashboard/qs?tab=cost-control''; (2) for level-2 group headers (which have no href of their own), a synthetic ''group:<module_key>:<slug>'' string, e.g. ''group:qs:cost_control''.';

create index idx_nav_item_settings_module_key on public.nav_item_settings (module_key);

-- Updated_at trigger (mirrors repo-wide set_updated_at convention)
create trigger set_nav_item_settings_updated_at
  before update on public.nav_item_settings
  for each row execute function public.set_updated_at();

-- RLS: only admins can read/write (mirrors module_settings' exact policy style/naming)
alter table public.nav_item_settings enable row level security;

create policy "Admins can read nav_item_settings"
  on public.nav_item_settings for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "Admins can update nav_item_settings"
  on public.nav_item_settings for update
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "Admins can insert nav_item_settings"
  on public.nav_item_settings for insert
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

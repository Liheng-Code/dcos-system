-- Re-use and top-up on Generate (Generate plan G6).
--   1. plan_act_generation_profiles: per project, the kit (by code), planning choices, per-row template overrides
--      (template codes, so they follow new template versions) and the level-link setting Generate last used.
--      Generate restores them, so running again after adding floors or chainage sections needs no re-entry.
--   2. wbs_templates.kit_code: the generation kit that fits a WBS template; Generate suggests the kit of the WBS
--      template a project applied (projects.wbs_template_id) before the best fit by building type.
-- Depends on: 20261021000022 (kits), 20261021000002 (sector WBS templates), 20261006000004 (generation runs).

-- ── 1. Profiles ────────────────────────────────────────────────────────────
create table if not exists public.plan_act_generation_profiles (
  project_id uuid primary key references public.projects(id) on delete cascade,
  kit_code text,
  -- planning choices the planner set (suggested values are not stored): { "roof_type": "flat_rc" }
  picks jsonb not null default '{}'::jsonb,
  -- template codes per WBS node chosen instead of the kit's: { "<wbs_node_id>": ["TPL-..."] }
  overrides jsonb not null default '{}'::jsonb,
  link_levels boolean not null default true,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

comment on table public.plan_act_generation_profiles is
  'What Activity Library > Generate last used for the project (kit, planning choices, row overrides); restored on the next visit.';

drop trigger if exists set_plan_act_generation_profiles_updated_at on public.plan_act_generation_profiles;
create trigger set_plan_act_generation_profiles_updated_at before update on public.plan_act_generation_profiles
  for each row execute function public.set_updated_at();

alter table public.plan_act_generation_profiles enable row level security;
drop policy if exists "plan_act_generation_profiles select" on public.plan_act_generation_profiles;
create policy "plan_act_generation_profiles select" on public.plan_act_generation_profiles for select to authenticated
  using (public.is_project_member(project_id));
drop policy if exists "plan_act_generation_profiles write" on public.plan_act_generation_profiles;
create policy "plan_act_generation_profiles write" on public.plan_act_generation_profiles to authenticated
  using (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'edit'))
  with check (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'edit'));
grant select, insert, update, delete on public.plan_act_generation_profiles to authenticated;

-- ── 2. WBS template → kit ──────────────────────────────────────────────────
alter table public.wbs_templates add column if not exists kit_code text;
comment on column public.wbs_templates.kit_code is
  'Generation kit (plan_act_kits.code) for projects built from this WBS template; Generate suggests it.';

update public.wbs_templates t set kit_code = v.kit
from (values
  ('7F Mixed-use (from PRJ-2026-004-PC)',              'KIT-COM-OFFICE'),
  ('Commercial – Hotel & Hospitality',                 'KIT-COM-OFFICE'),
  ('Commercial – Office, Retail & Mixed-use',          'KIT-COM-OFFICE'),
  ('Commercial – Showroom & Restaurant Fit-out',       'KIT-COM-RETAIL'),
  ('Industrial – Factory & Manufacturing',             'KIT-IND-FACTORY'),
  ('Industrial – Warehouse & Logistics',               'KIT-IND-WAREHOUSE'),
  ('Infrastructure – Bridge & Structures',             'KIT-INF-BRIDGE'),
  ('Infrastructure – Road & Drainage',                 'KIT-INF-ROAD'),
  ('Infrastructure – Water Supply & Utility Networks', 'KIT-INF-WATER'),
  ('Institutional – Government & Religious Building',  'KIT-INS-CIVIC'),
  ('Institutional – Hospital & Clinic',                'KIT-INS-HEALTH'),
  ('Institutional – School & University',              'KIT-INS-EDU'),
  ('Residential – High-rise Apartment / Condominium',  'KIT-RES-HIGHRISE'),
  ('Residential – Housing Development / Estate',       'KIT-RES-VILLA'),
  ('Residential – Villa & Landed House',               'KIT-RES-VILLA')
) as v(name, kit)
where t.template_name = v.name and t.kit_code is null;

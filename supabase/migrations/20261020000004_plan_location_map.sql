-- Migration: 20261020000004_plan_location_map.sql
-- Purpose: Planning <-> QS bridge, Phase 2: location map (doc 21, D5).
--   The BOQ allocates quantities by building_code + level label ("BA" / "04.1F"); the
--   WBS has level nodes with their own codes ("03.1F", "L01"). This table records, per
--   project, which WBS level node each BOQ location is, so a BOQ quantity can be put on
--   the right floor. Suggestions are computed by the app
--   (lib/planning/activity-library/location-map.ts); only decisions are stored here.
--   Project-wide lines (level "All" or blank) get a split rule instead of a node:
--   none = not used for per-level durations, equal = shared equally over the building's
--   levels, gfa = shared by each level's current GFA (wbs_node_quantities).
-- Owner (doc 21 §8): Project Controls. Writes need planning/schedule edit, like quantity links.
-- Depends on: wbs_nodes, projects, is_project_member(), has_permission().

create table if not exists public.plan_location_map (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  building_code text not null default '',
  qs_level_label text not null,
  wbs_node_id uuid references public.wbs_nodes(id) on delete set null,
  status text not null default 'confirmed',
  split_rule text not null default 'none',
  note text,
  confirmed_by uuid references auth.users(id) default auth.uid(),
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_location_map_status_chk check (status in ('confirmed', 'ignored')),
  constraint plan_location_map_split_chk check (split_rule in ('none', 'equal', 'gfa')),
  constraint plan_location_map_target_chk check (status = 'ignored' or wbs_node_id is not null or split_rule <> 'none'),
  unique (project_id, building_code, qs_level_label)
);

comment on table public.plan_location_map is
  'Per project: which WBS level node a BOQ location (building_code + level label) is. confirmed = use it; ignored = BOQ lines at this location never drive durations. Lines without a level use split_rule (equal / gfa over the building''s levels). Unmapped locations are suggested by the app and never used until confirmed.';
comment on column public.plan_location_map.building_code is
  'tender_boq_items.building_code as written in the BOQ ('''' when blank).';
comment on column public.plan_location_map.qs_level_label is
  'tender_boq_items.level as written in the BOQ, e.g. 04.1F, 02.GF, All.';

create index if not exists idx_plan_location_map_project on public.plan_location_map(project_id);
create index if not exists idx_plan_location_map_node on public.plan_location_map(wbs_node_id) where wbs_node_id is not null;

alter table public.plan_location_map enable row level security;
drop policy if exists "plan_location_map select" on public.plan_location_map;
drop policy if exists "plan_location_map write" on public.plan_location_map;
create policy "plan_location_map select" on public.plan_location_map for select to authenticated
  using (public.is_project_member(project_id));
create policy "plan_location_map write" on public.plan_location_map for all to authenticated
  using (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'edit'))
  with check (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'edit'));

drop trigger if exists set_plan_location_map_updated_at on public.plan_location_map;
create trigger set_plan_location_map_updated_at before update on public.plan_location_map
  for each row execute function public.set_updated_at();

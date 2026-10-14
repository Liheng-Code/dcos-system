-- Activity Library - Phase 3.4: BIM quantity provider (Planning side).
-- The IFC extraction itself (quantities, unit, storey per element) belongs to the Design/BIM team and lands in
-- bim_element_takeoff. Planning only CONSUMES it, through two small tables:
--   * plan_act_bim_metric_map  - which IFC class + unit feeds which activity metric (company-level, editable)
--   * plan_act_bim_level_map   - which BIM storey of a model is which WBS level of the project (planner-confirmed)
-- The provider ignores elements without a quantity or a storey, so nothing here changes until the extract is complete.
-- Depends on 20261006000001-8 and the bim_* tables (20260717000001, 20260717000004).

create table if not exists public.plan_act_bim_metric_map (
  id uuid primary key default gen_random_uuid(),
  metric_code text not null,                  -- matches plan_act_quantity_rules.metric_code
  ifc_class text not null,                    -- upper case, as stored in bim_element_takeoff.ifc_class
  unit text not null,                         -- canonical: m3 | m2 | m | kg
  note text,
  created_at timestamptz not null default now(),
  unique (metric_code, ifc_class, unit)
);
create index if not exists idx_plan_act_bim_metric_class on public.plan_act_bim_metric_map(ifc_class);

alter table public.plan_act_bim_metric_map enable row level security;
drop policy if exists "plan_act_bim_metric_map authenticated view" on public.plan_act_bim_metric_map;
drop policy if exists "plan_act_bim_metric_map privileged manage" on public.plan_act_bim_metric_map;
create policy "plan_act_bim_metric_map authenticated view" on public.plan_act_bim_metric_map for select to authenticated using (true);
create policy "plan_act_bim_metric_map privileged manage" on public.plan_act_bim_metric_map for all to authenticated
  using (public.can_manage_master_libraries()) with check (public.can_manage_master_libraries());

insert into public.plan_act_bim_metric_map(metric_code, ifc_class, unit, note) values
  ('slab_volume',   'IFCSLAB',             'm3', 'Net slab volume'),
  ('slab_area',     'IFCSLAB',             'm2', 'Slab plan area'),
  ('beam_volume',   'IFCBEAM',             'm3', 'Net beam volume'),
  ('column_volume', 'IFCCOLUMN',           'm3', 'Net column volume'),
  ('wall_volume',   'IFCWALL',             'm3', 'Net wall volume'),
  ('wall_volume',   'IFCWALLSTANDARDCASE', 'm3', 'Net wall volume'),
  ('wall_area',     'IFCWALL',             'm2', 'Wall side area (formwork)'),
  ('wall_area',     'IFCWALLSTANDARDCASE', 'm2', 'Wall side area (formwork)'),
  ('rebar_weight',  'IFCREINFORCINGBAR',   'kg', 'Reinforcement mass')
on conflict (metric_code, ifc_class, unit) do nothing;

create table if not exists public.plan_act_bim_level_map (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  model_id uuid not null references public.bim_models(id) on delete cascade,
  bim_level text not null,                    -- storey label as it appears in the extract
  wbs_node_id uuid not null references public.wbs_nodes(id) on delete cascade,
  confirmed_by uuid default auth.uid(),
  confirmed_at timestamptz not null default now(),
  unique (model_id, bim_level)
);
create index if not exists idx_plan_act_bim_level_project on public.plan_act_bim_level_map(project_id);
create index if not exists idx_plan_act_bim_level_node on public.plan_act_bim_level_map(wbs_node_id);

alter table public.plan_act_bim_level_map enable row level security;
drop policy if exists plan_act_bimlevel_select on public.plan_act_bim_level_map;
create policy plan_act_bimlevel_select on public.plan_act_bim_level_map for select to authenticated
  using (public.is_project_member(project_id));
drop policy if exists plan_act_bimlevel_write on public.plan_act_bim_level_map;
create policy plan_act_bimlevel_write on public.plan_act_bim_level_map for all to authenticated
  using (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'edit'))
  with check (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'edit'));

-- indexes the provider relies on (large takeoff tables)
create index if not exists idx_bim_takeoff_model_class on public.bim_element_takeoff(model_id, ifc_class);

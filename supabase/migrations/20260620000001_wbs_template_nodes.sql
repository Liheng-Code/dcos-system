-- ============================================================
-- WBS Template Nodes: full hierarchical template structures
-- SOP DCOS-SOP-WBS-001 clause 11 — WBS Template Management
-- ============================================================

-- 1. Enhance wbs_templates with category field
alter table public.wbs_templates
  add column if not exists template_category text,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

-- 2. Template node library table
create table if not exists public.wbs_template_nodes (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.wbs_templates(id) on delete cascade,
  parent_id   uuid references public.wbs_template_nodes(id) on delete cascade,
  node_type   text not null,
  wbs_code    text not null,
  wbs_name    text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_wbs_tpl_nodes_template on public.wbs_template_nodes(template_id);
create index if not exists idx_wbs_tpl_nodes_parent   on public.wbs_template_nodes(parent_id);

-- 3. RLS — mirrors wbs_templates policies in migration 20260527000016
alter table public.wbs_template_nodes enable row level security;

create policy "Authenticated users can view wbs_template_nodes"
  on public.wbs_template_nodes for select to authenticated using (true);

create policy "Admins can manage wbs_template_nodes"
  on public.wbs_template_nodes for all to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));

-- 4. Clone function: deep-copies template nodes into a project as wbs_nodes.
--    Traverses depth-first so parents are always inserted before children.
--    Returns count of nodes created.
create or replace function public.clone_wbs_template_to_project(
  p_template_id uuid,
  p_project_id  uuid
)
returns int
language plpgsql
security definer
as $$
declare
  v_count int := 0;
  v_rec   record;
  v_new_id uuid;
begin
  -- Temp map: template_node.id → new wbs_node.id
  drop table if exists _wbs_clone_map;
  create temp table _wbs_clone_map (
    old_id uuid primary key,
    new_id uuid not null
  ) on commit drop;

  -- Iterate nodes breadth-first (depth asc, sort_order asc) via recursive CTE
  -- so every parent is in _wbs_clone_map before its children are processed.
  for v_rec in
    with recursive ranked as (
      select id, parent_id, node_type, wbs_code, wbs_name, sort_order, 1 as depth
        from public.wbs_template_nodes
       where template_id = p_template_id and parent_id is null
      union all
      select n.id, n.parent_id, n.node_type, n.wbs_code, n.wbs_name, n.sort_order,
             r.depth + 1
        from public.wbs_template_nodes n
        join ranked r on n.parent_id = r.id
    )
    select * from ranked order by depth, sort_order
  loop
    v_new_id := gen_random_uuid();
    insert into _wbs_clone_map values (v_rec.id, v_new_id);

    insert into public.wbs_nodes (
      id, project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status
    ) values (
      v_new_id,
      p_project_id,
      (select new_id from _wbs_clone_map where old_id = v_rec.parent_id),
      v_rec.node_type,
      v_rec.wbs_code,
      v_rec.wbs_name,
      v_rec.sort_order,
      'active'
    );
    v_count := v_count + 1;
  end loop;

  drop table _wbs_clone_map;
  return v_count;
end;
$$;

-- 5. Seed / update the 5 SOP-standard templates with full placeholder node structures
do $seed$
declare
  t1 uuid; -- High-Rise Building
  t2 uuid; -- Infrastructure
  t3 uuid; -- Factory / Industrial
  t4 uuid; -- Residential Tower (new)
  t5 uuid; -- Hospital (new)

  n_bld uuid;
  n_l1  uuid; n_l2 uuid; n_l3 uuid; n_l4 uuid;
  n_z1  uuid; n_z2 uuid;
  n_r1  uuid; n_r2 uuid;
begin
  -- ── Template 1: High-Rise Building (rename existing "Building Construction") ──
  update public.wbs_templates
     set template_name = 'High-Rise Building',
         template_category = 'building',
         template_desc = 'Multi-level towers with repeating floors, zones, and rooms'
   where template_name = 'Building Construction'
  returning id into t1;

  if t1 is null then
    select id into t1 from public.wbs_templates where template_name = 'High-Rise Building';
  end if;
  if t1 is null then
    insert into public.wbs_templates (template_name, template_desc, node_type_chain, template_category)
    values ('High-Rise Building',
            'Multi-level towers with repeating floors, zones, and rooms',
            '["building","level","zone","room","element"]'::jsonb, 'building')
    returning id into t1;
  end if;

  -- ── Template 2: Infrastructure (rename existing "Infrastructure / Civil") ──
  update public.wbs_templates
     set template_name = 'Infrastructure',
         template_category = 'infrastructure',
         template_desc = 'Chainage / section-based decomposition for roads, bridges, utilities'
   where template_name in ('Infrastructure / Civil', 'Infrastructure')
  returning id into t2;

  if t2 is null then
    insert into public.wbs_templates (template_name, template_desc, node_type_chain, template_category)
    values ('Infrastructure',
            'Chainage / section-based decomposition for roads, bridges, utilities',
            '["building","level","zone","room","element"]'::jsonb, 'infrastructure')
    on conflict (template_name) do update set template_category = 'infrastructure'
    returning id into t2;
  end if;
  if t2 is null then
    select id into t2 from public.wbs_templates where template_name = 'Infrastructure';
  end if;

  -- ── Template 3: Factory / Industrial (rename existing "Industrial / Plant") ──
  update public.wbs_templates
     set template_name = 'Factory / Industrial',
         template_category = 'industrial',
         template_desc = 'Area- and system-based decomposition for manufacturing and process plants'
   where template_name in ('Industrial / Plant', 'Factory / Industrial')
  returning id into t3;

  if t3 is null then
    insert into public.wbs_templates (template_name, template_desc, node_type_chain, template_category)
    values ('Factory / Industrial',
            'Area- and system-based decomposition for manufacturing and process plants',
            '["building","level","zone","room","element"]'::jsonb, 'industrial')
    on conflict (template_name) do update set template_category = 'industrial'
    returning id into t3;
  end if;
  if t3 is null then
    select id into t3 from public.wbs_templates where template_name = 'Factory / Industrial';
  end if;

  -- ── Template 4: Residential Tower (new) ──
  insert into public.wbs_templates (template_name, template_desc, node_type_chain, template_category)
  values ('Residential Tower',
          'Residential units with standardized floor plates, corridors, and amenity zones',
          '["building","level","zone","room","element"]'::jsonb, 'residential')
  on conflict (template_name) do update set template_category = 'residential'
  returning id into t4;
  if t4 is null then
    select id into t4 from public.wbs_templates where template_name = 'Residential Tower';
  end if;

  -- ── Template 5: Hospital (new) ──
  insert into public.wbs_templates (template_name, template_desc, node_type_chain, template_category)
  values ('Hospital',
          'Department-driven layout with wards, operating theatres, and strict MEP zoning',
          '["building","level","zone","room","element"]'::jsonb, 'hospital')
  on conflict (template_name) do update set template_category = 'hospital'
  returning id into t5;
  if t5 is null then
    select id into t5 from public.wbs_templates where template_name = 'Hospital';
  end if;

  -- ════════════════════════════════════════════════════════════
  -- Seed nodes (only if not yet seeded)
  -- ════════════════════════════════════════════════════════════

  -- ── T1: High-Rise Building ──────────────────────────────────
  if not exists (select 1 from public.wbs_template_nodes where template_id = t1) then
    n_bld := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_bld, t1, null, 'building', 'BLD-TA', 'Tower A', 0);

    -- B1
    n_l1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_l1, t1, n_bld, 'level', 'B1', 'Basement Level 1', 0);
    n_z1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_z1, t1, n_l1, 'zone', 'ZA', 'Zone A', 0);
    n_r1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_r1, t1, n_z1, 'room', 'RM-CAR01', 'Car Park 01', 0);
    insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
      (t1, n_r1, 'element', 'STR-001', 'Structural Works', 0),
      (t1, n_r1, 'element', 'MEP-001', 'M&E Works', 1);

    -- L01
    n_l2 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_l2, t1, n_bld, 'level', 'L01', 'Level 01', 1);
    n_z1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_z1, t1, n_l2, 'zone', 'ZA', 'Zone A', 0);
    n_r1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_r1, t1, n_z1, 'room', 'RM-LOBBY01', 'Lobby 01', 0);
    insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
      (t1, n_r1, 'element', 'STR-001', 'Structural Works', 0),
      (t1, n_r1, 'element', 'ARC-001', 'Architectural Finishes', 1),
      (t1, n_r1, 'element', 'MEP-001', 'M&E Works', 2);
    n_z2 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_z2, t1, n_l2, 'zone', 'ZB', 'Zone B', 1);
    n_r2 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_r2, t1, n_z2, 'room', 'RM-OFFICE01', 'Office 01', 0);
    insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
      (t1, n_r2, 'element', 'STR-001', 'Structural Works', 0),
      (t1, n_r2, 'element', 'ARC-001', 'Architectural Finishes', 1);

    -- L02
    n_l3 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_l3, t1, n_bld, 'level', 'L02', 'Level 02', 2);
    n_z1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_z1, t1, n_l3, 'zone', 'ZA', 'Zone A', 0);
    n_r1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_r1, t1, n_z1, 'room', 'RM-OFFICE02', 'Office 02', 0);
    insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
      (t1, n_r1, 'element', 'STR-001', 'Structural Works', 0),
      (t1, n_r1, 'element', 'ARC-001', 'Architectural Finishes', 1);

    -- RF
    n_l4 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_l4, t1, n_bld, 'level', 'RF', 'Roof Level', 3);
    n_z1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_z1, t1, n_l4, 'zone', 'ZA', 'Zone A', 0);
    n_r1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_r1, t1, n_z1, 'room', 'RM-PLANT01', 'Plant Room 01', 0);
    insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
      (t1, n_r1, 'element', 'STR-001', 'Structural Works', 0),
      (t1, n_r1, 'element', 'MEP-001', 'M&E Works', 1);
  end if;

  -- ── T2: Infrastructure ──────────────────────────────────────
  if not exists (select 1 from public.wbs_template_nodes where template_id = t2) then
    -- Section 01 — Road Works
    n_bld := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_bld, t2, null, 'building', 'SEC-01', 'Section 01 — Road Works', 0);

    n_l1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_l1, t2, n_bld, 'level', 'STR-001', 'Bridge Structure A', 0);
    n_z1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_z1, t2, n_l1, 'zone', 'COMP-001', 'Foundation Works', 0);
    n_r1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_r1, t2, n_z1, 'room', 'EL-001', 'Pile Cap A1', 0);
    insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
      (t2, n_r1, 'element', 'CIV-001', 'Civil Works', 0),
      (t2, n_r1, 'element', 'STR-001', 'Structural Works', 1);

    n_z2 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_z2, t2, n_l1, 'zone', 'COMP-002', 'Superstructure', 1);
    n_r2 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_r2, t2, n_z2, 'room', 'EL-001', 'Deck Slab A', 0);
    insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
      (t2, n_r2, 'element', 'CIV-001', 'Civil Works', 0),
      (t2, n_r2, 'element', 'STR-001', 'Structural Works', 1);

    n_l2 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_l2, t2, n_bld, 'level', 'STR-002', 'Culvert B', 1);
    n_z1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_z1, t2, n_l2, 'zone', 'COMP-001', 'Earthworks', 0);
    n_r1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_r1, t2, n_z1, 'room', 'EL-001', 'Excavation', 0);
    insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
      (t2, n_r1, 'element', 'CIV-001', 'Civil Works', 0);

    -- Section 02 — Utility Works
    n_bld := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_bld, t2, null, 'building', 'SEC-02', 'Section 02 — Utility Works', 1);
    n_l1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_l1, t2, n_bld, 'level', 'STR-001', 'Water Main Pipe', 0);
    n_z1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_z1, t2, n_l1, 'zone', 'COMP-001', 'Pipe Installation', 0);
    n_r1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_r1, t2, n_z1, 'room', 'EL-001', 'Pipe Section 01', 0);
    insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
      (t2, n_r1, 'element', 'MEP-001', 'Mechanical Works', 0);
  end if;

  -- ── T3: Factory / Industrial ────────────────────────────────
  if not exists (select 1 from public.wbs_template_nodes where template_id = t3) then
    -- Production Area
    n_bld := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_bld, t3, null, 'building', 'AREA-01', 'Production Area', 0);

    n_l1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_l1, t3, n_bld, 'level', 'SYS-001', 'Process System', 0);
    n_z1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_z1, t3, n_l1, 'zone', 'SUB-001', 'Primary Process', 0);
    n_r1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_r1, t3, n_z1, 'room', 'EQ-001', 'Main Reactor', 0);
    insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
      (t3, n_r1, 'element', 'STR-001', 'Structural Support', 0),
      (t3, n_r1, 'element', 'MEP-001', 'Mechanical Works', 1);

    n_l2 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_l2, t3, n_bld, 'level', 'SYS-002', 'Utility System', 1);
    n_z1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_z1, t3, n_l2, 'zone', 'SUB-001', 'HVAC System', 0);
    n_r1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_r1, t3, n_z1, 'room', 'EQ-001', 'AHU Unit 01', 0);
    insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
      (t3, n_r1, 'element', 'MEP-001', 'Mechanical Works', 0),
      (t3, n_r1, 'element', 'ELE-001', 'Electrical Works', 1);

    -- Utility Area
    n_bld := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_bld, t3, null, 'building', 'AREA-02', 'Utility Area', 1);
    n_l1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_l1, t3, n_bld, 'level', 'SYS-001', 'Power System', 0);
    n_z1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_z1, t3, n_l1, 'zone', 'SUB-001', 'MV Distribution', 0);
    n_r1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_r1, t3, n_z1, 'room', 'EQ-001', 'Main Switchboard', 0);
    insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
      (t3, n_r1, 'element', 'ELE-001', 'Electrical Works', 0),
      (t3, n_r1, 'element', 'MEP-001', 'Mechanical Works', 1);
  end if;

  -- ── T4: Residential Tower ───────────────────────────────────
  if not exists (select 1 from public.wbs_template_nodes where template_id = t4) then
    n_bld := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_bld, t4, null, 'building', 'BLD-A', 'Block A', 0);

    -- B1
    n_l1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_l1, t4, n_bld, 'level', 'B1', 'Basement Level 1', 0);
    n_z1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_z1, t4, n_l1, 'zone', 'ZA', 'Zone A', 0);
    n_r1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_r1, t4, n_z1, 'room', 'RM-CAR01', 'Car Park 01', 0);
    insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
      (t4, n_r1, 'element', 'STR-001', 'Structural Works', 0),
      (t4, n_r1, 'element', 'MEP-001', 'M&E Works', 1);

    -- L01
    n_l2 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_l2, t4, n_bld, 'level', 'L01', 'Level 01 — Residential', 1);
    n_z1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_z1, t4, n_l2, 'zone', 'ZA', 'Zone A', 0);
    n_r1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_r1, t4, n_z1, 'room', 'RM-UNIT01', 'Unit A01', 0);
    insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
      (t4, n_r1, 'element', 'STR-001', 'Structural Works', 0),
      (t4, n_r1, 'element', 'ARC-001', 'Interior Finishes', 1);
    n_z2 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_z2, t4, n_l2, 'zone', 'ZB', 'Zone B', 1);
    n_r2 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_r2, t4, n_z2, 'room', 'RM-CORRIDOR01', 'Corridor 01', 0);
    insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
      (t4, n_r2, 'element', 'ARC-001', 'Architectural Finishes', 0);

    -- L02
    n_l3 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_l3, t4, n_bld, 'level', 'L02', 'Level 02 — Residential', 2);
    n_z1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_z1, t4, n_l3, 'zone', 'ZA', 'Zone A', 0);
    n_r1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_r1, t4, n_z1, 'room', 'RM-UNIT02', 'Unit B01', 0);
    insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
      (t4, n_r1, 'element', 'STR-001', 'Structural Works', 0),
      (t4, n_r1, 'element', 'ARC-001', 'Interior Finishes', 1);

    -- RF
    n_l4 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_l4, t4, n_bld, 'level', 'RF', 'Roof Level', 3);
    n_z1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_z1, t4, n_l4, 'zone', 'ZA', 'Zone A', 0);
    n_r1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_r1, t4, n_z1, 'room', 'RM-PLANT01', 'Plant Room', 0);
    insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
      (t4, n_r1, 'element', 'MEP-001', 'M&E Works', 0);
  end if;

  -- ── T5: Hospital ────────────────────────────────────────────
  if not exists (select 1 from public.wbs_template_nodes where template_id = t5) then
    n_bld := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_bld, t5, null, 'building', 'BLD-A', 'Block A — Medical', 0);

    -- L01 Ground Floor
    n_l1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_l1, t5, n_bld, 'level', 'L01', 'Ground Floor', 0);
    n_z1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_z1, t5, n_l1, 'zone', 'ZA', 'Zone A — Outpatient', 0);
    n_r1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_r1, t5, n_z1, 'room', 'RM-OPD01', 'OPD Clinic 01', 0);
    insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
      (t5, n_r1, 'element', 'STR-001', 'Structural Works', 0),
      (t5, n_r1, 'element', 'ARC-001', 'Architectural Finishes', 1),
      (t5, n_r1, 'element', 'MEP-001', 'M&E Works', 2);
    n_z2 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_z2, t5, n_l1, 'zone', 'ZB', 'Zone B — Emergency', 1);
    n_r2 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_r2, t5, n_z2, 'room', 'RM-ER01', 'Emergency Room 01', 0);
    insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
      (t5, n_r2, 'element', 'STR-001', 'Structural Works', 0),
      (t5, n_r2, 'element', 'ARC-001', 'Architectural Finishes', 1);

    -- L02 Ward Floor
    n_l2 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_l2, t5, n_bld, 'level', 'L02', 'First Floor — Ward', 1);
    n_z1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_z1, t5, n_l2, 'zone', 'ZA', 'Zone A — General Ward', 0);
    n_r1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_r1, t5, n_z1, 'room', 'RM-WARD01', 'Ward 01', 0);
    insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
      (t5, n_r1, 'element', 'STR-001', 'Structural Works', 0),
      (t5, n_r1, 'element', 'ARC-001', 'Architectural Finishes', 1);

    -- L03 ICU / OT
    n_l3 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_l3, t5, n_bld, 'level', 'L03', 'Second Floor — ICU / OT', 2);
    n_z1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_z1, t5, n_l3, 'zone', 'ZA', 'Zone A — Operating Theatre', 0);
    n_r1 := gen_random_uuid();
    insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
    values (n_r1, t5, n_z1, 'room', 'RM-OT01', 'Operating Theatre 01', 0);
    insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
      (t5, n_r1, 'element', 'STR-001', 'Structural Works', 0),
      (t5, n_r1, 'element', 'MEP-001', 'M&E Works', 1);
  end if;

end $seed$;

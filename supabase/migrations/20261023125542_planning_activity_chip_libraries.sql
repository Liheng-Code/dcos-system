-- Migration: 20261023125542_planning_activity_chip_libraries.sql
-- Purpose: Activity Database "Details" chip lists per activity master: Shop Drawings,
--          Materials, Coordination. Reusable libraries + link tables + audit + RPC.
-- Depends on: plan_act_masters, plan_act_change_history, csi_divisions, dwl_resources,
--             can_manage_master_libraries(), set_updated_at(), csi_set_audit_columns()
-- Additive only. Links are catalogue knowledge: editable at any master status (no frozen guard).

-- 1. Libraries ------------------------------------------------------------
create table if not exists public.plan_act_shop_drawing_types (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  name              text not null,
  csi_division_code text references public.csi_divisions(code) on update cascade,
  description       text,
  is_active         boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.profiles(id) on delete set null
);
create index if not exists idx_plan_act_sdt_division on public.plan_act_shop_drawing_types(csi_division_code);

create table if not exists public.plan_act_coordination_items (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  discipline  text,
  description text,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null
);

drop trigger if exists trg_plan_act_sdt_audit on public.plan_act_shop_drawing_types;
create trigger trg_plan_act_sdt_audit before insert or update on public.plan_act_shop_drawing_types
  for each row execute function public.csi_set_audit_columns();
drop trigger if exists trg_plan_act_coord_audit on public.plan_act_coordination_items;
create trigger trg_plan_act_coord_audit before insert or update on public.plan_act_coordination_items
  for each row execute function public.csi_set_audit_columns();

-- 2. Link tables ----------------------------------------------------------
create table if not exists public.plan_act_master_shop_drawings (
  id                   uuid primary key default gen_random_uuid(),
  master_id            uuid not null references public.plan_act_masters(id) on delete cascade,
  shop_drawing_type_id uuid not null references public.plan_act_shop_drawing_types(id) on delete restrict,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  created_by           uuid default auth.uid(),
  unique (master_id, shop_drawing_type_id)
);
create index if not exists idx_plan_act_msd_master on public.plan_act_master_shop_drawings(master_id);
create index if not exists idx_plan_act_msd_ref on public.plan_act_master_shop_drawings(shop_drawing_type_id);

create table if not exists public.plan_act_master_materials (
  id          uuid primary key default gen_random_uuid(),
  master_id   uuid not null references public.plan_act_masters(id) on delete cascade,
  resource_id uuid not null references public.dwl_resources(id) on delete restrict,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  unique (master_id, resource_id)
);
create index if not exists idx_plan_act_mm_master on public.plan_act_master_materials(master_id);
create index if not exists idx_plan_act_mm_ref on public.plan_act_master_materials(resource_id);

create table if not exists public.plan_act_master_coordination (
  id                   uuid primary key default gen_random_uuid(),
  master_id            uuid not null references public.plan_act_masters(id) on delete cascade,
  coordination_item_id uuid not null references public.plan_act_coordination_items(id) on delete restrict,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  created_by           uuid default auth.uid(),
  unique (master_id, coordination_item_id)
);
create index if not exists idx_plan_act_mc_master on public.plan_act_master_coordination(master_id);
create index if not exists idx_plan_act_mc_ref on public.plan_act_master_coordination(coordination_item_id);

-- 3. RLS ------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['plan_act_shop_drawing_types','plan_act_coordination_items',
    'plan_act_master_shop_drawings','plan_act_master_materials','plan_act_master_coordination'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || ' authenticated view', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || ' authenticated view', t);
    execute format('drop policy if exists %I on public.%I', t || ' privileged manage', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.can_manage_master_libraries()) with check (public.can_manage_master_libraries())', t || ' privileged manage', t);
  end loop;
end $$;

-- 4. Audit ----------------------------------------------------------------
create or replace function public.plan_act_master_chip_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb; v_kind text; v_ref uuid; v_master uuid; v_action text; v_label text;
begin
  v_kind := case tg_table_name
    when 'plan_act_master_shop_drawings' then 'shop_drawing'
    when 'plan_act_master_materials'     then 'material'
    else 'coordination' end;
  v_row := case when tg_op = 'INSERT' then to_jsonb(new) else to_jsonb(old) end;
  v_master := (v_row ->> 'master_id')::uuid;
  v_action := v_kind || case when tg_op = 'INSERT' then '_add' else '_remove' end;
  v_ref := (v_row ->> case v_kind when 'shop_drawing' then 'shop_drawing_type_id'
                                  when 'material' then 'resource_id'
                                  else 'coordination_item_id' end)::uuid;
  v_label := case v_kind
    when 'shop_drawing' then (select code || ' ' || name from public.plan_act_shop_drawing_types where id = v_ref)
    when 'material' then (select code || ' ' || description from public.dwl_resources where id = v_ref)
    else (select code || ' ' || name from public.plan_act_coordination_items where id = v_ref) end;
  insert into public.plan_act_change_history(entity_type, entity_id, action, reason)
  values ('master', v_master, v_action, coalesce(v_label, v_ref::text));
  return null;
end $$;

drop trigger if exists trg_plan_act_msd_audit on public.plan_act_master_shop_drawings;
create trigger trg_plan_act_msd_audit after insert or delete on public.plan_act_master_shop_drawings
  for each row execute function public.plan_act_master_chip_audit();
drop trigger if exists trg_plan_act_mm_audit on public.plan_act_master_materials;
create trigger trg_plan_act_mm_audit after insert or delete on public.plan_act_master_materials
  for each row execute function public.plan_act_master_chip_audit();
drop trigger if exists trg_plan_act_mc_audit on public.plan_act_master_coordination;
create trigger trg_plan_act_mc_audit after insert or delete on public.plan_act_master_coordination
  for each row execute function public.plan_act_master_chip_audit();

-- 5. RPC ------------------------------------------------------------------
create or replace function public.plan_act_master_chips(p_master_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'shop_drawings', coalesce((
      select jsonb_agg(jsonb_build_object('link_id', l.id, 'id', s.id, 'code', s.code, 'name', s.name)
                       order by l.sort_order, s.code)
      from plan_act_master_shop_drawings l join plan_act_shop_drawing_types s on s.id = l.shop_drawing_type_id
      where l.master_id = p_master_id), '[]'::jsonb),
    'materials', coalesce((
      select jsonb_agg(jsonb_build_object('link_id', l.id, 'id', r.id, 'code', r.code,
                       'name', coalesce(nullif(a.material_name, ''), r.description), 'unit', r.unit)
                       order by l.sort_order, r.code)
      from plan_act_master_materials l join dwl_resources r on r.id = l.resource_id
      left join dwl_material_attributes a on a.resource_id = r.id
      where l.master_id = p_master_id), '[]'::jsonb),
    'coordination', coalesce((
      select jsonb_agg(jsonb_build_object('link_id', l.id, 'id', c.id, 'code', c.code, 'name', c.name)
                       order by l.sort_order, c.code)
      from plan_act_master_coordination l join plan_act_coordination_items c on c.id = l.coordination_item_id
      where l.master_id = p_master_id), '[]'::jsonb));
$$;
grant execute on function public.plan_act_master_chips(uuid) to authenticated;

-- 6. Seed -----------------------------------------------------------------
insert into public.plan_act_shop_drawing_types (code, name, csi_division_code, sort_order) values
 ('SD-01-01', 'Builder''s Work Openings / Sleeves (Combined Services)', '01', 10),
 ('SD-03-01', 'Rebar Detailing / Bar Bending Schedule', '03', 20),
 ('SD-03-02', 'Formwork Shop Drawing', '03', 30),
 ('SD-04-01', 'Masonry Shop Drawing', '04', 40),
 ('SD-05-01', 'Structural Steel Shop Drawing', '05', 50),
 ('SD-05-02', 'Metalwork / Railings', '05', 60),
 ('SD-06-01', 'Joinery', '06', 70),
 ('SD-07-01', 'Waterproofing Details', '07', 80),
 ('SD-07-02', 'Roofing', '07', 90),
 ('SD-08-01', 'Door & Window Schedule', '08', 100),
 ('SD-08-02', 'Curtain Wall / Facade', '08', 110),
 ('SD-09-01', 'Ceiling Layout', '09', 120),
 ('SD-09-02', 'Tiling Layout', '09', 130),
 ('SD-10-01', 'Signage', '10', 140),
 ('SD-14-01', 'Lift Shop Drawing', '14', 150),
 ('SD-21-01', 'Fire Sprinkler', '21', 160),
 ('SD-22-01', 'Plumbing Shop Drawing', '22', 170),
 ('SD-23-01', 'HVAC Ductwork', '23', 180),
 ('SD-23-02', 'Chilled Water Piping', '23', 190),
 ('SD-26-01', 'Electrical Power & Lighting Layout', '26', 200),
 ('SD-27-01', 'ELV / Communications', '27', 210),
 ('SD-28-01', 'Fire Alarm', '28', 220),
 ('SD-31-01', 'Earthworks / Grading', '31', 230),
 ('SD-32-01', 'Paving & Landscape', '32', 240),
 ('SD-33-01', 'External Drainage', '33', 250)
on conflict (code) do nothing;

insert into public.plan_act_coordination_items (code, name, discipline, sort_order) values
 ('CO-01', 'MEP Coordination / Combined Services', 'MEP', 10),
 ('CO-02', 'Structural Openings & Sleeves', 'Structural', 20),
 ('CO-03', 'Architectural-Structural Interface', 'Architectural', 30),
 ('CO-04', 'Client Approval', 'Client', 40),
 ('CO-05', 'Authority Inspection', 'Authority', 50),
 ('CO-06', 'Consultant Inspection / Hold Point', 'Consultant', 60),
 ('CO-07', 'Subcontractor Interface', 'Construction', 70),
 ('CO-08', 'Material Submittal Approval', 'Consultant', 80),
 ('CO-09', 'Mock-up Approval', 'Client', 90),
 ('CO-10', 'Site Access & Logistics', 'Construction', 100),
 ('CO-11', 'Utilities Authority Connection', 'Authority', 110),
 ('CO-12', 'Testing Lab', 'Quality', 120),
 ('CO-13', 'Survey / Setting-out Verification', 'Civil', 130),
 ('CO-14', 'HSE Permit to Work', 'HSE', 140),
 ('CO-15', 'Neighbouring Property Interface', 'Client', 150)
on conflict (code) do nothing;

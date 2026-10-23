-- Migration: 20261023131300_planning_activity_ms_tc_libraries.sql
-- Purpose: Method Statement and Testing & Commissioning (T&C) chip libraries for the
--          Activity Database Details tab, with link tables, audit and RPC extension.
-- Depends on: 20261023125542_planning_activity_chip_libraries.sql (plan_act_master_chip_audit,
--             plan_act_master_chips), csi_divisions, plan_act_masters, can_manage_master_libraries()
-- Additive only. Links editable at any master status (no frozen guard).

-- 1. Libraries ------------------------------------------------------------
create table if not exists public.plan_act_method_statements (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  name              text not null,
  csi_division_code text references public.csi_divisions(code) on update cascade,
  description       text,
  reference_doc     text,
  is_active         boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.profiles(id) on delete set null
);
create index if not exists idx_plan_act_ms_division on public.plan_act_method_statements(csi_division_code);

create table if not exists public.plan_act_tc_items (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,
  name                text not null,
  csi_division_code   text references public.csi_divisions(code) on update cascade,
  tc_type             text not null default 'test',
  standard_ref        text,
  acceptance_criteria text,
  is_active           boolean not null default true,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.profiles(id) on delete set null,
  constraint plan_act_tc_items_type_chk check (tc_type in ('inspection', 'test', 'commissioning'))
);
create index if not exists idx_plan_act_tc_division on public.plan_act_tc_items(csi_division_code);

drop trigger if exists trg_plan_act_ms_audit_cols on public.plan_act_method_statements;
create trigger trg_plan_act_ms_audit_cols before insert or update on public.plan_act_method_statements
  for each row execute function public.csi_set_audit_columns();
drop trigger if exists trg_plan_act_tc_audit_cols on public.plan_act_tc_items;
create trigger trg_plan_act_tc_audit_cols before insert or update on public.plan_act_tc_items
  for each row execute function public.csi_set_audit_columns();

-- 2. Link tables ----------------------------------------------------------
create table if not exists public.plan_act_master_method_statements (
  id                  uuid primary key default gen_random_uuid(),
  master_id           uuid not null references public.plan_act_masters(id) on delete cascade,
  method_statement_id uuid not null references public.plan_act_method_statements(id) on delete restrict,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  created_by          uuid default auth.uid(),
  unique (master_id, method_statement_id)
);
create index if not exists idx_plan_act_mms_master on public.plan_act_master_method_statements(master_id);
create index if not exists idx_plan_act_mms_ref on public.plan_act_master_method_statements(method_statement_id);

create table if not exists public.plan_act_master_tc_items (
  id         uuid primary key default gen_random_uuid(),
  master_id  uuid not null references public.plan_act_masters(id) on delete cascade,
  tc_item_id uuid not null references public.plan_act_tc_items(id) on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (master_id, tc_item_id)
);
create index if not exists idx_plan_act_mtc_master on public.plan_act_master_tc_items(master_id);
create index if not exists idx_plan_act_mtc_ref on public.plan_act_master_tc_items(tc_item_id);

-- 3. RLS ------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['plan_act_method_statements','plan_act_tc_items',
    'plan_act_master_method_statements','plan_act_master_tc_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || ' authenticated view', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || ' authenticated view', t);
    execute format('drop policy if exists %I on public.%I', t || ' privileged manage', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.can_manage_master_libraries()) with check (public.can_manage_master_libraries())', t || ' privileged manage', t);
  end loop;
end $$;

-- 4. Audit: extend the shared function ------------------------------------
create or replace function public.plan_act_master_chip_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb; v_kind text; v_ref uuid; v_master uuid; v_action text; v_label text;
begin
  v_kind := case tg_table_name
    when 'plan_act_master_shop_drawings'     then 'shop_drawing'
    when 'plan_act_master_materials'         then 'material'
    when 'plan_act_master_method_statements' then 'method_statement'
    when 'plan_act_master_tc_items'          then 'tc'
    else 'coordination' end;
  v_row := case when tg_op = 'INSERT' then to_jsonb(new) else to_jsonb(old) end;
  v_master := (v_row ->> 'master_id')::uuid;
  v_action := v_kind || case when tg_op = 'INSERT' then '_add' else '_remove' end;
  v_ref := (v_row ->> case v_kind when 'shop_drawing' then 'shop_drawing_type_id'
                                  when 'material' then 'resource_id'
                                  when 'method_statement' then 'method_statement_id'
                                  when 'tc' then 'tc_item_id'
                                  else 'coordination_item_id' end)::uuid;
  v_label := case v_kind
    when 'shop_drawing' then (select code || ' ' || name from public.plan_act_shop_drawing_types where id = v_ref)
    when 'material' then (select code || ' ' || description from public.dwl_resources where id = v_ref)
    when 'method_statement' then (select code || ' ' || name from public.plan_act_method_statements where id = v_ref)
    when 'tc' then (select code || ' ' || name from public.plan_act_tc_items where id = v_ref)
    else (select code || ' ' || name from public.plan_act_coordination_items where id = v_ref) end;
  insert into public.plan_act_change_history(entity_type, entity_id, action, reason)
  values ('master', v_master, v_action, coalesce(v_label, v_ref::text));
  return null;
end $$;

drop trigger if exists trg_plan_act_mms_audit on public.plan_act_master_method_statements;
create trigger trg_plan_act_mms_audit after insert or delete on public.plan_act_master_method_statements
  for each row execute function public.plan_act_master_chip_audit();
drop trigger if exists trg_plan_act_mtc_audit on public.plan_act_master_tc_items;
create trigger trg_plan_act_mtc_audit after insert or delete on public.plan_act_master_tc_items
  for each row execute function public.plan_act_master_chip_audit();

-- 5. RPC (same signature, two more keys) ------------------------------------
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
      where l.master_id = p_master_id), '[]'::jsonb),
    'method_statements', coalesce((
      select jsonb_agg(jsonb_build_object('link_id', l.id, 'id', m.id, 'code', m.code, 'name', m.name)
                       order by l.sort_order, m.code)
      from plan_act_master_method_statements l join plan_act_method_statements m on m.id = l.method_statement_id
      where l.master_id = p_master_id), '[]'::jsonb),
    'tc_items', coalesce((
      select jsonb_agg(jsonb_build_object('link_id', l.id, 'id', t.id, 'code', t.code, 'name', t.name, 'tc_type', t.tc_type)
                       order by l.sort_order, t.code)
      from plan_act_master_tc_items l join plan_act_tc_items t on t.id = l.tc_item_id
      where l.master_id = p_master_id), '[]'::jsonb));
$$;
grant execute on function public.plan_act_master_chips(uuid) to authenticated;

-- 6. Seed -----------------------------------------------------------------
insert into public.plan_act_method_statements (code, name, csi_division_code, sort_order) values
 ('MS-01-01', 'Site Setup and Mobilisation', '01', 10),
 ('MS-01-02', 'Survey and Setting Out', '01', 20),
 ('MS-03-01', 'Rebar Fixing', '03', 30),
 ('MS-03-02', 'Formwork Erection and Striking', '03', 40),
 ('MS-03-03', 'Concrete Pouring and Curing', '03', 50),
 ('MS-03-04', 'Post-Tensioning', '03', 60),
 ('MS-04-01', 'Blockwork', '04', 70),
 ('MS-05-01', 'Structural Steel Erection', '05', 80),
 ('MS-07-01', 'Waterproofing', '07', 90),
 ('MS-07-02', 'Roofing', '07', 100),
 ('MS-08-01', 'Door and Window Installation', '08', 110),
 ('MS-08-02', 'Curtain Wall Installation', '08', 120),
 ('MS-09-01', 'Plastering', '09', 130),
 ('MS-09-02', 'Tiling', '09', 140),
 ('MS-09-03', 'Painting', '09', 150),
 ('MS-09-04', 'False Ceiling Installation', '09', 160),
 ('MS-21-01', 'Fire Sprinkler Installation', '21', 170),
 ('MS-22-01', 'Plumbing Installation', '22', 180),
 ('MS-23-01', 'HVAC Ductwork Installation', '23', 190),
 ('MS-26-01', 'Electrical Cable Installation', '26', 200),
 ('MS-27-01', 'ELV Installation', '27', 210),
 ('MS-31-01', 'Excavation and Backfill', '31', 220),
 ('MS-31-02', 'Piling', '31', 230),
 ('MS-31-03', 'Dewatering', '31', 240),
 ('MS-32-01', 'Asphalt Paving', '32', 250),
 ('MS-33-01', 'External Drainage Installation', '33', 260)
on conflict (code) do nothing;

insert into public.plan_act_tc_items (code, name, csi_division_code, tc_type, sort_order) values
 ('TC-03-01', 'Concrete Cube Test', '03', 'test', 10),
 ('TC-03-02', 'Slump Test', '03', 'test', 20),
 ('TC-03-03', 'Rebar Inspection Before Pour', '03', 'inspection', 30),
 ('TC-03-04', 'Formwork Inspection', '03', 'inspection', 40),
 ('TC-07-01', 'Waterproofing Flood Test', '07', 'test', 50),
 ('TC-08-01', 'Window Water-Tightness Test', '08', 'test', 60),
 ('TC-09-01', 'Paint DFT Inspection', '09', 'inspection', 70),
 ('TC-09-02', 'Tile Adhesion / Hollowness Inspection', '09', 'inspection', 80),
 ('TC-14-01', 'Lift Testing and Commissioning', '14', 'commissioning', 90),
 ('TC-21-01', 'Sprinkler Hydrostatic Test', '21', 'test', 100),
 ('TC-22-01', 'Plumbing Pressure Test', '22', 'test', 110),
 ('TC-23-01', 'Duct Leakage Test', '23', 'test', 120),
 ('TC-23-02', 'HVAC Testing, Adjusting and Balancing (TAB)', '23', 'commissioning', 130),
 ('TC-23-03', 'Chiller Commissioning', '23', 'commissioning', 140),
 ('TC-25-01', 'BMS Point-to-Point Test', '25', 'commissioning', 150),
 ('TC-26-01', 'Insulation Resistance (Megger) Test', '26', 'test', 160),
 ('TC-26-02', 'Earthing Resistance Test', '26', 'test', 170),
 ('TC-26-03', 'DB / Switchboard Commissioning', '26', 'commissioning', 180),
 ('TC-26-04', 'Generator Load Test', '26', 'commissioning', 190),
 ('TC-28-01', 'Fire Alarm Cause and Effect', '28', 'commissioning', 200),
 ('TC-28-02', 'CCTV / Access Control Commissioning', '28', 'commissioning', 210),
 ('TC-31-01', 'Pile Integrity Test', '31', 'test', 220),
 ('TC-31-02', 'Plate Load / Compaction Test', '31', 'test', 230),
 ('TC-32-01', 'Asphalt Core Test', '32', 'test', 240),
 ('TC-33-01', 'Drainage CCTV and Air Test', '33', 'test', 250)
on conflict (code) do nothing;

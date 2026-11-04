-- Construction Work Library: procurement packages (core master data).
--
-- A procurement package is a standard way the company buys a scope of work (Ready-Mix Concrete Supply, Rebar Supply &
-- Bending, Formwork Subcontract ...). The library links each activity to the packages that supply it, so a PR raised
-- for a task or BOQ line can be put in the right package. Additive only (lanes are running):
--   A. plan_act_procurement_packages: the catalogue (same shape and RLS as plan_act_shop_drawing_types).
--   B. plan_act_master_procurement_packages: activity <-> package links, audited like the other chips.
--   C. plan_act_master_chips / plan_act_master_chip_audit learn the new kind.
--   D. procurement_prs.package_id: optional package of a purchase requisition.
--   E. Backfill the PKG-* codes held as free text on qs_wbs_template_items, and link masters named there.
-- Table prefix stays plan_act_* like the other Work Library catalogues (no renames while lanes run).

-- ---------------------------------------------------------------- A. catalogue
create table if not exists public.plan_act_procurement_packages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  package_type text not null default 'material'
    check (package_type in ('material', 'subcontract', 'equipment', 'service')),
  csi_division_code text references public.csi_divisions(code) on update cascade,
  -- Matches supplier_approved_trades.trade_category, so bidders can later be filtered by trade.
  trade_category text,
  default_lead_time_days integer check (default_lead_time_days is null or default_lead_time_days >= 0),
  is_long_lead boolean not null default false,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
comment on table public.plan_act_procurement_packages is
  'Construction Work Library: standard procurement packages (material supply, subcontract, equipment, service), linked to activities.';
create index if not exists idx_plan_act_pp_division on public.plan_act_procurement_packages(csi_division_code);

drop trigger if exists trg_plan_act_pp_audit on public.plan_act_procurement_packages;
create trigger trg_plan_act_pp_audit before insert or update on public.plan_act_procurement_packages
  for each row execute function public.csi_set_audit_columns();

alter table public.plan_act_procurement_packages enable row level security;
drop policy if exists "plan_act_procurement_packages authenticated view" on public.plan_act_procurement_packages;
create policy "plan_act_procurement_packages authenticated view" on public.plan_act_procurement_packages
  for select to authenticated using (true);
drop policy if exists "plan_act_procurement_packages privileged manage" on public.plan_act_procurement_packages;
create policy "plan_act_procurement_packages privileged manage" on public.plan_act_procurement_packages
  for all to authenticated using (public.can_manage_master_libraries()) with check (public.can_manage_master_libraries());

-- ---------------------------------------------------------------- B. activity links
create table if not exists public.plan_act_master_procurement_packages (
  id uuid primary key default gen_random_uuid(),
  master_id uuid not null references public.plan_act_masters(id) on delete cascade,
  package_id uuid not null references public.plan_act_procurement_packages(id) on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (master_id, package_id)
);
create index if not exists idx_plan_act_mpp_master on public.plan_act_master_procurement_packages(master_id);
create index if not exists idx_plan_act_mpp_ref on public.plan_act_master_procurement_packages(package_id);

alter table public.plan_act_master_procurement_packages enable row level security;
drop policy if exists "plan_act_master_procurement_packages authenticated view" on public.plan_act_master_procurement_packages;
create policy "plan_act_master_procurement_packages authenticated view" on public.plan_act_master_procurement_packages
  for select to authenticated using (true);
drop policy if exists "plan_act_master_procurement_packages privileged manage" on public.plan_act_master_procurement_packages;
create policy "plan_act_master_procurement_packages privileged manage" on public.plan_act_master_procurement_packages
  for all to authenticated using (public.can_manage_master_libraries()) with check (public.can_manage_master_libraries());

-- ---------------------------------------------------------------- C. chips RPC + audit
create or replace function public.plan_act_master_chip_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb; v_kind text; v_ref uuid; v_master uuid; v_action text; v_label text;
begin
  v_kind := case tg_table_name
    when 'plan_act_master_shop_drawings'         then 'shop_drawing'
    when 'plan_act_master_materials'             then 'material'
    when 'plan_act_master_method_statements'     then 'method_statement'
    when 'plan_act_master_tc_items'              then 'tc'
    when 'plan_act_master_procurement_packages'  then 'procurement_package'
    else 'coordination' end;
  v_row := case when tg_op = 'INSERT' then to_jsonb(new) else to_jsonb(old) end;
  v_master := (v_row ->> 'master_id')::uuid;
  v_action := v_kind || case when tg_op = 'INSERT' then '_add' else '_remove' end;
  v_ref := (v_row ->> case v_kind when 'shop_drawing' then 'shop_drawing_type_id'
                                  when 'material' then 'resource_id'
                                  when 'method_statement' then 'method_statement_id'
                                  when 'tc' then 'tc_item_id'
                                  when 'procurement_package' then 'package_id'
                                  else 'coordination_item_id' end)::uuid;
  v_label := case v_kind
    when 'shop_drawing' then (select code || ' ' || name from public.plan_act_shop_drawing_types where id = v_ref)
    when 'material' then (select code || ' ' || description from public.dwl_resources where id = v_ref)
    when 'method_statement' then (select code || ' ' || name from public.plan_act_method_statements where id = v_ref)
    when 'tc' then (select code || ' ' || name from public.plan_act_tc_items where id = v_ref)
    when 'procurement_package' then (select code || ' ' || name from public.plan_act_procurement_packages where id = v_ref)
    else (select code || ' ' || name from public.plan_act_coordination_items where id = v_ref) end;
  insert into public.plan_act_change_history(entity_type, entity_id, action, reason)
  values ('master', v_master, v_action, coalesce(v_label, v_ref::text));
  return null;
end $$;

drop trigger if exists trg_plan_act_mpp_audit on public.plan_act_master_procurement_packages;
create trigger trg_plan_act_mpp_audit after insert or delete on public.plan_act_master_procurement_packages
  for each row execute function public.plan_act_master_chip_audit();

create or replace function public.plan_act_master_chips(p_master_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
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
      where l.master_id = p_master_id), '[]'::jsonb),
    'procurement_packages', coalesce((
      select jsonb_agg(jsonb_build_object('link_id', l.id, 'id', p.id, 'code', p.code, 'name', p.name, 'package_type', p.package_type)
                       order by l.sort_order, p.code)
      from plan_act_master_procurement_packages l join plan_act_procurement_packages p on p.id = l.package_id
      where l.master_id = p_master_id), '[]'::jsonb));
$$;
grant execute on function public.plan_act_master_chips(uuid) to authenticated;

-- ---------------------------------------------------------------- D. package on a PR
alter table public.procurement_prs
  add column if not exists package_id uuid references public.plan_act_procurement_packages(id) on delete set null;
create index if not exists idx_procurement_prs_package on public.procurement_prs(package_id);
comment on column public.procurement_prs.package_id is
  'Optional Construction Work Library procurement package this requisition buys under.';

-- ---------------------------------------------------------------- E. backfill from the QS WBS templates
do $$
begin
  if to_regclass('public.qs_wbs_template_items') is null then return; end if;

  insert into public.plan_act_procurement_packages (code, name, package_type, csi_division_code, sort_order)
  select distinct on (t.default_procurement_package_code)
         t.default_procurement_package_code,
         coalesce(nullif(t.procurement_package_name, ''), t.default_procurement_package_code),
         case t.resource_type when 'subcontractor' then 'subcontract' when 'equipment' then 'equipment' else 'material' end,
         (select d.code from public.csi_divisions d where d.code = left(t.masterformat_code, 2)),
         0
  from public.qs_wbs_template_items t
  where nullif(t.default_procurement_package_code, '') is not null
  order by t.default_procurement_package_code
  on conflict (code) do nothing;

  insert into public.plan_act_master_procurement_packages (master_id, package_id, sort_order)
  select distinct t.planning_activity_master_id, p.id, 10
  from public.qs_wbs_template_items t
  join public.plan_act_procurement_packages p on p.code = t.default_procurement_package_code
  where t.planning_activity_master_id is not null
  on conflict (master_id, package_id) do nothing;
end $$;

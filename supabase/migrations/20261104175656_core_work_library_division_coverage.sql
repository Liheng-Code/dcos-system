-- Construction Work Library: coverage by CSI division (2026-11-04, Wave 3 item 11).
--
-- For the current activities (not superseded / archived) of each division: how many have each piece of library
-- knowledge. Counts only, the same for every viewer (norms are RLS-limited to planning/norms view), hence security
-- definer. Rules match the list badges: a norm counts only for quantity-based activities (wl_masters_missing_norm),
-- a package only for activities that are not self-performed (wl_masters_missing_package).

create or replace function public.wl_division_coverage()
 returns table (
   division_code text, activities integer,
   quantity_based integer, with_norm integer,
   needs_package integer, with_package integer,
   with_boq integer, with_method_statement integer, with_tc integer, with_shop_drawing integer, with_material integer
 )
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  with m as (
    select m.id, m.csi_division_code, m.duration_basis, m.self_performed
      from public.plan_act_masters m
     where m.status not in ('superseded', 'archived'))
  select m.csi_division_code,
         count(*)::int,
         count(*) filter (where m.duration_basis = 'quantity')::int,
         count(*) filter (where m.duration_basis = 'quantity' and exists (
           select 1 from public.plan_productivity_norms n where n.activity_master_id = m.id and n.project_id is null and n.status <> 'retired'))::int,
         count(*) filter (where not m.self_performed)::int,
         count(*) filter (where not m.self_performed and exists (select 1 from public.plan_act_master_procurement_packages x where x.master_id = m.id))::int,
         count(*) filter (where exists (select 1 from public.plan_act_master_work_items x where x.master_id = m.id))::int,
         count(*) filter (where exists (select 1 from public.plan_act_master_method_statements x where x.master_id = m.id))::int,
         count(*) filter (where exists (select 1 from public.plan_act_master_tc_items x where x.master_id = m.id))::int,
         count(*) filter (where exists (select 1 from public.plan_act_master_shop_drawings x where x.master_id = m.id))::int,
         count(*) filter (where exists (select 1 from public.plan_act_master_materials x where x.master_id = m.id))::int
    from m
   group by m.csi_division_code
   order by m.csi_division_code nulls last;
$function$;

revoke all on function public.wl_division_coverage() from public, anon;
grant execute on function public.wl_division_coverage() to authenticated;

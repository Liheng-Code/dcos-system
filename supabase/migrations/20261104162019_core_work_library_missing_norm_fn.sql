-- Construction Work Library: the "No norm" flag on the Master Activity list (2026-11-04).
--
-- Current activities (not superseded / archived) whose duration comes from quantity but have no library
-- productivity norm: Generate and the BOQ bridge cannot give them a duration. Fixed / programme activities take
-- their duration from the step template and never count.
-- Security definer so the flag is the same for every viewer: norms are RLS-limited to planning/norms view, and
-- the function returns activity ids only, never norm data.

create or replace function public.wl_masters_missing_norm()
 returns setof uuid
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select m.id
    from public.plan_act_masters m
   where m.status not in ('superseded', 'archived')
     and m.duration_basis = 'quantity'
     and not exists (
       select 1 from public.plan_productivity_norms n
        where n.activity_master_id = m.id and n.project_id is null and n.status <> 'retired'
     );
$function$;

revoke all on function public.wl_masters_missing_norm() from public, anon;
grant execute on function public.wl_masters_missing_norm() to authenticated;

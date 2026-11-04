-- Construction Work Library: activating a new Activity Master version moves the live references onto it (2026-11-04).
--
-- createNewVersion copies a master's own children (methods, rules, requirements, links), but other tables point at
-- the master by id and stayed on the old version. Once that version is superseded, Generate and the BOQ-driven
-- programme skip it, so the activity lost its productivity norms and template lines, and re-planning would not
-- recognise existing tasks.
-- When a version becomes active, references held by the other versions of the same code move to it:
--   plan_productivity_norms.activity_master_id (+ method_id)
--   plan_act_template_items.master_id (+ method_id)          planning templates of any status
--   qs_wbs_template_items.planning_activity_master_id        draft QS templates only (published ones are immutable)
--   wbs_tasks.activity_master_id (+ activity_method_id)
-- Methods are matched by code (createNewVersion copies them with their codes); an unmatched method id is kept.
-- History stays on the old version: plan_act_generation_items, AI suggestions, change history.
-- The template-items freeze and WBS lock guards let this one update through (dcos.master_repoint, set only inside
-- the trigger and only when nothing but the reference columns changes).

-- ── Guards: allow the reference-only update ───────────────────────────────
create or replace function public.plan_act_template_children_guard()
 returns trigger
 language plpgsql
as $function$
declare tid uuid; st text;
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('dcos.master_repoint', true), '') = 'on'
     and (to_jsonb(new) - 'master_id' - 'method_id') = (to_jsonb(old) - 'master_id' - 'method_id') then
    return new;
  end if;
  tid := coalesce(new.template_id, old.template_id);
  select status into st from public.plan_act_templates where id = tid;
  if st is not null and st <> 'draft' then
    raise exception 'Template is % and frozen; create a new version to change its items', st;
  end if;
  return coalesce(new, old);
end $function$;

create or replace function public.wbs_tasks_lock_guard()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_node uuid := coalesce(new.wbs_node_id, old.wbs_node_id);
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('dcos.master_repoint', true), '') = 'on'
     and (to_jsonb(new) - 'activity_master_id' - 'activity_method_id' - 'updated_at')
       = (to_jsonb(old) - 'activity_master_id' - 'activity_method_id' - 'updated_at') then
    return new;
  end if;
  if v_node is not null
     and public.wbs_node_effectively_locked(v_node)
     and not public.is_wbs_manager() then
    raise exception
      'This task is under a locked WBS node (Planning backbone) — unlock the WBS node first'
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$function$;

-- ── Repoint on activation ─────────────────────────────────────────────────
create or replace function public.plan_act_master_repoint_on_activate()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform set_config('dcos.master_repoint', 'on', true);

  -- other versions of the code, with each of their methods mapped to the new version's method of the same code
  create temp table if not exists _repoint_methods (old_id uuid, new_id uuid) on commit drop;
  truncate _repoint_methods;
  insert into _repoint_methods
  select om.id, nm.id
  from public.plan_act_masters o
  join public.plan_act_methods om on om.master_id = o.id
  join public.plan_act_methods nm on nm.master_id = new.id and nm.code = om.code
  where o.code = new.code and o.id <> new.id;

  update public.plan_productivity_norms n
     set activity_master_id = new.id,
         method_id = coalesce((select r.new_id from _repoint_methods r where r.old_id = n.method_id), n.method_id)
   where n.activity_master_id in (select o.id from public.plan_act_masters o where o.code = new.code and o.id <> new.id);

  update public.plan_act_template_items i
     set master_id = new.id,
         method_id = coalesce((select r.new_id from _repoint_methods r where r.old_id = i.method_id), i.method_id)
   where i.master_id in (select o.id from public.plan_act_masters o where o.code = new.code and o.id <> new.id);

  update public.qs_wbs_template_items q
     set planning_activity_master_id = new.id
   where q.planning_activity_master_id in (select o.id from public.plan_act_masters o where o.code = new.code and o.id <> new.id)
     and exists (select 1 from public.qs_wbs_templates t where t.id = q.template_id and t.lifecycle_status = 'draft');

  update public.wbs_tasks t
     set activity_master_id = new.id,
         activity_method_id = coalesce((select r.new_id from _repoint_methods r where r.old_id = t.activity_method_id), t.activity_method_id)
   where t.activity_master_id in (select o.id from public.plan_act_masters o where o.code = new.code and o.id <> new.id);

  perform set_config('dcos.master_repoint', '', true);
  return new;
end;
$function$;

drop trigger if exists trg_plan_act_master_repoint_on_activate on public.plan_act_masters;
create trigger trg_plan_act_master_repoint_on_activate
  after update of status on public.plan_act_masters
  for each row
  when (new.status = 'active' and old.status is distinct from 'active')
  execute function public.plan_act_master_repoint_on_activate();

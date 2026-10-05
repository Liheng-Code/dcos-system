-- Module 10-01 Daily Reporting, Phase 2: rule governance (design 10.5).
--
-- Rules are data with per-project overrides. Until now an override could only
-- be made in the database. This file makes changing one safe from the Setup
-- screen:
--
--   1. Every change bumps the rule's version and stamps who made it, so a
--      stored rule result always says which version of the rule produced it.
--   2. Creating, changing or removing a rule definition is written to the
--      audit log ("changing a rule is an Admin Event").
--   3. A project administrator may delete the project's own override, which
--      returns the project to the global default. Global rows cannot be
--      deleted from the app.

create or replace function public.dr_rule_definition_stamp()
returns trigger
language plpgsql
as $$
begin
  if (to_jsonb(new) - 'version' - 'updated_at' - 'updated_by')
     is distinct from (to_jsonb(old) - 'version' - 'updated_at' - 'updated_by') then
    new.version := old.version + 1;
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  else
    new.version := old.version;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_dr_rule_definition_stamp on public.dr_rule_definitions;
create trigger trg_dr_rule_definition_stamp
  before update on public.dr_rule_definitions
  for each row execute function public.dr_rule_definition_stamp();

create or replace function public.dr_audit_rule_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.dr_rule_definitions%rowtype;
begin
  if tg_op = 'DELETE' then
    r := old;
    -- The project itself is being deleted: nothing is left to audit against.
    if r.project_id is not null and not exists (select 1 from projects where id = r.project_id) then
      return old;
    end if;
  else
    r := new;
    if tg_op = 'UPDATE' and new.version = old.version then
      return new;
    end if;
  end if;

  insert into dr_audit_log (project_id, event_code, actor_id, channel, details)
  values (
    r.project_id,
    case tg_op when 'INSERT' then 'DR.RULE_SET' when 'UPDATE' then 'DR.RULE_CHANGED' else 'DR.RULE_REMOVED' end,
    auth.uid(),
    'WEB',
    jsonb_build_object(
      'rule_code', r.rule_code, 'scope', case when r.project_id is null then 'GLOBAL' else 'PROJECT' end,
      'version', r.version, 'severity', r.severity, 'is_active', r.is_active,
      'min_history_days', r.min_history_days, 'params', r.params)
    || case when tg_op = 'UPDATE'
            then jsonb_build_object('previous', jsonb_build_object(
                   'severity', old.severity, 'is_active', old.is_active,
                   'min_history_days', old.min_history_days, 'params', old.params))
            else '{}'::jsonb end);
  return r;
end;
$$;

revoke all on function public.dr_audit_rule_change() from public, anon, authenticated;

drop trigger if exists trg_dr_audit_rule_change on public.dr_rule_definitions;
create trigger trg_dr_audit_rule_change
  after insert or update or delete on public.dr_rule_definitions
  for each row execute function public.dr_audit_rule_change();

grant delete on public.dr_rule_definitions to authenticated;
drop policy if exists dr_rules_delete on public.dr_rule_definitions;
create policy dr_rules_delete on public.dr_rule_definitions for delete to authenticated
  using (project_id is not null and dr_can_admin(project_id));

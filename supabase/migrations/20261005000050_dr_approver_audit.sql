-- Module 10-01 Daily Reporting, Phase 2: delegated reviewer (design 10.5, G7).
--
-- The delegate already exists: an ALTERNATE row in dr_project_approvers has
-- the primary approver's authority inside its dates (dr_can_review,
-- dr_reviewers). This file closes two gaps around it:
--
--   1. An approver's end date cannot be before its start date. Cover for
--      planned leave is a row whose valid_from is in the future.
--   2. Setting, changing or removing an approver is written to the audit
--      log, like every other change of who may approve.

alter table public.dr_project_approvers
  drop constraint if exists dr_project_approvers_dates_check;
alter table public.dr_project_approvers
  add constraint dr_project_approvers_dates_check check (valid_to is null or valid_to >= valid_from);

create or replace function public.dr_audit_approver_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.dr_project_approvers%rowtype;
begin
  if tg_op = 'DELETE' then
    r := old;
    -- The whole project is being deleted: there is nothing left to audit against.
    if not exists (select 1 from projects where id = r.project_id) then
      return old;
    end if;
  else
    r := new;
    if tg_op = 'UPDATE'
       and (to_jsonb(new) - 'set_by' - 'created_at') is not distinct from (to_jsonb(old) - 'set_by' - 'created_at') then
      return new;
    end if;
  end if;

  insert into dr_audit_log (project_id, event_code, actor_id, channel, details)
  values (
    r.project_id,
    case tg_op when 'INSERT' then 'DR.APPROVER_SET' when 'UPDATE' then 'DR.APPROVER_CHANGED' else 'DR.APPROVER_REMOVED' end,
    auth.uid(),
    'WEB',
    jsonb_build_object(
      'user_id', r.user_id, 'approver_role', r.approver_role, 'valid_from', r.valid_from, 'valid_to', r.valid_to)
    || case when tg_op = 'UPDATE'
            then jsonb_build_object('previous_valid_from', old.valid_from, 'previous_valid_to', old.valid_to)
            else '{}'::jsonb end);
  return r;
end;
$$;

revoke all on function public.dr_audit_approver_change() from public, anon, authenticated;

drop trigger if exists trg_dr_audit_approver_change on public.dr_project_approvers;
create trigger trg_dr_audit_approver_change
  after insert or update or delete on public.dr_project_approvers
  for each row execute function public.dr_audit_approver_change();

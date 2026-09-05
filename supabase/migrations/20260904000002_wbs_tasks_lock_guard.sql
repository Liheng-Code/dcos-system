-- Migration: 20260904000002_wbs_tasks_lock_guard.sql
-- Purpose: Extend the WBS "Planning backbone" lock (20260904000001) to wbs_tasks.
--          When a task's WBS node is (transitively) locked, non-managers cannot
--          insert / update / delete it — matching trg_wbs_nodes_lock_guard.
-- Depends on: public.wbs_tasks (20260527000016), and from 20260904000001:
--             public.wbs_node_effectively_locked(uuid), public.is_wbs_manager(uuid).

create or replace function public.wbs_tasks_lock_guard()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_node uuid := coalesce(new.wbs_node_id, old.wbs_node_id);
begin
  if v_node is not null
     and public.wbs_node_effectively_locked(v_node)
     and not public.is_wbs_manager() then
    raise exception
      'This task is under a locked WBS node (Planning backbone) — unlock the WBS node first'
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

comment on function public.wbs_tasks_lock_guard() is
  'Blocks insert/update/delete on a wbs_task whose wbs_node is transitively locked, '
  'unless the caller is an admin / project manager. See 20260904000002.';

drop trigger if exists trg_wbs_tasks_lock_guard on public.wbs_tasks;
create trigger trg_wbs_tasks_lock_guard
  before insert or update or delete on public.wbs_tasks
  for each row execute function public.wbs_tasks_lock_guard();

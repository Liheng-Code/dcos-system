-- Migration: 20261027103153_planning_boq_line_delete_keeps_task_work.sql
-- Purpose: deleting a BOQ line that a programme uses failed with plan_task_work_boq_link_chk.
--   plan_task_work.qs_boq_item_id / tender_boq_item_id are ON DELETE SET NULL, but quantity_source stayed 'boq' /
--   'tender_boq', which the check requires to carry a link. A BEFORE DELETE trigger on qs_boq_items and
--   tender_boq_items now turns those task quantities into manual ones first: the quantity is kept, the link is cleared
--   and the reason "BOQ line deleted: <ref>" goes to plan_task_work_quantity_history. The delete then proceeds as
--   before (plan_task_boq_lines rows still cascade).
-- SECURITY DEFINER: the person deleting the line (QS) may not hold Planning task-work edit rights; the change is
--   limited to rows linked to the line being deleted.
-- Additive: new functions and triggers only.

create or replace function public.plan_task_work_unlink_deleted_boq_line()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text;
begin
  if tg_table_name = 'qs_boq_items' then
    v_ref := coalesce(nullif(old.item_code, ''), nullif(old.item_no, ''), left(old.description, 60));
    update public.plan_task_work
       set quantity_source = 'manual',
           qs_boq_item_id  = null,
           quantity_reason = left('BOQ line deleted: ' || coalesce(v_ref, old.id::text), 500),
           updated_by      = auth.uid()
     where qs_boq_item_id = old.id and quantity_source = 'boq';
  else
    v_ref := coalesce(nullif(old.item_code, ''), left(old.description, 60));
    update public.plan_task_work
       set quantity_source    = 'manual',
           tender_boq_item_id = null,
           quantity_reason    = left('Tender BOQ line deleted: ' || coalesce(v_ref, old.id::text), 500),
           updated_by         = auth.uid()
     where tender_boq_item_id = old.id and quantity_source = 'tender_boq';
  end if;
  return old;
end $$;

revoke all on function public.plan_task_work_unlink_deleted_boq_line() from public, anon;

drop trigger if exists trg_qs_boq_items_unlink_task_work on public.qs_boq_items;
create trigger trg_qs_boq_items_unlink_task_work
  before delete on public.qs_boq_items
  for each row execute function public.plan_task_work_unlink_deleted_boq_line();

drop trigger if exists trg_tender_boq_items_unlink_task_work on public.tender_boq_items;
create trigger trg_tender_boq_items_unlink_task_work
  before delete on public.tender_boq_items
  for each row execute function public.plan_task_work_unlink_deleted_boq_line();

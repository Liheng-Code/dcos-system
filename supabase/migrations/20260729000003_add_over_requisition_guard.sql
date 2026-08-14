-- Prevent over-requisitioning: enforce that PR item quantities
-- never exceed the remaining BOQ item quantity.

create or replace function public.check_pr_item_quantity()
returns trigger
language plpgsql
as $$
declare
  v_boq_qty numeric;
  v_used numeric;
begin
  if NEW.boq_item_id is null then
    return NEW;
  end if;

  select bi.quantity into strict v_boq_qty
    from public.qs_boq_items bi
    where bi.id = NEW.boq_item_id;

  select coalesce(sum(pi.quantity), 0) into v_used
    from public.procurement_pr_items pi
    join public.procurement_prs pr on pr.id = pi.pr_id
    where pi.boq_item_id = NEW.boq_item_id
      and pr.approval_status not in ('cancelled', 'rejected')
      and (TG_OP = 'INSERT' or pi.id != NEW.id);

  if v_used + NEW.quantity > v_boq_qty then
    raise exception 'Over-requisition: BOQ item % (qty %) already has % requisitioned, cannot add %',
      NEW.boq_item_id, v_boq_qty, v_used, NEW.quantity;
  end if;

  return NEW;
end;
$$;

create or replace trigger trg_check_pr_item_quantity
  before insert or update
  on public.procurement_pr_items
  for each row
  execute function public.check_pr_item_quantity();

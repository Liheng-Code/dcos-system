-- Migration: 20260727000005_create_inv_notifications.sql
-- Purpose: CWIMS Stage 1+2 gap-closure — inv_notifications table + trigger functions,
--          mirroring the procurement_notifications table + trigger pattern
--          (20260531000012_create_procurement_notifications.sql), adapted to the
--          inv_ namespace and the inventory event list.
-- Depends on: inv_stock, inv_items, inv_stores, inv_material_requisitions, inv_grns,
--             inv_transfers, inv_returns, inv_adjustments, inv_stocktakes,
--             inv_tool_issues, profiles
--
-- Deviation from procurement_notifications' exact shape: this table adds a mandatory
-- tenant_id column (non-negotiable DCOS DB rule — every table must be tenant-scoped),
-- whereas procurement_notifications relies on recipient_id alone. The insert policy
-- additionally checks tenant_id; the select/update policies stay recipient-scoped,
-- matching procurement's personal-inbox model.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. inv_notifications Table
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.inv_notifications (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null,
  record_type    text        not null
                   check (record_type in (
                     'item','stock','grn','mr','transfer','return','adjustment','stocktake','tool_issue'
                   )),
  record_id      uuid        not null,
  event_type     text        not null
                   check (event_type in (
                     'low_stock',
                     'out_of_stock',
                     'approval_required',
                     'grn_posted',
                     'mr_approved',
                     'transfer_dispatched',
                     'transfer_overdue',
                     'return_posted',
                     'adjustment_posted',
                     'count_variance',
                     'overdue_tool_return'
                   )),
  recipient_id   uuid        references public.profiles(id) on delete set null,
  title          text        not null,
  message        text,
  is_read        boolean     not null default false,
  created_at     timestamptz not null default now()
);

create index if not exists idx_inv_notif_tenant     on public.inv_notifications(tenant_id, created_at desc);
create index if not exists idx_inv_notif_recipient  on public.inv_notifications(recipient_id, created_at desc);
create index if not exists idx_inv_notif_unread     on public.inv_notifications(recipient_id) where is_read = false;

alter table public.inv_notifications enable row level security;

create policy "inv_notifications_select_own" on public.inv_notifications
  for select to authenticated
  using (recipient_id = auth.uid());

create policy "inv_notifications_update_own" on public.inv_notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

create policy "inv_notifications_insert" on public.inv_notifications
  for insert to authenticated
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Trigger Function: Stock Level → low_stock / out_of_stock
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.inv_notify_stock_level()
returns trigger
language plpgsql
security definer
as $$
declare
  v_min_stock numeric(18,4);
  v_item_name text;
  v_recipient uuid;
begin
  select min_stock_level, name into v_min_stock, v_item_name
  from public.inv_items
  where id = new.item_id;

  if v_min_stock is null then
    return new;
  end if;

  select responsible_user_id into v_recipient
  from public.inv_stores
  where id = new.store_id;

  if new.quantity_available <= 0 then
    insert into public.inv_notifications (tenant_id, record_type, record_id, event_type, recipient_id, title, message)
    values (new.tenant_id, 'stock', new.id, 'out_of_stock', v_recipient, 'Item Out of Stock',
            coalesce(v_item_name, 'Item') || ' is out of stock.');
  elsif new.quantity_available <= v_min_stock then
    insert into public.inv_notifications (tenant_id, record_type, record_id, event_type, recipient_id, title, message)
    values (new.tenant_id, 'stock', new.id, 'low_stock', v_recipient, 'Low Stock Alert',
            coalesce(v_item_name, 'Item') || ' has reached the minimum stock level.');
  end if;
  return new;
end;
$$;

create trigger trg_inv_notify_stock_level
  after update of quantity_available on public.inv_stock
  for each row
  when (old.quantity_available is distinct from new.quantity_available)
  execute function public.inv_notify_stock_level();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Trigger Function: Material Requisition → approval_required / mr_approved
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.inv_notify_mr_status()
returns trigger
language plpgsql
security definer
as $$
declare
  v_recipient uuid;
begin
  if new.status = 'submitted' and old.status = 'draft' then
    select responsible_user_id into v_recipient from public.inv_stores where id = new.store_id;
    insert into public.inv_notifications (tenant_id, record_type, record_id, event_type, recipient_id, title, message)
    values (new.tenant_id, 'mr', new.id, 'approval_required', v_recipient, 'MR Approval Required',
            'Material Requisition ' || new.mr_number || ' requires approval.');
  elsif new.status = 'approved' and old.status = 'submitted' then
    insert into public.inv_notifications (tenant_id, record_type, record_id, event_type, recipient_id, title, message)
    values (new.tenant_id, 'mr', new.id, 'mr_approved', new.requested_by, 'MR Approved',
            'Material Requisition ' || new.mr_number || ' has been approved.');
  end if;
  return new;
end;
$$;

create trigger trg_inv_notify_mr_status
  after update of status on public.inv_material_requisitions
  for each row
  when (old.status is distinct from new.status)
  execute function public.inv_notify_mr_status();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Trigger Function: GRN → grn_posted
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.inv_notify_grn_status()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.status = 'confirmed' and old.status = 'draft' then
    insert into public.inv_notifications (tenant_id, record_type, record_id, event_type, recipient_id, title, message)
    values (new.tenant_id, 'grn', new.id, 'grn_posted', new.received_by, 'GRN Posted',
            'GRN ' || new.grn_number || ' has been posted to stock.');
  end if;
  return new;
end;
$$;

create trigger trg_inv_notify_grn_status
  after update of status on public.inv_grns
  for each row
  when (old.status is distinct from new.status)
  execute function public.inv_notify_grn_status();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Trigger Function: Transfer → transfer_dispatched
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.inv_notify_transfer_status()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.status = 'in_transit' and old.status = 'approved' then
    insert into public.inv_notifications (tenant_id, record_type, record_id, event_type, recipient_id, title, message)
    values (new.tenant_id, 'transfer', new.id, 'transfer_dispatched', new.requested_by, 'Transfer Dispatched',
            'Transfer ' || new.transfer_number || ' has been dispatched.');
  end if;
  return new;
end;
$$;

create trigger trg_inv_notify_transfer_status
  after update of status on public.inv_transfers
  for each row
  when (old.status is distinct from new.status)
  execute function public.inv_notify_transfer_status();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Trigger Function: Return → return_posted
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.inv_notify_return_status()
returns trigger
language plpgsql
security definer
as $$
declare
  v_recipient uuid;
begin
  if new.status = 'posted' and old.status = 'inspected' then
    select responsible_user_id into v_recipient from public.inv_stores where id = new.store_id;
    insert into public.inv_notifications (tenant_id, record_type, record_id, event_type, recipient_id, title, message)
    values (new.tenant_id, 'return', new.id, 'return_posted', coalesce(v_recipient, new.returned_by), 'Return Posted',
            'Return ' || new.return_number || ' has been posted to stock.');
  end if;
  return new;
end;
$$;

create trigger trg_inv_notify_return_status
  after update of status on public.inv_returns
  for each row
  when (old.status is distinct from new.status)
  execute function public.inv_notify_return_status();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Trigger Function: Adjustment → approval_required (insert) / adjustment_posted (approve)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.inv_notify_adjustment_event()
returns trigger
language plpgsql
security definer
as $$
declare
  v_recipient uuid;
begin
  if tg_op = 'INSERT' then
    select responsible_user_id into v_recipient from public.inv_stores where id = new.store_id;
    insert into public.inv_notifications (tenant_id, record_type, record_id, event_type, recipient_id, title, message)
    values (new.tenant_id, 'adjustment', new.id, 'approval_required', v_recipient, 'Adjustment Approval Required',
            'Stock Adjustment ' || new.adjustment_number || ' requires approval.');
    return new;
  end if;

  if new.status = 'approved' and old.status = 'pending_approval' then
    insert into public.inv_notifications (tenant_id, record_type, record_id, event_type, recipient_id, title, message)
    values (new.tenant_id, 'adjustment', new.id, 'adjustment_posted', new.requested_by, 'Adjustment Posted',
            'Stock Adjustment ' || new.adjustment_number || ' has been approved and posted.');
  end if;
  return new;
end;
$$;

create trigger trg_inv_notify_adjustment_insert
  after insert on public.inv_adjustments
  for each row
  execute function public.inv_notify_adjustment_event();

create trigger trg_inv_notify_adjustment_update
  after update of status on public.inv_adjustments
  for each row
  when (old.status is distinct from new.status)
  execute function public.inv_notify_adjustment_event();

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Trigger Function: Stocktake → count_variance
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.inv_notify_stocktake_status()
returns trigger
language plpgsql
security definer
as $$
declare
  v_recipient uuid;
begin
  if new.status = 'completed' and old.status = 'pending_approval' and coalesce(new.total_variance_value, 0) <> 0 then
    select responsible_user_id into v_recipient from public.inv_stores where id = new.store_id;
    insert into public.inv_notifications (tenant_id, record_type, record_id, event_type, recipient_id, title, message)
    values (new.tenant_id, 'stocktake', new.id, 'count_variance', v_recipient, 'Stock Count Variance',
            'Stock Take ' || new.stocktake_number || ' completed with a variance value of ' || new.total_variance_value::text || '.');
  end if;
  return new;
end;
$$;

create trigger trg_inv_notify_stocktake_status
  after update of status on public.inv_stocktakes
  for each row
  when (old.status is distinct from new.status)
  execute function public.inv_notify_stocktake_status();

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Periodic (non-trigger) helpers: transfer_overdue / overdue_tool_return
--    These two events depend on wall-clock time crossing a due date, not on a row
--    being written — they cannot be pure AFTER INSERT/UPDATE triggers. Each function
--    is intended to be invoked by a scheduled job (pg_cron or an application-level
--    cron endpoint), e.g.:
--      select public.inv_flag_overdue_tool_issues();
--      select public.inv_flag_overdue_transfers();
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.inv_flag_overdue_tool_issues()
returns void
language plpgsql
security definer
as $$
declare
  r record;
begin
  for r in
    select id, tenant_id, custodian_id, due_date
    from public.inv_tool_issues
    where status = 'issued'
      and due_date < current_date
  loop
    update public.inv_tool_issues set status = 'overdue' where id = r.id;

    insert into public.inv_notifications (tenant_id, record_type, record_id, event_type, recipient_id, title, message)
    values (r.tenant_id, 'tool_issue', r.id, 'overdue_tool_return', r.custodian_id, 'Tool Return Overdue',
            'Tool issue is overdue for return (was due ' || r.due_date::text || ').');
  end loop;
end;
$$;

create or replace function public.inv_flag_overdue_transfers(p_days_in_transit integer default 3)
returns void
language plpgsql
security definer
as $$
declare
  r record;
begin
  for r in
    select id, tenant_id, transfer_number, requested_by, dispatched_at
    from public.inv_transfers
    where status = 'in_transit'
      and dispatched_at < now() - (p_days_in_transit || ' days')::interval
  loop
    insert into public.inv_notifications (tenant_id, record_type, record_id, event_type, recipient_id, title, message)
    values (r.tenant_id, 'transfer', r.id, 'transfer_overdue', r.requested_by, 'Transfer Overdue',
            'Transfer ' || r.transfer_number || ' has been in transit for more than ' || p_days_in_transit || ' days.');
  end loop;
end;
$$;

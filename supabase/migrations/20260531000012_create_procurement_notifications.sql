-- Procurement Notifications Table + Triggers
-- Fires on status changes in PR, PO, GR, Invoice Match tables

-- ─────────────────────────────────────────────────────────────
-- 1. Notifications Table
-- ─────────────────────────────────────────────────────────────
create table if not exists public.procurement_notifications (
  id             uuid primary key default gen_random_uuid(),
  record_type    text not null check (record_type in ('pr', 'po', 'gr', 'invoice_match')),
  record_id      uuid not null,
  event_type     text not null check (event_type in (
    'pr_submitted',
    'pr_approved',
    'pr_rejected',
    'pr_returned',
    'pr_budget_review',
    'po_issued',
    'po_delivered',
    'po_under_invoice_match',
    'po_closed',
    'gr_created',
    'gr_rejected',
    'invoice_variance_detected',
    'invoice_approved',
    'invoice_rejected'
  )),
  recipient_id   uuid references public.profiles(id) on delete set null,
  title          text not null,
  message        text,
  is_read        boolean not null default false,
  created_at     timestamptz not null default now()
);

create index if not exists idx_proc_notif_recipient on public.procurement_notifications(recipient_id, created_at desc);
create index if not exists idx_proc_notif_unread   on public.procurement_notifications(recipient_id) where is_read = false;

alter table public.procurement_notifications enable row level security;

create policy "Users can view their own notifications"
  on public.procurement_notifications for select
  to authenticated
  using (recipient_id = auth.uid());

create policy "Users can update their own notifications (mark read)"
  on public.procurement_notifications for update
  to authenticated
  using (recipient_id = auth.uid());

create policy "Trigger can insert notifications"
  on public.procurement_notifications for insert
  to authenticated
  with check (true);

-- ─────────────────────────────────────────────────────────────
-- 2. Trigger Function: PR Status Change → Notification
-- ─────────────────────────────────────────────────────────────
create or replace function public.proc_notify_pr_status_change()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.approval_status = 'submitted' and old.approval_status = 'draft' then
    insert into public.procurement_notifications (record_type, record_id, event_type, recipient_id, title, message)
    values ('pr', new.id, 'pr_submitted', new.approved_by, 'PR Submitted',
            'PR ' || new.pr_number || ' has been submitted for approval.');
  elsif new.approval_status = 'under_budget_review' then
    insert into public.procurement_notifications (record_type, record_id, event_type, recipient_id, title, message)
    values ('pr', new.id, 'pr_budget_review', new.requested_by, 'PR Under Budget Review',
            'PR ' || new.pr_number || ' requires budget check.');
  elsif new.approval_status = 'approved' and old.approval_status in ('submitted', 'under_budget_review') then
    insert into public.procurement_notifications (record_type, record_id, event_type, recipient_id, title, message)
    values ('pr', new.id, 'pr_approved', new.requested_by, 'PR Approved',
            'PR ' || new.pr_number || ' has been approved.');
  elsif new.approval_status = 'rejected' then
    insert into public.procurement_notifications (record_type, record_id, event_type, recipient_id, title, message)
    values ('pr', new.id, 'pr_rejected', new.requested_by, 'PR Rejected',
            'PR ' || new.pr_number || ' has been rejected.');
  elsif new.approval_status = 'returned' then
    insert into public.procurement_notifications (record_type, record_id, event_type, recipient_id, title, message)
    values ('pr', new.id, 'pr_returned', new.requested_by, 'PR Returned',
            'PR ' || new.pr_number || ' has been returned for revision.');
  end if;
  return new;
end;
$$;

create trigger trg_proc_notify_pr_status
  after update of approval_status on public.procurement_prs
  for each row
  when (old.approval_status is distinct from new.approval_status)
  execute function public.proc_notify_pr_status_change();

-- ─────────────────────────────────────────────────────────────
-- 3. Trigger Function: PO Status Change → Notification
-- ─────────────────────────────────────────────────────────────
create or replace function public.proc_notify_po_status_change()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.status = 'issued' and old.status in ('approved', 'submitted') then
    insert into public.procurement_notifications (record_type, record_id, event_type, recipient_id, title, message)
    values ('po', new.id, 'po_issued', new.issued_by, 'PO Issued',
            'PO ' || new.po_number || ' has been issued to supplier.');
  elsif new.status = 'delivered' then
    insert into public.procurement_notifications (record_type, record_id, event_type, recipient_id, title, message)
    values ('po', new.id, 'po_delivered', new.issued_by, 'PO Delivered',
            'PO ' || new.po_number || ' has been fully delivered.');
  elsif new.status = 'under_invoice_match' then
    insert into public.procurement_notifications (record_type, record_id, event_type, recipient_id, title, message)
    values ('po', new.id, 'po_under_invoice_match', new.issued_by, 'PO Pending Invoice Match',
            'PO ' || new.po_number || ' is awaiting invoice matching.');
  elsif new.status = 'closed' and old.status in ('delivered', 'under_invoice_match') then
    insert into public.procurement_notifications (record_type, record_id, event_type, recipient_id, title, message)
    values ('po', new.id, 'po_closed', new.issued_by, 'PO Closed',
            'PO ' || new.po_number || ' has been closed.');
  end if;
  return new;
end;
$$;

create trigger trg_proc_notify_po_status
  after update of status on public.procurement_pos
  for each row
  when (old.status is distinct from new.status)
  execute function public.proc_notify_po_status_change();

-- ─────────────────────────────────────────────────────────────
-- 4. Trigger Function: GR → Notification
-- ─────────────────────────────────────────────────────────────
create or replace function public.proc_notify_gr_event()
returns trigger
language plpgsql
security definer
as $$
declare
  v_po_number text;
begin
  select p.po_number into v_po_number
  from public.procurement_po_items pi
  join public.procurement_pos p on p.id = pi.po_id
  where pi.id = new.po_item_id;

  if new.inspection_result = 'failed' then
    insert into public.procurement_notifications (record_type, record_id, event_type, recipient_id, title, message)
    values ('gr', new.id, 'gr_rejected', null, 'Goods Rejected',
            'Goods receipt #' || new.id || ' failed inspection.');
  else
    insert into public.procurement_notifications (record_type, record_id, event_type, recipient_id, title, message)
    values ('gr', new.id, 'gr_created', null, 'Goods Received',
            'Goods received for PO ' || coalesce(v_po_number, ''));
  end if;
  return new;
end;
$$;

create trigger trg_proc_notify_gr
  after insert on public.procurement_goods_receipts
  for each row
  execute function public.proc_notify_gr_event();

-- ─────────────────────────────────────────────────────────────
-- 5. Trigger Function: Invoice Match → Notification
-- ─────────────────────────────────────────────────────────────
create or replace function public.proc_notify_invoice_event()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.status = 'variance_detected' then
    insert into public.procurement_notifications (record_type, record_id, event_type, recipient_id, title, message)
    values ('invoice_match', new.id, 'invoice_variance_detected', new.approved_by, 'Invoice Variance Detected',
            'Invoice ' || new.invoice_ref || ' has a variance of $' || round(abs(coalesce(new.variance_amount, 0)), 2)::text || '.');
  elsif new.status = 'approved' then
    insert into public.procurement_notifications (record_type, record_id, event_type, recipient_id, title, message)
    values ('invoice_match', new.id, 'invoice_approved', null, 'Invoice Approved',
            'Invoice ' || new.invoice_ref || ' has been approved for payment.');
  elsif new.status = 'rejected' then
    insert into public.procurement_notifications (record_type, record_id, event_type, recipient_id, title, message)
    values ('invoice_match', new.id, 'invoice_rejected', null, 'Invoice Rejected',
            'Invoice ' || new.invoice_ref || ' has been rejected.');
  end if;
  return new;
end;
$$;

create trigger trg_proc_notify_invoice_insert
  after insert on public.procurement_invoice_matches
  for each row
  execute function public.proc_notify_invoice_event();

create trigger trg_proc_notify_invoice_update
  after update of status on public.procurement_invoice_matches
  for each row
  when (new.status is distinct from old.status)
  execute function public.proc_notify_invoice_event();

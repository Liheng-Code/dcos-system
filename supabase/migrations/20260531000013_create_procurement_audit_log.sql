-- Procurement Audit Log Table + Triggers
-- Captures all INSERT/UPDATE/DELETE on procurement tables

-- ─────────────────────────────────────────────────────────────
-- 1. Audit Log Table
-- ─────────────────────────────────────────────────────────────
create table if not exists public.procurement_audit_log (
  id          uuid primary key default gen_random_uuid(),
  table_name  text not null,
  record_id   uuid not null,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data    jsonb,
  new_data    jsonb,
  changed_by  uuid references public.profiles(id) on delete set null,
  changed_at  timestamptz not null default now()
);

create index if not exists idx_proc_audit_table   on public.procurement_audit_log(table_name, changed_at desc);
create index if not exists idx_proc_audit_record  on public.procurement_audit_log(record_id);
create index if not exists idx_proc_audit_user    on public.procurement_audit_log(changed_by);

alter table public.procurement_audit_log enable row level security;

create policy "Authenticated users can view audit log"
  on public.procurement_audit_log for select
  to authenticated
  using (true);

create policy "Trigger can insert audit log"
  on public.procurement_audit_log for insert
  to authenticated
  with check (true);

-- ─────────────────────────────────────────────────────────────
-- 2. Generic Audit Trigger Function
-- ─────────────────────────────────────────────────────────────
create or replace function public.proc_audit_trigger()
returns trigger
language plpgsql
security definer
as $$
declare
  v_action text;
  v_old_data jsonb;
  v_new_data jsonb;
begin
  if tg_op = 'INSERT' then
    v_action := 'INSERT';
    v_old_data := null;
    v_new_data := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_action := 'UPDATE';
    v_old_data := to_jsonb(old);
    v_new_data := to_jsonb(new);
  elsif tg_op = 'DELETE' then
    v_action := 'DELETE';
    v_old_data := to_jsonb(old);
    v_new_data := null;
  end if;

  insert into public.procurement_audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  values (tg_table_name, coalesce(new.id, old.id), v_action, v_old_data, v_new_data, auth.uid());

  return coalesce(new, old);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. Attach Trigger to All Procurement Tables
-- ─────────────────────────────────────────────────────────────
create trigger trg_proc_audit_suppliers
  after insert or update or delete on public.procurement_suppliers
  for each row execute function public.proc_audit_trigger();

create trigger trg_proc_audit_prs
  after insert or update or delete on public.procurement_prs
  for each row execute function public.proc_audit_trigger();

create trigger trg_proc_audit_pr_items
  after insert or update or delete on public.procurement_pr_items
  for each row execute function public.proc_audit_trigger();

create trigger trg_proc_audit_pos
  after insert or update or delete on public.procurement_pos
  for each row execute function public.proc_audit_trigger();

create trigger trg_proc_audit_po_items
  after insert or update or delete on public.procurement_po_items
  for each row execute function public.proc_audit_trigger();

create trigger trg_proc_audit_delivery_notes
  after insert or update or delete on public.procurement_delivery_notes
  for each row execute function public.proc_audit_trigger();

create trigger trg_proc_audit_goods_receipts
  after insert or update or delete on public.procurement_goods_receipts
  for each row execute function public.proc_audit_trigger();

create trigger trg_proc_audit_rfqs
  after insert or update or delete on public.procurement_rfqs
  for each row execute function public.proc_audit_trigger();

create trigger trg_proc_audit_rfq_suppliers
  after insert or update or delete on public.procurement_rfq_suppliers
  for each row execute function public.proc_audit_trigger();

create trigger trg_proc_audit_quotations
  after insert or update or delete on public.procurement_quotations
  for each row execute function public.proc_audit_trigger();

create trigger trg_proc_audit_quotation_items
  after insert or update or delete on public.procurement_quotation_items
  for each row execute function public.proc_audit_trigger();

create trigger trg_proc_audit_invoice_matches
  after insert or update or delete on public.procurement_invoice_matches
  for each row execute function public.proc_audit_trigger();

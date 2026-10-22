-- Migration: 20261022130910_procurement_p0_audit_lockdown.sql
-- Purpose: Procurement hardening P0 (doc 13, F7 + F14).
--   1. Close the audit log to client inserts (the definer trigger is the only writer).
--   2. Audit the budget confirmation tables like every other procurement table.
--   3. Pin search_path on the existing security definer audit/notify trigger functions.
-- Depends on: procurement_audit_log, proc_audit_trigger, procurement_budget_confirmations(+_items)
-- Additive and idempotent. No tenant_id in this system.

-- 1. No client insert into the audit log. proc_audit_trigger is security definer (owner bypasses RLS).
drop policy if exists "Trigger can insert audit log" on public.procurement_audit_log;

-- 2. Audit triggers on the budget confirmation tables.
drop trigger if exists trg_proc_audit_budget_confirmations on public.procurement_budget_confirmations;
create trigger trg_proc_audit_budget_confirmations
  after insert or update or delete on public.procurement_budget_confirmations
  for each row execute function public.proc_audit_trigger();

drop trigger if exists trg_proc_audit_budget_confirmation_items on public.procurement_budget_confirmation_items;
create trigger trg_proc_audit_budget_confirmation_items
  after insert or update or delete on public.procurement_budget_confirmation_items
  for each row execute function public.proc_audit_trigger();

-- 3. Security definer functions must not resolve names through a caller-controlled search_path.
--    Bodies already schema-qualify every table, so this changes no behaviour.
alter function public.proc_audit_trigger()             set search_path = public;
alter function public.proc_notify_pr_status_change()   set search_path = public;
alter function public.proc_notify_po_status_change()   set search_path = public;
alter function public.proc_notify_invoice_event()      set search_path = public;
alter function public.proc_notify_gr_event()           set search_path = public;

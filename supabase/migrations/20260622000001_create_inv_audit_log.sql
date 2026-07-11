-- Migration: 20260622000001_create_inv_audit_log.sql
-- Purpose: Append-only audit log for the INV module
-- Pattern: matches overtime_audit_log, procurement_audit_log — per-module table,
--          direct application inserts, no UPDATE/DELETE granted.

create table if not exists public.inv_audit_log (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        not null,
  table_name   text        not null,
  record_id    uuid        not null,
  action       text        not null,
  old_status   text,
  new_status   text,
  performed_by uuid        not null references public.profiles(id) on delete restrict,
  details      jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists inv_audit_log_tenant_record_idx
  on public.inv_audit_log(tenant_id, record_id);

create index if not exists inv_audit_log_tenant_table_idx
  on public.inv_audit_log(tenant_id, table_name, created_at desc);

alter table public.inv_audit_log enable row level security;

-- Authenticated users can read audit records for their own tenant
create policy "inv_audit_log_select" on public.inv_audit_log
  for select to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Application layer inserts audit records
create policy "inv_audit_log_insert" on public.inv_audit_log
  for insert to authenticated
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- No UPDATE or DELETE — append-only by policy

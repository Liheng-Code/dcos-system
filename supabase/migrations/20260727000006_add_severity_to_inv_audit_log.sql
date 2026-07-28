-- Migration: 20260727000006_add_severity_to_inv_audit_log.sql
-- Purpose: CWIMS Stage 1+2 gap-closure — add severity classification to inv_audit_log
-- Depends on: inv_audit_log (20260622000001_create_inv_audit_log.sql)

alter table public.inv_audit_log
  add column if not exists severity text not null default 'medium';

alter table public.inv_audit_log
  drop constraint if exists inv_audit_log_severity_check;

alter table public.inv_audit_log
  add constraint inv_audit_log_severity_check
  check (severity in ('low','medium','high','critical'));

create index if not exists inv_audit_log_tenant_severity_idx
  on public.inv_audit_log(tenant_id, severity, created_at desc);

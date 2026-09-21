-- Migration: 20260919000002_planning_audit_index.sql
-- Purpose: Planning & Scheduling Completion Plan, Phase 1, item 1.1 — index
--          to support the new "Schedule Change Log" project-level audit view
--          (queries filter by project_id, order by created_at desc).
-- Depends on: public.wbs_audit_log (20260527000016_create_wbs_enterprise_tables.sql)
--
-- Schema verification: confirmed against 20260527000016_create_wbs_enterprise_tables.sql
-- — public.wbs_audit_log(id, wbs_node_id, wbs_task_id, project_id not null,
-- user_id, action, field_name, old_value, new_value, created_at). Column
-- names/casing match the plan's assumption exactly; no changes needed.

create index if not exists idx_wbs_audit_log_project_created
  on public.wbs_audit_log(project_id, created_at desc);

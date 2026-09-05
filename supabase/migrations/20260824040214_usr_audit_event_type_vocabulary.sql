-- Migration: 20260824040214_usr_audit_event_type_vocabulary.sql
-- Purpose: Documentation-only migration. user_audit_logs.event_type is free-text
--          (verified: no CHECK constraint exists on it in this project, confirmed
--          via pg_constraint inspection before writing this file) so no schema
--          change is required to support the new module 02-USR event types.
--          This migration records the canonical vocabulary as a column comment so
--          it is discoverable from the schema itself, matching
--          04-Database-Schema.md §9.
-- Depends on: public.user_audit_logs (20260606000002_user_management_gaps.sql)

comment on column public.user_audit_logs.event_type is
  'Free-text (no CHECK constraint — intentional). Canonical module 02-USR values: '
  'account_invited, account_activated, password_changed, password_reset_requested, '
  'password_reset_completed, force_reset_triggered, account_locked, '
  'account_unlocked, account_suspended, account_disabled, '
  'account_auto_disabled_inactivity (actor_id NULL = system-initiated), '
  'session_revoked. Pre-existing value (unchanged by this module): '
  'employment_status_changed. See '
  'docs/04-Business-Modules/02-USR-User-Management/04-Database-Schema.md §9.';

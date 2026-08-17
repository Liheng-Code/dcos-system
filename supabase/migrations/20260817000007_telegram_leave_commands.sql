-- Migration: 20260817000007_telegram_leave_commands.sql
-- Purpose: Widen public.task_alerts so it can carry Leave module alerts
--          (leave_pending_approval / leave_request_approved / leave_request_rejected),
--          reusing the existing Database Webhook -> notify-task edge function
--          delivery pipeline (email via Resend + Telegram via Bot API, based on
--          each recipient's profiles.notification_preferences) instead of building
--          a second, parallel notification channel.
--
-- Depends on: public.task_alerts (20260527000024_create_task_alerts.sql,
--             alert_type widened in 20260608000003_update_alert_trigger.sql).
--
-- task_alerts was created WBS-task-specific: project_id, wbs_task_id, task_code,
-- and task_name are all `not null`, which makes it physically impossible to
-- insert a leave alert (leave requests aren't projects/wbs_tasks) without this
-- change. Dropping NOT NULL is safe for existing rows -- it's a constraint
-- removal, not a data change, and the WBS-generated trigger
-- (create_task_alert_from_audit) always populates all four columns anyway, so
-- existing task_alerts rows and behavior are unaffected.

alter table public.task_alerts
  alter column project_id  drop not null,
  alter column wbs_task_id drop not null,
  alter column task_code   drop not null,
  alter column task_name   drop not null;

alter table public.task_alerts
  drop constraint if exists task_alerts_alert_type_check;

alter table public.task_alerts
  add constraint task_alerts_alert_type_check
  check (alert_type in (
    -- Existing WBS task alert types (unchanged)
    'task_assigned',
    'task_reassigned',
    'task_assignment_accepted',
    'task_assignment_rejected',
    'task_submitted',
    'task_approved',
    'task_rejected',
    'task_progress_updated',
    'task_overdue',
    -- New: Leave module alert types
    'leave_pending_approval', -- to whichever approver's turn it is (request submitted, or approver_1 just approved a 2-step chain)
    'leave_request_approved', -- to employee, on final approval
    'leave_request_rejected'  -- to employee, on rejection by either approver
  ));

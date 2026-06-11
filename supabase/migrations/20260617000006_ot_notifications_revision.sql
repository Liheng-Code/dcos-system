-- ============================================================
-- OT Notifications & Revision Flow (Phase 1.1 + 3.1)
-- ============================================================

-- 1. Add is_read column to overtime_notifications (Phase 1.1)
alter table if exists public.overtime_notifications
  add column if not exists is_read boolean not null default false;

create index if not exists idx_ot_notif_read on public.overtime_notifications(recipient_id, is_read)
  where is_read = false;

-- 2. Add needs_revision to overtime_requests status check (Phase 3.1)
alter table if exists public.overtime_requests
  drop constraint if exists overtime_requests_status_check;

alter table if exists public.overtime_requests
  add constraint overtime_requests_status_check
    check (status in (
      'draft', 'submitted', 'approved', 'rejected', 'cancelled',
      'in_progress', 'completed', 'verified', 'paid', 'needs_revision'
    ));

-- 3. Add request_needs_revision to overtime_notifications event_type check
alter table if exists public.overtime_notifications
  drop constraint if exists overtime_notifications_event_type_check;

alter table if exists public.overtime_notifications
  add constraint overtime_notifications_event_type_check
    check (event_type in (
      'request_submitted', 'request_approved', 'request_rejected',
      'request_verified', 'request_paid', 'request_cancelled',
      'request_needs_revision'
    ));

-- 4. Add cancelled to overtime_approvals status check (for orphan cleanup)
alter table if exists public.overtime_approvals
  drop constraint if exists overtime_approvals_status_check;

alter table if exists public.overtime_approvals
  add constraint overtime_approvals_status_check
    check (status in ('pending', 'approved', 'rejected', 'cancelled'));

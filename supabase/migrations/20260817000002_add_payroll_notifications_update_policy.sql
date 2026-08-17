-- Migration: 20260817000002_add_payroll_notifications_update_policy.sql
-- Purpose: Add missing UPDATE RLS policy on payroll_notifications so recipients
--          can mark their own notifications read (sent_at timestamp toggle) from
--          the Payroll Notifications inbox UI. Table currently only has SELECT
--          (pnotif_own_read) and INSERT (pnotif_hr_write) policies, so the
--          client-side "mark as read" UPDATE is silently blocked by RLS default-deny.
-- Depends on: payroll_notifications (supabase/migrations/20260618000004_payroll_enhancements.sql, section 4)

CREATE POLICY "pnotif_own_update" ON payroll_notifications
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

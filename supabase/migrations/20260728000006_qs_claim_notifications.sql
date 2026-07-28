-- IPC approval-chain notifications. The QS module has no notification
-- infrastructure at all today; this mirrors procurement_notifications'
-- table+trigger shape. Since claim approval is role-gated (not assigned to a
-- named user — see qs_claim_approvals/canActOnStep), a status-change trigger
-- fans out to every user holding the relevant role via user_roles, rather
-- than targeting a single recipient column.

CREATE TABLE IF NOT EXISTS public.qs_notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type  TEXT NOT NULL CHECK (record_type IN ('claim')),
  record_id    UUID NOT NULL,
  event_type   TEXT NOT NULL CHECK (event_type IN
    ('claim_internal_review','claim_pm_endorsed','claim_rejected')),
  recipient_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  message      TEXT,
  is_read      BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.qs_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qs_notif_select_own" ON public.qs_notifications
  FOR SELECT TO authenticated USING (recipient_id = auth.uid());
CREATE POLICY "qs_notif_update_own" ON public.qs_notifications
  FOR UPDATE TO authenticated USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());
CREATE POLICY "qs_notif_insert" ON public.qs_notifications
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_qs_notif_recipient ON public.qs_notifications(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qs_notif_unread    ON public.qs_notifications(recipient_id) WHERE is_read = false;

CREATE OR REPLACE FUNCTION public.qs_notify_claim_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF new.status = 'internal_review' AND old.status = 'draft' THEN
    INSERT INTO public.qs_notifications (record_type, record_id, event_type, recipient_id, title, message)
    SELECT 'claim', new.id, 'claim_internal_review', ur.user_id, 'IPC Pending QS Review',
           'IPC #' || new.claim_number || ' is awaiting QS Manager review.'
    FROM public.user_roles ur WHERE ur.role_code IN ('QS','L0','L1','L2');
  ELSIF new.status = 'pm_endorsed' AND old.status = 'internal_review' THEN
    INSERT INTO public.qs_notifications (record_type, record_id, event_type, recipient_id, title, message)
    SELECT 'claim', new.id, 'claim_pm_endorsed', ur.user_id, 'IPC PM-Endorsed',
           'IPC #' || new.claim_number || ' has been endorsed and is ready to submit to the client.'
    FROM public.user_roles ur WHERE ur.role_code IN ('L3','L0','L1','L2');
  ELSIF new.status = 'rejected' THEN
    INSERT INTO public.qs_notifications (record_type, record_id, event_type, recipient_id, title, message)
    VALUES ('claim', new.id, 'claim_rejected', new.submitted_by, 'IPC Rejected',
            'IPC #' || new.claim_number || ' was rejected: ' || coalesce(new.rejection_reason, ''));
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_qs_notify_claim_status ON public.qs_progress_claims;
CREATE TRIGGER trg_qs_notify_claim_status
  AFTER UPDATE OF status ON public.qs_progress_claims
  FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status)
  EXECUTE FUNCTION public.qs_notify_claim_status_change();

-- Gap fixes for SOP-UM-001 compliance
-- 1. Auto-generated User Code (USR-000001 format) — separate from HR-assigned Employee ID
-- 2. Password change tracking column
-- 3. User audit log table for lifecycle event history

-- ─── 1. User Code (system-generated) ─────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS public.profiles_user_code_seq START 1;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_code text UNIQUE;

CREATE OR REPLACE FUNCTION public.fn_assign_user_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_code IS NULL THEN
    NEW.user_code := 'USR-' || LPAD(nextval('public.profiles_user_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_user_code ON public.profiles;
CREATE TRIGGER trg_assign_user_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION fn_assign_user_code();

-- Backfill existing rows in creation order
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.profiles
    WHERE user_code IS NULL
    ORDER BY created_at NULLS LAST, id
  LOOP
    UPDATE public.profiles
      SET user_code = 'USR-' || LPAD(nextval('public.profiles_user_code_seq')::text, 6, '0')
    WHERE id = r.id;
  END LOOP;
END;
$$;

-- ─── 2. Password change tracking ──────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;

-- ─── 3. User Audit Log ────────────────────────────────────────────────────────
-- Records lifecycle events: account created, status changed, role assigned/removed,
-- session revoked, employment updated, etc.

CREATE TABLE IF NOT EXISTS public.user_audit_logs (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text        NOT NULL,
  old_value  jsonb,
  new_value  jsonb,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ual_user_id    ON public.user_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ual_created_at ON public.user_audit_logs(created_at DESC);

ALTER TABLE public.user_audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read all audit logs
CREATE POLICY "ual_admin_read" ON public.user_audit_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Users can read their own audit entries
CREATE POLICY "ual_self_read" ON public.user_audit_logs
  FOR SELECT USING (user_id = auth.uid());

-- Service role (admin client) handles all inserts — no row-level INSERT policy needed

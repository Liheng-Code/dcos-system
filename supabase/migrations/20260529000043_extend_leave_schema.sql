-- ============================================================
-- Extend Leave Management Schema
-- Adds: 14 new columns to leave_types, cancellation/half-day
-- fields to leave_requests, 7 new tables for full workflow
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- A. Extend leave_types with 14 configuration columns
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.leave_types
  ADD COLUMN IF NOT EXISTS gender_restriction       TEXT    NOT NULL DEFAULT 'all'
    CHECK (gender_restriction IN ('all', 'male', 'female')),
  ADD COLUMN IF NOT EXISTS probation_required       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requires_document        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS half_day_allowed         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS skip_team_capacity       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS max_days_per_request     NUMERIC NOT NULL DEFAULT 0,  -- 0 = unlimited
  ADD COLUMN IF NOT EXISTS advance_notice_days      INT     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_accrual          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS monthly_accrual_amount   NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accrual_day_of_month     INT     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deduct_from_type_id      UUID    REFERENCES public.leave_types(id),
  ADD COLUMN IF NOT EXISTS is_replacement_leave     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS carryover_expiry_month   INT     NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS seniority_based          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Update existing leave types with sensible defaults
UPDATE public.leave_types SET
  half_day_allowed     = TRUE,
  is_active            = TRUE,
  skip_team_capacity   = FALSE,
  advance_notice_days  = 1
WHERE leave_code = 'ANNUAL';

UPDATE public.leave_types SET
  half_day_allowed     = TRUE,
  skip_team_capacity   = TRUE,  -- sick leave bypasses team capacity
  is_active            = TRUE,
  advance_notice_days  = 0
WHERE leave_code = 'SICK';

UPDATE public.leave_types SET
  skip_team_capacity   = TRUE,
  half_day_allowed     = FALSE,
  is_active            = TRUE
WHERE leave_code IN ('MATERNITY', 'PATERNITY');

UPDATE public.leave_types SET
  is_replacement_leave = TRUE,
  skip_team_capacity   = FALSE,
  half_day_allowed     = TRUE,
  is_active            = TRUE
WHERE leave_code = 'COMPENSATION';

UPDATE public.leave_types SET
  half_day_allowed = TRUE,
  is_active        = TRUE
WHERE leave_code IN ('EMERGENCY', 'UNPAID', 'BUSINESS');

-- ─────────────────────────────────────────────────────────────
-- B. Extend leave_requests with new status values + fields
-- ─────────────────────────────────────────────────────────────

-- Drop existing check constraint to add new status values
ALTER TABLE public.leave_requests
  DROP CONSTRAINT IF EXISTS leave_requests_status_check;

ALTER TABLE public.leave_requests
  ADD CONSTRAINT leave_requests_status_check
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled', 'withdrawn', 'pending_cancellation'));

-- Add new columns
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS is_half_day           BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS half_day_period       TEXT        CHECK (half_day_period IN ('morning', 'afternoon')),
  ADD COLUMN IF NOT EXISTS cancellation_reason   TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_date     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_approved_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS withdrawal_date       TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────
-- C1. Approver Configuration
-- Maps employee / department → approver (3-level cascade)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leave_approver_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_type     TEXT NOT NULL CHECK (config_type IN ('personal', 'department', 'company_default')),
  employee_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE,  -- for personal
  department_id   UUID REFERENCES public.departments(id) ON DELETE CASCADE, -- for department
  approver_level  INT  NOT NULL DEFAULT 1 CHECK (approver_level BETWEEN 1 AND 5),
  approver_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_approver_config_employee    ON public.leave_approver_config(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_approver_config_department  ON public.leave_approver_config(department_id);
CREATE INDEX IF NOT EXISTS idx_leave_approver_config_type        ON public.leave_approver_config(config_type);

-- ─────────────────────────────────────────────────────────────
-- C2. Team Capacity Configuration
-- Max % of department that can be on leave at once
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leave_team_capacity (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id   UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  max_percent     NUMERIC NOT NULL DEFAULT 50 CHECK (max_percent BETWEEN 0 AND 100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(department_id)
);

CREATE TABLE IF NOT EXISTS public.leave_capacity_exceptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_type  TEXT NOT NULL CHECK (exception_type IN ('date_override', 'employee_exception')),
  department_id   UUID REFERENCES public.departments(id) ON DELETE CASCADE,
  employee_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  exception_date  DATE,
  override_percent NUMERIC CHECK (override_percent BETWEEN 0 AND 100),
  notes           TEXT,
  created_by      UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_capacity_dept   ON public.leave_team_capacity(department_id);
CREATE INDEX IF NOT EXISTS idx_leave_exceptions_date ON public.leave_capacity_exceptions(exception_date);

-- ─────────────────────────────────────────────────────────────
-- C3. Seniority Rules
-- Years of service → annual leave days entitlement
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leave_seniority_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_type_id   UUID NOT NULL REFERENCES public.leave_types(id) ON DELETE CASCADE,
  min_years       INT  NOT NULL DEFAULT 0,
  max_years       INT,   -- NULL = no upper limit
  days_per_year   NUMERIC NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(leave_type_id, min_years)
);

CREATE INDEX IF NOT EXISTS idx_leave_seniority_type ON public.leave_seniority_rules(leave_type_id);

-- Seed default seniority rules for Annual Leave
INSERT INTO public.leave_seniority_rules (leave_type_id, min_years, max_years, days_per_year)
SELECT id, 0,  2,  14 FROM public.leave_types WHERE leave_code = 'ANNUAL'
UNION ALL
SELECT id, 3,  5,  16 FROM public.leave_types WHERE leave_code = 'ANNUAL'
UNION ALL
SELECT id, 6,  10, 18 FROM public.leave_types WHERE leave_code = 'ANNUAL'
UNION ALL
SELECT id, 11, NULL, 20 FROM public.leave_types WHERE leave_code = 'ANNUAL'
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- C4. Year-End Processing Logs
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leave_year_end_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  from_year       INT  NOT NULL,
  to_year         INT  NOT NULL,
  employee_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  leave_type_id   UUID NOT NULL REFERENCES public.leave_types(id),
  days_used       NUMERIC NOT NULL DEFAULT 0,
  days_remaining  NUMERIC NOT NULL DEFAULT 0,
  days_carried    NUMERIC NOT NULL DEFAULT 0,
  days_expired    NUMERIC NOT NULL DEFAULT 0,
  run_by          UUID REFERENCES public.profiles(id),
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_leave_year_end_employee ON public.leave_year_end_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_year_end_year     ON public.leave_year_end_logs(from_year, to_year);

-- ─────────────────────────────────────────────────────────────
-- C5. Notification Queue
-- Stores notifications for 7 leave event types (mock — no actual email yet)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leave_notifications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id UUID NOT NULL REFERENCES public.leave_requests(id) ON DELETE CASCADE,
  event_type       TEXT NOT NULL CHECK (event_type IN (
    'request_submitted',     -- ① to approver
    'request_approved',      -- ② to employee
    'request_rejected',      -- ③ to employee
    'request_withdrawn',     -- ④ to approver
    'cancellation_requested',-- ⑤ to approver
    'cancellation_approved', -- ⑥ to approver
    'cancellation_denied'    -- ⑦ to employee
  )),
  recipient_id     UUID NOT NULL REFERENCES public.profiles(id),
  recipient_email  TEXT,
  recipient_name   TEXT,
  subject          TEXT,
  body             TEXT,
  queued_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at          TIMESTAMPTZ,  -- NULL = pending
  error_message    TEXT
);

CREATE INDEX IF NOT EXISTS idx_leave_notifications_request  ON public.leave_notifications(leave_request_id);
CREATE INDEX IF NOT EXISTS idx_leave_notifications_pending  ON public.leave_notifications(sent_at) WHERE sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leave_notifications_event    ON public.leave_notifications(event_type);

-- ─────────────────────────────────────────────────────────────
-- D. RLS Policies
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.leave_approver_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_team_capacity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_capacity_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_seniority_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_year_end_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_notifications ENABLE ROW LEVEL SECURITY;

-- Approver config: all authenticated can view (needed for resolution), HR manages
CREATE POLICY "leave_approver_config_view"
  ON public.leave_approver_config FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "leave_approver_config_manage"
  ON public.leave_approver_config FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')));

-- Team capacity: all view, HR manages
CREATE POLICY "leave_team_capacity_view"
  ON public.leave_team_capacity FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "leave_team_capacity_manage"
  ON public.leave_team_capacity FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')));

-- Capacity exceptions: all view, HR manages
CREATE POLICY "leave_capacity_exceptions_view"
  ON public.leave_capacity_exceptions FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "leave_capacity_exceptions_manage"
  ON public.leave_capacity_exceptions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')));

-- Seniority rules: all view, HR manages
CREATE POLICY "leave_seniority_rules_view"
  ON public.leave_seniority_rules FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "leave_seniority_rules_manage"
  ON public.leave_seniority_rules FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')));

-- Year-end logs: employees view own, HR views all
CREATE POLICY "leave_year_end_logs_view_own"
  ON public.leave_year_end_logs FOR SELECT TO authenticated
  USING (employee_id = auth.uid());
CREATE POLICY "leave_year_end_logs_view_hr"
  ON public.leave_year_end_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')));
CREATE POLICY "leave_year_end_logs_manage"
  ON public.leave_year_end_logs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')));

-- Notifications: recipients view own, HR views all
CREATE POLICY "leave_notifications_view_own"
  ON public.leave_notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());
CREATE POLICY "leave_notifications_view_hr"
  ON public.leave_notifications FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')));
CREATE POLICY "leave_notifications_insert"
  ON public.leave_notifications FOR INSERT TO authenticated
  WITH CHECK (TRUE);  -- system inserts on behalf of users

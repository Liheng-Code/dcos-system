-- SOP-STK compliance migration
-- 1. Internal vs External category + SOP type codes (CLI, CON, MC, SUB, SUP, AUT, TST, FM, INT)
-- 2. Company master fields: General, Commercial, Compliance
-- 3. stakeholder_teams table (Company → Teams layer)
-- 4. HR profile link on stakeholder_staff

-- ─── 1. Category column ───────────────────────────────────────────────────────

ALTER TABLE public.stakeholders
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'external';

-- ─── 2. Migrate old type strings → SOP codes, set category ───────────────────

ALTER TABLE public.stakeholders
  DROP CONSTRAINT IF EXISTS stakeholders_stakeholder_type_check;

UPDATE public.stakeholders SET
  stakeholder_type = CASE stakeholder_type
    WHEN 'client'              THEN 'CLI'
    WHEN 'project_manager'     THEN 'CON'
    WHEN 'contractor'          THEN 'MC'
    WHEN 'architect'           THEN 'CON'
    WHEN 'subcontractor'       THEN 'SUB'
    WHEN 'supplier'            THEN 'SUP'
    WHEN 'authority'           THEN 'AUT'
    WHEN 'consultant'          THEN 'CON'
    WHEN 'testing_agency'      THEN 'TST'
    WHEN 'utility'             THEN 'AUT'
    WHEN 'insurance'           THEN 'SUP'
    WHEN 'internal_department' THEN 'INT'
    ELSE stakeholder_type
  END,
  category = CASE stakeholder_type
    WHEN 'internal_department' THEN 'internal'
    ELSE 'external'
  END
WHERE stakeholder_type IN (
  'client', 'project_manager', 'contractor', 'architect',
  'subcontractor', 'supplier', 'authority', 'consultant',
  'testing_agency', 'utility', 'insurance', 'internal_department'
);

ALTER TABLE public.stakeholders
  ADD CONSTRAINT stakeholders_type_sop_check
  CHECK (stakeholder_type IN ('CLI','CON','MC','SUB','SUP','AUT','TST','FM','INT'));

ALTER TABLE public.stakeholders
  ADD CONSTRAINT stakeholders_category_check
  CHECK (category IN ('internal','external'));

-- ─── 3. General Information fields ───────────────────────────────────────────

ALTER TABLE public.stakeholders
  ADD COLUMN IF NOT EXISTS short_name          text,
  ADD COLUMN IF NOT EXISTS company_code        text,
  ADD COLUMN IF NOT EXISTS registration_number text,
  ADD COLUMN IF NOT EXISTS tax_number          text,
  ADD COLUMN IF NOT EXISTS website             text,
  ADD COLUMN IF NOT EXISTS country             text,
  ADD COLUMN IF NOT EXISTS province            text,
  ADD COLUMN IF NOT EXISTS city                text;

-- ─── 4. Commercial fields (external companies) ────────────────────────────────

ALTER TABLE public.stakeholders
  ADD COLUMN IF NOT EXISTS credit_terms        text,
  ADD COLUMN IF NOT EXISTS payment_terms       text,
  ADD COLUMN IF NOT EXISTS currency            text DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS contract_capacity   text,
  ADD COLUMN IF NOT EXISTS business_categories text[];

-- ─── 5. Compliance / Licence fields (external companies) ─────────────────────

ALTER TABLE public.stakeholders
  ADD COLUMN IF NOT EXISTS business_license_number text,
  ADD COLUMN IF NOT EXISTS business_license_expiry  date,
  ADD COLUMN IF NOT EXISTS insurance_cert_number    text,
  ADD COLUMN IF NOT EXISTS insurance_expiry         date,
  ADD COLUMN IF NOT EXISTS trade_license_number     text,
  ADD COLUMN IF NOT EXISTS trade_license_expiry     date;

-- ─── 6. Approval status for registration workflow ────────────────────────────

ALTER TABLE public.stakeholders
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved';

ALTER TABLE public.stakeholders
  ADD CONSTRAINT stakeholders_approval_status_check
  CHECK (approval_status IN ('draft','pending_review','approved','rejected'));

-- Backfill any NULLs (DEFAULT handles new rows)
UPDATE public.stakeholders SET approval_status = 'approved'
  WHERE approval_status IS NULL;

-- ─── 7. Teams layer ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.stakeholder_teams (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  stakeholder_id uuid        NOT NULL REFERENCES public.stakeholders(id) ON DELETE CASCADE,
  team_code      text,
  team_name      text        NOT NULL,
  department     text,
  description    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stk_teams_stakeholder
  ON public.stakeholder_teams(stakeholder_id);

ALTER TABLE public.stakeholder_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stk_teams_select" ON public.stakeholder_teams
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "stk_teams_insert" ON public.stakeholder_teams
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "stk_teams_update" ON public.stakeholder_teams
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "stk_teams_delete" ON public.stakeholder_teams
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ─── 8. HR profile link + team assignment on stakeholder_staff ───────────────

ALTER TABLE public.stakeholder_staff
  ADD COLUMN IF NOT EXISTS profile_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team_id uuid
    REFERENCES public.stakeholder_teams(id) ON DELETE SET NULL;

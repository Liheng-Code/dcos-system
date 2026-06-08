-- Extend profiles for SOP-compliant user management
-- Adds: pending, suspended, disabled, archived status values
-- Adds: suspended_reason, first_login_at, last_login_at columns

-- Drop existing inline check constraint (auto-named by Postgres)
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_status_check;

-- Re-add with full SOP status set
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check
  CHECK (status IN (
    'pending',     -- awaiting first login / activation
    'active',      -- can use the system
    'inactive',    -- temporarily inactive (HR-side)
    'suspended',   -- temporarily blocked (security / investigation)
    'disabled',    -- access permanently removed
    'resigned',    -- employment ended by employee
    'terminated',  -- employment ended by company
    'archived'     -- historical record only, read-only
  ));

-- System access tracking columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS first_login_at   timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at    timestamptz;

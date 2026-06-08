-- Add tolerance_khr column to tos_brackets
-- Tolerance is a currency amount (KHR) that defines an acceptable rounding buffer
-- at bracket boundaries, configurable per admin.

ALTER TABLE tos_brackets
  ADD COLUMN IF NOT EXISTS tolerance_khr numeric(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN tos_brackets.tolerance_khr IS
  'Acceptable rounding tolerance at bracket boundary (KHR). '
  'Income within this amount of a bracket edge is absorbed into the lower bracket.';

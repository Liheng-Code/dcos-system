-- ── GAP-16: Multi-currency support for QS module ──────────────────────────────
-- Adds project-level base currency, exchange rate table, and currency columns
-- on the main QS transaction tables.

-- 1. Project base currency (one row per project, defaults to USD)
CREATE TABLE IF NOT EXISTS qs_project_currency (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  base_currency char(3) NOT NULL DEFAULT 'USD',
  updated_at   timestamptz DEFAULT now(),
  UNIQUE(project_id)
);
ALTER TABLE qs_project_currency ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read"   ON qs_project_currency FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_write"  ON qs_project_currency FOR ALL    USING (auth.role() = 'authenticated');

-- 2. Exchange rates (from any currency to any currency, point-in-time)
CREATE TABLE IF NOT EXISTS qs_exchange_rates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_currency  char(3) NOT NULL,
  to_currency    char(3) NOT NULL,
  rate           numeric(18,6) NOT NULL CHECK (rate > 0),
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  source         text,
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz DEFAULT now(),
  UNIQUE(project_id, from_currency, to_currency, effective_date)
);
ALTER TABLE qs_exchange_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read"  ON qs_exchange_rates FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_write" ON qs_exchange_rates FOR ALL    USING (auth.role() = 'authenticated');

-- 3. Add currency columns to qs_cost_transactions
ALTER TABLE qs_cost_transactions
  ADD COLUMN IF NOT EXISTS currency              char(3)        DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS exchange_rate         numeric(18,6)  DEFAULT 1,
  ADD COLUMN IF NOT EXISTS base_currency_amount  numeric(18,2)  GENERATED ALWAYS AS
    (total_cost * COALESCE(exchange_rate, 1)) STORED;

-- 4. Add currency to qs_boq_items (for cross-currency BOQs)
ALTER TABLE qs_boq_items
  ADD COLUMN IF NOT EXISTS currency char(3) DEFAULT 'USD';

-- 5. Add currency to qs_variation_orders
ALTER TABLE qs_variation_orders
  ADD COLUMN IF NOT EXISTS currency char(3) DEFAULT 'USD';

-- Migration: 20260817000001_add_leave_type_rounding_expiry.sql
-- Purpose: Add configurable rounding rule and recurring carryover-expiry policy
--          (month/day) to leave_types, and the corresponding computed expiry
--          tracking columns to leave_balances, to support the HR/E-Leave
--          Year-End Run admin configuration feature.
-- Depends on: public.leave_types, public.leave_balances (created in
--             20260527000036_create_leave_tables.sql; already have
--             carryover_allowed / max_carryover on leave_types and
--             carried_over_days on leave_balances)

-- ============================================================
-- leave_types: rounding rule + recurring carryover-expiry policy
-- ============================================================

-- How fractional day balances are rounded during Year-End Run processing.
alter table public.leave_types
  add column if not exists rounding_rule text not null default 'none'
    check (rounding_rule in ('none', 'nearest_half', 'nearest_whole', 'round_up', 'round_down'));

-- Recurring month/day (e.g. "31 March every year") on which carried-over
-- leave for this leave type expires. Both nullable together — NULL/NULL
-- means carried-over leave never expires. These are NOT a one-off date;
-- the concrete date is computed per fiscal year onto leave_balances below.
alter table public.leave_types
  add column if not exists carryover_expiry_month int
    check (carryover_expiry_month between 1 and 12);

alter table public.leave_types
  add column if not exists carryover_expiry_day int
    check (carryover_expiry_day between 1 and 31);

-- ============================================================
-- leave_balances: computed carryover-expiry tracking per balance/year
-- ============================================================

-- Concrete computed expiry date for this balance's carried-over days,
-- derived at Year-End Run generation time, e.g.
--   make_date(next_year, carryover_expiry_month, carryover_expiry_day)
-- Nullable — no value means no expiry applies for this balance.
alter table public.leave_balances
  add column if not exists carryover_expiry_date date;

-- Whether the carried-over days for this balance have been forfeited
-- (swept back) after passing carryover_expiry_date.
alter table public.leave_balances
  add column if not exists carryover_forfeited boolean not null default false;

-- Timestamp of when the carryover forfeiture was applied.
alter table public.leave_balances
  add column if not exists carryover_forfeited_at timestamptz;

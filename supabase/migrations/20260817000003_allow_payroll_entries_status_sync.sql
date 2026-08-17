-- Migration: 20260817000003_allow_payroll_entries_status_sync.sql
-- Purpose: payroll_block_locked_period_entries() (added in 20260618000004) blocks
--          ALL writes to payroll_entries once the period is locked/exported/paid/closed,
--          including the workflow-advance route's own attempt to flip entries.status
--          from 'draft' to 'paid' when the period reaches "paid". That left every
--          finalized period's entries stuck at status='draft' forever, which meant
--          "My Payslip" (which filters out status='draft') never showed anything.
-- Fix: permit an UPDATE through when it changes ONLY the status column (via a
--      generic to_jsonb diff, so it stays correct if more columns are added later) —
--      still blocks any change to actual payroll figures after finalization.

CREATE OR REPLACE FUNCTION payroll_block_locked_period_entries()
RETURNS trigger AS $$
DECLARE
  v_period_id uuid;
  v_status    text;
BEGIN
  v_period_id := COALESCE(NEW.period_id, OLD.period_id);
  SELECT status INTO v_status FROM payroll_periods WHERE id = v_period_id;

  IF v_status IN ('locked','exported','paid','closed') THEN
    IF TG_OP = 'UPDATE'
       AND (to_jsonb(NEW) - 'status') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'status')
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Payroll period is % — entries can no longer be modified', v_status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

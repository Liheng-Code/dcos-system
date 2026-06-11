-- ============================================================
-- Seed Tax, NSSF & Bank profiles for any employee not yet
-- covered by 20260602000060_seed_employee_hr_payroll_profiles.
-- Idempotent — skips employees who already have records.
-- ============================================================

DO $$
DECLARE
  rec RECORD;
  rnd int;
  residency text;
  marital text;
  spouse bool;
  kids int;
  nssf_on bool;
  occ_risk bool;
  bank_name text;
  branch text;
  tax_id_val text;
  nssf_num_val text;
  acct_num_val text;
BEGIN
  FOR rec IN (
    SELECT p.id, p.full_name, p.employee_id
    FROM public.profiles p
    WHERE p.status IN ('active', 'pending')
      AND NOT EXISTS (SELECT 1 FROM employee_tax_profiles WHERE employee_id = p.id)
    ORDER BY p.employee_id NULLS LAST
  ) LOOP
    -- ── randomness seeds (deterministic per employee_id) ──────
    rnd := abs(hashtext(coalesce(rec.employee_id, rec.id::text)));

    -- ── Tax profile ───────────────────────────────────────────
    residency := CASE WHEN (rnd % 10) < 7 THEN 'resident' ELSE 'non_resident' END;
    marital   := CASE WHEN (rnd % 10) < 6 THEN 'married' ELSE 'single' END;
    spouse    := CASE WHEN marital = 'married' AND (rnd % 10) < 4 THEN true ELSE false END;
    kids      := CASE
      WHEN (rnd % 10) < 3 THEN 0
      WHEN (rnd % 10) < 5 THEN 1
      WHEN (rnd % 10) < 7 THEN 2
      WHEN (rnd % 10) < 9 THEN 3
      ELSE 4
    END;
    tax_id_val := 'TIN-' || upper(substr(md5(rec.id::text), 1, 6));

    INSERT INTO employee_tax_profiles (
      employee_id, tax_residency, marital_status, spouse_dependent,
      num_children, tax_id, effective_date
    ) VALUES (
      rec.id, residency, marital, spouse, kids, tax_id_val, '2026-01-01'
    );

    -- ── NSSF profile ──────────────────────────────────────────
    nssf_on   := CASE WHEN (rnd % 10) < 9 THEN true ELSE false END;
    occ_risk  := CASE WHEN (rnd % 10) < 3 THEN true ELSE false END;
    nssf_num_val := 'NSSF-' || lpad((rnd % 90000 + 10000)::text, 7, '0');

    INSERT INTO employee_nssf_profiles (
      employee_id, nssf_applicable, nssf_number,
      pension_applicable, healthcare_applicable,
      occupational_risk_applicable, effective_date
    ) VALUES (
      rec.id, nssf_on, nssf_num_val, true, true, occ_risk, '2026-01-01'
    );

    -- ── Bank account ──────────────────────────────────────────
    bank_name := CASE (rnd % 8)
      WHEN 0 THEN 'ABA Bank'
      WHEN 1 THEN 'ACLEDA Bank'
      WHEN 2 THEN 'Canadia Bank'
      WHEN 3 THEN 'Chip Mong Bank'
      WHEN 4 THEN 'Prince Bank'
      WHEN 5 THEN 'Wing Bank'
      WHEN 6 THEN 'Sathapana Bank'
      ELSE 'Maybank'
    END;
    branch := CASE (rnd % 5)
      WHEN 0 THEN 'Phnom Penh'
      WHEN 1 THEN 'Siem Reap'
      WHEN 2 THEN 'Battambang'
      WHEN 3 THEN 'Sihanoukville'
      ELSE 'Kampong Cham'
    END;
    acct_num_val := 'ACC-' || lpad((rnd % 9000000 + 1000000)::text, 7, '0');

    INSERT INTO employee_bank_accounts (
      employee_id, bank_name, account_number, account_name, branch, is_primary
    ) VALUES (
      rec.id, bank_name, acct_num_val, rec.full_name, branch, true
    );
  END LOOP;
END;
$$;

-- ============================================================
-- Seed Employee HR & Payroll Profiles (R2 Demo Data)
-- Populates employee_payroll_profiles, employee_tax_profiles,
-- employee_nssf_profiles, and employee_bank_accounts for all
-- 35 staff employees. Idempotent — skips existing rows.
-- ============================================================
-- Demographic variety:
--   Single, no dependents : 13 employees
--   Married, no dependents: 4
--   Married + child only  : 3 (no spouse relief)
--   Married + spouse + children: 15
--   Non-resident (20% flat TOS): 1 (Anna, C-0013)
--   KHR-currency site staff: 4 (C-0030 to C-0033)
--   Occupational risk NSSF: 8 site-staff (C-0017–C-0020, C-0030–C-0033)
-- ============================================================

DO $$
DECLARE
  rec RECORD;
  uid uuid;
BEGIN
  FOR rec IN (
    SELECT * FROM (VALUES
      -- emp_id         | payroll_group | currency | ot_elig
      -- | tax_residency   | marital  | spouse_dep | children | tax_id
      -- | nssf_num      | occ_risk
      -- | bank_name          | acct_number    | acct_name
      ('C-0001','management','USD', false,
       'resident',    'married',true, 2,'K100000001',
       'NSSF-10001',false,
       'ABA Bank',       'ACC-00010001','Liheng'),
      ('C-0002','management','USD', false,
       'resident',    'married',true, 1,'K100000002',
       'NSSF-10002',false,
       'ABA Bank',       'ACC-00010002','Sophat'),
      ('C-0003','management','USD', false,
       'resident',    'married',false,0,'K100000003',
       'NSSF-10003',false,
       'ABA Bank',       'ACC-00010003','Vuthy'),
      ('C-0004','staff',    'USD', false,
       'resident',    'single', false,0,'K100000004',
       'NSSF-10004',false,
       'ACLEDA Bank',    'ACC-00010004','Chenda'),
      ('C-0005','staff',    'USD', true,
       'resident',    'married',true, 2,'K100000005',
       'NSSF-10005',false,
       'ACLEDA Bank',    'ACC-00010005','Pheara'),
      ('C-0006','staff',    'USD', true,
       'resident',    'single', false,0,'K100000006',
       'NSSF-10006',false,
       'ACLEDA Bank',    'ACC-00010006','Dany'),
      ('C-0007','staff',    'USD', true,
       'resident',    'married',true, 1,'K100000007',
       'NSSF-10007',false,
       'ACLEDA Bank',    'ACC-00010007','Thida'),
      ('C-0008','staff',    'USD', false,
       'resident',    'married',true, 3,'K100000008',
       'NSSF-10008',false,
       'ABA Bank',       'ACC-00010008','Tangkea'),
      ('C-0009','staff',    'USD', true,
       'resident',    'married',false,0,'K100000009',
       'NSSF-10009',false,
       'ACLEDA Bank',    'ACC-00010009','Dara'),
      ('C-0010','staff',    'USD', true,
       'resident',    'single', false,0,'K100000010',
       'NSSF-10010',false,
       'ACLEDA Bank',    'ACC-00010010','The'),
      ('C-0011','staff',    'USD', true,
       'resident',    'married',true, 1,'K100000011',
       'NSSF-10011',false,
       'ACLEDA Bank',    'ACC-00010011','Kosal'),
      ('C-0012','staff',    'USD', false,
       'resident',    'married',true, 2,'K100000012',
       'NSSF-10012',false,
       'ABA Bank',       'ACC-00010012','Visal'),
      -- Non-resident: flat 20% TOS regardless of brackets
      ('C-0013','staff',    'USD', true,
       'non_resident','single', false,0,'K100000013',
       'NSSF-10013',false,
       'Canadia Bank',   'ACC-00010013','Anna'),
      ('C-0014','staff',    'USD', true,
       'resident',    'single', false,0,'K100000014',
       'NSSF-10014',false,
       'Canadia Bank',   'ACC-00010014','Daros'),
      -- Married with child but no spouse_dependent (separated)
      ('C-0015','staff',    'USD', true,
       'resident',    'married',false,1,'K100000015',
       'NSSF-10015',false,
       'Canadia Bank',   'ACC-00010015','Sovvan'),
      ('C-0016','staff',    'USD', false,
       'resident',    'married',true, 1,'K100000016',
       'NSSF-10016',false,
       'ABA Bank',       'ACC-00010016','Sophal'),
      -- Site staff: occupational risk NSSF applies
      ('C-0017','site_staff','USD',true,
       'resident',    'married',true, 2,'K100000017',
       'NSSF-10017',true,
       'Canadia Bank',   'ACC-00010017','Ratanak'),
      ('C-0018','site_staff','USD',true,
       'resident',    'single', false,0,'K100000018',
       'NSSF-10018',true,
       'Canadia Bank',   'ACC-00010018','Sokun'),
      ('C-0019','site_staff','USD',true,
       'resident',    'married',false,0,'K100000019',
       'NSSF-10019',true,
       'Canadia Bank',   'ACC-00010019','Vannara'),
      ('C-0020','site_staff','USD',true,
       'resident',    'single', false,0,'K100000020',
       'NSSF-10020',true,
       'Canadia Bank',   'ACC-00010020','Bophea'),
      ('C-0021','staff',    'USD', false,
       'resident',    'married',true, 2,'K100000021',
       'NSSF-10021',false,
       'ABA Bank',       'ACC-00010021','Kimseng'),
      ('C-0022','staff',    'USD', true,
       'resident',    'single', false,0,'K100000022',
       'NSSF-10022',false,
       'Wing Bank',      'ACC-00010022','Pepsi'),
      ('C-0023','staff',    'USD', true,
       'resident',    'married',true, 1,'K100000023',
       'NSSF-10023',false,
       'Wing Bank',      'ACC-00010023','Nalin'),
      ('C-0024','staff',    'USD', true,
       'resident',    'married',false,0,'K100000024',
       'NSSF-10024',false,
       'Wing Bank',      'ACC-00010024','Kimly'),
      ('C-0025','staff',    'USD', false,
       'resident',    'married',true, 3,'K100000025',
       'NSSF-10025',false,
       'ABA Bank',       'ACC-00010025','Sovanarith'),
      ('C-0026','staff',    'USD', true,
       'resident',    'single', false,0,'K100000026',
       'NSSF-10026',false,
       'Prince Bank',    'ACC-00010026','Sreymom'),
      ('C-0027','staff',    'USD', true,
       'resident',    'single', false,0,'K100000027',
       'NSSF-10027',false,
       'Prince Bank',    'ACC-00010027','Rithy'),
      ('C-0028','staff',    'USD', false,
       'resident',    'married',true, 2,'K100000028',
       'NSSF-10028',false,
       'ABA Bank',       'ACC-00010028','Hanko'),
      -- Married with child only (no spouse_dependent)
      ('C-0029','staff',    'USD', true,
       'resident',    'married',false,1,'K100000029',
       'NSSF-10029',false,
       'Chip Mong Bank', 'ACC-00010029','Seyha'),
      -- KHR-currency site staff with occupational risk
      ('C-0030','site_staff','KHR',true,
       'resident',    'single', false,0,'K100000030',
       'NSSF-10030',true,
       'Chip Mong Bank', 'ACC-00010030','Samnang'),
      ('C-0031','site_staff','KHR',true,
       'resident',    'married',true, 1,'K100000031',
       'NSSF-10031',true,
       'Chip Mong Bank', 'ACC-00010031','Sophea'),
      ('C-0032','site_staff','KHR',true,
       'resident',    'single', false,0,'K100000032',
       'NSSF-10032',true,
       'Chip Mong Bank', 'ACC-00010032','Nita'),
      ('C-0033','site_staff','KHR',true,
       'resident',    'married',true, 2,'K100000033',
       'NSSF-10033',true,
       'Chip Mong Bank', 'ACC-00010033','Vanchhouy'),
      ('C-0034','staff',    'USD', true,
       'resident',    'single', false,0,'K100000034',
       'NSSF-10034',false,
       'Prince Bank',    'ACC-00010034','nisa'),
      -- Note: C0035 has no dash (intentional in staff_list-seed.sql)
      ('C0035', 'staff',    'USD', true,
       'resident',    'married',false,1,'K100000035',
       'NSSF-10035',false,
       'Prince Bank',    'ACC-00010035','Soklay')
    ) AS t(
      emp_id,        payroll_group, currency,  ot_eligible,
      tax_residency, marital,       spouse_dep, children,  tax_id,
      nssf_num,      occ_risk,
      bank_name,     acct_number,   acct_name
    )
  ) LOOP
    SELECT id INTO uid FROM public.profiles WHERE employee_id = rec.emp_id;
    CONTINUE WHEN uid IS NULL;  -- employee not seeded yet, skip safely

    -- Payroll profile
    IF NOT EXISTS (SELECT 1 FROM employee_payroll_profiles WHERE employee_id = uid) THEN
      INSERT INTO employee_payroll_profiles (
        employee_id, payroll_type, currency, payroll_group,
        ot_eligible, tax_applicable, nssf_applicable, effective_date
      ) VALUES (
        uid, 'monthly', rec.currency, rec.payroll_group,
        rec.ot_eligible, true, true, '2026-01-01'
      );
    END IF;

    -- Tax profile
    IF NOT EXISTS (SELECT 1 FROM employee_tax_profiles WHERE employee_id = uid) THEN
      INSERT INTO employee_tax_profiles (
        employee_id, tax_residency, marital_status, spouse_dependent,
        num_children, tax_id, effective_date
      ) VALUES (
        uid, rec.tax_residency, rec.marital, rec.spouse_dep,
        rec.children, rec.tax_id, '2026-01-01'
      );
    END IF;

    -- NSSF profile
    IF NOT EXISTS (SELECT 1 FROM employee_nssf_profiles WHERE employee_id = uid) THEN
      INSERT INTO employee_nssf_profiles (
        employee_id, nssf_applicable, nssf_number,
        pension_applicable, healthcare_applicable,
        occupational_risk_applicable, effective_date
      ) VALUES (
        uid, true, rec.nssf_num, true, true, rec.occ_risk, '2026-01-01'
      );
    END IF;

    -- Bank account (primary only)
    IF NOT EXISTS (SELECT 1 FROM employee_bank_accounts WHERE employee_id = uid) THEN
      INSERT INTO employee_bank_accounts (
        employee_id, bank_name, account_number, account_name, branch, is_primary
      ) VALUES (
        uid, rec.bank_name, rec.acct_number, rec.acct_name, 'Phnom Penh', true
      );
    END IF;

  END LOOP;
END;
$$;

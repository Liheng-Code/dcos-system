-- ============================================================
-- Seed Employee Salary Structures (R2 Demo Data)
-- Inserts Basic, Housing, Transport, Meal allowances for all
-- 35 staff, plus Loan Deduction for 2 employees.
-- Idempotent: skips employees who already have an active structure.
--
-- Salary bands by level:
--   L1 MD:     $4,000 basic
--   L2 GM:     $3,000 basic
--   L3 PM:     $2,500 basic
--   L4 Mgr:    $1,600–$1,800 basic
--   L5 Senior: $1,000–$1,400 basic (site staff +$200 premium)
--   L6 Staff:  $650–$850 basic   (site staff +$150–200 premium)
--   L6 KHR:    ៛3,000,000–3,200,000 basic (≈ $730–780 USD)
-- ============================================================

DO $$
DECLARE
  uid          uuid;
  basic_id     uuid;
  housing_id   uuid;
  transport_id uuid;
  meal_id      uuid;
  loan_id      uuid;
  rec          RECORD;
BEGIN
  -- Resolve component type IDs once
  SELECT id INTO basic_id     FROM payroll_component_types WHERE code = 'BASIC';
  SELECT id INTO housing_id   FROM payroll_component_types WHERE code = 'HOUSING_ALLOWANCE';
  SELECT id INTO transport_id FROM payroll_component_types WHERE code = 'TRANSPORT_ALLOWANCE';
  SELECT id INTO meal_id      FROM payroll_component_types WHERE code = 'MEAL_ALLOWANCE';
  SELECT id INTO loan_id      FROM payroll_component_types WHERE code = 'LOAN_DEDUCTION';

  FOR rec IN (
    SELECT * FROM (VALUES
      -- emp_id     | basic        | housing   | transport | meal    | loan
      -- Management band
      ('C-0001',  4000.00,   800.00,  150.00,  150.00,    0.00),  -- Liheng    L1 MD
      ('C-0002',  3000.00,   600.00,  150.00,  150.00,    0.00),  -- Sophat    L2 GM
      ('C-0003',  2500.00,   500.00,  150.00,  150.00,    0.00),  -- Vuthy     L3 PM
      -- L4 Dept Managers
      ('C-0004',  1800.00,   400.00,  100.00,  100.00,    0.00),  -- Chenda    Arch Mgr
      ('C-0008',  1800.00,   400.00,  100.00,  100.00,    0.00),  -- Tangkea   Struct Mgr
      ('C-0012',  1700.00,   350.00,  100.00,  100.00,    0.00),  -- Visal     Proc Mgr
      ('C-0016',  1800.00,   400.00,  100.00,  100.00,    0.00),  -- Sophal    Const Mgr
      ('C-0021',  1600.00,   350.00,  100.00,  100.00,    0.00),  -- Kimseng   HR Mgr
      ('C-0025',  1700.00,   350.00,  100.00,  100.00,    0.00),  -- Sovanarith Acc Mgr
      ('C-0028',  1800.00,   400.00,  100.00,  100.00,    0.00),  -- Hanko     MEP Mgr
      -- L5 Seniors (USD)
      ('C-0005',  1200.00,   250.00,   80.00,   80.00,    0.00),  -- Pheara    Arch Sr
      ('C-0009',  1200.00,   250.00,   80.00,   80.00,    0.00),  -- Dara      Struct Sr
      ('C-0013',  1100.00,   250.00,   80.00,   80.00,    0.00),  -- Anna      Proc Sr (non-resident)
      ('C-0017',  1400.00,   300.00,   80.00,   80.00,    0.00),  -- Ratanak   Const Sr (site premium)
      ('C-0022',  1000.00,   200.00,   80.00,   80.00,    0.00),  -- Pepsi     HR Sr
      ('C-0026',  1100.00,   200.00,   80.00,   80.00,    0.00),  -- Sreymom   Acc Sr
      ('C-0029',  1200.00,   250.00,   80.00,   80.00,    0.00),  -- Seyha     MEP Sr
      -- L6 Architecture (USD)
      ('C-0006',   850.00,   150.00,   60.00,   60.00,    0.00),  -- Dany
      ('C-0007',   800.00,   150.00,   60.00,   60.00,    0.00),  -- Thida
      ('C0035',    750.00,   150.00,   60.00,   60.00,    0.00),  -- Soklay (no dash)
      -- L6 Structural (USD)
      ('C-0010',   800.00,   150.00,   60.00,   60.00,    0.00),  -- The
      ('C-0011',   780.00,   150.00,   60.00,   60.00,    0.00),  -- Kosal
      -- L6 Procurement (USD)
      ('C-0014',   720.00,   150.00,   60.00,   60.00,    0.00),  -- Daros
      ('C-0015',   700.00,   150.00,   60.00,   60.00,  100.00),  -- Sovvan  (loan: single parent)
      -- L6 Construction site (USD, site premium on transport)
      ('C-0018',   950.00,   150.00,   80.00,   60.00,    0.00),  -- Sokun   site+
      ('C-0019',   900.00,   150.00,   80.00,   60.00,    0.00),  -- Vannara site+
      ('C-0020',   880.00,   150.00,   80.00,   60.00,    0.00),  -- Bophea  site+
      -- L6 HR (USD)
      ('C-0023',   650.00,   150.00,   60.00,   60.00,    0.00),  -- Nalin
      ('C-0024',   650.00,   150.00,   60.00,   60.00,    0.00),  -- Kimly
      -- L6 Accounting (USD)
      ('C-0027',   750.00,   150.00,   60.00,   60.00,   80.00),  -- Rithy   (loan)
      ('C-0034',   700.00,   150.00,   60.00,   60.00,    0.00),  -- nisa
      -- L6 MEP site staff (KHR — amounts are in KHR)
      ('C-0030', 3200000.00, 600000.00, 200000.00, 200000.00, 0.00),  -- Samnang
      ('C-0031', 3000000.00, 600000.00, 200000.00, 200000.00, 0.00),  -- Sophea
      ('C-0032', 3000000.00, 600000.00, 200000.00, 200000.00, 0.00),  -- Nita
      ('C-0033', 3100000.00, 600000.00, 200000.00, 200000.00, 0.00)   -- Vanchhouy
    ) AS t(emp_id, basic, housing, transport, meal, loan)
  ) LOOP
    SELECT id INTO uid FROM public.profiles WHERE employee_id = rec.emp_id;
    CONTINUE WHEN uid IS NULL;  -- employee not yet created, skip

    -- Idempotent: skip if this employee already has an active salary structure
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM employee_salary_structures
      WHERE employee_id = uid AND effective_to IS NULL
    );

    -- Insert all four base allowances in one statement
    INSERT INTO employee_salary_structures
      (employee_id, component_type_id, amount, effective_from)
    VALUES
      (uid, basic_id,     rec.basic,     '2026-01-01'),
      (uid, housing_id,   rec.housing,   '2026-01-01'),
      (uid, transport_id, rec.transport, '2026-01-01'),
      (uid, meal_id,      rec.meal,      '2026-01-01');

    -- Loan deduction only for employees who carry one
    IF rec.loan > 0 THEN
      INSERT INTO employee_salary_structures
        (employee_id, component_type_id, amount, effective_from)
      VALUES (uid, loan_id, rec.loan, '2026-01-01');
    END IF;

  END LOOP;
END;
$$;

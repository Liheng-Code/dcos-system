-- ============================================================
-- Seed Employee Salary Structures (Cambodia construction market)
-- ============================================================
-- Salary bands by level (Cambodia construction industry, 2026):
--   L1 MD:       $4,000 basic
--   L2 GM:       $3,000 basic
--   L3 PM:       $2,500 basic
--   L4 Mgr:      $1,600–$1,800 basic  (dept heads)
--   L5 Senior:   $1,000–$1,400 basic  (site staff +$200 premium)
--   L6 Staff:    $650–$950 basic      (site staff +$150–200 premium)
--   L6 KHR:      ៛3,000,000–3,200,000 (MEP site staff, ≈ $730–780)
-- ============================================================

-- Idempotent: remove all active structures before re-seeding
DELETE FROM employee_salary_structures WHERE effective_to IS NULL;

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
  SELECT id INTO basic_id     FROM payroll_component_types WHERE code = 'BASIC';
  SELECT id INTO housing_id   FROM payroll_component_types WHERE code = 'HOUSING_ALLOWANCE';
  SELECT id INTO transport_id FROM payroll_component_types WHERE code = 'TRANSPORT_ALLOWANCE';
  SELECT id INTO meal_id      FROM payroll_component_types WHERE code = 'MEAL_ALLOWANCE';
  SELECT id INTO loan_id      FROM payroll_component_types WHERE code = 'LOAN_DEDUCTION';

  FOR rec IN (
    SELECT * FROM (VALUES
      -- full_name    | basic        | housing   | transport | meal    | loan
      -- Management band
      ('Liheng',     4000.00,   800.00,  150.00,  150.00,    0.00),  -- L1 MD
      ('Sophat',     3000.00,   600.00,  150.00,  150.00,    0.00),  -- L2 GM
      ('Vuthy',      2500.00,   500.00,  150.00,  150.00,    0.00),  -- L3 PM
      -- L4 Dept Managers
      ('Chenda',     1800.00,   400.00,  100.00,  100.00,    0.00),  -- Arch Mgr
      ('Tangkea',    1800.00,   400.00,  100.00,  100.00,    0.00),  -- Struct Mgr
      ('Visal',      1700.00,   350.00,  100.00,  100.00,    0.00),  -- Proc Mgr
      ('Sophal',     1800.00,   400.00,  100.00,  100.00,    0.00),  -- Const Mgr
      ('Kimseng',    1600.00,   350.00,  100.00,  100.00,    0.00),  -- HR Mgr
      ('Sovanarith', 1700.00,   350.00,  100.00,  100.00,    0.00),  -- Acc Mgr
      ('Hanko',      1800.00,   400.00,  100.00,  100.00,    0.00),  -- MEP Mgr
      -- L5 Seniors (USD)
      ('Pheara',     1200.00,   250.00,   80.00,   80.00,    0.00),  -- Arch Sr
      ('Dara',       1200.00,   250.00,   80.00,   80.00,    0.00),  -- Struct Sr
      ('Anna',       1100.00,   250.00,   80.00,   80.00,    0.00),  -- Proc Sr (non-resident tax)
      ('Ratanak',    1400.00,   300.00,   80.00,   80.00,    0.00),  -- Const Sr (site premium)
      ('Pepsi',      1000.00,   200.00,   80.00,   80.00,    0.00),  -- HR Sr
      ('Sreymom',    1100.00,   200.00,   80.00,   80.00,    0.00),  -- Acc Sr
      ('Seyha',      1200.00,   250.00,   80.00,   80.00,    0.00),  -- MEP Sr
      -- L6 Architecture (USD)
      ('Dany',        850.00,   150.00,   60.00,   60.00,    0.00),
      ('Thida',       800.00,   150.00,   60.00,   60.00,    0.00),
      ('Soklay',      750.00,   150.00,   60.00,   60.00,    0.00),
      -- L6 Structural (USD)
      ('The',         800.00,   150.00,   60.00,   60.00,    0.00),
      ('Kosal',       780.00,   150.00,   60.00,   60.00,    0.00),
      -- L6 Procurement (USD)
      ('Daros',       720.00,   150.00,   60.00,   60.00,    0.00),
      ('Sovvan',      700.00,   150.00,   60.00,   60.00,  100.00),  -- loan: single parent
      -- L6 Construction site (USD, site premium on transport)
      ('Sokun',       950.00,   150.00,   80.00,   60.00,    0.00),  -- site+
      ('Vannara',     900.00,   150.00,   80.00,   60.00,    0.00),  -- site+
      ('Bophea',      880.00,   150.00,   80.00,   60.00,    0.00),  -- site+
      -- L6 HR (USD)
      ('Nalin',       650.00,   150.00,   60.00,   60.00,    0.00),
      ('Kimly',       650.00,   150.00,   60.00,   60.00,    0.00),
      -- L6 Accounting (USD)
      ('Rithy',       750.00,   150.00,   60.00,   60.00,   80.00),  -- loan
      ('nisa',        700.00,   150.00,   60.00,   60.00,    0.00),
      -- L6 MEP site staff (KHR — amounts are in Riel)
      ('Samnang',  3200000.00, 600000.00, 200000.00, 200000.00, 0.00),
      ('Sophea',   3000000.00, 600000.00, 200000.00, 200000.00, 0.00),
      ('Nita',     3000000.00, 600000.00, 200000.00, 200000.00, 0.00),
      ('Vanchhouy',3100000.00, 600000.00, 200000.00, 200000.00, 0.00)
    ) AS t(full_name, basic, housing, transport, meal, loan)
  ) LOOP
    SELECT id INTO uid FROM public.profiles WHERE full_name = rec.full_name;
    CONTINUE WHEN uid IS NULL;

    INSERT INTO employee_salary_structures
      (employee_id, component_type_id, amount, effective_from)
    VALUES
      (uid, basic_id,     rec.basic,     '2026-01-01'),
      (uid, housing_id,   rec.housing,   '2026-01-01'),
      (uid, transport_id, rec.transport, '2026-01-01'),
      (uid, meal_id,      rec.meal,      '2026-01-01');

    IF rec.loan > 0 THEN
      INSERT INTO employee_salary_structures
        (employee_id, component_type_id, amount, effective_from)
      VALUES (uid, loan_id, rec.loan, '2026-01-01');
    END IF;
  END LOOP;
END;
$$;

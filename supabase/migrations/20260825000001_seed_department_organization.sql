-- Seed organization data required by the Department workspace / Team Planning module:
-- 1) backfill profiles.department_id from the legacy free-text column,
-- 2) assign department heads (all were NULL, leaving the module permanently empty),
-- 3) grant the L4 Department Manager role to the administration account.

-- 1. Profile department backfill (legacy text -> departments FK).
UPDATE public.profiles p
SET department_id = d.id
FROM public.departments d
WHERE p.department_id IS NULL
  AND (
    (p.department = 'HR & Admin'           AND d.department_code = 'HR')
    OR (p.department = 'Architecture'      AND d.department_code = 'DESIGN')
    OR (p.department IN ('MEP', 'Structure', 'Construction') AND d.department_code = 'CONST')
    OR (p.department = 'Account & Finance' AND d.department_code = 'FINANCE')
    OR (p.department = 'Management'        AND d.department_code = 'OPS')
    OR (p.department = 'Procurement'       AND d.department_code = 'PROC')
  );

-- 2. Department heads.
UPDATE public.departments SET department_head = (SELECT id FROM public.profiles WHERE email = 'sokun@dcos.com')  WHERE department_code = 'CONST';
UPDATE public.departments SET department_head = (SELECT id FROM public.profiles WHERE email = 'daros@dcos.com')  WHERE department_code = 'PROC';
UPDATE public.departments SET department_head = (SELECT id FROM public.profiles WHERE email = 'nalin@dcos.com')  WHERE department_code = 'HR';
UPDATE public.departments SET department_head = (SELECT id FROM public.profiles WHERE email = 'sarach@dcos.com') WHERE department_code = 'FINANCE';
UPDATE public.departments SET department_head = (SELECT id FROM public.profiles WHERE email = 'pheara@dcos.com') WHERE department_code = 'DESIGN';
UPDATE public.departments SET department_head = (SELECT id FROM public.profiles WHERE email = 'liheng@dcos.com') WHERE department_code = 'OPS';

-- 3. Department Manager role for the tester account.
INSERT INTO public.user_roles (user_id, role_code)
SELECT p.id, 'L4'
FROM public.profiles p
WHERE p.email = 'liheng@dcos.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role_code = 'L4'
  );

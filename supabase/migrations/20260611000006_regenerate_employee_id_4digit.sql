-- Change employee_id format from 5-digit to 4-digit sequence, regenerate all

-- Step 1: Update trigger function to use 4-digit padding
CREATE OR REPLACE FUNCTION public.fn_assign_employee_id()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.employee_id IS NULL OR NEW.employee_id = '') AND NEW.join_date IS NOT NULL THEN
    NEW.employee_id := 'EMP-' || to_char(NEW.join_date, 'YYYY') || '-' || LPAD(nextval('public.profiles_employee_id_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Regenerate all existing EMP-format IDs with 4-digit numbers ordered by join_date
DO $$
DECLARE
  r RECORD;
  _seq INT;
BEGIN
  ALTER SEQUENCE public.profiles_employee_id_seq RESTART WITH 1;

  FOR r IN
    SELECT id, join_date FROM public.profiles
    WHERE employee_id LIKE 'EMP-%' AND join_date IS NOT NULL
    ORDER BY join_date ASC, id ASC
  LOOP
    _seq := nextval('public.profiles_employee_id_seq');
    UPDATE public.profiles
      SET employee_id = 'EMP-' || to_char(r.join_date, 'YYYY') || '-' || LPAD(_seq::text, 4, '0')
    WHERE id = r.id;
  END LOOP;
END;
$$;

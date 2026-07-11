-- Regenerate all employee_id to EMP-YYYY-00001 format (5-digit sequence)
-- Replaces legacy C-NNNN IDs. Ordered by join_date ASC within each year.
-- Employee code is permanent and never reused, even after archival.

-- Step 1: Update trigger function to use 5-digit padding
CREATE OR REPLACE FUNCTION public.fn_assign_employee_id()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.employee_id IS NULL OR NEW.employee_id = '') AND NEW.join_date IS NOT NULL THEN
    NEW.employee_id := 'EMP-' || to_char(NEW.join_date, 'YYYY') || '-'
      || LPAD(nextval('public.profiles_employee_id_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Temporarily drop the read-only block trigger
DROP TRIGGER IF EXISTS trg_block_employee_id_change ON public.profiles;

-- Step 3: Regenerate all employee_ids ordered by join_date
DO $$
DECLARE
  r RECORD;
  _seq INT;
BEGIN
  ALTER SEQUENCE public.profiles_employee_id_seq RESTART WITH 1;

  FOR r IN
    SELECT id, join_date FROM public.profiles
    WHERE join_date IS NOT NULL
    ORDER BY join_date ASC, id ASC
  LOOP
    _seq := nextval('public.profiles_employee_id_seq');
    UPDATE public.profiles
      SET employee_id = 'EMP-' || to_char(r.join_date, 'YYYY') || '-'
        || LPAD(_seq::text, 5, '0')
    WHERE id = r.id;
  END LOOP;
END;
$$;

-- Step 4: Re-create the read-only block trigger
CREATE TRIGGER trg_block_employee_id_change
  BEFORE UPDATE OF employee_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_block_employee_id_change();

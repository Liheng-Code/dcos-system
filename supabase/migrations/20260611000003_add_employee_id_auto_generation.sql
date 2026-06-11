-- Auto-generate HR-assigned Employee ID in format EMP-yyyy-nnnnn
-- Uses a global sequence; the join_date determines the year portion.
-- Trigger fires on INSERT or when join_date/employee_id is updated.

CREATE SEQUENCE IF NOT EXISTS public.profiles_employee_id_seq START 1;

CREATE OR REPLACE FUNCTION public.fn_assign_employee_id()
RETURNS TRIGGER AS $$
DECLARE
  _year text;
  _seq  int;
BEGIN
  IF (NEW.employee_id IS NULL OR NEW.employee_id = '') AND NEW.join_date IS NOT NULL THEN
    _year := to_char(NEW.join_date, 'YYYY');
    _seq  := nextval('public.profiles_employee_id_seq');
    NEW.employee_id := 'EMP-' || _year || '-' || LPAD(_seq::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_employee_id ON public.profiles;
CREATE TRIGGER trg_assign_employee_id
  BEFORE INSERT OR UPDATE OF join_date, employee_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION fn_assign_employee_id();

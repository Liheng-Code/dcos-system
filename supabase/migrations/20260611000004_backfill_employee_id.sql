-- Backfill employee_id for existing staff who have join_date but no employee_id
-- Orders by join_date ASC so sequence numbering reflects join order

DO $$
DECLARE
  r RECORD;
  _seq INT;
  _year TEXT;
BEGIN
  FOR r IN 
    SELECT id, join_date FROM public.profiles 
    WHERE (employee_id IS NULL OR employee_id = '') AND join_date IS NOT NULL
    ORDER BY join_date ASC, id ASC
  LOOP
    _seq := nextval('public.profiles_employee_id_seq');
    _year := to_char(r.join_date, 'YYYY');
    UPDATE public.profiles 
      SET employee_id = 'EMP-' || _year || '-' || LPAD(_seq::text, 5, '0')
    WHERE id = r.id;
  END LOOP;
END;
$$;

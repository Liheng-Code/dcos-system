-- Standardize Vuthy's employee_id from C-0003 to EMP-yyyy-nnnnn format

DO $$
DECLARE
  _next_seq INT;
  _vuthy record;
BEGIN
  SELECT id, join_date INTO _vuthy FROM public.profiles
    WHERE full_name = 'Vuthy' AND (employee_id IS NOT NULL AND employee_id != '')
    LIMIT 1;

  IF _vuthy.id IS NULL THEN
    RAISE NOTICE 'Vuthy not found or already standardized';
    RETURN;
  END IF;

  _next_seq := nextval('public.profiles_employee_id_seq');
  UPDATE public.profiles
    SET employee_id = 'EMP-' || to_char(_vuthy.join_date, 'YYYY') || '-' || LPAD(_next_seq::text, 5, '0')
    WHERE id = _vuthy.id;
END;
$$;

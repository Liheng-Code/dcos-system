-- Delete staff EMP-2026-0036 (Chan Dara) and EMP-2026-0037 (test)

DO $$
DECLARE
  _ids uuid[];
BEGIN
  SELECT ARRAY_AGG(id) INTO _ids FROM public.profiles
    WHERE employee_id IN ('EMP-2026-0036', 'EMP-2026-0037');

  IF _ids IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = ANY(_ids);
  END IF;
END;
$$;

-- Normalize staff department membership: profiles.department_id becomes the
-- source of truth (FK to HR departments). Legacy free-text profiles.department
-- is kept in sync until every screen writes the FK.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;

-- Backfill: case-insensitive match of legacy text against department name or code.
UPDATE public.profiles pr
SET    department_id = d.id
FROM   public.departments d
WHERE  pr.department_id IS NULL
  AND  pr.department IS NOT NULL
  AND  (lower(btrim(pr.department)) = lower(btrim(d.department_name))
     OR lower(btrim(pr.department)) = lower(btrim(d.department_code)));

CREATE INDEX IF NOT EXISTS idx_profiles_department_id
  ON public.profiles(department_id);

-- Bidirectional keep-in-sync:
--   * department_id set / changed  -> refresh legacy text from departments
--   * only text set                -> try to resolve FK from text
CREATE OR REPLACE FUNCTION public.sync_profile_department()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.department_id IS NOT NULL THEN
    SELECT d.department_name INTO NEW.department
    FROM   public.departments d
    WHERE  d.id = NEW.department_id;
  ELSIF NEW.department IS NOT NULL THEN
    SELECT d.id INTO NEW.department_id
    FROM   public.departments d
    WHERE  lower(btrim(NEW.department)) IN (lower(btrim(d.department_name)), lower(btrim(d.department_code)))
    LIMIT  1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_department ON public.profiles;

CREATE TRIGGER trg_sync_profile_department
  BEFORE INSERT OR UPDATE OF department, department_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_department();

-- Fix: flush_dirty_wbs_progress() aborts with
--   ERROR: relation "_wbs_dirty_projects" does not exist
-- when a wbs_tasks / wbs_nodes statement affects zero rows.
--
-- Root cause: trg_*_flush_dirty is a STATEMENT-level trigger and fires even for
-- zero-row statements, but the session temp table is only created by the
-- ROW-level trigger (collect_dirty_wbs_project), which does NOT fire when no
-- rows match. Any bulk DELETE / targeted UPDATE OF progress that matches
-- nothing (e.g. an idempotent seed's first run) then blows up.
--
-- Make the flush a no-op when the temp table has not been created yet.

CREATE OR REPLACE FUNCTION public.flush_dirty_wbs_progress()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Nothing has been marked dirty in this session yet.
  IF to_regclass('pg_temp._wbs_dirty_projects') IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM public.recalculate_wbs_progress(project_id)
  FROM _wbs_dirty_projects;

  TRUNCATE _wbs_dirty_projects;
  RETURN NULL;
END;
$$;

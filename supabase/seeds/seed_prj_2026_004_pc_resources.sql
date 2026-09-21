-- =============================================================================
-- Seed: PRJ-2026-004-PC (7 Story Mix Use Building) — manpower & equipment
--       resources, for the Planning ▸ Manpower Histogram and Resource Levelling
-- =============================================================================
-- The programme (802 tasks, 2026-10-01 → 2028-11-03, 6-day week) has no
-- resources, so the Planning dashboard's Manpower Histogram and Resource
-- Levelling charts have nothing to draw. This seed adds:
--
--   * 9 labour trades   — capacity in workers (max_units = workers × 100)
--   * 2 equipment items — tower crane, concrete pump
--   * ~595 task assignments for the construction (03.*) and testing/handover
--     (04.*) tasks. Design, procurement and paperwork tasks stay unassigned.
--
-- Units: allocation_percent and max_units are percent, 100 = ONE worker (or one
-- machine). A task needing 12 carpenters is allocation_percent = 1200 against a
-- crew capacity of 50 workers (max_units = 5000). This is what the dashboard
-- charts (÷100 → headcount) and the levelling engine (÷100 → units) expect.
--
-- Capacities are set at roughly 75–80% of the peak weekly demand the programme
-- generates (peaks: formwork 72, finishing 61, rebar 60, concrete 48, masons 48,
-- electrical 36, mechanical 30, labourers 28, QA/QC 10), so the histogram shows
-- genuine over-allocated weeks for the levelling diagram to work on.
--
-- Task → trade mapping is by discipline + activity name (see the `map` rows
-- below); the first matching row wins. Tasks longer than 14 days use the
-- "long" headcount (only Civil differs: 10 workers short, 5 long).
--
-- Re-running is safe: resources are matched by name (updated in place) and the
-- assignments of THESE resources are rebuilt from the mapping. Remove it all:
--
--   DELETE FROM public.plan_resources
--   WHERE project_id = (SELECT id FROM public.projects WHERE project_code = 'PRJ-2026-004-PC')
--     AND name IN ('Formwork Carpenters','Rebar Fixers','Concrete Gang','Masons & Plasterers',
--                  'Finishing Trades','MEP Electrical Technicians','MEP Mechanical & Plumbing Fitters',
--                  'General Labourers','QA/QC Inspectors','Tower Crane TC-1','Concrete Pump');
--   -- assignments go with them (ON DELETE CASCADE)
--
-- Manual seed — NOT listed in supabase/config.toml [db.seed].sql_paths, and not
-- applied by `db push`. Run it against a database that already holds the
-- project; it stops with an error if PRJ-2026-004-PC is not found.
-- =============================================================================

DO $$
DECLARE
  pid       uuid;
  cal_id    uuid;
  n_res     int;
  n_assign  int;
BEGIN
  -- --------------------------------------------------------------------------
  -- 0. Resolve the project
  -- --------------------------------------------------------------------------
  SELECT id INTO pid FROM public.projects WHERE project_code = 'PRJ-2026-004-PC';
  IF pid IS NULL THEN
    RAISE EXCEPTION 'Project PRJ-2026-004-PC not found. This seed only populates that project.';
  END IF;

  SELECT id INTO cal_id
  FROM   public.plan_calendars
  WHERE  project_id = pid
  ORDER BY is_default DESC, created_at
  LIMIT 1;

  -- --------------------------------------------------------------------------
  -- 1. Resources (max_units in percent: 100 = one worker / one machine)
  -- --------------------------------------------------------------------------
  DROP TABLE IF EXISTS _seed_res, _seed_map;   -- safe to re-run in the same session

  CREATE TEMP TABLE _seed_res (
    name          text PRIMARY KEY,
    resource_type text NOT NULL,
    max_units     numeric NOT NULL,
    unit_label    text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _seed_res (name, resource_type, max_units, unit_label) VALUES
    ('Formwork Carpenters',               'labor',     5000, 'worker'),  -- 50 workers
    ('Rebar Fixers',                      'labor',     4000, 'worker'),  -- 40
    ('Concrete Gang',                     'labor',     3500, 'worker'),  -- 35
    ('Masons & Plasterers',               'labor',     3500, 'worker'),  -- 35
    ('Finishing Trades',                  'labor',     4500, 'worker'),  -- 45
    ('MEP Electrical Technicians',        'labor',     2800, 'worker'),  -- 28
    ('MEP Mechanical & Plumbing Fitters', 'labor',     2400, 'worker'),  -- 24
    ('General Labourers',                 'labor',     2500, 'worker'),  -- 25
    ('QA/QC Inspectors',                  'labor',      800, 'worker'),  -- 8
    ('Tower Crane TC-1',                  'equipment',  100, 'unit'),    -- 1 crane
    ('Concrete Pump',                     'equipment',  200, 'unit');    -- 2 pumps

  UPDATE public.plan_resources r
  SET    resource_type = s.resource_type,
         max_units     = s.max_units,
         unit_label    = s.unit_label,
         calendar_id   = cal_id,
         is_active     = true
  FROM   _seed_res s
  WHERE  r.project_id = pid AND r.name = s.name;

  INSERT INTO public.plan_resources (project_id, name, resource_type, max_units, unit_label, calendar_id)
  SELECT pid, s.name, s.resource_type, s.max_units, s.unit_label, cal_id
  FROM   _seed_res s
  WHERE  NOT EXISTS (
    SELECT 1 FROM public.plan_resources r WHERE r.project_id = pid AND r.name = s.name
  );

  -- --------------------------------------------------------------------------
  -- 2. Task → trade mapping (first matching `ord` wins; discipline and name are
  --    regexes; workers are per task, shown as short (<=14 days) / long (>14)).
  -- --------------------------------------------------------------------------
  CREATE TEMP TABLE _seed_map (
    ord     int PRIMARY KEY,
    disc    text NOT NULL,
    nm      text NOT NULL,
    res     text NOT NULL,
    w_short numeric NOT NULL,
    w_long  numeric NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _seed_map (ord, disc, nm, res, w_short, w_long) VALUES
    -- Structural
    ( 1, '^Structural$',    'Inspection',        'QA/QC Inspectors',           2,  2),
    ( 2, '^Structural$',    'MEP Embedded',      'MEP Electrical Technicians', 4,  4),
    ( 3, '^Structural$',    'Formwork Removal',  'Formwork Carpenters',        6,  6),
    ( 4, '^Structural$',    'Formwork',          'Formwork Carpenters',       12, 12),
    ( 5, '^Structural$',    'Reinforcement',     'Rebar Fixers',              10, 10),
    ( 6, '^Structural$',    'Curing',            'General Labourers',          3,  3),
    ( 7, '^Structural$',    'Setting Out|Pile Setting|Pile Installation|Pile Head|Pile Testing|Excavation',
                                                 'General Labourers',          5,  5),
    ( 8, '^Structural$',    '.*',                'Concrete Gang',             12, 12),
    -- Architectural
    (10, '^Architectural$', 'Blockwork|Partition|Plaster|Screed|Waterproofing|Insulation|Boundary Wall|Guard House',
                                                 'Masons & Plasterers',        8,  8),
    (11, '^Architectural$', 'Final Cleaning|Protection|Snagging|Roof Access',
                                                 'General Labourers',          6,  6),
    (12, '^Architectural$', '.*',                'Finishing Trades',           8,  8),
    -- MEP
    (20, '^MEP$',           'Cable|Conduits|DB Installation|Lighting|Switches|ELV|Fire Alarm|Electrical|Telecom|Lightning|MEP Testing',
                                                 'MEP Electrical Technicians', 6,  6),
    (21, '^MEP$',           '.*',                'MEP Mechanical & Plumbing Fitters', 6, 6),
    -- Civil / landscape (long external runs are lightly crewed)
    (30, '^Civil$',         '.*',                'General Labourers',         10,  5),
    (31, '^Landscape$',     '.*',                'General Labourers',          6,  6),
    -- QA/QC
    (40, '^QA/QC$',         'Snag Rectification','Finishing Trades',           5,  5),
    (41, '^QA/QC$',         '.*',                'QA/QC Inspectors',           2,  2),
    -- Testing & commissioning
    (50, '^Commissioning$', 'Electrical|ELV|Fire Alarm|Integrated',
                                                 'MEP Electrical Technicians', 4,  4),
    (51, '^Commissioning$', '.*',                'MEP Mechanical & Plumbing Fitters', 4, 4);

  -- --------------------------------------------------------------------------
  -- 3. Assignments — rebuild for the seeded resources only
  -- --------------------------------------------------------------------------
  DELETE FROM public.plan_task_assignments a
  USING  public.plan_resources r
  WHERE  a.resource_id = r.id
    AND  r.project_id  = pid
    AND  r.name IN (SELECT name FROM _seed_res);

  -- 3a. Labour: one trade per construction / testing task
  INSERT INTO public.plan_task_assignments (task_id, resource_id, allocation_percent)
  SELECT p.task_id, r.id, p.workers * 100
  FROM (
    SELECT DISTINCT ON (t.id)
           t.id AS task_id,
           m.res,
           CASE WHEN (t.end_date - t.start_date) + 1 > 14 THEN m.w_long ELSE m.w_short END AS workers
    FROM   public.wbs_tasks t
    JOIN   _seed_map m
      ON   t.discipline ~ m.disc AND t.task_name ~* m.nm
    WHERE  t.project_id = pid
      AND  t.start_date IS NOT NULL AND t.end_date IS NOT NULL
      AND  (t.task_code LIKE '03.%' OR t.task_code LIKE '04.%')
    ORDER BY t.id, m.ord
  ) p
  JOIN public.plan_resources r ON r.project_id = pid AND r.name = p.res
  ON CONFLICT (task_id, resource_id) DO UPDATE SET allocation_percent = EXCLUDED.allocation_percent;

  -- 3b. Equipment (added after labour so a task's first assignment is its trade):
  --     the concrete pump serves each pour; the tower crane lifts formwork and
  --     rebar at 20% of its time per task (up to five tasks share the one crane).
  INSERT INTO public.plan_task_assignments (task_id, resource_id, allocation_percent)
  SELECT t.id, r.id, 100
  FROM   public.wbs_tasks t
  JOIN   public.plan_resources r ON r.project_id = pid AND r.name = 'Concrete Pump'
  WHERE  t.project_id = pid
    AND  t.discipline = 'Structural'
    AND  (t.task_code LIKE '03.%')
    AND  t.start_date IS NOT NULL AND t.end_date IS NOT NULL
    AND  t.task_name ~* 'Concrete Pour|Column Concrete|Shear Wall Concrete|Ground Beam Concrete|Pile Cap Concrete|Roof Slab|B1 Slab'
  ON CONFLICT (task_id, resource_id) DO UPDATE SET allocation_percent = EXCLUDED.allocation_percent;

  INSERT INTO public.plan_task_assignments (task_id, resource_id, allocation_percent)
  SELECT t.id, r.id, 20
  FROM   public.wbs_tasks t
  JOIN   public.plan_resources r ON r.project_id = pid AND r.name = 'Tower Crane TC-1'
  WHERE  t.project_id = pid
    AND  t.discipline = 'Structural'
    AND  (t.task_code LIKE '03.%')
    AND  t.start_date IS NOT NULL AND t.end_date IS NOT NULL
    AND  t.task_name ~* 'Formwork|Reinforcement'
  ON CONFLICT (task_id, resource_id) DO UPDATE SET allocation_percent = EXCLUDED.allocation_percent;

  -- --------------------------------------------------------------------------
  -- 4. Report
  -- --------------------------------------------------------------------------
  SELECT count(*) INTO n_res
  FROM   public.plan_resources WHERE project_id = pid AND name IN (SELECT name FROM _seed_res);

  SELECT count(*) INTO n_assign
  FROM   public.plan_task_assignments a
  JOIN   public.plan_resources r ON r.id = a.resource_id
  WHERE  r.project_id = pid AND r.name IN (SELECT name FROM _seed_res);

  RAISE NOTICE 'PRJ-2026-004-PC: % resources, % task assignments seeded (project %).', n_res, n_assign, pid;
END $$;

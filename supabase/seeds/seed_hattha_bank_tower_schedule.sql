-- =============================================================================
-- Seed: Hattha Bank Tower — full multi-discipline test programme
-- =============================================================================
-- Builds a clean, self-contained schedule for the "Hattha Bank Tower" project
-- so the Planning ▸ Gantt Chart can be demoed / tested end to end.
--
-- Scope:
--   * Buildings ....... BA (Bank Tower), BB (Annex Block), EXT (External Works)
--   * Phases .......... Design (P1) and Construction (P2) for every building
--   * Disciplines ..... ARC / STR / MEP under every phase
--   * ~34 activities with finish-to-start links, 6 milestones, mixed progress
--
-- Everything created here is prefixed  HBT-  so it is easy to spot and remove:
--
--   DO $$
--   DECLARE pid uuid;
--   BEGIN
--     SELECT id INTO pid FROM public.projects
--       WHERE project_code = 'PJR-2026-001' OR project_name ILIKE 'Hattha%Bank%Tower%'
--       ORDER BY (project_code = 'PJR-2026-001') DESC LIMIT 1;
--     DELETE FROM public.wbs_tasks  WHERE project_id = pid AND task_code LIKE 'HBT-%';
--     DELETE FROM public.wbs_nodes  WHERE project_id = pid AND wbs_code  LIKE 'HBT-%';
--   END $$;
--
-- Re-running this file is safe: it deletes its own previous output first.
-- Requires the migration 20260902000003_wbs_tasks_activity_detail_fields.sql
-- (adds activity_type / actual_start_date / actual_finish_date).
-- =============================================================================

DO $$
DECLARE
  pid  uuid;
  d0   date := DATE '2026-01-05';   -- programme day zero — shift this to re-base
BEGIN
  -- --------------------------------------------------------------------------
  -- 0. Resolve the project
  -- --------------------------------------------------------------------------
  SELECT id INTO pid
  FROM   public.projects
  WHERE  project_code = 'PJR-2026-001'
     OR  project_name ILIKE 'Hattha%Bank%Tower%'
  ORDER BY (project_code = 'PJR-2026-001') DESC
  LIMIT 1;

  IF pid IS NULL THEN
    RAISE EXCEPTION 'Project "Hattha Bank Tower" (project_code PJR-2026-001) not found. Create it first.';
  END IF;

  RAISE NOTICE 'Seeding Hattha Bank Tower schedule into project %', pid;

  -- --------------------------------------------------------------------------
  -- 0b. Progress-rollup safety net
  -- The wbs_tasks / wbs_nodes statement-level triggers (trg_*_flush_dirty) read
  -- a session temp table that is only created by the row-level triggers. A
  -- statement that matches zero rows fires the flush but not the row trigger,
  -- so the flush aborts with: relation "_wbs_dirty_projects" does not exist.
  -- Pre-creating it here makes every statement below safe.
  -- --------------------------------------------------------------------------
  CREATE TEMP TABLE IF NOT EXISTS _wbs_dirty_projects (project_id uuid PRIMARY KEY)
    ON COMMIT DELETE ROWS;

  -- --------------------------------------------------------------------------
  -- 1. Clean previous run
  -- --------------------------------------------------------------------------
  DELETE FROM public.wbs_tasks WHERE project_id = pid AND task_code LIKE 'HBT-%';
  DELETE FROM public.wbs_nodes WHERE project_id = pid AND wbs_code  LIKE 'HBT-%';

  -- --------------------------------------------------------------------------
  -- 2. WBS scaffold  (buildings -> phase -> discipline)
  --    Codes are hierarchical: HBT-<bld>-<phase>-<disc>
  --    Parents are wired afterwards by trimming the last "-segment".
  -- --------------------------------------------------------------------------
  INSERT INTO public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  SELECT pid, NULL, v.ntype, v.code, v.name, v.so
  FROM (VALUES
    -- buildings
    ('building',   'HBT-BA',        'BA · Bank Tower',              100),
    ('building',   'HBT-BB',        'BB · Annex Block',             200),
    ('building',   'HBT-EXT',       'EXT · External Works',         300),
    -- BA
    ('task_group', 'HBT-BA-P1',     'BA · Design',                  110),
    ('discipline', 'HBT-BA-P1-AR',  'BA · Design · ARC',            111),
    ('discipline', 'HBT-BA-P1-ME',  'BA · Design · MEP',            112),
    ('discipline', 'HBT-BA-P1-ST',  'BA · Design · STR',            113),
    ('task_group', 'HBT-BA-P2',     'BA · Construction',            120),
    ('discipline', 'HBT-BA-P2-AR',  'BA · Construction · ARC',      121),
    ('discipline', 'HBT-BA-P2-ME',  'BA · Construction · MEP',      122),
    ('discipline', 'HBT-BA-P2-ST',  'BA · Construction · STR',      123),
    -- BB
    ('task_group', 'HBT-BB-P1',     'BB · Design',                  210),
    ('discipline', 'HBT-BB-P1-AR',  'BB · Design · ARC',            211),
    ('discipline', 'HBT-BB-P1-ME',  'BB · Design · MEP',            212),
    ('discipline', 'HBT-BB-P1-ST',  'BB · Design · STR',            213),
    ('task_group', 'HBT-BB-P2',     'BB · Construction',            220),
    ('discipline', 'HBT-BB-P2-AR',  'BB · Construction · ARC',      221),
    ('discipline', 'HBT-BB-P2-ME',  'BB · Construction · MEP',      222),
    ('discipline', 'HBT-BB-P2-ST',  'BB · Construction · STR',      223),
    -- EXT
    ('task_group', 'HBT-EXT-P1',    'EXT · Design',                 310),
    ('discipline', 'HBT-EXT-P1-AR', 'EXT · Design · ARC',           311),
    ('discipline', 'HBT-EXT-P1-ME', 'EXT · Design · MEP',           312),
    ('discipline', 'HBT-EXT-P1-ST', 'EXT · Design · STR',           313),
    ('task_group', 'HBT-EXT-P2',    'EXT · Construction',           320),
    ('discipline', 'HBT-EXT-P2-AR', 'EXT · Construction · ARC',     321),
    ('discipline', 'HBT-EXT-P2-ME', 'EXT · Construction · MEP',     322),
    ('discipline', 'HBT-EXT-P2-ST', 'EXT · Construction · STR',     323)
  ) AS v(ntype, code, name, so);

  -- wire parents: parent code = child code minus its final "-<segment>"
  UPDATE public.wbs_nodes c
  SET    parent_id = p.id
  FROM   public.wbs_nodes p
  WHERE  c.project_id = pid
    AND  p.project_id = pid
    AND  c.wbs_code LIKE 'HBT-%'
    AND  p.wbs_code LIKE 'HBT-%'
    AND  p.wbs_code = left(c.wbs_code, length(c.wbs_code) - strpos(reverse(c.wbs_code), '-'))
    AND  c.wbs_code <> p.wbs_code;

  -- --------------------------------------------------------------------------
  -- 3. Activities  (no links yet)
  --    v(node, code, name, disc, owner, status, progress, priority,
  --      atype, dstat, s, e, ms, so)   — s/e are day offsets from d0
  -- --------------------------------------------------------------------------
  INSERT INTO public.wbs_tasks
    (project_id, wbs_node_id, task_code, task_name, discipline, owner_name,
     status, progress, priority, activity_type, delay_status,
     start_date, end_date, is_milestone, sort_order)
  SELECT pid, n.id, v.code, v.name, v.disc, v.owner,
         v.status, v.progress, v.priority, v.atype, v.dstat,
         d0 + v.s, d0 + v.e, v.ms, v.so
  FROM (VALUES
    -- ============================ BA · DESIGN ==============================
    ('HBT-BA-P1-AR','HBT-BA-D-AR-01','ARC — Concept & Schematic Design (BA)',        'ARC','ARC Design Team','completed',   100,'medium','normal',          'on_track',   0, 14,false,10),
    ('HBT-BA-P1-ST','HBT-BA-D-ST-01','STR — Superstructure Analysis & Design (BA)',  'STR','STR Design Team','completed',   100,'high',  'normal',          'on_track',  15, 35,false,20),
    ('HBT-BA-P1-ME','HBT-BA-D-ME-01','MEP — Services Design & Load Calculations (BA)','MEP','MEP Design Team','in_progress',  75,'medium','normal',          'on_track',  15, 35,false,30),
    ('HBT-BA-P1-AR','HBT-BA-D-AR-02','ARC — Detailed Design & IFC Drawings (BA)',    'ARC','ARC Design Team','in_progress',  35,'high',  'normal',          'risk',      36, 61,false,40),
    ('HBT-BA-P1',   'HBT-BA-D-MS-01','Milestone — BA Design Complete / IFC Issued',  'PM', 'Project Controls','open',          0,'high',  'finish_milestone','on_track',  62, 62,true, 50),
    -- ========================= BA · CONSTRUCTION ==========================
    ('HBT-BA-P2-ST','HBT-BA-C-ST-01','STR — Piling & Pile Caps (BA)',                'STR','STR Site Team','open',             0,'high',  'normal',          'on_track',  64, 84,false,10),
    ('HBT-BA-P2-ST','HBT-BA-C-ST-02','STR — Raft & Basement Structure (BA)',         'STR','STR Site Team','open',             0,'high',  'normal',          'on_track',  85,110,false,20),
    ('HBT-BA-P2-ST','HBT-BA-C-ST-03','STR — Superstructure RC Frame L1–L18 (BA)',    'STR','STR Site Team','open',             0,'critical','normal',        'on_track', 111,171,false,30),
    ('HBT-BA-P2-ME','HBT-BA-C-ME-01','MEP — Vertical Risers & Services Rough-in (BA)','MEP','MEP Site Team','open',            0,'medium','normal',          'on_track', 172,207,false,40),
    ('HBT-BA-P2-AR','HBT-BA-C-AR-01','ARC — Facade & Curtain Wall Installation (BA)','ARC','ARC Site Team','open',             0,'medium','normal',          'on_track', 172,212,false,50),
    ('HBT-BA-P2-AR','HBT-BA-C-AR-02','ARC — Internal Fit-out & Finishes (BA)',       'ARC','ARC Site Team','open',             0,'medium','normal',          'on_track', 172,217,false,60),
    ('HBT-BA-P2-ME','HBT-BA-C-ME-02','MEP — Testing, Balancing & Commissioning (BA)','MEP','MEP Site Team','open',             0,'high',  'normal',          'on_track', 218,238,false,70),
    ('HBT-BA-P2',   'HBT-BA-C-MS-01','Milestone — BA Practical Completion',          'PM', 'Project Controls','open',          0,'high',  'finish_milestone','on_track', 239,239,true, 80),
    -- ============================ BB · DESIGN ==============================
    ('HBT-BB-P1-AR','HBT-BB-D-AR-01','ARC — Podium Architectural Design (BB)',       'ARC','ARC Design Team','completed',   100,'medium','normal',          'on_track',  20, 32,false,10),
    ('HBT-BB-P1-ST','HBT-BB-D-ST-01','STR — Podium & Basement Structural Design (BB)','STR','STR Design Team','in_progress', 60,'high',  'normal',          'delayed',   33, 48,false,20),
    ('HBT-BB-P1-ME','HBT-BB-D-ME-01','MEP — Podium Services Design (BB)',            'MEP','MEP Design Team','in_progress',  50,'medium','normal',          'on_track',  33, 48,false,30),
    ('HBT-BB-P1',   'HBT-BB-D-MS-01','Milestone — BB Design Complete',               'PM', 'Project Controls','open',          0,'high',  'finish_milestone','on_track',  49, 49,true, 40),
    -- ========================= BB · CONSTRUCTION ==========================
    ('HBT-BB-P2-ST','HBT-BB-C-ST-01','STR — Substructure & Ground Slab (BB)',        'STR','STR Site Team','open',             0,'high',  'normal',          'on_track',  70, 90,false,10),
    ('HBT-BB-P2-ST','HBT-BB-C-ST-02','STR — Podium RC Frame (L1–L3) (BB)',           'STR','STR Site Team','open',             0,'high',  'normal',          'on_track',  91,121,false,20),
    ('HBT-BB-P2-ME','HBT-BB-C-ME-01','MEP — Services Installation & Rough-in (BB)',  'MEP','MEP Site Team','open',             0,'medium','normal',          'on_track', 122,147,false,30),
    ('HBT-BB-P2-AR','HBT-BB-C-AR-01','ARC — Roofing & External Envelope (BB)',       'ARC','ARC Site Team','open',             0,'medium','normal',          'on_track', 122,142,false,40),
    ('HBT-BB-P2-AR','HBT-BB-C-AR-02','ARC — Retail Shell & Core Fit-out (BB)',       'ARC','ARC Site Team','open',             0,'medium','normal',          'on_track', 148,173,false,50),
    ('HBT-BB-P2-ME','HBT-BB-C-ME-02','MEP — Testing & Commissioning (BB)',           'MEP','MEP Site Team','open',             0,'high',  'normal',          'on_track', 174,186,false,60),
    ('HBT-BB-P2',   'HBT-BB-C-MS-01','Milestone — BB Practical Completion',          'PM', 'Project Controls','open',          0,'high',  'finish_milestone','on_track', 187,187,true, 70),
    -- ========================= EXT · DESIGN ===============================
    ('HBT-EXT-P1-AR','HBT-EXT-D-AR-01','ARC — Hardscape & Landscape Design',         'ARC','ARC Design Team','completed',   100,'low',   'normal',          'on_track',  40, 50,false,10),
    ('HBT-EXT-P1-ST','HBT-EXT-D-ST-01','STR — Retaining Walls & Boundary Structure Design','STR','STR Design Team','completed',100,'medium','normal',      'on_track',  40, 50,false,20),
    ('HBT-EXT-P1-ME','HBT-EXT-D-ME-01','MEP — External Utilities, Drainage & Power Design','MEP','MEP Design Team','in_progress',40,'medium','normal',     'on_track',  40, 52,false,30),
    ('HBT-EXT-P1',   'HBT-EXT-D-MS-01','Milestone — External Works Design Complete', 'PM', 'Project Controls','open',          0,'medium','finish_milestone','on_track',  53, 53,true, 40),
    -- ======================= EXT · CONSTRUCTION ==========================
    ('HBT-EXT-P2-ST','HBT-EXT-C-ST-01','STR — Site Retaining Walls & Boundary Wall', 'STR','STR Site Team','open',             0,'medium','normal',          'on_track', 180,205,false,10),
    ('HBT-EXT-P2-ME','HBT-EXT-C-ME-01','MEP — External Drainage, Water & Power Reticulation','MEP','MEP Site Team','open',      0,'medium','normal',          'on_track', 206,236,false,20),
    ('HBT-EXT-P2-AR','HBT-EXT-C-AR-01','ARC — Roads, Kerbs, Paving & Parking',       'ARC','ARC Site Team','open',             0,'medium','normal',          'on_track', 237,262,false,30),
    ('HBT-EXT-P2-AR','HBT-EXT-C-AR-02','ARC — Soft Landscaping & Site Furniture',    'ARC','ARC Site Team','open',             0,'low',   'normal',          'on_track', 263,283,false,40),
    ('HBT-EXT-P2',   'HBT-EXT-C-MS-01','Milestone — Site Handover / Overall Completion','PM','Project Controls','open',        0,'high',  'finish_milestone','on_track', 284,284,true, 50)
  ) AS v(node, code, name, disc, owner, status, progress, priority, atype, dstat, s, e, ms, so)
  JOIN public.wbs_nodes n ON n.project_id = pid AND n.wbs_code = v.node;

  -- --------------------------------------------------------------------------
  -- 4. Dependencies  (all Finish-to-Start, zero lag)
  -- --------------------------------------------------------------------------
  UPDATE public.wbs_tasks s
  SET    dependency_task_ids = agg.ids,
         dependency_types    = agg.types,
         dependency_lag_days = agg.lags
  FROM (
    SELECT d.succ,
           array_agg(pt.id           ORDER BY pt.task_code) AS ids,
           array_agg('fs'::text      ORDER BY pt.task_code) AS types,
           array_agg(0::numeric      ORDER BY pt.task_code) AS lags
    FROM (VALUES
      ('HBT-BA-D-ST-01',  ARRAY['HBT-BA-D-AR-01']),
      ('HBT-BA-D-ME-01',  ARRAY['HBT-BA-D-AR-01']),
      ('HBT-BA-D-AR-02',  ARRAY['HBT-BA-D-ST-01','HBT-BA-D-ME-01']),
      ('HBT-BA-D-MS-01',  ARRAY['HBT-BA-D-AR-02']),
      ('HBT-BA-C-ST-01',  ARRAY['HBT-BA-D-MS-01']),
      ('HBT-BA-C-ST-02',  ARRAY['HBT-BA-C-ST-01']),
      ('HBT-BA-C-ST-03',  ARRAY['HBT-BA-C-ST-02']),
      ('HBT-BA-C-ME-01',  ARRAY['HBT-BA-C-ST-03']),
      ('HBT-BA-C-AR-01',  ARRAY['HBT-BA-C-ST-03']),
      ('HBT-BA-C-AR-02',  ARRAY['HBT-BA-C-ST-03']),
      ('HBT-BA-C-ME-02',  ARRAY['HBT-BA-C-ME-01','HBT-BA-C-AR-02']),
      ('HBT-BA-C-MS-01',  ARRAY['HBT-BA-C-ME-02','HBT-BA-C-AR-01']),
      ('HBT-BB-D-ST-01',  ARRAY['HBT-BB-D-AR-01']),
      ('HBT-BB-D-ME-01',  ARRAY['HBT-BB-D-AR-01']),
      ('HBT-BB-D-MS-01',  ARRAY['HBT-BB-D-ST-01','HBT-BB-D-ME-01']),
      ('HBT-BB-C-ST-01',  ARRAY['HBT-BB-D-MS-01']),
      ('HBT-BB-C-ST-02',  ARRAY['HBT-BB-C-ST-01']),
      ('HBT-BB-C-ME-01',  ARRAY['HBT-BB-C-ST-02']),
      ('HBT-BB-C-AR-01',  ARRAY['HBT-BB-C-ST-02']),
      ('HBT-BB-C-AR-02',  ARRAY['HBT-BB-C-AR-01','HBT-BB-C-ME-01']),
      ('HBT-BB-C-ME-02',  ARRAY['HBT-BB-C-AR-02']),
      ('HBT-BB-C-MS-01',  ARRAY['HBT-BB-C-ME-02']),
      ('HBT-EXT-D-MS-01', ARRAY['HBT-EXT-D-AR-01','HBT-EXT-D-ST-01','HBT-EXT-D-ME-01']),
      ('HBT-EXT-C-ST-01', ARRAY['HBT-EXT-D-MS-01','HBT-BA-C-ST-02']),
      ('HBT-EXT-C-ME-01', ARRAY['HBT-EXT-C-ST-01']),
      ('HBT-EXT-C-AR-01', ARRAY['HBT-EXT-C-ME-01']),
      ('HBT-EXT-C-AR-02', ARRAY['HBT-EXT-C-AR-01']),
      ('HBT-EXT-C-MS-01', ARRAY['HBT-EXT-C-AR-02','HBT-BA-C-MS-01','HBT-BB-C-MS-01'])
    ) AS d(succ, preds)
    JOIN public.wbs_tasks pt
      ON pt.project_id = pid AND pt.task_code = ANY(d.preds)
    GROUP BY d.succ
  ) AS agg
  WHERE s.project_id = pid AND s.task_code = agg.succ;

  -- --------------------------------------------------------------------------
  -- 5. Actuals / field notes for started work (exercises the Progress tab)
  -- --------------------------------------------------------------------------
  UPDATE public.wbs_tasks
  SET    actual_start_date  = start_date,
         actual_finish_date = end_date
  WHERE  project_id = pid AND task_code LIKE 'HBT-%' AND status = 'completed';

  UPDATE public.wbs_tasks
  SET    actual_start_date        = start_date,
         field_observation_notes  = 'Work in progress — refer to latest weekly site progress report.'
  WHERE  project_id = pid AND task_code LIKE 'HBT-%' AND status = 'in_progress';

  -- --------------------------------------------------------------------------
  -- 6. Set the project data date so "today" lands mid-programme when testing
  --    (only if the projects.data_date column exists in this schema)
  -- --------------------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'data_date'
  ) THEN
    EXECUTE format('UPDATE public.projects SET data_date = %L WHERE id = %L AND data_date IS NULL',
                   d0 + 85, pid);
  END IF;

  RAISE NOTICE 'Hattha Bank Tower schedule seeded: % nodes, % activities.',
    (SELECT count(*) FROM public.wbs_nodes WHERE project_id = pid AND wbs_code  LIKE 'HBT-%'),
    (SELECT count(*) FROM public.wbs_tasks WHERE project_id = pid AND task_code LIKE 'HBT-%');
END $$;

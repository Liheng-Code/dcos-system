-- Site Execution Module
-- Tables: site_daily_reports, site_manpower, site_equipment, site_progress_photos

-- ── Daily Reports (Site Diary) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_daily_reports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  report_date         DATE NOT NULL,
  weather_conditions  TEXT,
  temperature_low     NUMERIC(4,1),
  temperature_high    NUMERIC(4,1),
  site_conditions     TEXT,
  work_summary        TEXT,
  issues_encountered  TEXT,
  planned_next_day    TEXT,
  created_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Manpower Tracking ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_manpower (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  report_date   DATE NOT NULL,
  trade         TEXT NOT NULL,
  contractor    TEXT,
  foreman       TEXT,
  total_workers INTEGER NOT NULL DEFAULT 0,
  skilled       INTEGER DEFAULT 0,
  unskilled     INTEGER DEFAULT 0,
  regular_hours NUMERIC(5,1) DEFAULT 0,
  ot_hours      NUMERIC(5,1) DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Equipment Tracking ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_equipment (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  equipment_name   TEXT NOT NULL,
  equipment_code   TEXT,
  equipment_type   TEXT,
  operator         TEXT,
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','idle','under_maintenance','off_site')),
  hours_operated   NUMERIC(6,1) DEFAULT 0,
  fuel_litres      NUMERIC(8,1) DEFAULT 0,
  location         TEXT,
  date             DATE NOT NULL,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Progress Photos ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_progress_photos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  wbs_node_id UUID REFERENCES public.wbs_nodes(id) ON DELETE SET NULL,
  photo_url   TEXT NOT NULL,
  caption     TEXT,
  location    TEXT,
  taken_at    TIMESTAMPTZ,
  taken_by    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_site_daily_reports_project  ON public.site_daily_reports(project_id, report_date);
CREATE INDEX IF NOT EXISTS idx_site_manpower_project       ON public.site_manpower(project_id, report_date);
CREATE INDEX IF NOT EXISTS idx_site_equipment_project      ON public.site_equipment(project_id, date);
CREATE INDEX IF NOT EXISTS idx_site_progress_photos_project ON public.site_progress_photos(project_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.site_daily_reports   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_manpower        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_equipment       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_progress_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_site_daily_reports"   ON public.site_daily_reports   TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_site_manpower"        ON public.site_manpower        TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_site_equipment"       ON public.site_equipment       TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_site_progress_photos" ON public.site_progress_photos TO authenticated USING (true) WITH CHECK (true);

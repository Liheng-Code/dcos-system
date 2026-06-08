-- HSE Module — Health, Safety, Environment
-- Tables: hse_permits, hse_toolbox_talks, hse_incidents, hse_risk_assessments, hse_observations

-- ── Work Permits ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hse_permits (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  permit_number    TEXT NOT NULL,
  permit_type      TEXT NOT NULL CHECK (permit_type IN (
    'hot_work','confined_space','work_at_height','excavation','electrical','lifting',
    'chemical','cold_work','general'
  )),
  title            TEXT NOT NULL,
  description      TEXT,
  location         TEXT,
  requested_by     TEXT,
  requested_date   DATE DEFAULT CURRENT_DATE,
  start_date       DATE,
  end_date         DATE,
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','submitted','approved','active','closed','cancelled','rejected'
  )),
  permit_conditions TEXT,
  safety_measures   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Toolbox Talks ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hse_toolbox_talks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  talk_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  topic            TEXT NOT NULL,
  presenter        TEXT,
  attendees_count  INTEGER DEFAULT 0,
  topics_covered   TEXT,
  notes            TEXT,
  duration_minutes INTEGER DEFAULT 15,
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Incidents ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hse_incidents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  incident_number   TEXT NOT NULL,
  incident_type     TEXT NOT NULL CHECK (incident_type IN (
    'near_miss','first_aid','medical_treatment','lost_time','fatality','property_damage','environmental'
  )),
  incident_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  incident_time     TIME,
  location          TEXT,
  description       TEXT NOT NULL,
  immediate_action  TEXT,
  root_cause        TEXT,
  severity          TEXT NOT NULL DEFAULT 'minor' CHECK (severity IN ('minor','moderate','serious','critical')),
  status            TEXT NOT NULL DEFAULT 'reported' CHECK (status IN (
    'reported','investigating','resolved','closed'
  )),
  reported_by       TEXT,
  affected_person   TEXT,
  corrective_action TEXT,
  preventive_action TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Risk Assessments ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hse_risk_assessments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  assessment_number TEXT NOT NULL,
  title             TEXT NOT NULL,
  activity          TEXT,
  location          TEXT,
  assessment_date   DATE DEFAULT CURRENT_DATE,
  assessor          TEXT,
  review_date       DATE,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','reviewed','approved','superseded'
  )),
  risk_matrix       JSONB DEFAULT '[]'::jsonb,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Safety Observations ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hse_observations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  observation_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  observer          TEXT,
  location          TEXT,
  observation_type  TEXT NOT NULL CHECK (observation_type IN (
    'safe_act','unsafe_act','safe_condition','unsafe_condition'
  )),
  description       TEXT NOT NULL,
  immediate_action  TEXT,
  category          TEXT NOT NULL DEFAULT 'other' CHECK (category IN (
    'housekeeping','ppe','equipment','behavior','environmental','other'
  )),
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_hse_permits_project       ON public.hse_permits(project_id, permit_type);
CREATE INDEX IF NOT EXISTS idx_hse_toolbox_project       ON public.hse_toolbox_talks(project_id, talk_date);
CREATE INDEX IF NOT EXISTS idx_hse_incidents_project      ON public.hse_incidents(project_id, incident_date);
CREATE INDEX IF NOT EXISTS idx_hse_risk_project           ON public.hse_risk_assessments(project_id);
CREATE INDEX IF NOT EXISTS idx_hse_observations_project   ON public.hse_observations(project_id, observation_date);

-- ── RLS ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.hse_permits            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hse_toolbox_talks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hse_incidents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hse_risk_assessments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hse_observations       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_hse_permits"           ON public.hse_permits          TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_hse_toolbox_talks"     ON public.hse_toolbox_talks     TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_hse_incidents"         ON public.hse_incidents        TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_hse_risk_assessments"  ON public.hse_risk_assessments TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_hse_observations"      ON public.hse_observations     TO authenticated USING (true) WITH CHECK (true);

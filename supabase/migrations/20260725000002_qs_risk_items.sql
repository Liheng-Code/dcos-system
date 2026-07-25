-- Post-contract risk register. Risks carried over from tender_risk_items during
-- award conversion, plus new risks identified during execution.

CREATE TABLE qs_risk_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  risk_no         TEXT NOT NULL,
  description     TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (
    category IN ('technical','commercial','schedule','geotechnical',
                 'market','regulatory','environmental','other')
  ),
  likelihood      TEXT NOT NULL CHECK (
    likelihood IN ('very_low','low','medium','high','very_high')
  ),
  impact          TEXT NOT NULL CHECK (
    impact IN ('very_low','low','medium','high','very_high')
  ),
  risk_score      TEXT GENERATED ALWAYS AS (
    CASE
      WHEN likelihood IN ('very_high','high') AND impact IN ('very_high','high') THEN 'critical'
      WHEN likelihood IN ('very_high','high') OR impact IN ('very_high','high') THEN 'high'
      WHEN likelihood = 'medium' AND impact = 'medium' THEN 'medium'
      ELSE 'low'
    END
  ) STORED,
  priced_amount   NUMERIC(15,2) DEFAULT 0,
  mitigation      TEXT,
  owner           TEXT,
  source          TEXT NOT NULL DEFAULT 'execution',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(project_id, risk_no)
);

CREATE INDEX idx_qs_risk_items_project ON qs_risk_items(project_id);

ALTER TABLE qs_risk_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project members can view risk items"
  ON qs_risk_items FOR SELECT
  USING (project_id IN (
    SELECT pst.project_id FROM project_team_members ptm
    JOIN project_stakeholder_teams pst ON pst.id = ptm.project_stakeholder_team_id
    JOIN stakeholder_staff ss ON ss.id = ptm.stakeholder_staff_id
    WHERE ss.profile_id = auth.uid()
    UNION
    SELECT projects.id FROM projects WHERE projects.project_manager_id = auth.uid()
  ));

CREATE POLICY "project managers can manage risk items"
  ON qs_risk_items FOR ALL
  USING (project_id IN (
    SELECT projects.id FROM projects WHERE projects.project_manager_id = auth.uid()
  ));

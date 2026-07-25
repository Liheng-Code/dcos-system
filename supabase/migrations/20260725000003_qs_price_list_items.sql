-- Post-contract price list. Carried over from tender_price_list during award
-- conversion. Stores the locked baseline rates for the postcontract project.

CREATE TABLE qs_price_list_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_code         TEXT NOT NULL,
  section           TEXT,
  sub_section       TEXT,
  sub_element       TEXT,
  description       TEXT NOT NULL,
  unit              TEXT NOT NULL DEFAULT 'ea',
  labor_net_cost    NUMERIC(15,2) NOT NULL DEFAULT 0,
  labor_margin_pct  NUMERIC(5,2)  NOT NULL DEFAULT 0,
  labor_rate        NUMERIC(15,2) GENERATED ALWAYS AS (labor_net_cost * (1 + labor_margin_pct / 100)) STORED,
  material_net_cost NUMERIC(15,2) NOT NULL DEFAULT 0,
  material_margin_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  material_rate     NUMERIC(15,2) GENERATED ALWAYS AS (material_net_cost * (1 + material_margin_pct / 100)) STORED,
  total_rate        NUMERIC(15,2) GENERATED ALWAYS AS (
    (labor_net_cost * (1 + labor_margin_pct / 100)) +
    (material_net_cost * (1 + material_margin_pct / 100))
  ) STORED,
  basis_source      TEXT,
  budget_code_id    UUID REFERENCES budget_codes(id) ON DELETE SET NULL,
  source_tender_price_list_id UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(project_id, item_code)
);

CREATE INDEX idx_qs_price_list_items_project ON qs_price_list_items(project_id);

ALTER TABLE qs_price_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project members can view price list items"
  ON qs_price_list_items FOR SELECT
  USING (project_id IN (
    SELECT pst.project_id FROM project_team_members ptm
    JOIN project_stakeholder_teams pst ON pst.id = ptm.project_stakeholder_team_id
    JOIN stakeholder_staff ss ON ss.id = ptm.stakeholder_staff_id
    WHERE ss.profile_id = auth.uid()
    UNION
    SELECT projects.id FROM projects WHERE projects.project_manager_id = auth.uid()
  ));

CREATE POLICY "project managers can manage price list items"
  ON qs_price_list_items FOR ALL
  USING (project_id IN (
    SELECT projects.id FROM projects WHERE projects.project_manager_id = auth.uid()
  ));

-- Stores the tender-to-postcontract snapshot metadata and bid summary values.
-- Created during award conversion; read-only reference for the postcontract project.

CREATE TABLE qs_contract_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tender_id       UUID NOT NULL REFERENCES tender_register(id) ON DELETE CASCADE,
  tender_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  converted_by    UUID REFERENCES profiles(id),
  converted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Bid summary snapshot (locked copy of tender_bid_summaries latest revision)
  direct_cost         NUMERIC(15,2) NOT NULL DEFAULT 0,
  preliminaries       NUMERIC(15,2) NOT NULL DEFAULT 0,
  subcontract_cost    NUMERIC(15,2) NOT NULL DEFAULT 0,
  overhead_pct        NUMERIC(5,2)  NOT NULL DEFAULT 0,
  overhead_amount     NUMERIC(15,2) NOT NULL DEFAULT 0,
  profit_pct          NUMERIC(5,2)  NOT NULL DEFAULT 0,
  profit_amount       NUMERIC(15,2) NOT NULL DEFAULT 0,
  contingency         NUMERIC(15,2) NOT NULL DEFAULT 0,
  risk_allowance      NUMERIC(15,2) NOT NULL DEFAULT 0,
  vat_pct             NUMERIC(5,2)  NOT NULL DEFAULT 0,
  vat_amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_bid_price     NUMERIC(15,2) NOT NULL DEFAULT 0,

  -- Counts for quick reference
  boq_item_count      INTEGER NOT NULL DEFAULT 0,
  price_list_count    INTEGER NOT NULL DEFAULT 0,
  prelims_count       INTEGER NOT NULL DEFAULT 0,
  risk_count          INTEGER NOT NULL DEFAULT 0,

  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_qs_contract_snapshots_project ON qs_contract_snapshots(project_id);
CREATE INDEX idx_qs_contract_snapshots_tender ON qs_contract_snapshots(tender_id);

ALTER TABLE qs_contract_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project members can view contract snapshots"
  ON qs_contract_snapshots FOR SELECT
  USING (project_id IN (
    SELECT pst.project_id FROM project_team_members ptm
    JOIN project_stakeholder_teams pst ON pst.id = ptm.project_stakeholder_team_id
    JOIN stakeholder_staff ss ON ss.id = ptm.stakeholder_staff_id
    WHERE ss.profile_id = auth.uid()
    UNION
    SELECT projects.id FROM projects WHERE projects.project_manager_id = auth.uid()
  ));

CREATE POLICY "project managers can insert contract snapshots"
  ON qs_contract_snapshots FOR INSERT
  WITH CHECK (project_id IN (
    SELECT projects.id FROM projects WHERE projects.project_manager_id = auth.uid()
  ));

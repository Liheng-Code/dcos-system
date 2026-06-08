-- ============================================================
-- Payroll Cost Allocation Table (R2.4-A)
-- Connects payroll entries to Project / WBS / Task / Department
-- ============================================================

CREATE TABLE payroll_cost_allocations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_entry_id    uuid NOT NULL REFERENCES payroll_entries(id) ON DELETE CASCADE,
  project_id          uuid,           -- FK to projects table if it exists
  wbs_element_id      uuid,           -- FK to wbs_elements if it exists
  task_id             uuid,           -- FK to tasks if it exists
  department          text,           -- department code / name for overhead allocation
  allocation_method   text NOT NULL DEFAULT 'manual'
                      CHECK (allocation_method IN ('timesheet', 'manual', 'department_default', 'project', 'mixed')),
  allocation_percent  numeric(5,2) NOT NULL CHECK (allocation_percent >= 0 AND allocation_percent <= 100),
  allocated_amount    numeric(12,2) NOT NULL DEFAULT 0,
  is_overhead         boolean NOT NULL DEFAULT false,
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'confirmed', 'locked')),
  confirmed_by        uuid REFERENCES profiles(id),
  confirmed_at        timestamptz,
  note                text,
  created_by          uuid REFERENCES profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pca_entry   ON payroll_cost_allocations(payroll_entry_id);
CREATE INDEX idx_pca_project ON payroll_cost_allocations(project_id) WHERE project_id IS NOT NULL;

ALTER TABLE payroll_cost_allocations ENABLE ROW LEVEL SECURITY;

-- HR admin and PM can manage allocations
CREATE POLICY "pca_hr_full" ON payroll_cost_allocations
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                 AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                      AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')));

-- Finance and project managers can read (for verification and cost tracking)
CREATE POLICY "pca_finance_read" ON payroll_cost_allocations
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin'))
    OR auth.uid() = confirmed_by
  );

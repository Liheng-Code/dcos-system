-- Asset Management Tables

-- Employee Assets Catalog
CREATE TABLE employee_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code VARCHAR(100) UNIQUE NOT NULL,
  asset_name VARCHAR(255) NOT NULL,
  asset_type VARCHAR(100), -- laptop, phone, tablet, access_card, vehicle, ppe, equipment, other
  brand VARCHAR(100),
  model VARCHAR(100),
  serial_number VARCHAR(100) UNIQUE NOT NULL,
  imei VARCHAR(20),
  purchase_date DATE,
  purchase_cost DECIMAL(12, 2),
  warranty_expiry DATE,
  depreciation_rate DECIMAL(5, 2),
  status VARCHAR(50) DEFAULT 'in_stock', -- in_stock, assigned, maintenance, retired
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Asset Assignments (track which employee has which asset)
CREATE TABLE asset_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES employee_assets(id),
  assignment_date DATE NOT NULL,
  return_date DATE,
  status VARCHAR(50) DEFAULT 'active', -- active, returned, lost, damaged
  condition_on_assignment VARCHAR(100), -- new, good, fair, poor
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Asset Returns (audit trail)
CREATE TABLE asset_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES asset_assignments(id) ON DELETE CASCADE,
  return_date DATE NOT NULL,
  condition VARCHAR(100), -- new, good, fair, poor, damaged, lost
  return_notes TEXT,
  received_by_id UUID REFERENCES profiles(id),
  data_wiped BOOLEAN DEFAULT FALSE,
  data_wiped_by_id UUID REFERENCES profiles(id),
  data_wipe_date DATE,
  final_depreciation_value DECIMAL(12, 2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Asset Maintenance Records
CREATE TABLE asset_maintenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES employee_assets(id),
  maintenance_date DATE,
  maintenance_type VARCHAR(100), -- repair, upgrade, cleaning, replacement
  description TEXT,
  cost DECIMAL(12, 2),
  maintenance_provider VARCHAR(255),
  warranty_claim BOOLEAN DEFAULT FALSE,
  status VARCHAR(50) DEFAULT 'completed', -- scheduled, in_progress, completed
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_employee_assets_type ON employee_assets(asset_type);
CREATE INDEX idx_employee_assets_status ON employee_assets(status);
CREATE INDEX idx_asset_assignments_employee ON asset_assignments(employee_id);
CREATE INDEX idx_asset_assignments_asset ON asset_assignments(asset_id);
CREATE INDEX idx_asset_assignments_status ON asset_assignments(status);
CREATE INDEX idx_asset_returns_assignment ON asset_returns(assignment_id);
CREATE INDEX idx_asset_maintenance_asset ON asset_maintenance(asset_id);
CREATE INDEX idx_asset_maintenance_date ON asset_maintenance(maintenance_date);

-- RLS Policies
ALTER TABLE employee_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_maintenance ENABLE ROW LEVEL SECURITY;

-- Employee Assets: all authenticated can view, HR manages
CREATE POLICY "employee_assets_view" ON employee_assets
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "employee_assets_manage" ON employee_assets
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')));

-- Asset Assignments: employees view own, HR manages all
CREATE POLICY "asset_assignments_view_own" ON asset_assignments
  FOR SELECT TO authenticated USING (employee_id = auth.uid());

CREATE POLICY "asset_assignments_view_hr" ON asset_assignments
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'HR', 'admin')));

CREATE POLICY "asset_assignments_manage" ON asset_assignments
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')));

-- Asset Returns: HR manages
CREATE POLICY "asset_returns_view" ON asset_returns
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'HR', 'admin')));

CREATE POLICY "asset_returns_manage" ON asset_returns
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')));

-- Asset Maintenance: all authenticated can view, HR manages
CREATE POLICY "asset_maintenance_view" ON asset_maintenance
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "asset_maintenance_manage" ON asset_maintenance
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')));

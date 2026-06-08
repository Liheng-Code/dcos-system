-- Training Management Tables

-- Training Courses
CREATE TABLE training_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_code VARCHAR(50) UNIQUE NOT NULL,
  course_name VARCHAR(255) NOT NULL,
  description TEXT,
  duration_hours INT,
  provider VARCHAR(255),
  is_mandatory BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Training Records (enrollment and completion)
CREATE TABLE training_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES training_courses(id),
  enrollment_date DATE,
  completion_date DATE,
  score INT,
  status VARCHAR(50) DEFAULT 'enrolled', -- enrolled, in_progress, completed, failed
  certificate_number VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(employee_id, course_id)
);

-- Training Certificates (credentials)
CREATE TABLE training_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  certification_name VARCHAR(255) NOT NULL,
  issuing_body VARCHAR(255),
  issue_date DATE NOT NULL,
  expiry_date DATE,
  renewal_date DATE,
  certificate_number VARCHAR(100),
  status VARCHAR(50) DEFAULT 'active', -- active, expired, pending_renewal
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_training_records_employee ON training_records(employee_id);
CREATE INDEX idx_training_records_course ON training_records(course_id);
CREATE INDEX idx_training_records_status ON training_records(status);
CREATE INDEX idx_training_certificates_employee ON training_certificates(employee_id);
CREATE INDEX idx_training_certificates_expiry ON training_certificates(expiry_date);

-- RLS Policies
ALTER TABLE training_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_certificates ENABLE ROW LEVEL SECURITY;

-- Training Courses: all authenticated users can view, HR can manage
CREATE POLICY "training_courses_view" ON training_courses
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "training_courses_manage" ON training_courses
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'HR', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'HR', 'admin')));

-- Training Records: employees view own, HR manages all
CREATE POLICY "training_records_view_own" ON training_records
  FOR SELECT TO authenticated USING (employee_id = auth.uid());

CREATE POLICY "training_records_view_hr" ON training_records
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'HR', 'admin')));

CREATE POLICY "training_records_manage" ON training_records
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')));

-- Training Certificates: employees view own, HR manages all
CREATE POLICY "training_certificates_view_own" ON training_certificates
  FOR SELECT TO authenticated USING (employee_id = auth.uid());

CREATE POLICY "training_certificates_view_hr" ON training_certificates
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'HR', 'admin')));

CREATE POLICY "training_certificates_manage" ON training_certificates
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')));

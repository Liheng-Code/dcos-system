-- Recruitment Management Tables

-- Job Requisitions
CREATE TABLE job_requisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID REFERENCES positions(id),
  department_id UUID REFERENCES departments(id) NOT NULL,
  job_title VARCHAR(255) NOT NULL,
  description TEXT,
  required_experience INT, -- years
  salary_range_min DECIMAL(12, 2),
  salary_range_max DECIMAL(12, 2),
  status VARCHAR(50) DEFAULT 'draft', -- draft, approved, open, closed, filled
  approval_date DATE,
  approved_by UUID REFERENCES profiles(id),
  target_hire_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Candidates
CREATE TABLE candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id UUID NOT NULL REFERENCES job_requisitions(id) ON DELETE CASCADE,
  candidate_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  current_company VARCHAR(255),
  current_position VARCHAR(255),
  cv_url TEXT,
  years_experience INT,
  status VARCHAR(50) DEFAULT 'applied', -- applied, screening, interview, offer, rejected, hired
  rejection_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Interviews
CREATE TABLE interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  interview_type VARCHAR(50), -- phone, video, in_person, technical
  interview_date TIMESTAMP,
  interviewer_id UUID REFERENCES profiles(id),
  duration_minutes INT,
  score INT CHECK (score BETWEEN 1 AND 10),
  feedback TEXT,
  recommendation VARCHAR(50), -- strong_yes, yes, maybe, no
  status VARCHAR(50) DEFAULT 'scheduled', -- scheduled, completed, cancelled
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Offer Letters
CREATE TABLE offer_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  position_id UUID NOT NULL REFERENCES positions(id),
  job_title VARCHAR(255),
  department_id UUID NOT NULL REFERENCES departments(id),
  salary_offered DECIMAL(12, 2),
  start_date DATE,
  employment_type VARCHAR(50), -- full_time, part_time, contract, temporary
  reporting_manager_id UUID REFERENCES profiles(id),
  status VARCHAR(50) DEFAULT 'pending', -- pending, accepted, rejected, expired
  acceptance_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_job_requisitions_department ON job_requisitions(department_id);
CREATE INDEX idx_job_requisitions_status ON job_requisitions(status);
CREATE INDEX idx_candidates_requisition ON candidates(requisition_id);
CREATE INDEX idx_candidates_status ON candidates(status);
CREATE INDEX idx_interviews_candidate ON interviews(candidate_id);
CREATE INDEX idx_interviews_interviewer ON interviews(interviewer_id);
CREATE INDEX idx_interviews_status ON interviews(status);
CREATE INDEX idx_offer_letters_candidate ON offer_letters(candidate_id);
CREATE INDEX idx_offer_letters_status ON offer_letters(status);

-- RLS Policies
ALTER TABLE job_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_letters ENABLE ROW LEVEL SECURITY;

-- Job Requisitions: HR and dept managers can view/manage
CREATE POLICY "job_requisitions_view" ON job_requisitions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'HR', 'admin'))
  );

CREATE POLICY "job_requisitions_manage" ON job_requisitions
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')));

-- Candidates: HR can view and manage
CREATE POLICY "candidates_view" ON candidates
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'HR', 'admin'))
  );

CREATE POLICY "candidates_manage" ON candidates
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')));

-- Interviews: interviewers view own, HR manages all
CREATE POLICY "interviews_view_own" ON interviews
  FOR SELECT TO authenticated USING (interviewer_id = auth.uid());

CREATE POLICY "interviews_view_hr" ON interviews
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'HR', 'admin')));

CREATE POLICY "interviews_manage" ON interviews
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')));

-- Offer Letters: HR can view and manage
CREATE POLICY "offer_letters_view" ON offer_letters
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'HR', 'admin')));

CREATE POLICY "offer_letters_manage" ON offer_letters
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')));

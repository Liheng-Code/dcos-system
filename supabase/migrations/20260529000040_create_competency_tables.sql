-- Competency Management Tables

-- Skills Catalog
CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_name VARCHAR(255) NOT NULL UNIQUE,
  skill_category VARCHAR(100), -- technical, behavioral, leadership, safety
  description TEXT,
  required_for_roles TEXT[], -- Array of role names that require this skill
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Employee Skill Assignments
CREATE TABLE employee_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id),
  proficiency_level INT CHECK (proficiency_level BETWEEN 1 AND 5), -- 1=Beginner, 5=Expert
  verified_date DATE,
  verified_by UUID REFERENCES profiles(id),
  evidence_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(employee_id, skill_id)
);

-- Competency Levels Reference
CREATE TABLE competency_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  level_number INT CHECK (level_number BETWEEN 1 AND 5),
  level_name VARCHAR(100), -- Beginner, Intermediate, Advanced, Expert, Master
  description TEXT,
  performance_indicators TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_employee_skills_employee ON employee_skills(employee_id);
CREATE INDEX idx_employee_skills_skill ON employee_skills(skill_id);
CREATE INDEX idx_employee_skills_proficiency ON employee_skills(proficiency_level);
CREATE INDEX idx_competency_levels_skill ON competency_levels(skill_id);

-- RLS Policies
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE competency_levels ENABLE ROW LEVEL SECURITY;

-- Skills: all authenticated can view, HR manages
CREATE POLICY "skills_view" ON skills
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "skills_manage" ON skills
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')));

-- Employee Skills: employees view own, managers view team, HR manages all
CREATE POLICY "employee_skills_view_own" ON employee_skills
  FOR SELECT TO authenticated USING (employee_id = auth.uid());

CREATE POLICY "employee_skills_view_hr" ON employee_skills
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'HR', 'admin')));

CREATE POLICY "employee_skills_manage" ON employee_skills
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')));

-- Competency Levels: all authenticated can view, HR manages
CREATE POLICY "competency_levels_view" ON competency_levels
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "competency_levels_manage" ON competency_levels
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin')));

-- Seed standard competency levels (can be used for any skill)
-- These will be inserted after skills are created
INSERT INTO competency_levels (skill_id, level_number, level_name, description)
SELECT (SELECT id FROM skills ORDER BY created_at DESC LIMIT 1), level_num, level_name, description
FROM (VALUES
  (1, 'Beginner', 'Just starting, needs guidance'),
  (2, 'Intermediate', 'Can work independently with occasional help'),
  (3, 'Advanced', 'Highly proficient, can teach others'),
  (4, 'Expert', 'Deep mastery, sets standards'),
  (5, 'Master', 'Industry-leading expertise')
) AS t(level_num, level_name, description)
WHERE EXISTS (SELECT 1 FROM skills)
ON CONFLICT DO NOTHING;

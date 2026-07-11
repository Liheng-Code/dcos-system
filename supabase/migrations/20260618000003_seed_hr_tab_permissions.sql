-- Seed HR tab-level role permissions
-- Controls which tabs appear in the HR Management sidebar for each role

INSERT INTO public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, transmit, configure, reassign, scope)
VALUES
  -- ── WORKFORCE DASHBOARD ────────────────────────────────────────────────────
  ('L0',  'hr','view_dashboard',    false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L1',  'hr','view_dashboard',    false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L2',  'hr','view_dashboard',    false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L3',  'hr','view_dashboard',    true,  false, false, false, false, false, false, false, false, false, false, 'department'),
  ('L4',  'hr','view_dashboard',    true,  false, false, false, false, false, false, false, false, false, false, 'department'),
  ('L5',  'hr','view_dashboard',    true,  false, false, false, false, false, false, false, false, false, false, 'department'),
  ('L6',  'hr','view_dashboard',    false, false, false, false, false, false, false, false, false, false, false, null),
  ('HR',  'hr','view_dashboard',    true,  false, false, false, false, false, false, false, false, false, false, 'company'),
  ('AC',  'hr','view_dashboard',    true,  false, false, false, false, false, false, false, false, false, false, 'company'),

  -- ── ORGANIZATION SETUP ─────────────────────────────────────────────────────
  ('L0',  'hr','manage_organization', false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L1',  'hr','manage_organization', false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L2',  'hr','manage_organization', false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L3',  'hr','manage_organization', false, false, false, false, false, false, false, false, false, false, false, null),
  ('L4',  'hr','manage_organization', false, false, false, false, false, false, false, false, false, false, false, null),
  ('L5',  'hr','manage_organization', false, false, false, false, false, false, false, false, false, false, false, null),
  ('L6',  'hr','manage_organization', false, false, false, false, false, false, false, false, false, false, false, null),
  ('HR',  'hr','manage_organization', false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('AC',  'hr','manage_organization', false, false, false, false, false, false, false, false, false, false, false, null),

  -- ── EMPLOYEE MASTER ────────────────────────────────────────────────────────
  ('L0',  'hr','manage_employees',  false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L1',  'hr','manage_employees',  false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L2',  'hr','manage_employees',  false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L3',  'hr','manage_employees',  true,  false, false, false, false, false, false, false, false, false, false, 'department'),
  ('L4',  'hr','manage_employees',  true,  false, false, false, false, false, false, false, false, false, false, 'department'),
  ('L5',  'hr','manage_employees',  true,  false, false, false, false, false, false, false, false, false, false, 'department'),
  ('L6',  'hr','manage_employees',  false, false, false, false, false, false, false, false, false, false, false, null),
  ('HR',  'hr','manage_employees',  true,  true,  true,  false, false, false, false, true,  false, false, false, 'company'),
  ('AC',  'hr','manage_employees',  false, false, false, false, false, false, false, false, false, false, false, null),

  -- ── RESOURCE ALLOCATION ────────────────────────────────────────────────────
  ('L0',  'hr','manage_resources',  false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L1',  'hr','manage_resources',  false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L2',  'hr','manage_resources',  false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L3',  'hr','manage_resources',  true,  false, false, false, false, false, false, false, false, false, false, 'project'),
  ('L4',  'hr','manage_resources',  true,  false, false, false, false, false, false, false, false, false, false, 'department'),
  ('L5',  'hr','manage_resources',  false, false, false, false, false, false, false, false, false, false, false, null),
  ('L6',  'hr','manage_resources',  false, false, false, false, false, false, false, false, false, false, false, null),
  ('HR',  'hr','manage_resources',  true,  false, false, false, false, false, false, false, false, false, false, 'company'),
  ('AC',  'hr','manage_resources',  false, false, false, false, false, false, false, false, false, false, false, null),

  -- ── ATTENDANCE ─────────────────────────────────────────────────────────────
  ('L0',  'hr','manage_attendance', false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L1',  'hr','manage_attendance', false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L2',  'hr','manage_attendance', false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L3',  'hr','manage_attendance', true,  false, false, false, false, false, false, false, false, false, false, 'department'),
  ('L4',  'hr','manage_attendance', true,  false, false, false, false, false, false, false, false, false, false, 'department'),
  ('L5',  'hr','manage_attendance', true,  true,  false, false, false, false, false, false, false, false, false, 'department'),
  ('L6',  'hr','manage_attendance', true,  true,  false, false, false, false, false, false, false, false, false, 'own'),
  ('HR',  'hr','manage_attendance', true,  false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('AC',  'hr','manage_attendance', false, false, false, false, false, false, false, false, false, false, false, null),

  -- ── PAYROLL ────────────────────────────────────────────────────────────────
  ('L0',  'hr','manage_payroll',    false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L1',  'hr','manage_payroll',    false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L2',  'hr','manage_payroll',    false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L3',  'hr','manage_payroll',    true,  false, false, false, false, false, false, false, false, false, false, 'own'),
  ('L4',  'hr','manage_payroll',    true,  false, false, false, false, false, false, false, false, false, false, 'own'),
  ('L5',  'hr','manage_payroll',    true,  false, false, false, false, false, false, false, false, false, false, 'own'),
  ('L6',  'hr','manage_payroll',    true,  false, false, false, false, false, false, false, false, false, false, 'own'),
  ('HR',  'hr','manage_payroll',    true,  true,  true,  false, true,  true,  false, true,  false, false, false, 'company'),
  ('AC',  'hr','manage_payroll',    true,  true,  true,  false, true,  true,  false, true,  false, false, false, 'company'),

  -- ── TIMESHEET ──────────────────────────────────────────────────────────────
  ('L0',  'hr','manage_timesheet',  false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L1',  'hr','manage_timesheet',  false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L2',  'hr','manage_timesheet',  false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L3',  'hr','manage_timesheet',  true,  false, false, false, false, false, false, false, false, false, false, 'department'),
  ('L4',  'hr','manage_timesheet',  true,  false, false, false, false, false, false, false, false, false, false, 'department'),
  ('L5',  'hr','manage_timesheet',  true,  true,  false, false, false, false, false, false, false, false, false, 'own'),
  ('L6',  'hr','manage_timesheet',  true,  true,  false, false, false, false, false, false, false, false, false, 'own'),
  ('HR',  'hr','manage_timesheet',  true,  false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('AC',  'hr','manage_timesheet',  true,  false, false, false, false, false, false, false, false, false, false, 'company'),

  -- ── OT MANAGEMENT ──────────────────────────────────────────────────────────
  ('L0',  'hr','manage_overtime',   false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L1',  'hr','manage_overtime',   false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L2',  'hr','manage_overtime',   false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L3',  'hr','manage_overtime',   true,  false, false, false, false, false, false, false, false, false, false, 'department'),
  ('L4',  'hr','manage_overtime',   true,  false, false, false, false, false, false, false, false, false, false, 'department'),
  ('L5',  'hr','manage_overtime',   true,  true,  false, false, false, false, false, false, false, false, false, 'own'),
  ('L6',  'hr','manage_overtime',   true,  true,  false, false, false, false, false, false, false, false, false, 'own'),
  ('HR',  'hr','manage_overtime',   true,  false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('AC',  'hr','manage_overtime',   false, false, false, false, false, false, false, false, false, false, false, null),

  -- ── TRAINING & COMPETENCY ──────────────────────────────────────────────────
  ('L0',  'hr','manage_training',   false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L1',  'hr','manage_training',   false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L2',  'hr','manage_training',   false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L3',  'hr','manage_training',   true,  false, false, false, false, false, false, false, false, false, false, 'department'),
  ('L4',  'hr','manage_training',   true,  false, false, false, false, false, false, false, false, false, false, 'department'),
  ('L5',  'hr','manage_training',   false, false, false, false, false, false, false, false, false, false, false, null),
  ('L6',  'hr','manage_training',   false, false, false, false, false, false, false, false, false, false, false, null),
  ('HR',  'hr','manage_training',   true,  true,  true,  false, false, false, false, true,  false, false, false, 'company'),
  ('AC',  'hr','manage_training',   false, false, false, false, false, false, false, false, false, false, false, null),

  -- ── PERFORMANCE ────────────────────────────────────────────────────────────
  ('L0',  'hr','manage_performance', false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L1',  'hr','manage_performance', false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L2',  'hr','manage_performance', false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L3',  'hr','manage_performance', true,  false, false, false, false, false, false, false, false, false, false, 'department'),
  ('L4',  'hr','manage_performance', true,  false, false, false, false, false, false, false, false, false, false, 'department'),
  ('L5',  'hr','manage_performance', false, false, false, false, false, false, false, false, false, false, false, null),
  ('L6',  'hr','manage_performance', false, false, false, false, false, false, false, false, false, false, false, null),
  ('HR',  'hr','manage_performance', true,  true,  true,  false, false, false, false, true,  false, false, false, 'company'),
  ('AC',  'hr','manage_performance', false, false, false, false, false, false, false, false, false, false, false, null),

  -- ── RECRUITMENT ────────────────────────────────────────────────────────────
  ('L0',  'hr','manage_recruitment', false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L1',  'hr','manage_recruitment', false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L2',  'hr','manage_recruitment', false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L3',  'hr','manage_recruitment', false, false, false, false, false, false, false, false, false, false, false, null),
  ('L4',  'hr','manage_recruitment', false, false, false, false, false, false, false, false, false, false, false, null),
  ('L5',  'hr','manage_recruitment', false, false, false, false, false, false, false, false, false, false, false, null),
  ('L6',  'hr','manage_recruitment', false, false, false, false, false, false, false, false, false, false, false, null),
  ('HR',  'hr','manage_recruitment', true,  true,  true,  false, false, false, false, true,  false, false, false, 'company'),
  ('AC',  'hr','manage_recruitment', false, false, false, false, false, false, false, false, false, false, false, null),

  -- ── EMPLOYEE ASSETS ────────────────────────────────────────────────────────
  ('L0',  'hr','manage_assets',     false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L1',  'hr','manage_assets',     false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L2',  'hr','manage_assets',     false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L3',  'hr','manage_assets',     false, false, false, false, false, false, false, false, false, false, false, null),
  ('L4',  'hr','manage_assets',     false, false, false, false, false, false, false, false, false, false, false, null),
  ('L5',  'hr','manage_assets',     false, false, false, false, false, false, false, false, false, false, false, null),
  ('L6',  'hr','manage_assets',     false, false, false, false, false, false, false, false, false, false, false, null),
  ('HR',  'hr','manage_assets',     true,  true,  true,  false, false, false, false, false, false, false, false, 'company'),
  ('AC',  'hr','manage_assets',     false, false, false, false, false, false, false, false, false, false, false, null)

ON CONFLICT (role_code, module, action) DO NOTHING;

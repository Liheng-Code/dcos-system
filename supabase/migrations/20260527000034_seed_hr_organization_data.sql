-- Seed HR Organization Data

-- First, insert the HR_Manager role if it doesn't exist
insert into public.roles (code, name, type, level, description)
values ('HR_Manager', 'HR Manager', 'functional', null, 'Manages all HR operations, employee records, leave, timesheets.')
on conflict(code) do nothing;

-- Insert sample departments
insert into public.departments (department_code, department_name, description)
values
  ('HR', 'Human Resources', 'Human Resources Department'),
  ('OPS', 'Operations', 'Operations and Administration'),
  ('DESIGN', 'Design', 'Engineering Design Department'),
  ('CONST', 'Construction', 'On-site Construction Department'),
  ('FINANCE', 'Finance & Admin', 'Finance and Administration'),
  ('QA', 'Quality Assurance', 'Quality Assurance & QC Department'),
  ('PROC', 'Procurement', 'Procurement Department'),
  ('HSE', 'HSE', 'Health, Safety & Environment Department')
on conflict do nothing;

-- Add HR permissions for the HR_Manager role
insert into public.role_permissions (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, transmit, configure, reassign, scope) values
  ('HR_Manager', 'hr', 'view_employee', true, false, false, false, false, false, false, false, false, false, false, null),
  ('HR_Manager', 'hr', 'create_employee', false, true, false, false, false, false, false, false, false, false, false, null),
  ('HR_Manager', 'hr', 'edit_employee', false, false, true, false, false, false, false, false, false, false, false, null),
  ('HR_Manager', 'hr', 'delete_employee', false, false, false, true, false, false, false, false, false, false, false, null),
  ('HR_Manager', 'hr', 'manage_organization', false, false, false, false, false, false, false, false, false, true, false, null),
  ('HR_Manager', 'hr', 'manage_assignments', false, true, true, true, false, false, false, false, false, false, false, null),
  ('HR_Manager', 'hr', 'view_documents', true, false, false, false, false, false, false, false, false, false, false, null),
  ('HR_Manager', 'hr', 'manage_documents', false, true, true, true, false, false, false, false, false, false, false, null),
  ('HR_Manager', 'hr', 'view_leave', true, false, false, false, false, false, false, false, false, false, false, null),
  ('HR_Manager', 'hr', 'approve_leave', false, false, false, false, false, true, true, false, false, false, false, null),
  ('HR_Manager', 'hr', 'view_attendance', true, false, false, false, false, false, false, false, false, false, false, null),
  ('HR_Manager', 'hr', 'view_timesheet', true, false, false, false, false, false, false, false, false, false, false, null),
  ('HR_Manager', 'hr', 'approve_timesheet', false, false, false, false, false, true, true, false, false, false, false, null),
  ('HR_Manager', 'hr', 'export_hr_data', false, false, false, false, false, false, false, true, false, false, false, null),
  ('HR', 'hr', 'view_employee', true, false, false, false, false, false, false, false, false, false, false, null),
  ('HR', 'hr', 'view_documents', true, false, false, false, false, false, false, false, false, false, false, null),
  ('HR', 'hr', 'view_leave', true, false, false, false, false, false, false, false, false, false, false, null),
  ('HR', 'hr', 'view_attendance', true, false, false, false, false, false, false, false, false, false, false, null),
  ('HR', 'hr', 'view_timesheet', true, false, false, false, false, false, false, false, false, false, false, null),
  ('L1', 'hr', 'view_employee', true, false, false, false, false, false, false, false, false, false, false, null),
  ('L2', 'hr', 'view_employee', true, false, false, false, false, false, false, false, false, false, false, null),
  ('L3', 'hr', 'view_employee', true, false, false, false, false, false, false, false, false, false, false, null),
  ('L4', 'hr', 'view_employee', true, false, false, false, false, false, false, false, false, false, false, 'department'),
  ('L6', 'hr', 'view_employee', true, false, false, false, false, false, false, false, false, false, false, 'own')
on conflict do nothing;

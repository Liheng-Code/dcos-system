-- Permissions for department-scoped task views, team planning and
-- cross-department request handling (module: task_management).

insert into public.role_permissions (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, transmit, configure, reassign, scope) values
  ('L0', 'task_management', 'view_department',      true,  false, false, false, false, false, false, false, false, true,  false, null),
  ('L1', 'task_management', 'view_department',      true,  false, false, false, false, false, false, false, false, false, false, null),
  ('L2', 'task_management', 'view_department',      true,  false, false, false, false, false, false, false, false, false, false, null),
  ('L3', 'task_management', 'view_department',      true,  false, false, false, false, false, false, false, false, false, false, null),
  ('L4', 'task_management', 'view_department',      true,  false, false, false, false, false, false, false, false, false, false, 'department'),
  ('L5', 'task_management', 'view_department',      true,  false, false, false, false, false, false, false, false, false, false, 'department'),
  ('L6', 'task_management', 'view_department',      true,  false, false, false, false, false, false, false, false, false, false, 'department'),
  ('L0', 'task_management', 'plan_team',            false, false, false, false, false, false, false, false, false, true,  true,  null),
  ('L3', 'task_management', 'plan_team',            false, false, true,  false, false, false, false, false, false, false, true,  null),
  ('L4', 'task_management', 'plan_team',            false, false, true,  false, false, false, false, false, false, false, true,  'department'),
  ('L0', 'task_management', 'accept_cross_request', false, false, false, false, false, true,  true,  false, false, true,  false, null),
  ('L4', 'task_management', 'accept_cross_request', false, false, false, false, false, true,  true,  false, false, false, false, 'department')
on conflict do nothing;

alter table public.profiles
  drop constraint if exists profiles_role_check,
  add constraint profiles_role_check
    check (role in ('admin', 'project_manager', 'department_manager', 'contractor', 'inspector', 'viewer'));

create table if not exists public.employee_attendance_site_assignments (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.profiles(id) on delete cascade,
  site_id         uuid not null references public.site_locations(id) on delete cascade,
  effective_from  date not null,
  effective_to    date,
  is_required     boolean not null default true,
  assigned_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create index if not exists idx_employee_attendance_site_assignments_employee
  on public.employee_attendance_site_assignments(employee_id, effective_from, effective_to);

create index if not exists idx_employee_attendance_site_assignments_site
  on public.employee_attendance_site_assignments(site_id);

alter table public.employee_attendance_site_assignments enable row level security;

drop policy if exists "site_locations_read" on public.site_locations;

create policy "site_locations_hr_read" on public.site_locations
  for select to authenticated using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('admin', 'HR_Manager', 'hr_manager')
    )
  );

create policy "attendance_site_assignments_hr_read" on public.employee_attendance_site_assignments
  for select to authenticated using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('admin', 'HR_Manager', 'hr_manager')
    )
  );

create policy "attendance_site_assignments_hr_write" on public.employee_attendance_site_assignments
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('admin', 'HR_Manager', 'hr_manager')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('admin', 'HR_Manager', 'hr_manager')
    )
  );

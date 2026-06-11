-- Work shift templates
create table if not exists public.work_shifts (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  shift_type      text not null check (shift_type in ('fixed', 'flexible', 'rotating')),
  start_time      time,
  end_time        time,
  break_minutes   int default 60,
  is_overnight    boolean default false,
  grace_minutes   int default 15,
  work_days       text[] default array['Mon','Tue','Wed','Thu','Fri'],
  created_at      timestamptz not null default now()
);

-- Assign shifts to employees (effective-dated)
create table if not exists public.employee_shift_assignments (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.profiles(id) on delete cascade,
  shift_id        uuid not null references public.work_shifts(id) on delete cascade,
  effective_from  date not null,
  effective_to    date,
  assigned_by     uuid references public.profiles(id),
  created_at      timestamptz not null default now()
);

-- Site locations with geofence for GPS/QR validation
create table if not exists public.site_locations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  address         text,
  lat             decimal(10,7),
  lng             decimal(10,7),
  radius_meters   int default 100,
  qr_token        text,
  qr_expires_at   timestamptz,
  qr_rotation_min int default 5,
  is_active       boolean default true,
  created_at      timestamptz not null default now()
);

-- RLS: everyone reads, HR_Manager/admin writes
alter table public.work_shifts enable row level security;
alter table public.employee_shift_assignments enable row level security;
alter table public.site_locations enable row level security;

create policy "work_shifts_read" on public.work_shifts
  for select to authenticated using (true);

create policy "work_shifts_write" on public.work_shifts
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('admin', 'HR_Manager', 'hr_manager')
    )
  );

create policy "shift_assignments_read" on public.employee_shift_assignments
  for select to authenticated using (true);

create policy "shift_assignments_write" on public.employee_shift_assignments
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('admin', 'HR_Manager', 'hr_manager')
    )
  );

create policy "site_locations_read" on public.site_locations
  for select to authenticated using (true);

create policy "site_locations_write" on public.site_locations
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('admin', 'HR_Manager', 'hr_manager')
    )
  );

-- Seed default shifts
insert into public.work_shifts (name, shift_type, start_time, end_time, break_minutes, grace_minutes) values
  ('Office Hours',   'fixed',    '08:00', '17:00', 60, 15),
  ('Site Day Shift', 'fixed',    '07:00', '16:00', 60, 10),
  ('Flexible',       'flexible',  null,    null,   60, 30)
on conflict do nothing;

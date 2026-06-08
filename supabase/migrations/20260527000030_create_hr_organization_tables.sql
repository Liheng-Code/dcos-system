-- HR Organization Management Tables

-- Create departments table
create table if not exists public.departments (
  id              uuid primary key default gen_random_uuid(),
  department_code text not null unique,
  department_name text not null,
  description     text,
  parent_id       uuid references public.departments(id) on delete set null,
  department_head uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Create teams table
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  team_code   text not null unique,
  team_name   text not null,
  description text,
  department_id uuid not null references public.departments(id) on delete cascade,
  team_lead   uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Create positions table
create table if not exists public.positions (
  id              uuid primary key default gen_random_uuid(),
  position_code   text not null unique,
  position_name   text not null,
  description     text,
  department_id   uuid not null references public.departments(id) on delete cascade,
  grade           text,
  reports_to_position_id uuid references public.positions(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Create reporting_structure table (tracks manager-subordinate relationships)
create table if not exists public.reporting_structure (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.profiles(id) on delete cascade,
  manager_id      uuid not null references public.profiles(id) on delete cascade,
  position_id     uuid references public.positions(id) on delete set null,
  effective_from  date not null default current_date,
  effective_to    date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(employee_id, effective_from)
);

-- Create indexes for performance
create index idx_departments_parent_id on public.departments(parent_id);
create index idx_departments_department_head on public.departments(department_head);
create index idx_teams_department_id on public.teams(department_id);
create index idx_teams_team_lead on public.teams(team_lead);
create index idx_positions_department_id on public.positions(department_id);
create index idx_positions_reports_to on public.positions(reports_to_position_id);
create index idx_reporting_structure_employee on public.reporting_structure(employee_id);
create index idx_reporting_structure_manager on public.reporting_structure(manager_id);

-- Enable RLS
alter table public.departments enable row level security;
alter table public.teams enable row level security;
alter table public.positions enable row level security;
alter table public.reporting_structure enable row level security;

-- RLS Policies - authenticated users can view
create policy "Authenticated users can view departments"
  on public.departments for select to authenticated using (true);

create policy "Authenticated users can view teams"
  on public.teams for select to authenticated using (true);

create policy "Authenticated users can view positions"
  on public.positions for select to authenticated using (true);

create policy "Authenticated users can view reporting structure"
  on public.reporting_structure for select to authenticated using (true);

-- RLS Policies - HR Manager can manage
create policy "HR Manager can create departments"
  on public.departments for insert to authenticated
  with check (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "HR Manager can update departments"
  on public.departments for update to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')))
  with check (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "HR Manager can delete departments"
  on public.departments for delete to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "HR Manager can create teams"
  on public.teams for insert to authenticated
  with check (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "HR Manager can update teams"
  on public.teams for update to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')))
  with check (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "HR Manager can delete teams"
  on public.teams for delete to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "HR Manager can create positions"
  on public.positions for insert to authenticated
  with check (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "HR Manager can update positions"
  on public.positions for update to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')))
  with check (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "HR Manager can delete positions"
  on public.positions for delete to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "HR Manager can manage reporting structure"
  on public.reporting_structure for all to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')))
  with check (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

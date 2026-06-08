-- Employee Project and WBS Assignment Tables

-- Employee to Project Assignment
create table if not exists public.employee_project_assignments (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.profiles(id) on delete cascade,
  project_id      uuid not null references public.projects(id) on delete cascade,
  discipline      text,
  role_in_project text,
  allocation_percent numeric not null default 100 check (allocation_percent > 0 and allocation_percent <= 100),
  start_date      date not null default current_date,
  end_date        date,
  status          text not null default 'active' check (status in ('active', 'inactive', 'on_hold')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(employee_id, project_id, start_date)
);

-- Employee to WBS Assignment
create table if not exists public.employee_wbs_assignments (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.profiles(id) on delete cascade,
  wbs_node_id     uuid not null references public.wbs_nodes(id) on delete cascade,
  project_id      uuid not null references public.projects(id) on delete cascade,
  allocation_percent numeric not null default 100 check (allocation_percent > 0 and allocation_percent <= 100),
  start_date      date not null default current_date,
  end_date        date,
  status          text not null default 'active' check (status in ('active', 'inactive', 'on_hold')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(employee_id, wbs_node_id, start_date)
);

-- Resource Forecasts
create table if not exists public.resource_forecasts (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.profiles(id) on delete cascade,
  project_id      uuid references public.projects(id) on delete set null,
  forecast_month  date not null,
  forecasted_hours numeric not null default 0,
  confidence_percent numeric default 100 check (confidence_percent >= 0 and confidence_percent <= 100),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(employee_id, forecast_month, project_id)
);

-- Create indexes for performance
create index idx_employee_project_assignments_employee on public.employee_project_assignments(employee_id);
create index idx_employee_project_assignments_project on public.employee_project_assignments(project_id);
create index idx_employee_project_assignments_status on public.employee_project_assignments(status);
create index idx_employee_wbs_assignments_employee on public.employee_wbs_assignments(employee_id);
create index idx_employee_wbs_assignments_wbs_node on public.employee_wbs_assignments(wbs_node_id);
create index idx_employee_wbs_assignments_project on public.employee_wbs_assignments(project_id);
create index idx_employee_wbs_assignments_status on public.employee_wbs_assignments(status);
create index idx_resource_forecasts_employee on public.resource_forecasts(employee_id);
create index idx_resource_forecasts_project on public.resource_forecasts(project_id);
create index idx_resource_forecasts_month on public.resource_forecasts(forecast_month);

-- Enable RLS
alter table public.employee_project_assignments enable row level security;
alter table public.employee_wbs_assignments enable row level security;
alter table public.resource_forecasts enable row level security;

-- RLS Policies - authenticated users can view
create policy "Authenticated users can view employee project assignments"
  on public.employee_project_assignments for select to authenticated using (true);

create policy "Authenticated users can view employee wbs assignments"
  on public.employee_wbs_assignments for select to authenticated using (true);

create policy "Authenticated users can view resource forecasts"
  on public.resource_forecasts for select to authenticated using (true);

-- RLS Policies - HR Manager and Project Manager can manage
create policy "HR and PM can create project assignments"
  on public.employee_project_assignments for insert to authenticated
  with check (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'project_manager', 'admin')));

create policy "HR and PM can update project assignments"
  on public.employee_project_assignments for update to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'project_manager', 'admin')))
  with check (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'project_manager', 'admin')));

create policy "HR and PM can delete project assignments"
  on public.employee_project_assignments for delete to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'project_manager', 'admin')));

create policy "HR and PM can create wbs assignments"
  on public.employee_wbs_assignments for insert to authenticated
  with check (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'project_manager', 'admin')));

create policy "HR and PM can update wbs assignments"
  on public.employee_wbs_assignments for update to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'project_manager', 'admin')))
  with check (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'project_manager', 'admin')));

create policy "HR and PM can delete wbs assignments"
  on public.employee_wbs_assignments for delete to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'project_manager', 'admin')));

create policy "HR and PM can manage resource forecasts"
  on public.resource_forecasts for all to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'project_manager', 'admin')))
  with check (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'project_manager', 'admin')));

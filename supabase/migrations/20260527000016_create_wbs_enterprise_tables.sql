-- WBS Templates (configurable node type chains)
create table public.wbs_templates (
  id                uuid primary key default gen_random_uuid(),
  template_name     text not null unique,
  template_desc     text,
  node_type_chain   jsonb not null default '["building","level","zone","room","element"]'::jsonb,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Add template FK to projects (optional)
alter table public.projects
  add column wbs_template_id uuid references public.wbs_templates(id) on delete set null;

-- WBS Tasks
create table public.wbs_tasks (
  id                uuid primary key default gen_random_uuid(),
  wbs_node_id       uuid not null references public.wbs_nodes(id) on delete cascade,
  project_id        uuid not null references public.projects(id) on delete cascade,
  task_code         text not null,
  task_name         text not null,
  description       text,
  status            text not null default 'open' check (status in ('open', 'in_progress', 'blocked', 'review', 'submitted', 'closed')),
  progress          numeric not null default 0 check (progress between 0 and 100),
  priority          text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  discipline        text,
  owner_id          uuid references public.profiles(id) on delete set null,
  owner_name        text,
  start_date        date,
  end_date          date,
  delay_status      text default 'on_track' check (delay_status in ('on_track', 'risk', 'delayed', 'blocked')),
  dependency_text   text,
  dependency_type   text check (dependency_type in ('fs', 'ss', 'ff', 'sf')),
  dependency_task_id uuid references public.wbs_tasks(id) on delete set null,
  docs_count        int not null default 0,
  photos_count      int not null default 0,
  qa_status         text default 'not_required' check (qa_status in ('not_required', 'pending', 'submitted', 'review', 'failed', 'approved')),
  budget_cost       numeric,
  actual_cost       numeric,
  planned_hours     numeric,
  actual_hours      numeric,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique(project_id, task_code)
);

-- WBS Baselines (multi-baseline support)
create table public.wbs_baselines (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  baseline_name     text not null,
  baseline_type     text not null default 'current' check (baseline_type in ('contract', 'revised', 'current')),
  baseline_date     date not null default current_date,
  snapshot_data     jsonb not null default '{}'::jsonb,
  is_active         boolean not null default true,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);

-- WBS Audit Log
create table public.wbs_audit_log (
  id                uuid primary key default gen_random_uuid(),
  wbs_node_id       uuid references public.wbs_nodes(id) on delete cascade,
  wbs_task_id       uuid references public.wbs_tasks(id) on delete cascade,
  project_id        uuid not null references public.projects(id) on delete cascade,
  user_id           uuid references public.profiles(id) on delete set null,
  action            text not null,
  field_name        text,
  old_value         text,
  new_value         text,
  created_at        timestamptz not null default now()
);

-- WBS Subscriptions (user follows a node for notifications)
create table public.wbs_subscriptions (
  id                uuid primary key default gen_random_uuid(),
  wbs_node_id       uuid not null references public.wbs_nodes(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  notify_on_status  boolean not null default true,
  notify_on_task    boolean not null default true,
  notify_on_doc     boolean not null default true,
  created_at        timestamptz not null default now(),
  unique(wbs_node_id, user_id)
);

-- Indexes
create index idx_wbs_tasks_node_id on public.wbs_tasks(wbs_node_id);
create index idx_wbs_tasks_project_id on public.wbs_tasks(project_id);
create index idx_wbs_tasks_status on public.wbs_tasks(status);
create index idx_wbs_baselines_project on public.wbs_baselines(project_id);
create index idx_wbs_audit_log_node on public.wbs_audit_log(wbs_node_id);
create index idx_wbs_audit_log_project on public.wbs_audit_log(project_id);
create index idx_wbs_subscriptions_node on public.wbs_subscriptions(wbs_node_id);
create index idx_wbs_subscriptions_user on public.wbs_subscriptions(user_id);

-- RLS
alter table public.wbs_templates enable row level security;
alter table public.wbs_tasks enable row level security;
alter table public.wbs_baselines enable row level security;
alter table public.wbs_audit_log enable row level security;
alter table public.wbs_subscriptions enable row level security;

create policy "Authenticated users can view wbs_templates"
  on public.wbs_templates for select to authenticated using (true);

create policy "Admins can manage wbs_templates"
  on public.wbs_templates for all to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

create policy "Authenticated users can view wbs_tasks"
  on public.wbs_tasks for select to authenticated using (true);

create policy "Authenticated users can manage wbs_tasks"
  on public.wbs_tasks for insert to authenticated with check (true);

create policy "Authenticated users can update wbs_tasks"
  on public.wbs_tasks for update to authenticated using (true) with check (true);

create policy "Admins can delete wbs_tasks"
  on public.wbs_tasks for delete to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

create policy "Authenticated users can view wbs_baselines"
  on public.wbs_baselines for select to authenticated using (true);

create policy "Authenticated users can manage wbs_baselines"
  on public.wbs_baselines for insert to authenticated with check (true);

create policy "Authenticated users can update wbs_baselines"
  on public.wbs_baselines for update to authenticated using (true) with check (true);

create policy "Admins can delete wbs_baselines"
  on public.wbs_baselines for delete to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

create policy "Authenticated users can view wbs_audit_log"
  on public.wbs_audit_log for select to authenticated using (true);

create policy "Service role can insert wbs_audit_log"
  on public.wbs_audit_log for insert to authenticated with check (true);

create policy "Authenticated users can view wbs_subscriptions"
  on public.wbs_subscriptions for select to authenticated using (true);

create policy "Authenticated users can manage own subscriptions"
  on public.wbs_subscriptions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

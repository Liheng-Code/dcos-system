-- Phase A: Extend projects table and create setup tables for wizard Steps 5-11

-- ============================================================
-- 1. Extend projects table with missing fields from wizard Steps 1-2
-- ============================================================
alter table public.projects
  add column if not exists short_name       text,
  add column if not exists category         text check (category in (
    'building', 'high_rise', 'infrastructure', 'industrial',
    'residential', 'commercial', 'mixed_use', 'other'
  )),
  add column if not exists location         text,
  add column if not exists dlp_period       text,
  add column if not exists retention        numeric,
  add column if not exists advance_payment  numeric,
  add column if not exists duration         text;

-- ============================================================
-- 2. Calendar settings (Step 5)
-- ============================================================
create table if not exists public.project_calendars (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade unique,
  working_days      text,
  working_hours     text,
  weekend_rule      text,
  holiday_calendar  text,
  shift_type        text,
  exception_days    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ============================================================
-- 3. WBS setup (Step 6)
-- ============================================================
create table if not exists public.project_wbs_setups (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade unique,
  setup_method      text not null check (setup_method in (
    'use_template', 'create_manually', 'import_excel', 'clone_project'
  )),
  wbs_template_id   uuid,
  source_project_id uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ============================================================
-- 4. Document numbering rules (Step 7)
-- ============================================================
create table if not exists public.project_numbering_rules (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade unique,
  format_mask       text not null,
  discipline_codes  jsonb not null default '[]'::jsonb,
  document_types    jsonb not null default '[]'::jsonb,
  revision_format   text not null default 'R00',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ============================================================
-- 5. Approval flows (Step 8)
-- ============================================================
create table if not exists public.project_approval_flows (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  flow_type         text not null check (flow_type in (
    'drawing_approval', 'rfi_response', 'material_approval', 'method_statement',
    'pr_po_approval', 'inspection_request', 'ncr_closeout'
  )),
  role_chain        jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique(project_id, flow_type)
);

-- ============================================================
-- 6. Budget settings (Step 9)
-- ============================================================
create table if not exists public.project_budget_settings (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects(id) on delete cascade unique,
  contingency         numeric,
  cost_code_template  text,
  approval_limit_rule text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ============================================================
-- 7. Notification rules (Step 10)
-- ============================================================
create table if not exists public.project_notification_rules (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  rule_type   text not null check (rule_type in (
    'task_assigned', 'task_overdue', 'document_submitted', 'rfi_overdue',
    'pr_approval', 'ncr_created', 'safety_incident', 'payment_approval'
  )),
  channel     text not null default 'in_app',
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(project_id, rule_type)
);

-- ============================================================
-- 8. Activation log (Step 11)
-- ============================================================
create table if not exists public.project_activation_log (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade unique,
  activated_at  timestamptz not null default now(),
  activated_by  uuid not null references public.profiles(id),
  checklist     jsonb,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- RLS: Enable row-level security on all new tables
-- ============================================================
alter table public.project_calendars enable row level security;
alter table public.project_wbs_setups enable row level security;
alter table public.project_numbering_rules enable row level security;
alter table public.project_approval_flows enable row level security;
alter table public.project_budget_settings enable row level security;
alter table public.project_notification_rules enable row level security;
alter table public.project_activation_log enable row level security;

-- ============================================================
-- RLS Policies: Authenticated users can read/write all
-- (mirrors existing pattern from project_stakeholder_mappings)
-- ============================================================
create policy "Authenticated users can view project calendars"
  on public.project_calendars for select to authenticated using (true);
create policy "Authenticated users can manage project calendars"
  on public.project_calendars for all to authenticated using (true) with check (true);

create policy "Authenticated users can view project WBS setups"
  on public.project_wbs_setups for select to authenticated using (true);
create policy "Authenticated users can manage project WBS setups"
  on public.project_wbs_setups for all to authenticated using (true) with check (true);

create policy "Authenticated users can view project numbering rules"
  on public.project_numbering_rules for select to authenticated using (true);
create policy "Authenticated users can manage project numbering rules"
  on public.project_numbering_rules for all to authenticated using (true) with check (true);

create policy "Authenticated users can view project approval flows"
  on public.project_approval_flows for select to authenticated using (true);
create policy "Authenticated users can manage project approval flows"
  on public.project_approval_flows for all to authenticated using (true) with check (true);

create policy "Authenticated users can view project budget settings"
  on public.project_budget_settings for select to authenticated using (true);
create policy "Authenticated users can manage project budget settings"
  on public.project_budget_settings for all to authenticated using (true) with check (true);

create policy "Authenticated users can view project notification rules"
  on public.project_notification_rules for select to authenticated using (true);
create policy "Authenticated users can manage project notification rules"
  on public.project_notification_rules for all to authenticated using (true) with check (true);

create policy "Authenticated users can view project activation logs"
  on public.project_activation_log for select to authenticated using (true);
create policy "Authenticated users can create project activation logs"
  on public.project_activation_log for insert to authenticated with check (true);

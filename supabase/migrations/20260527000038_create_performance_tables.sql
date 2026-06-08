-- Performance Management Tables

-- Performance KPI definitions
create table if not exists public.kpi_definitions (
  id              uuid primary key default gen_random_uuid(),
  kpi_code        text not null unique,
  kpi_name        text not null,
  description     text,
  kpi_category    text not null check (kpi_category in ('quality', 'productivity', 'compliance', 'behavior', 'safety')),
  position_id     uuid references public.positions(id) on delete set null,
  target_value    numeric,
  unit            text,
  weight          numeric default 1,
  is_active       boolean default true,
  created_at      timestamptz not null default now()
);

-- Employee KPI metrics (actual values)
create table if not exists public.employee_kpis (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.profiles(id) on delete cascade,
  kpi_id          uuid not null references public.kpi_definitions(id) on delete restrict,
  period_start    date not null,
  period_end      date not null,
  actual_value    numeric,
  target_value    numeric,
  achievement_percent numeric,
  notes           text,
  recorded_by     uuid references public.profiles(id) on delete set null,
  recorded_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(employee_id, kpi_id, period_start)
);

-- Performance reviews
create table if not exists public.performance_reviews (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.profiles(id) on delete cascade,
  review_period_start date not null,
  review_period_end date not null,
  review_type     text not null check (review_type in ('quarterly', 'half_yearly', 'annual', 'probation')),
  reviewer_id     uuid not null references public.profiles(id) on delete restrict,
  overall_score   numeric check (overall_score between 0 and 5),
  status          text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'completed')),
  submission_date timestamptz,
  approval_date   timestamptz,
  approved_by     uuid references public.profiles(id) on delete set null,
  comments        text,
  employee_feedback text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(employee_id, review_period_start, review_type)
);

-- Performance scores per KPI in a review
create table if not exists public.performance_scores (
  id              uuid primary key default gen_random_uuid(),
  review_id       uuid not null references public.performance_reviews(id) on delete cascade,
  kpi_id          uuid not null references public.kpi_definitions(id) on delete restrict,
  kpi_name        text not null,
  score           numeric not null check (score between 0 and 5),
  weight          numeric default 1,
  weighted_score  numeric,
  comments        text,
  created_at      timestamptz not null default now()
);

-- Performance review history/audit trail
create table if not exists public.review_history (
  id              uuid primary key default gen_random_uuid(),
  review_id       uuid not null references public.performance_reviews(id) on delete cascade,
  action          text not null check (action in ('created', 'submitted', 'approved', 'rejected', 'completed', 'revised')),
  action_by       uuid not null references public.profiles(id) on delete restrict,
  action_date     timestamptz not null default now(),
  notes           text,
  created_at      timestamptz not null default now()
);

-- Seed sample KPIs for different positions
insert into public.kpi_definitions (kpi_code, kpi_name, description, kpi_category, position_id, target_value, unit, weight, is_active) values
  ('TASK_COMPLETION', 'Task Completion Rate', 'Percentage of tasks completed on time', 'productivity', null, 95, '%', 2, true),
  ('QUALITY_SCORE', 'Quality of Work', 'Quality of delivered work', 'quality', null, 90, '%', 2, true),
  ('RFI_RESPONSE', 'RFI Response Time', 'Average time to respond to RFI', 'productivity', null, 48, 'hours', 1.5, true),
  ('SAFETY_COMPLIANCE', 'Safety Compliance', 'Adherence to safety protocols', 'safety', null, 100, '%', 2, true),
  ('ATTENDANCE', 'Attendance Record', 'On-time attendance and presence', 'compliance', null, 95, '%', 1, true),
  ('CLIENT_FEEDBACK', 'Client Feedback Rating', 'Client satisfaction score', 'behavior', null, 4.5, 'rating', 1.5, true),
  ('INNOVATION', 'Innovation & Suggestions', 'Number of process improvements suggested', 'productivity', null, 4, 'count', 1, true),
  ('TEAMWORK', 'Team Collaboration', 'Effectiveness in team environment', 'behavior', null, 4, 'rating', 1, true),
  ('DELIVERY_QUALITY', 'Delivery Quality', 'Quality of project deliverables', 'quality', null, 90, '%', 2, true),
  ('BUDGET_COMPLIANCE', 'Budget Compliance', 'Cost overruns percentage', 'compliance', null, 100, '%', 1.5, true)
on conflict do nothing;

-- Create indexes for performance
create index if not exists idx_kpi_definitions_position on public.kpi_definitions(position_id);
create index if not exists idx_kpi_definitions_active on public.kpi_definitions(is_active);
create index if not exists idx_employee_kpis_employee on public.employee_kpis(employee_id);
create index if not exists idx_employee_kpis_kpi on public.employee_kpis(kpi_id);
create index if not exists idx_employee_kpis_period on public.employee_kpis(period_start, period_end);
create index if not exists idx_performance_reviews_employee on public.performance_reviews(employee_id);
create index if not exists idx_performance_reviews_reviewer on public.performance_reviews(reviewer_id);
create index if not exists idx_performance_reviews_status on public.performance_reviews(status);
create index if not exists idx_performance_reviews_period on public.performance_reviews(review_period_start, review_period_end);
create index if not exists idx_performance_scores_review on public.performance_scores(review_id);
create index if not exists idx_performance_scores_kpi on public.performance_scores(kpi_id);
create index if not exists idx_review_history_review on public.review_history(review_id);
create index if not exists idx_review_history_action_by on public.review_history(action_by);

-- Enable RLS
alter table public.kpi_definitions enable row level security;
alter table public.employee_kpis enable row level security;
alter table public.performance_reviews enable row level security;
alter table public.performance_scores enable row level security;
alter table public.review_history enable row level security;

-- RLS Policies
create policy "Authenticated users can view KPI definitions"
  on public.kpi_definitions for select to authenticated using (true);

create policy "Users can view own KPIs"
  on public.employee_kpis for select to authenticated
  using (employee_id = auth.uid());

create policy "HR Manager can view all KPIs"
  on public.employee_kpis for select to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "HR Manager can manage KPIs"
  on public.employee_kpis for all to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')))
  with check (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "Users can view own reviews"
  on public.performance_reviews for select to authenticated
  using (employee_id = auth.uid() or reviewer_id = auth.uid());

create policy "HR Manager can view all reviews"
  on public.performance_reviews for select to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "Reviewers can create reviews"
  on public.performance_reviews for insert to authenticated
  with check (reviewer_id = auth.uid() or exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "Reviewers can update their reviews"
  on public.performance_reviews for update to authenticated
  using (reviewer_id = auth.uid() or exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')))
  with check (reviewer_id = auth.uid() or exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "Users can view scores from own reviews"
  on public.performance_scores for select to authenticated
  using (
    exists(select 1 from performance_reviews where performance_reviews.id = review_id and (performance_reviews.employee_id = auth.uid() or performance_reviews.reviewer_id = auth.uid()))
  );

create policy "HR Manager can view all scores"
  on public.performance_scores for select to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "Users can view own review history"
  on public.review_history for select to authenticated
  using (
    exists(select 1 from performance_reviews where performance_reviews.id = review_id and (performance_reviews.employee_id = auth.uid() or performance_reviews.reviewer_id = auth.uid()))
  );

create policy "HR Manager can view all history"
  on public.review_history for select to authenticated
  using (exists(select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));

create policy "Actions are logged automatically"
  on public.review_history for insert to authenticated with check (true);

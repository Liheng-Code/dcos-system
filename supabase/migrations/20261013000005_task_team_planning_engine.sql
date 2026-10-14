-- Task Team Planning, slice 2: task types, deliverables, submissions/reviews, blockers,
-- comments, progress + effort history, task audit events. All additive and idempotent.
-- See docs/04-Business-Modules/04-04-Task-Management/13-Team-Planning-Addendum.md
-- Access model: project membership + task_management permissions. Append-only tables have no
-- UPDATE/DELETE policies. The wider wbs_tasks RLS tightening is a separate step.

-- ---------------------------------------------------------------------------
-- Helper: can the caller see this task? (project member + view_task)
-- ---------------------------------------------------------------------------
create or replace function public.task_in_scope(p_task uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.wbs_tasks t
     where t.id = p_task
       and public.is_project_member(t.project_id)
  ) and public.has_permission('task_management', 'view_task', 'view');
$$;

-- ---------------------------------------------------------------------------
-- task_types (configurable; not tied to code)
-- ---------------------------------------------------------------------------
create table if not exists public.task_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  discipline_id uuid references public.discipline_master(id) on delete set null,
  progress_method text not null default 'percentage'
    check (progress_method in ('percentage','deliverable','quantity','milestone')),
  review_required boolean not null default false,
  deliverable_required boolean not null default false,
  default_estimated_hours numeric check (default_estimated_hours is null or default_estimated_hours >= 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists task_types_discipline_idx on public.task_types (discipline_id);
drop trigger if exists task_types_set_updated_at on public.task_types;
create trigger task_types_set_updated_at before update on public.task_types
  for each row execute function public.set_updated_at();

alter table public.task_types enable row level security;
drop policy if exists task_types_select on public.task_types;
create policy task_types_select on public.task_types for select to authenticated using (true);
drop policy if exists task_types_write on public.task_types;
create policy task_types_write on public.task_types for all to authenticated
  using (public.has_permission('task_management', 'configure_task_workflow', 'configure'))
  with check (public.has_permission('task_management', 'configure_task_workflow', 'configure'));

-- ---------------------------------------------------------------------------
-- wbs_tasks additions (nullable / defaulted; existing writers unaffected)
-- ---------------------------------------------------------------------------
alter table public.wbs_tasks
  add column if not exists task_type_id uuid references public.task_types(id) on delete set null,
  add column if not exists team_id uuid references public.teams(id) on delete set null,
  add column if not exists reviewer_id uuid references public.profiles(id) on delete set null,
  add column if not exists approver_id uuid references public.profiles(id) on delete set null,
  add column if not exists estimated_hours numeric,
  add column if not exists remaining_hours numeric,
  add column if not exists progress_method text,
  add column if not exists required_seniority text,
  add column if not exists required_skill_ids uuid[],
  add column if not exists is_blocked boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'wbs_tasks_hours_nonneg') then
    alter table public.wbs_tasks add constraint wbs_tasks_hours_nonneg
      check ((estimated_hours is null or estimated_hours >= 0) and (remaining_hours is null or remaining_hours >= 0)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wbs_tasks_progress_method_check') then
    alter table public.wbs_tasks add constraint wbs_tasks_progress_method_check
      check (progress_method is null or progress_method in ('percentage','deliverable','quantity','milestone')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wbs_tasks_reviewer_independent') then
    alter table public.wbs_tasks add constraint wbs_tasks_reviewer_independent
      check (reviewer_id is null or reviewer_id is distinct from owner_id) not valid;
  end if;
end $$;

create index if not exists wbs_tasks_team_idx on public.wbs_tasks (team_id);
create index if not exists wbs_tasks_reviewer_idx on public.wbs_tasks (reviewer_id);
create index if not exists wbs_tasks_task_type_idx on public.wbs_tasks (task_type_id);

-- ---------------------------------------------------------------------------
-- task_deliverables
-- ---------------------------------------------------------------------------
create table if not exists public.task_deliverables (
  id uuid primary key default gen_random_uuid(),
  wbs_task_id uuid not null references public.wbs_tasks(id) on delete cascade,
  name text not null,
  description text,
  is_required boolean not null default true,
  contributor_id uuid references public.profiles(id) on delete set null,
  due_date date,
  document_revision_id uuid references public.document_revisions(id) on delete set null,
  external_url text,
  revision text,
  status text not null default 'pending'
    check (status in ('pending','in_progress','submitted','accepted','returned')),
  submitted_at timestamptz,
  reviewer_comment text,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists task_deliverables_task_idx on public.task_deliverables (wbs_task_id);
create index if not exists task_deliverables_contrib_idx on public.task_deliverables (contributor_id);
drop trigger if exists task_deliverables_set_updated_at on public.task_deliverables;
create trigger task_deliverables_set_updated_at before update on public.task_deliverables
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- task_submissions / task_reviews (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.task_submissions (
  id uuid primary key default gen_random_uuid(),
  wbs_task_id uuid not null references public.wbs_tasks(id) on delete cascade,
  round integer not null check (round >= 1),
  submitted_by uuid not null references public.profiles(id),
  note text,
  deliverables_snapshot jsonb,
  submitted_at timestamptz not null default now(),
  unique (wbs_task_id, round)
);
create index if not exists task_submissions_task_idx on public.task_submissions (wbs_task_id);

create table if not exists public.task_reviews (
  id uuid primary key default gen_random_uuid(),
  wbs_task_id uuid not null references public.wbs_tasks(id) on delete cascade,
  submission_id uuid not null references public.task_submissions(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id),
  decision text not null check (decision in ('approved','returned')),
  comments text,
  required_corrections text,
  decided_at timestamptz not null default now(),
  unique (submission_id, reviewer_id)
);
create index if not exists task_reviews_task_idx on public.task_reviews (wbs_task_id);
create index if not exists task_reviews_reviewer_idx on public.task_reviews (reviewer_id);

-- ---------------------------------------------------------------------------
-- task_blockers
-- ---------------------------------------------------------------------------
create table if not exists public.task_blockers (
  id uuid primary key default gen_random_uuid(),
  wbs_task_id uuid not null references public.wbs_tasks(id) on delete cascade,
  title text not null,
  description text,
  category text,
  impact text,
  responsible_department_id uuid references public.departments(id) on delete set null,
  responsible_profile_id uuid references public.profiles(id) on delete set null,
  linked_task_id uuid references public.wbs_tasks(id) on delete set null,
  linked_ref text,
  required_action text,
  expected_resolution_date date,
  status text not null default 'open' check (status in ('open','escalated','resolved','cancelled')),
  resolution_comment text,
  reported_by uuid not null references public.profiles(id),
  reported_at timestamptz not null default now(),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists task_blockers_task_idx on public.task_blockers (wbs_task_id);
create index if not exists task_blockers_open_idx on public.task_blockers (status) where status in ('open','escalated');
drop trigger if exists task_blockers_set_updated_at on public.task_blockers;
create trigger task_blockers_set_updated_at before update on public.task_blockers
  for each row execute function public.set_updated_at();

-- wbs_tasks.is_blocked is derived from open blockers.
create or replace function public.task_sync_is_blocked()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_task uuid := coalesce(new.wbs_task_id, old.wbs_task_id);
begin
  update public.wbs_tasks t
     set is_blocked = exists (
       select 1 from public.task_blockers b
        where b.wbs_task_id = v_task and b.status in ('open','escalated'))
   where t.id = v_task;
  return null;
end $$;
drop trigger if exists task_blockers_sync_is_blocked on public.task_blockers;
create trigger task_blockers_sync_is_blocked
  after insert or update of status or delete on public.task_blockers
  for each row execute function public.task_sync_is_blocked();

-- ---------------------------------------------------------------------------
-- task_comments, task_progress_history, task_effort_log, task_audit_events
-- ---------------------------------------------------------------------------
create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  wbs_task_id uuid not null references public.wbs_tasks(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists task_comments_task_idx on public.task_comments (wbs_task_id, created_at);

create table if not exists public.task_progress_history (
  id uuid primary key default gen_random_uuid(),
  wbs_task_id uuid not null references public.wbs_tasks(id) on delete cascade,
  previous_progress numeric,
  new_progress numeric not null check (new_progress >= 0 and new_progress <= 1),
  hours numeric check (hours is null or hours >= 0),
  remaining_hours numeric check (remaining_hours is null or remaining_hours >= 0),
  comment text,
  evidence_url text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists task_progress_history_task_idx on public.task_progress_history (wbs_task_id, created_at);

create table if not exists public.task_effort_log (
  id uuid primary key default gen_random_uuid(),
  wbs_task_id uuid not null references public.wbs_tasks(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  work_date date not null,
  hours numeric not null check (hours > 0 and hours <= 24),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists task_effort_log_task_idx on public.task_effort_log (wbs_task_id);
create index if not exists task_effort_log_profile_date_idx on public.task_effort_log (profile_id, work_date);

-- wbs_tasks.actual_hours = sum of the effort log for that task.
create or replace function public.task_sync_actual_hours()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_task uuid := coalesce(new.wbs_task_id, old.wbs_task_id);
begin
  update public.wbs_tasks t
     set actual_hours = coalesce((select sum(e.hours) from public.task_effort_log e where e.wbs_task_id = v_task), 0)
   where t.id = v_task;
  return null;
end $$;
drop trigger if exists task_effort_log_sync_actual on public.task_effort_log;
create trigger task_effort_log_sync_actual
  after insert or update or delete on public.task_effort_log
  for each row execute function public.task_sync_actual_hours();

create table if not exists public.task_audit_events (
  id uuid primary key default gen_random_uuid(),
  wbs_task_id uuid not null references public.wbs_tasks(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists task_audit_events_task_idx on public.task_audit_events (wbs_task_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['task_deliverables','task_submissions','task_reviews','task_blockers',
                           'task_comments','task_progress_history','task_effort_log','task_audit_events']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.task_in_scope(wbs_task_id))', t || '_select', t);
  end loop;
end $$;

-- deliverables: owner, contributor or users who can create/assign tasks
drop policy if exists task_deliverables_write on public.task_deliverables;
create policy task_deliverables_write on public.task_deliverables for all to authenticated
  using (public.task_in_scope(wbs_task_id) and (
    contributor_id = auth.uid()
    or exists (select 1 from public.wbs_tasks t where t.id = wbs_task_id and t.owner_id = auth.uid())
    or public.has_permission('task_management', 'create_task', 'can_create')
    or public.has_permission('task_management', 'assign_task', 'can_create')))
  with check (public.task_in_scope(wbs_task_id) and (
    contributor_id = auth.uid()
    or exists (select 1 from public.wbs_tasks t where t.id = wbs_task_id and t.owner_id = auth.uid())
    or public.has_permission('task_management', 'create_task', 'can_create')
    or public.has_permission('task_management', 'assign_task', 'can_create')));

-- submissions: only the task owner, with submit permission
drop policy if exists task_submissions_insert on public.task_submissions;
create policy task_submissions_insert on public.task_submissions for insert to authenticated
  with check (
    submitted_by = auth.uid()
    and public.has_permission('task_management', 'submit_task', 'submit')
    and exists (select 1 from public.wbs_tasks t where t.id = wbs_task_id and t.owner_id = auth.uid()));

-- reviews: only the named reviewer/approver, never the owner (separation of duties in the DB)
drop policy if exists task_reviews_insert on public.task_reviews;
create policy task_reviews_insert on public.task_reviews for insert to authenticated
  with check (
    reviewer_id = auth.uid()
    and exists (
      select 1 from public.wbs_tasks t
       where t.id = wbs_task_id
         and t.owner_id is distinct from auth.uid()
         and (t.reviewer_id = auth.uid() or t.approver_id = auth.uid())));

-- blockers: any in-scope participant can report; owner, reporter, responsible or planners can update
drop policy if exists task_blockers_insert on public.task_blockers;
create policy task_blockers_insert on public.task_blockers for insert to authenticated
  with check (reported_by = auth.uid() and public.task_in_scope(wbs_task_id));
drop policy if exists task_blockers_update on public.task_blockers;
create policy task_blockers_update on public.task_blockers for update to authenticated
  using (public.task_in_scope(wbs_task_id) and (
    reported_by = auth.uid()
    or responsible_profile_id = auth.uid()
    or exists (select 1 from public.wbs_tasks t where t.id = wbs_task_id and t.owner_id = auth.uid())
    or public.has_permission('task_management', 'plan_team', 'edit')))
  with check (public.task_in_scope(wbs_task_id));

-- comments: immutable
drop policy if exists task_comments_insert on public.task_comments;
create policy task_comments_insert on public.task_comments for insert to authenticated
  with check (author_id = auth.uid() and public.task_in_scope(wbs_task_id));

-- progress history: owner or users with update_progress; append-only
drop policy if exists task_progress_history_insert on public.task_progress_history;
create policy task_progress_history_insert on public.task_progress_history for insert to authenticated
  with check (
    created_by = auth.uid() and public.task_in_scope(wbs_task_id) and (
      exists (select 1 from public.wbs_tasks t where t.id = wbs_task_id and t.owner_id = auth.uid())
      or public.has_permission('task_management', 'update_progress', 'edit')));

-- effort log: own entries only; may correct own rows
drop policy if exists task_effort_log_insert on public.task_effort_log;
create policy task_effort_log_insert on public.task_effort_log for insert to authenticated
  with check (profile_id = auth.uid() and public.task_in_scope(wbs_task_id));
drop policy if exists task_effort_log_update on public.task_effort_log;
create policy task_effort_log_update on public.task_effort_log for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
drop policy if exists task_effort_log_delete on public.task_effort_log;
create policy task_effort_log_delete on public.task_effort_log for delete to authenticated
  using (profile_id = auth.uid());

-- audit events: insert-only
drop policy if exists task_audit_events_insert on public.task_audit_events;
create policy task_audit_events_insert on public.task_audit_events for insert to authenticated
  with check (actor_id = auth.uid() and public.task_in_scope(wbs_task_id));

-- ---------------------------------------------------------------------------
-- Seed: starter task types (configurable; admins can edit or disable). Not applied to any project.
-- ---------------------------------------------------------------------------
with t(code, name, disc, method, review, deliv) as (values
  ('STR-GEO','Geotechnical data review','STR','percentage',true,true),
  ('STR-FND','Foundation design','STR','deliverable',true,true),
  ('STR-PILE','Pile / pile cap design','STR','deliverable',true,true),
  ('STR-FRAME','Column, beam and slab design','STR','deliverable',true,true),
  ('STR-ANA','Structural analysis','STR','percentage',true,true),
  ('STR-CALC','Structural calculations','STR','deliverable',true,true),
  ('STR-DWG','Structural drawings','STR','deliverable',true,true),
  ('STR-REBAR','Rebar detailing','STR','deliverable',true,true),
  ('STR-SD','Shop drawing review','STR','milestone',true,false),
  ('STR-RFI','RFI technical review','STR','milestone',false,false),
  ('ARC-PLAN','Floor plan preparation','ARC','deliverable',true,true),
  ('ARC-ELEV','Elevation and section preparation','ARC','deliverable',true,true),
  ('ARC-INT','Interior layout','ARC','deliverable',true,true),
  ('ARC-SCH','Finishing, door and window schedules','ARC','deliverable',true,true),
  ('ARC-MAT','Material selection','ARC','milestone',true,false),
  ('ARC-DET','Architectural detailing','ARC','deliverable',true,true),
  ('ARC-SD','Shop drawing review','ARC','milestone',true,false),
  ('MEP-HVAC','HVAC design','MEP','deliverable',true,true),
  ('MEP-ELEC','Electrical design','MEP','deliverable',true,true),
  ('MEP-PLB','Plumbing and drainage design','MEP','deliverable',true,true),
  ('MEP-FIRE','Fire protection and alarm design','MEP','deliverable',true,true),
  ('MEP-ELV','ELV design','MEP','deliverable',true,true),
  ('MEP-COORD','MEP coordination','MEP','milestone',false,false),
  ('MEP-SD','Shop drawing review','MEP','milestone',true,false),
  ('BIM-MODEL','Discipline modelling','BIM','percentage',true,true),
  ('BIM-FED','Model federation','BIM','milestone',false,false),
  ('BIM-CLASH','Clash detection and coordination review','BIM','milestone',false,true),
  ('BIM-EXT','Drawing and quantity extraction','BIM','deliverable',true,true),
  ('QS-QTO','Quantity takeoff','QS','quantity',true,true),
  ('QS-BOQ','BOQ preparation','QS','deliverable',true,true),
  ('QS-TENDER','Tender preparation and comparison','QS','deliverable',true,true),
  ('QS-IPC','Interim payment assessment','QS','deliverable',true,true),
  ('QS-VO','Variation assessment','QS','deliverable',true,true),
  ('PRC-RFQ','RFQ preparation and quotation collection','PRC','milestone',false,true),
  ('PRC-EVAL','Technical and commercial evaluation','PRC','deliverable',true,true),
  ('PRC-PO','Purchase order processing','PRC','milestone',false,true),
  ('PRC-DLV','Delivery tracking and supplier follow-up','PRC','milestone',false,false),
  ('CON-PLAN','Work planning and method statement','CON','deliverable',true,true),
  ('CON-EXEC','Site execution','CON','quantity',false,false),
  ('CON-LOOK','Weekly look-ahead','CON','milestone',false,false),
  ('CON-INSP','Inspection coordination','CON','milestone',false,false),
  ('QAQC-ITP','Inspection and Test Plan','QAQC','deliverable',true,true),
  ('QAQC-INSP','Material / work inspection','QAQC','milestone',true,true),
  ('QAQC-NCR','Nonconformance reporting and corrective action','QAQC','milestone',true,true),
  ('HSE-RA','Risk assessment','HSE','deliverable',true,true),
  ('HSE-MS','Method statement review','HSE','milestone',true,false),
  ('HSE-INSP','Site safety inspection','HSE','milestone',false,true),
  ('PLN-BASE','Baseline schedule preparation','PLN','deliverable',true,true),
  ('PLN-UPD','Schedule update and look-ahead','PLN','milestone',false,false),
  ('PLN-DELAY','Delay / EOT analysis','PLN','deliverable',true,true),
  ('DC-REG','Document registration and transmittal','DC','milestone',false,false),
  ('DC-REV','Revision tracking and distribution','DC','milestone',false,false),
  ('COM-TC','Testing and commissioning','COM','milestone',true,true)
)
insert into public.task_types (code, name, discipline_id, progress_method, review_required, deliverable_required, sort_order)
select t.code, t.name, d.id, t.method, t.review, t.deliv, row_number() over ()
  from t left join public.discipline_master d on d.discipline_code = t.disc
on conflict (code) do nothing;

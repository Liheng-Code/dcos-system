-- Migration: 20261004000010_dr_core_schema.sql
-- Purpose: Module 10-01 Daily Reporting, Phase 1A — core schema.
--          Reporting units, immutable versioned daily reports, line-table
--          projections, evidence, rules, review/correction, missing reports,
--          project daily summary, audit log, notification outbox.
--          See docs/04-Business-Modules/10-Construction/10-01-Daily-Reporting/.
-- Design notes:
--   - Built BESIDE public.site_daily_reports (ADR-1). Nothing here alters the
--     old tables except projects.dr_enabled (per-project cut-over switch).
--   - No tenant_id: scoped by project_id, like the rest of this schema.
--   - Record tables have SELECT policies only. Every write goes through the
--     service-role-only functions in 20261004000011 (called by app/api/dr/*),
--     so clients have no direct write path. Config tables (units, members,
--     schedules, approvers, rule definitions) are written under RLS.
--   - Immutability is enforced by triggers, not by convention (G6).
-- Depends on:
--   public.projects, public.profiles, public.wbs_nodes, public.wbs_tasks,
--   public.subcontracts, public.departments, public.role_permissions,
--   public.is_admin(uuid), public.is_project_member(uuid),
--   public.has_permission(text,text,text), public.set_updated_at(),
--   public.task_alerts

-- ── 0. Per-project cut-over switch ──────────────────────────────────────────
alter table public.projects
  add column if not exists dr_enabled boolean not null default false;

comment on column public.projects.dr_enabled is
  'Module 10-01 cut-over switch. true = the project uses dr_reports (versioned, '
  'PM-approved); false = the legacy site_daily_reports flow.';

-- ── 1. Reporting schedule ───────────────────────────────────────────────────
create table public.dr_reporting_schedules (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  name              text not null default 'Default',
  deadline_time     time not null default '18:00',
  reminder_time     time not null default '16:00',
  late_window_hours int  not null default 15 check (late_window_hours between 0 and 72),
  -- ISO day numbers, 1 = Monday … 7 = Sunday.
  working_days      int[] not null default '{1,2,3,4,5,6}',
  -- null = the project's own projects.time_zone.
  timezone          text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (project_id, name)
);

-- Project-specific non-working days (holidays, shutdowns). Kept in-module:
-- the only holiday table in this schema is HR's leave_public_holidays, which
-- is company-wide and not project-scoped.
create table public.dr_non_working_days (
  project_id uuid not null references public.projects(id) on delete cascade,
  day        date not null,
  reason     text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, day)
);

-- ── 2. Reporting unit ───────────────────────────────────────────────────────
create table public.dr_reporting_units (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects(id) on delete cascade,
  unit_code           text not null,
  unit_type           text not null check (unit_type in ('SUBCONTRACTOR', 'IN_HOUSE_TEAM')),
  subcontract_id      uuid references public.subcontracts(id) on delete set null,
  department_id       uuid references public.departments(id) on delete set null,
  display_name        text not null,
  discipline_scope    text[] not null default '{}',
  schedule_id         uuid references public.dr_reporting_schedules(id) on delete set null,
  -- Sections the unit must fill in addition to the always-required ones.
  required_sections   jsonb not null default '[]'::jsonb,
  -- { "per_activity": 1, "per_report": 0, "severity": "WARNING" }
  evidence_min_policy jsonb not null default '{"per_activity": 1, "per_report": 0, "severity": "WARNING"}'::jsonb,
  status              text not null default 'Planned'
                      check (status in ('Planned', 'Active', 'Suspended', 'Demobilised')),
  mobilised_at        date,
  demobilised_at      date,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (project_id, unit_code)
);

create index idx_dr_units_project on public.dr_reporting_units(project_id, status);

-- G5: WBS scope as rows with foreign keys. No rows = whole project.
create table public.dr_reporting_unit_wbs_scope (
  unit_id     uuid not null references public.dr_reporting_units(id) on delete cascade,
  wbs_node_id uuid not null references public.wbs_nodes(id) on delete cascade,
  primary key (unit_id, wbs_node_id)
);

create table public.dr_reporting_unit_members (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references public.dr_reporting_units(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'REPORTER' check (member_role in ('REPORTER', 'VIEWER')),
  is_lead     boolean not null default false,
  valid_from  date not null default current_date,
  valid_to    date,
  status      text not null default 'active' check (status in ('active', 'suspended', 'revoked')),
  created_at  timestamptz not null default now(),
  unique (unit_id, user_id)
);

create index idx_dr_unit_members_user on public.dr_reporting_unit_members(user_id);

-- G7: primary and alternate approver per project. With no PRIMARY row the
-- project's project_manager_id is the approver.
create table public.dr_project_approvers (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  approver_role text not null check (approver_role in ('PRIMARY', 'ALTERNATE')),
  valid_from    date not null default current_date,
  valid_to      date,
  set_by        uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (project_id, user_id, approver_role)
);

-- ── 3. Running numbers: DR-<year>-<6 digits> ────────────────────────────────
create table public.dr_running_numbers (
  year    int primary key,
  last_no int not null default 0
);

-- ── 4. Report header ────────────────────────────────────────────────────────
create table public.dr_reports (
  id                    uuid primary key default gen_random_uuid(),
  report_no             text not null unique,
  project_id            uuid not null references public.projects(id) on delete cascade,
  unit_id               uuid not null references public.dr_reporting_units(id) on delete restrict,
  report_date           date not null,
  report_kind           text not null check (report_kind in ('WORK', 'NO_WORK')),
  current_version_no    int not null default 1,
  approved_version_no   int,
  submission_state      text not null default 'SUBMITTED'
                        check (submission_state in ('DRAFT', 'QUEUED_OFFLINE', 'SUBMITTED', 'RETURNED', 'WITHDRAWN')),
  assurance_state       text not null default 'PENDING'
                        check (assurance_state in ('PENDING', 'RULES_DONE', 'AI_RUNNING', 'COMPLETE', 'AI_UNAVAILABLE', 'NOT_APPLICABLE')),
  review_state          text not null default 'AWAITING_REVIEW'
                        check (review_state in ('AWAITING_REVIEW', 'IN_REVIEW', 'INFO_REQUESTED', 'RETURNED',
                                                'APPROVED', 'APPROVED_WITH_REMARK', 'AMENDMENT_PENDING')),
  sync_state            text not null default 'SYNCED'
                        check (sync_state in ('LOCAL_ONLY', 'SYNCING', 'SYNCED', 'CONFLICT', 'REQUIRES_REVIEW', 'EVIDENCE_PENDING')),
  late_flag             boolean not null default false,
  backdated_flag        boolean not null default false,
  imported_flag         boolean not null default false,
  warning_count         int not null default 0,
  first_submitted_at    timestamptz not null default now(),
  first_submitted_by    uuid references public.profiles(id) on delete set null,
  approved_at           timestamptz,
  approved_by           uuid references public.profiles(id) on delete set null,
  -- A5: trace of a migrated legacy report.
  source_site_report_id uuid references public.site_daily_reports(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (unit_id, report_date)
);

create index idx_dr_reports_project_date on public.dr_reports(project_id, report_date desc);
create index idx_dr_reports_review on public.dr_reports(project_id, review_state);

-- ── 5. Immutable versions ───────────────────────────────────────────────────
create table public.dr_report_versions (
  id                uuid primary key default gen_random_uuid(),
  report_id         uuid not null references public.dr_reports(id) on delete restrict,
  project_id        uuid not null references public.projects(id) on delete cascade,
  unit_id           uuid not null references public.dr_reporting_units(id) on delete restrict,
  version_no        int not null,
  version_kind      text not null check (version_kind in ('ORIGINAL', 'CORRECTION', 'AMENDMENT')),
  report_kind       text not null check (report_kind in ('WORK', 'NO_WORK')),
  -- Authoritative content (G4). Line tables below are projections of this.
  payload           jsonb not null,
  content_hash      text not null,
  submitted_by      uuid references public.profiles(id) on delete set null,
  submitted_at      timestamptz not null default now(),
  client_created_at timestamptz,
  idempotency_key   text not null,
  channel           text not null default 'WEB'
                    check (channel in ('TELEGRAM_MINIAPP', 'FIELD_APP', 'WEB', 'API', 'IMPORT')),
  change_reason     text,
  unique (report_id, version_no),
  unique (project_id, idempotency_key)
);

create index idx_dr_versions_report on public.dr_report_versions(report_id, version_no desc);

-- Server-side drafts. Mutable by design: a draft is not a record.
create table public.dr_drafts (
  unit_id     uuid not null references public.dr_reporting_units(id) on delete cascade,
  report_date date not null,
  project_id  uuid not null references public.projects(id) on delete cascade,
  payload     jsonb not null,
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (unit_id, report_date)
);

-- ── 6. Line tables (projections, one set per version) ───────────────────────
create table public.dr_activity_progress (
  id                      uuid primary key default gen_random_uuid(),
  version_id              uuid not null references public.dr_report_versions(id) on delete restrict,
  report_id               uuid not null references public.dr_reports(id) on delete restrict,
  project_id              uuid not null references public.projects(id) on delete cascade,
  line_id                 text not null,
  task_id                 uuid references public.wbs_tasks(id) on delete set null,
  wbs_node_id             uuid references public.wbs_nodes(id) on delete set null,
  discipline              text,
  work_status             text check (work_status in ('not_started', 'in_progress', 'completed', 'hindered', 'stopped')),
  progress_before         numeric(5,2) check (progress_before between 0 and 100),
  progress_today          numeric(5,2) check (progress_today between 0 and 100),
  reported_qty            numeric(14,4) check (reported_qty is null or reported_qty >= 0),
  uom                     text,
  cumulative_reported_qty numeric(14,4),
  trade_code              text,
  headcount               int check (headcount is null or headcount >= 0),
  hours_normal            numeric(6,2) check (hours_normal is null or hours_normal >= 0),
  hours_ot                numeric(6,2) check (hours_ot is null or hours_ot >= 0),
  step_progress           jsonb not null default '[]'::jsonb,
  actual_start_date       date,
  actual_finish_date      date,
  unplanned_flag          boolean not null default false,
  unplanned_reason        text,
  free_text_activity      text,
  remarks                 text,
  unique (version_id, line_id)
);
create index idx_dr_activity_task on public.dr_activity_progress(task_id);
create index idx_dr_activity_report on public.dr_activity_progress(report_id);

create table public.dr_manpower (
  id             uuid primary key default gen_random_uuid(),
  version_id     uuid not null references public.dr_report_versions(id) on delete restrict,
  project_id     uuid not null references public.projects(id) on delete cascade,
  line_id        text not null,
  trade          text not null,
  planned_count  int check (planned_count is null or planned_count >= 0),
  reported_count int not null check (reported_count >= 0),
  supervisors    int check (supervisors is null or supervisors >= 0),
  hours          numeric(6,2) check (hours is null or hours >= 0),
  unique (version_id, line_id)
);

create table public.dr_equipment (
  id              uuid primary key default gen_random_uuid(),
  version_id      uuid not null references public.dr_report_versions(id) on delete restrict,
  project_id      uuid not null references public.projects(id) on delete cascade,
  line_id         text not null,
  equipment_type  text not null,
  asset_ref       text,
  hours_working   numeric(6,2) check (hours_working is null or hours_working >= 0),
  hours_idle      numeric(6,2) check (hours_idle is null or hours_idle >= 0),
  hours_breakdown numeric(6,2) check (hours_breakdown is null or hours_breakdown >= 0),
  unique (version_id, line_id)
);

create table public.dr_materials (
  id                uuid primary key default gen_random_uuid(),
  version_id        uuid not null references public.dr_report_versions(id) on delete restrict,
  project_id        uuid not null references public.projects(id) on delete cascade,
  line_id           text not null,
  description       text not null,
  qty_delivered     numeric(14,4) check (qty_delivered is null or qty_delivered >= 0),
  qty_used          numeric(14,4) check (qty_used is null or qty_used >= 0),
  uom               text,
  delivery_note_ref text,
  unique (version_id, line_id)
);

create table public.dr_delay_events (
  id                 uuid primary key default gen_random_uuid(),
  version_id         uuid not null references public.dr_report_versions(id) on delete restrict,
  report_id          uuid not null references public.dr_reports(id) on delete restrict,
  project_id         uuid not null references public.projects(id) on delete cascade,
  line_id            text not null,
  cause_category     text not null check (cause_category in (
                       'EMPLOYER_CAUSED', 'CONTRACTOR_CAUSED', 'SUBCONTRACTOR_CAUSED', 'DESIGN_INFORMATION',
                       'WEATHER', 'THIRD_PARTY_UTILITY', 'AUTHORITY', 'FORCE_MAJEURE', 'MATERIAL_SUPPLY',
                       'ACCESS_NOT_RELEASED', 'OTHER')),
  description        text not null,
  start_at           timestamptz,
  end_at             timestamptz,
  hours_lost         numeric(6,2) check (hours_lost is null or hours_lost >= 0),
  task_id            uuid references public.wbs_tasks(id) on delete set null,
  wbs_node_id        uuid references public.wbs_nodes(id) on delete set null,
  notice_required    boolean not null default false,
  unique (version_id, line_id)
);
create index idx_dr_delay_report on public.dr_delay_events(report_id);

create table public.dr_issues (
  id                   uuid primary key default gen_random_uuid(),
  version_id           uuid not null references public.dr_report_versions(id) on delete restrict,
  project_id           uuid not null references public.projects(id) on delete cascade,
  line_id              text not null,
  issue_type           text,
  severity             text check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  description          text not null,
  action_required_from text,
  unique (version_id, line_id)
);

create table public.dr_instructions_received (
  id               uuid primary key default gen_random_uuid(),
  version_id       uuid not null references public.dr_report_versions(id) on delete restrict,
  project_id       uuid not null references public.projects(id) on delete cascade,
  line_id          text not null,
  instruction_type text check (instruction_type in ('VERBAL', 'WRITTEN')),
  given_by         text,
  reference        text,
  description      text not null,
  unique (version_id, line_id)
);

create table public.dr_inspection_requests (
  id          uuid primary key default gen_random_uuid(),
  version_id  uuid not null references public.dr_report_versions(id) on delete restrict,
  project_id  uuid not null references public.projects(id) on delete cascade,
  line_id     text not null,
  wbs_node_id uuid references public.wbs_nodes(id) on delete set null,
  reference   text,
  status      text,
  unique (version_id, line_id)
);

create table public.dr_weather (
  version_id uuid primary key references public.dr_report_versions(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  condition  text,
  hours_lost numeric(6,2) check (hours_lost is null or hours_lost >= 0),
  note       text
);

create table public.dr_safety (
  version_id        uuid primary key references public.dr_report_versions(id) on delete restrict,
  project_id        uuid not null references public.projects(id) on delete cascade,
  toolbox_talk_held boolean,
  observations      text,
  incident_count    int not null default 0 check (incident_count >= 0),
  near_miss_count   int not null default 0 check (near_miss_count >= 0)
);

create table public.dr_area_access (
  id           uuid primary key default gen_random_uuid(),
  version_id   uuid not null references public.dr_report_versions(id) on delete restrict,
  project_id   uuid not null references public.projects(id) on delete cascade,
  line_id      text not null,
  wbs_node_id  uuid references public.wbs_nodes(id) on delete set null,
  access_state text not null check (access_state in ('RELEASED', 'BLOCKED', 'PARTIAL')),
  note         text,
  unique (version_id, line_id)
);

create table public.dr_next_day_plan (
  id               uuid primary key default gen_random_uuid(),
  version_id       uuid not null references public.dr_report_versions(id) on delete restrict,
  project_id       uuid not null references public.projects(id) on delete cascade,
  line_id          text not null,
  task_id          uuid references public.wbs_tasks(id) on delete set null,
  description      text,
  planned_manpower int check (planned_manpower is null or planned_manpower >= 0),
  planned_qty      numeric(14,4),
  unique (version_id, line_id)
);

-- ── 7. Evidence ─────────────────────────────────────────────────────────────
create table public.dr_evidence (
  id                 uuid primary key default gen_random_uuid(),
  version_id         uuid not null references public.dr_report_versions(id) on delete restrict,
  report_id          uuid not null references public.dr_reports(id) on delete restrict,
  project_id         uuid not null references public.projects(id) on delete cascade,
  target_section     text not null,
  target_line_id     text,
  wbs_node_id        uuid references public.wbs_nodes(id) on delete set null,
  storage_key        text not null,
  mime_type          text not null,
  size_bytes         bigint not null,
  sha256             text not null,
  captured_at_device timestamptz,
  received_at_server timestamptz not null default now(),
  gps_lat            numeric(10,7),
  gps_lng            numeric(10,7),
  source             text not null default 'WEB' check (source in ('MINIAPP', 'FIELD_APP', 'WEB', 'IMPORT')),
  caption            text,
  -- G12. 'Available' is set only after the content check in the upload
  -- gateway; scan_engine records what actually checked the file.
  scan_status        text not null default 'Scanning'
                     check (scan_status in ('Uploading', 'Scanning', 'Available', 'Quarantined', 'Failed')),
  scan_engine        text,
  unique (version_id, storage_key)
);
create index idx_dr_evidence_report on public.dr_evidence(report_id);
create index idx_dr_evidence_sha on public.dr_evidence(project_id, sha256);

-- ── 8. Rules ────────────────────────────────────────────────────────────────
create table public.dr_rule_definitions (
  id               uuid primary key default gen_random_uuid(),
  -- null project_id = global default; a project row overrides it.
  project_id       uuid references public.projects(id) on delete cascade,
  rule_code        text not null,
  point            text not null check (point in ('INTAKE', 'POST_SUBMIT')),
  severity         text not null check (severity in ('ERROR', 'WARNING')),
  params           jsonb not null default '{}'::jsonb,
  min_history_days int not null default 0,
  version          int not null default 1,
  is_active        boolean not null default true,
  updated_by       uuid references public.profiles(id) on delete set null,
  updated_at       timestamptz not null default now()
);
create unique index uq_dr_rule_global on public.dr_rule_definitions(rule_code) where project_id is null;
create unique index uq_dr_rule_project on public.dr_rule_definitions(project_id, rule_code) where project_id is not null;

create table public.dr_rule_results (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references public.dr_reports(id) on delete restrict,
  version_id   uuid not null references public.dr_report_versions(id) on delete restrict,
  project_id   uuid not null references public.projects(id) on delete cascade,
  rule_code    text not null,
  rule_version int not null default 1,
  status       text not null check (status in ('PASSED', 'FAILED')),
  severity     text not null check (severity in ('ERROR', 'WARNING')),
  message      text not null,
  params       jsonb not null default '{}'::jsonb,
  target       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index idx_dr_rule_results_version on public.dr_rule_results(version_id);

-- ── 9. Review and correction ────────────────────────────────────────────────
create table public.dr_review_decisions (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.dr_reports(id) on delete restrict,
  version_id  uuid not null references public.dr_report_versions(id) on delete restrict,
  project_id  uuid not null references public.projects(id) on delete cascade,
  reviewer_id uuid references public.profiles(id) on delete set null,
  decision    text not null check (decision in ('APPROVE', 'APPROVE_WITH_REMARK', 'REQUEST_INFO', 'RETURN')),
  comment     text,
  decided_at  timestamptz not null default now(),
  -- Return, remark and information requests must say why.
  constraint dr_review_comment_required
    check (decision = 'APPROVE' or (comment is not null and btrim(comment) <> ''))
);
create index idx_dr_decisions_report on public.dr_review_decisions(report_id, decided_at desc);

-- G3: verified quantities live outside the immutable line tables.
create table public.dr_verified_quantities (
  id           uuid primary key default gen_random_uuid(),
  decision_id  uuid not null references public.dr_review_decisions(id) on delete restrict,
  version_id   uuid not null references public.dr_report_versions(id) on delete restrict,
  report_id    uuid not null references public.dr_reports(id) on delete restrict,
  project_id   uuid not null references public.projects(id) on delete cascade,
  line_id      text not null,
  reported_qty numeric(14,4),
  verified_qty numeric(14,4) not null check (verified_qty >= 0),
  remark       text not null check (btrim(remark) <> ''),
  decided_by   uuid references public.profiles(id) on delete set null,
  decided_at   timestamptz not null default now(),
  unique (version_id, line_id)
);

-- Contractual classification of a delay, confirmed by the PM at approval
-- before anything is written to delay_register (A4).
create table public.dr_delay_classifications (
  id                uuid primary key default gen_random_uuid(),
  decision_id       uuid not null references public.dr_review_decisions(id) on delete restrict,
  version_id        uuid not null references public.dr_report_versions(id) on delete restrict,
  project_id        uuid not null references public.projects(id) on delete cascade,
  line_id           text not null,
  delay_type        text not null check (delay_type in ('excusable', 'non_excusable', 'compensable', 'non_compensable')),
  delay_register_id uuid references public.delay_register(id) on delete set null,
  unique (version_id, line_id)
);

create table public.dr_correction_requests (
  id                     uuid primary key default gen_random_uuid(),
  report_id              uuid not null references public.dr_reports(id) on delete restrict,
  project_id             uuid not null references public.projects(id) on delete cascade,
  based_on_version_no    int not null,
  request_kind           text not null default 'RETURN' check (request_kind in ('RETURN', 'REQUEST_INFO')),
  drafted_by             text not null default 'PM' check (drafted_by in ('AI', 'PM')),
  sent_by                uuid references public.profiles(id) on delete set null,
  status                 text not null default 'Sent'
                         check (status in ('Draft', 'Sent', 'Acknowledged', 'Resubmitted', 'Closed', 'Cancelled')),
  message                text not null,
  response               text,
  sent_at                timestamptz not null default now(),
  resolved_in_version_no int,
  closed_at              timestamptz
);
create index idx_dr_corrections_report on public.dr_correction_requests(report_id, sent_at desc);

create table public.dr_correction_items (
  id              uuid primary key default gen_random_uuid(),
  correction_id   uuid not null references public.dr_correction_requests(id) on delete cascade,
  project_id      uuid not null references public.projects(id) on delete cascade,
  target_section  text not null,
  target_line_id  text,
  reason          text not null,
  required_action text
);

-- ── 10. Missing reports ─────────────────────────────────────────────────────
create table public.dr_missing_reports (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  unit_id          uuid not null references public.dr_reporting_units(id) on delete cascade,
  report_date      date not null,
  detected_at      timestamptz not null default now(),
  status           text not null default 'Open' check (status in ('Open', 'Late Submitted', 'Excused', 'Closed')),
  escalation_level int not null default 0,
  excuse_reason    text,
  excused_by       uuid references public.profiles(id) on delete set null,
  closed_at        timestamptz,
  linked_report_id uuid references public.dr_reports(id) on delete set null,
  unique (unit_id, report_date)
);
create index idx_dr_missing_project on public.dr_missing_reports(project_id, report_date desc);

-- ── 11. Project daily summary ───────────────────────────────────────────────
create table public.dr_project_daily_summaries (
  id                       uuid primary key default gen_random_uuid(),
  project_id               uuid not null references public.projects(id) on delete cascade,
  summary_date             date not null,
  -- 0 = the Live row, rewritten as approvals arrive. >= 1 = published.
  revision_no              int not null default 0,
  status                   text not null default 'Live' check (status in ('Live', 'Official', 'Superseded')),
  coverage                 jsonb not null default '{}'::jsonb,
  totals                   jsonb not null default '{}'::jsonb,
  included_report_versions jsonb not null default '[]'::jsonb,
  narrative_final          text,
  published_by             uuid references public.profiles(id) on delete set null,
  published_at             timestamptz,
  updated_at               timestamptz not null default now(),
  unique (project_id, summary_date, revision_no)
);

-- ── 12. Audit log (append-only) ─────────────────────────────────────────────
create table public.dr_audit_log (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  unit_id    uuid,
  report_id  uuid,
  version_no int,
  event_code text not null,
  actor_id   uuid,
  channel    text,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_dr_audit_project on public.dr_audit_log(project_id, created_at desc);
create index idx_dr_audit_report on public.dr_audit_log(report_id, created_at desc);

-- ── 13. Notification outbox ─────────────────────────────────────────────────
-- Written in the same transaction as the event it describes. In-app alerts
-- are inserted directly into task_alerts by the same functions; this outbox
-- carries the Telegram DM / email fan-out, drained by app/api/dr/cron/tick.
create table public.dr_notification_outbox (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  event_code   text not null,
  priority     text not null default 'Normal' check (priority in ('Low', 'Normal', 'High', 'Critical')),
  title        text not null,
  body         text not null,
  href         text,
  -- 'email' forces email for Critical items regardless of the general toggle.
  channels     text[] not null default '{telegram,email}',
  source_key   text not null unique,
  status       text not null default 'Pending' check (status in ('Pending', 'Sent', 'Failed')),
  attempts     int not null default 0,
  last_error   text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);
create index idx_dr_outbox_pending on public.dr_notification_outbox(status, created_at) where status = 'Pending';

-- In-app alerts reuse task_alerts. Extend its alert_type CHECK without
-- assuming the current value list (other migrations have widened it).
do $$
declare
  v_con   text;
  v_vals  text[];
  v_new   text[] := array[
    'dr_report_submitted', 'dr_review_required', 'dr_report_returned', 'dr_info_requested',
    'dr_report_approved', 'dr_report_missing', 'dr_review_overdue', 'dr_correction_overdue',
    'dr_safety_incident', 'dr_delay_notice', 'dr_summary_published', 'dr_requires_review'];
begin
  select conname into v_con
  from pg_constraint
  where conrelid = 'public.task_alerts'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%alert_type%';

  if v_con is not null then
    select array_agg(distinct m[1]) into v_vals
    from pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') as m
    where c.conrelid = 'public.task_alerts'::regclass and c.conname = v_con;

    execute format('alter table public.task_alerts drop constraint %I', v_con);
  end if;

  select array_agg(distinct v) into v_vals
  from unnest(coalesce(v_vals, '{}'::text[]) || v_new) as v;

  execute format(
    'alter table public.task_alerts add constraint task_alerts_alert_type_check check (alert_type = any (%L::text[]))',
    v_vals);
end $$;

-- ── 14. updated_at triggers ─────────────────────────────────────────────────
create trigger trg_dr_schedules_updated_at before update on public.dr_reporting_schedules
  for each row execute function public.set_updated_at();
create trigger trg_dr_units_updated_at before update on public.dr_reporting_units
  for each row execute function public.set_updated_at();
create trigger trg_dr_reports_updated_at before update on public.dr_reports
  for each row execute function public.set_updated_at();

-- ── 15. Immutability (G6) ───────────────────────────────────────────────────
create or replace function public.dr_block_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'DR_IMMUTABLE: % on % is not allowed; daily-report records are append-only',
    tg_op, tg_table_name
    using errcode = 'P0001';
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'dr_report_versions', 'dr_activity_progress', 'dr_manpower', 'dr_equipment', 'dr_materials',
    'dr_delay_events', 'dr_issues', 'dr_instructions_received', 'dr_inspection_requests',
    'dr_weather', 'dr_safety', 'dr_area_access', 'dr_next_day_plan',
    'dr_rule_results', 'dr_review_decisions', 'dr_verified_quantities', 'dr_audit_log']
  loop
    execute format(
      'create trigger trg_%s_immutable before update or delete on public.%I
         for each row execute function public.dr_block_mutation()', t, t);
  end loop;
end $$;

-- Evidence: only scan_status / scan_engine may change after insert.
create or replace function public.dr_evidence_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'DR_IMMUTABLE: evidence rows cannot be deleted' using errcode = 'P0001';
  end if;
  if (to_jsonb(new) - 'scan_status' - 'scan_engine') is distinct from
     (to_jsonb(old) - 'scan_status' - 'scan_engine') then
    raise exception 'DR_IMMUTABLE: only scan_status may change on evidence' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_dr_evidence_guard before update or delete on public.dr_evidence
  for each row execute function public.dr_evidence_guard();

-- Delay classification: only the delay_register backlink may be filled in.
create or replace function public.dr_delay_classification_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'DR_IMMUTABLE: delay classifications cannot be deleted' using errcode = 'P0001';
  end if;
  if (to_jsonb(new) - 'delay_register_id') is distinct from (to_jsonb(old) - 'delay_register_id') then
    raise exception 'DR_IMMUTABLE: delay classification is append-only' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_dr_delay_classification_guard before update or delete on public.dr_delay_classifications
  for each row execute function public.dr_delay_classification_guard();

-- ── 16. Access helpers ──────────────────────────────────────────────────────
-- Active unit membership on a given day.
create or replace function public.dr_is_unit_member(p_unit_id uuid, p_user uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from dr_reporting_unit_members m
    where m.unit_id = p_unit_id
      and m.user_id = p_user
      and m.status = 'active'
      and m.valid_from <= current_date
      and (m.valid_to is null or m.valid_to >= current_date)
  );
$$;

-- Reviewer = admin, a PRIMARY/ALTERNATE approver inside its validity window,
-- or the project's manager when no PRIMARY approver is configured.
create or replace function public.dr_can_review(p_project_id uuid, p_user uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select is_admin(p_user)
    or exists (
      select 1 from dr_project_approvers a
      where a.project_id = p_project_id
        and a.user_id = p_user
        and a.valid_from <= current_date
        and (a.valid_to is null or a.valid_to >= current_date)
    )
    or (
      not exists (
        select 1 from dr_project_approvers a
        where a.project_id = p_project_id and a.approver_role = 'PRIMARY'
          and a.valid_from <= current_date and (a.valid_to is null or a.valid_to >= current_date)
      )
      and exists (
        select 1 from projects p where p.id = p_project_id and p.project_manager_id = p_user
      )
    );
$$;

-- Project-wide read (management, planners, QS …): reviewer, or a project
-- member whose role has the construction/daily_reporting view permission and
-- is not scoped to a single unit.
create or replace function public.dr_can_view_project(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select dr_can_review(p_project_id, auth.uid())
    or (
      exists (select 1 from project_members pm where pm.project_id = p_project_id and pm.user_id = auth.uid())
      and exists (
        select 1
        from user_roles ur
        join role_permissions rp on rp.role_code = ur.role_code
        where ur.user_id = auth.uid()
          and rp.module = 'construction' and rp.action = 'daily_reporting'
          and rp.view and rp.scope is distinct from 'own'
      )
    );
$$;

-- G15: the single predicate every record policy uses.
create or replace function public.dr_has_project_access(p_project_id uuid, p_unit_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select dr_can_view_project(p_project_id)
    or (p_unit_id is not null and dr_is_unit_member(p_unit_id, auth.uid()));
$$;

create or replace function public.dr_can_admin(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select is_admin(auth.uid())
    or exists (select 1 from projects p where p.id = p_project_id and p.project_manager_id = auth.uid())
    or (
      exists (select 1 from project_members pm where pm.project_id = p_project_id and pm.user_id = auth.uid())
      and has_permission('construction', 'daily_reporting', 'configure')
    );
$$;

grant execute on function
  public.dr_is_unit_member(uuid, uuid),
  public.dr_can_review(uuid, uuid),
  public.dr_can_view_project(uuid),
  public.dr_has_project_access(uuid, uuid),
  public.dr_can_admin(uuid)
to authenticated, service_role;

-- ── 17. RLS ─────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'dr_reporting_schedules', 'dr_non_working_days', 'dr_reporting_units', 'dr_reporting_unit_wbs_scope',
    'dr_reporting_unit_members', 'dr_project_approvers', 'dr_running_numbers', 'dr_reports',
    'dr_report_versions', 'dr_drafts', 'dr_activity_progress', 'dr_manpower', 'dr_equipment',
    'dr_materials', 'dr_delay_events', 'dr_issues', 'dr_instructions_received', 'dr_inspection_requests',
    'dr_weather', 'dr_safety', 'dr_area_access', 'dr_next_day_plan', 'dr_evidence',
    'dr_rule_definitions', 'dr_rule_results', 'dr_review_decisions', 'dr_verified_quantities',
    'dr_delay_classifications', 'dr_correction_requests', 'dr_correction_items', 'dr_missing_reports',
    'dr_project_daily_summaries', 'dr_audit_log', 'dr_notification_outbox']
  loop
    execute format('alter table public.%I enable row level security', t);
    -- Records are written only by the service-role functions.
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated, anon', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Config tables: project-wide viewers and unit members read; admins write.
grant insert, update, delete on
  public.dr_reporting_schedules, public.dr_non_working_days, public.dr_reporting_units,
  public.dr_reporting_unit_wbs_scope, public.dr_reporting_unit_members, public.dr_project_approvers
to authenticated;
grant insert, update on public.dr_rule_definitions to authenticated;

create policy dr_schedules_select on public.dr_reporting_schedules for select to authenticated
  using (dr_can_view_project(project_id) or exists (
    select 1 from dr_reporting_units u where u.schedule_id = dr_reporting_schedules.id
      and dr_is_unit_member(u.id, auth.uid())));
create policy dr_schedules_write on public.dr_reporting_schedules for all to authenticated
  using (dr_can_admin(project_id)) with check (dr_can_admin(project_id));

create policy dr_nwd_select on public.dr_non_working_days for select to authenticated
  using (is_project_member(project_id) or dr_can_view_project(project_id));
create policy dr_nwd_write on public.dr_non_working_days for all to authenticated
  using (dr_can_admin(project_id)) with check (dr_can_admin(project_id));

create policy dr_units_select on public.dr_reporting_units for select to authenticated
  using (dr_has_project_access(project_id, id));
create policy dr_units_write on public.dr_reporting_units for all to authenticated
  using (dr_can_admin(project_id)) with check (dr_can_admin(project_id));

create policy dr_unit_scope_select on public.dr_reporting_unit_wbs_scope for select to authenticated
  using (exists (select 1 from dr_reporting_units u
                 where u.id = unit_id and dr_has_project_access(u.project_id, u.id)));
create policy dr_unit_scope_write on public.dr_reporting_unit_wbs_scope for all to authenticated
  using (exists (select 1 from dr_reporting_units u where u.id = unit_id and dr_can_admin(u.project_id)))
  with check (exists (select 1 from dr_reporting_units u where u.id = unit_id and dr_can_admin(u.project_id)));

create policy dr_unit_members_select on public.dr_reporting_unit_members for select to authenticated
  using (user_id = auth.uid() or exists (
    select 1 from dr_reporting_units u where u.id = unit_id and dr_has_project_access(u.project_id, u.id)));
create policy dr_unit_members_write on public.dr_reporting_unit_members for all to authenticated
  using (exists (select 1 from dr_reporting_units u where u.id = unit_id and dr_can_admin(u.project_id)))
  with check (exists (select 1 from dr_reporting_units u where u.id = unit_id and dr_can_admin(u.project_id)));

create policy dr_approvers_select on public.dr_project_approvers for select to authenticated
  using (is_project_member(project_id) or dr_can_view_project(project_id));
-- Only an administrator sets approvers: a PM must not appoint their own alternate.
create policy dr_approvers_write on public.dr_project_approvers for all to authenticated
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

create policy dr_rules_select on public.dr_rule_definitions for select to authenticated using (true);
create policy dr_rules_insert on public.dr_rule_definitions for insert to authenticated
  with check (case when project_id is null then is_admin(auth.uid()) else dr_can_admin(project_id) end);
create policy dr_rules_update on public.dr_rule_definitions for update to authenticated
  using (case when project_id is null then is_admin(auth.uid()) else dr_can_admin(project_id) end)
  with check (case when project_id is null then is_admin(auth.uid()) else dr_can_admin(project_id) end);

-- Records: read by project-wide viewers and by the owning unit's members.
create policy dr_reports_select on public.dr_reports for select to authenticated
  using (dr_has_project_access(project_id, unit_id));
create policy dr_versions_select on public.dr_report_versions for select to authenticated
  using (dr_has_project_access(project_id, unit_id));
create policy dr_drafts_select on public.dr_drafts for select to authenticated
  using (dr_is_unit_member(unit_id, auth.uid()));
create policy dr_missing_select on public.dr_missing_reports for select to authenticated
  using (dr_has_project_access(project_id, unit_id));

do $$
declare
  t text;
begin
  -- Tables keyed by version_id: visible when the parent version is visible.
  foreach t in array array[
    'dr_activity_progress', 'dr_manpower', 'dr_equipment', 'dr_materials', 'dr_delay_events', 'dr_issues',
    'dr_instructions_received', 'dr_inspection_requests', 'dr_weather', 'dr_safety', 'dr_area_access',
    'dr_next_day_plan', 'dr_evidence', 'dr_verified_quantities']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (exists (select 1 from public.dr_report_versions v
                        where v.id = version_id
                          and public.dr_has_project_access(v.project_id, v.unit_id)))',
      t || '_select', t);
  end loop;
end $$;

-- Reviewer-only material: rule results, decisions, delay classification, audit.
-- The reporting unit sees a decision only through the correction request and
-- the report's review_state (design principle 6).
create policy dr_rule_results_select on public.dr_rule_results for select to authenticated
  using (dr_can_view_project(project_id));
create policy dr_decisions_select on public.dr_review_decisions for select to authenticated
  using (dr_can_view_project(project_id)
         or (decision = 'APPROVE_WITH_REMARK' and exists (
               select 1 from dr_reports r where r.id = report_id and dr_is_unit_member(r.unit_id, auth.uid()))));
create policy dr_delay_class_select on public.dr_delay_classifications for select to authenticated
  using (dr_can_view_project(project_id));
create policy dr_audit_select on public.dr_audit_log for select to authenticated
  using (project_id is not null and dr_can_review(project_id, auth.uid()));

create policy dr_corrections_select on public.dr_correction_requests for select to authenticated
  using (status <> 'Draft' and exists (
    select 1 from dr_reports r where r.id = report_id and dr_has_project_access(r.project_id, r.unit_id)));
create policy dr_correction_items_select on public.dr_correction_items for select to authenticated
  using (exists (
    select 1 from dr_correction_requests c join dr_reports r on r.id = c.report_id
    where c.id = correction_id and c.status <> 'Draft' and dr_has_project_access(r.project_id, r.unit_id)));

-- Summaries: management sees everything; a unit sees only Official revisions.
create policy dr_summaries_select on public.dr_project_daily_summaries for select to authenticated
  using (dr_can_view_project(project_id));

-- dr_running_numbers and dr_notification_outbox: no policies = service role only.

-- ── 18. Evidence storage bucket (private) ───────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dr-evidence', 'dr-evidence', false, 20971520,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;
-- No storage.objects policies: uploads and downloads use signed URLs issued by
-- app/api/dr/evidence/* after an access check.

-- ── 19. Permissions seed: module 'construction', action 'daily_reporting' ───
insert into public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, configure, scope)
values
  ('L0',  'construction', 'daily_reporting', true, true,  true,  false, true,  true,  true,  true,  true,  'company'),
  ('L1',  'construction', 'daily_reporting', true, false, false, false, false, true,  true,  true,  true,  'company'),
  ('L2',  'construction', 'daily_reporting', true, false, false, false, false, true,  true,  true,  true,  'company'),
  ('L3',  'construction', 'daily_reporting', true, true,  true,  false, true,  true,  true,  true,  true,  'project'),
  ('L4',  'construction', 'daily_reporting', true, true,  true,  false, true,  false, false, true,  false, 'project'),
  ('L5',  'construction', 'daily_reporting', true, true,  true,  false, true,  false, false, true,  false, 'project'),
  ('L6',  'construction', 'daily_reporting', true, true,  true,  false, true,  false, false, false, false, 'own'),
  ('SS',  'construction', 'daily_reporting', true, true,  true,  false, true,  false, false, false, false, 'own'),
  ('PE',  'construction', 'daily_reporting', true, false, false, false, false, false, false, true,  false, 'project'),
  ('QS',  'construction', 'daily_reporting', true, false, false, false, false, false, false, true,  false, 'project'),
  ('QA',  'construction', 'daily_reporting', true, false, false, false, false, false, false, false, false, 'project'),
  ('HSE', 'construction', 'daily_reporting', true, false, false, false, false, false, false, false, false, 'project'),
  ('EXT-SUB', 'construction', 'daily_reporting', true, true, true, false, true, false, false, false, false, 'own')
on conflict (role_code, module, action) do nothing;

-- ── 20. Rule definitions seed (global defaults) ─────────────────────────────
insert into public.dr_rule_definitions (project_id, rule_code, point, severity, params, min_history_days) values
  (null, 'REQ_FIELD',                 'INTAKE',      'ERROR',   '{}', 0),
  (null, 'INV_UNIT',                  'INTAKE',      'ERROR',   '{}', 0),
  (null, 'INV_WBS',                   'INTAKE',      'ERROR',   '{}', 0),
  (null, 'PROGRESS_MAX_100',          'INTAKE',      'ERROR',   '{}', 0),
  (null, 'QTY_NEGATIVE',              'INTAKE',      'ERROR',   '{}', 0),
  (null, 'UOM_MISMATCH',              'INTAKE',      'ERROR',   '{}', 0),
  (null, 'DATE_FUTURE',               'INTAKE',      'ERROR',   '{}', 0),
  (null, 'DUP_REPORT',                'INTAKE',      'ERROR',   '{}', 0),
  (null, 'UNPLANNED_REASON',          'INTAKE',      'ERROR',   '{}', 0),
  (null, 'EVIDENCE_MIN',              'INTAKE',      'WARNING', '{}', 0),
  (null, 'LATE_SUBMIT',               'POST_SUBMIT', 'WARNING', '{}', 0),
  (null, 'MANPOWER_BELOW_PLAN',       'POST_SUBMIT', 'WARNING', '{"threshold_pct": 80}', 0),
  (null, 'PROGRESS_REGRESS',          'POST_SUBMIT', 'WARNING', '{}', 0),
  (null, 'NEXT_DAY_MISSING_RESOURCE', 'POST_SUBMIT', 'WARNING', '{}', 0),
  (null, 'DELAY_NO_NOTICE_FLAG',      'POST_SUBMIT', 'WARNING',
     '{"causes": ["EMPLOYER_CAUSED", "DESIGN_INFORMATION", "ACCESS_NOT_RELEASED", "AUTHORITY"]}', 0)
on conflict do nothing;

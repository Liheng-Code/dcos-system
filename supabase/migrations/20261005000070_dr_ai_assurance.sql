-- Module 10-01 Daily Reporting, Phase 2: AI assurance, evidence assessment
-- (design 11, 15.11).
--
-- AI is a consultation layer. It reads a submitted report and its photos and
-- records findings for the approver. It never approves, rejects or changes a
-- report. This file gives it exactly the storage and the write paths it needs:
--
--   dr_ai_capabilities       registry: one row per capability, with a status
--                            that switches it off everywhere.
--   dr_ai_project_settings   per project: on/off (default off) and a daily
--                            limit on the number of reports assessed.
--   dr_ai_runs               one row per finished attempt. Append-only.
--   dr_ai_findings           what a run found. Append-only.
--   dr_ai_finding_feedback   the approver's verdict on a finding (accepted or
--                            dismissed), to measure whether findings are useful.
--
-- Write paths (service role only):
--   dr_ai_claim()       picks reports to assess and marks them AI_RUNNING.
--   dr_ai_record_run()  stores the run and its findings and settles the
--                       report's assurance_state.
-- Neither touches the report's content, versions, reviews or summaries. The
-- only report column they write is assurance_state (and its claim time).
--
-- Visibility: runs and findings are readable by approvers only. A reporting
-- unit sees only what the approver sends it as a correction request.

-- ── 1. Tables ───────────────────────────────────────────────────────────────
create table public.dr_ai_capabilities (
  capability     text primary key,
  name           text not null,
  purpose        text not null,
  model          text not null,
  prompt_version text not null,
  input_schema   jsonb not null default '{}'::jsonb,
  output_schema  jsonb not null default '{}'::jsonb,
  permissions    text not null default 'insert into dr_ai_runs and dr_ai_findings; set dr_reports.assurance_state',
  status         text not null default 'Enabled' check (status in ('Enabled', 'Disabled')),
  updated_at     timestamptz not null default now()
);

create table public.dr_ai_project_settings (
  project_id                  uuid primary key references public.projects(id) on delete cascade,
  evidence_assessment_enabled boolean not null default false,
  -- Reports assessed per calendar day (UTC). Past it, reports go to the approver marked "AI unavailable".
  daily_report_limit          int not null default 30 check (daily_report_limit between 0 and 1000),
  updated_by                  uuid references public.profiles(id) on delete set null,
  updated_at                  timestamptz not null default now()
);

create table public.dr_ai_runs (
  id             uuid primary key default gen_random_uuid(),
  capability     text not null references public.dr_ai_capabilities(capability),
  project_id     uuid not null references public.projects(id) on delete cascade,
  unit_id        uuid,
  report_id      uuid not null references public.dr_reports(id) on delete restrict,
  version_id     uuid not null references public.dr_report_versions(id) on delete restrict,
  version_no     int not null,
  status         text not null check (status in ('SUCCEEDED', 'FAILED', 'SKIPPED_BUDGET', 'SKIPPED_NO_PHOTOS')),
  model          text,
  prompt_version text,
  input_tokens   int,
  output_tokens  int,
  images         int not null default 0,
  error          text,
  started_at     timestamptz,
  finished_at    timestamptz not null default now()
);
create index idx_dr_ai_runs_version on public.dr_ai_runs(version_id, capability);
create index idx_dr_ai_runs_project_day on public.dr_ai_runs(project_id, finished_at desc);

create table public.dr_ai_findings (
  id                 uuid primary key default gen_random_uuid(),
  run_id             uuid not null references public.dr_ai_runs(id) on delete restrict,
  report_id          uuid not null references public.dr_reports(id) on delete restrict,
  version_id         uuid not null references public.dr_report_versions(id) on delete restrict,
  version_no         int not null,
  project_id         uuid not null references public.projects(id) on delete cascade,
  unit_id            uuid,
  capability         text not null,
  finding_type       text not null,
  severity           text not null check (severity in ('INFO', 'WARNING')),
  -- Categorical only. There is no numeric confidence (design 11.3).
  assessment         text not null check (assessment in ('SUPPORTED', 'UNCLEAR', 'CONTRADICTED', 'NOT_ASSESSABLE')),
  message            text not null check (btrim(message) <> ''),
  target             jsonb not null default '{}'::jsonb,
  source_refs        jsonb not null default '[]'::jsonb,
  recommended_action text not null default 'NONE',
  model              text,
  prompt_version     text,
  created_at         timestamptz not null default now()
);
create index idx_dr_ai_findings_version on public.dr_ai_findings(version_id);
create index idx_dr_ai_findings_project on public.dr_ai_findings(project_id, created_at desc);

create table public.dr_ai_finding_feedback (
  finding_id uuid primary key references public.dr_ai_findings(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  verdict    text not null check (verdict in ('ACCEPTED', 'DISMISSED')),
  decided_by uuid not null references public.profiles(id) on delete cascade,
  decided_at timestamptz not null default now()
);

alter table public.dr_reports add column if not exists assurance_claimed_at timestamptz;

-- ── 2. Immutability ─────────────────────────────────────────────────────────
create trigger trg_dr_ai_runs_immutable before update or delete on public.dr_ai_runs
  for each row execute function public.dr_block_mutation();
create trigger trg_dr_ai_findings_immutable before update or delete on public.dr_ai_findings
  for each row execute function public.dr_block_mutation();

-- The verdict belongs to the finding's project and to whoever gave it.
create or replace function public.dr_ai_feedback_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select f.project_id into new.project_id from dr_ai_findings f where f.id = new.finding_id;
  if new.project_id is null then
    raise exception 'DR_NOT_FOUND: finding not found';
  end if;
  new.decided_by := coalesce(auth.uid(), new.decided_by);
  new.decided_at := now();
  return new;
end;
$$;
revoke all on function public.dr_ai_feedback_stamp() from public, anon, authenticated;

create trigger trg_dr_ai_feedback_stamp before insert or update on public.dr_ai_finding_feedback
  for each row execute function public.dr_ai_feedback_stamp();

-- Switching AI on or off for a project, or changing its limit, is audited.
create or replace function public.dr_audit_ai_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.evidence_assessment_enabled = old.evidence_assessment_enabled
     and new.daily_report_limit = old.daily_report_limit then
    return new;
  end if;
  insert into dr_audit_log (project_id, event_code, actor_id, channel, details)
  values (new.project_id, 'DR.AI_SETTINGS_CHANGED', auth.uid(), 'WEB',
          jsonb_build_object('evidence_assessment_enabled', new.evidence_assessment_enabled,
                             'daily_report_limit', new.daily_report_limit));
  return new;
end;
$$;
revoke all on function public.dr_audit_ai_settings() from public, anon, authenticated;

create trigger trg_dr_audit_ai_settings after insert or update on public.dr_ai_project_settings
  for each row execute function public.dr_audit_ai_settings();

-- ── 3. Access ───────────────────────────────────────────────────────────────
alter table public.dr_ai_capabilities enable row level security;
alter table public.dr_ai_project_settings enable row level security;
alter table public.dr_ai_runs enable row level security;
alter table public.dr_ai_findings enable row level security;
alter table public.dr_ai_finding_feedback enable row level security;

revoke all on public.dr_ai_capabilities, public.dr_ai_project_settings, public.dr_ai_runs,
              public.dr_ai_findings, public.dr_ai_finding_feedback from anon, authenticated;
grant select on public.dr_ai_capabilities, public.dr_ai_runs, public.dr_ai_findings to authenticated;
grant select, insert, update on public.dr_ai_project_settings, public.dr_ai_finding_feedback to authenticated;
grant all on public.dr_ai_capabilities, public.dr_ai_project_settings, public.dr_ai_runs,
             public.dr_ai_findings, public.dr_ai_finding_feedback to service_role;

create policy dr_ai_capabilities_select on public.dr_ai_capabilities for select to authenticated using (true);

create policy dr_ai_settings_select on public.dr_ai_project_settings for select to authenticated
  using (dr_can_review(project_id, auth.uid()) or dr_can_admin(project_id));
create policy dr_ai_settings_insert on public.dr_ai_project_settings for insert to authenticated
  with check (dr_can_admin(project_id));
create policy dr_ai_settings_update on public.dr_ai_project_settings for update to authenticated
  using (dr_can_admin(project_id)) with check (dr_can_admin(project_id));

-- Approvers only: never the reporting unit.
create policy dr_ai_runs_select on public.dr_ai_runs for select to authenticated
  using (dr_can_review(project_id, auth.uid()));
create policy dr_ai_findings_select on public.dr_ai_findings for select to authenticated
  using (dr_can_review(project_id, auth.uid()));

create policy dr_ai_feedback_select on public.dr_ai_finding_feedback for select to authenticated
  using (dr_can_review(project_id, auth.uid()));
create policy dr_ai_feedback_insert on public.dr_ai_finding_feedback for insert to authenticated
  with check (dr_can_review(project_id, auth.uid()) and decided_by = auth.uid());
create policy dr_ai_feedback_update on public.dr_ai_finding_feedback for update to authenticated
  using (dr_can_review(project_id, auth.uid()))
  with check (dr_can_review(project_id, auth.uid()) and decided_by = auth.uid());

-- ── 4. The queue ────────────────────────────────────────────────────────────
-- Picks reports whose current version has not been assessed, on projects that
-- switched the capability on. A report with no usable photo, or past the
-- project's daily limit, is settled here without a model call.
create or replace function public.dr_ai_claim(p_capability text, p_limit int default 3)
returns table (report_id uuid, version_id uuid, version_no int, project_id uuid, unit_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  r      record;
  v_used int;
begin
  if not exists (select 1 from dr_ai_capabilities c where c.capability = p_capability and c.status = 'Enabled') then
    return;
  end if;

  for r in
    select rep.id, rep.project_id as pid, rep.unit_id as uid, rep.current_version_no as vno, v.id as vid,
           s.daily_report_limit as day_limit
    from dr_reports rep
    join dr_ai_project_settings s on s.project_id = rep.project_id and s.evidence_assessment_enabled
    join dr_report_versions v on v.report_id = rep.id and v.version_no = rep.current_version_no
    where rep.report_kind = 'WORK'
      and rep.submission_state = 'SUBMITTED'
      and rep.review_state in ('AWAITING_REVIEW', 'IN_REVIEW', 'AMENDMENT_PENDING')
      -- Photos still arriving from a phone, or an open conflict: wait.
      and rep.sync_state in ('SYNCED', 'REQUIRES_REVIEW')
      and v.submitted_at > now() - interval '3 days'
      and (rep.assurance_claimed_at is null or rep.assurance_claimed_at < now() - interval '10 minutes')
      and not exists (select 1 from dr_ai_runs x
                      where x.version_id = v.id and x.capability = p_capability and x.status <> 'FAILED')
      and (select count(*) from dr_ai_runs x
           where x.version_id = v.id and x.capability = p_capability and x.status = 'FAILED') < 3
    order by v.submitted_at
    limit greatest(coalesce(p_limit, 3), 0)
    for update of rep skip locked
  loop
    if not exists (
      select 1 from dr_evidence e
      where e.version_id = r.vid and e.target_section = 'activities' and e.target_line_id is not null
        and e.scan_status = 'Available' and e.mime_type in ('image/jpeg', 'image/png', 'image/webp')
    ) then
      insert into dr_ai_runs (capability, project_id, unit_id, report_id, version_id, version_no, status)
      values (p_capability, r.pid, r.uid, r.id, r.vid, r.vno, 'SKIPPED_NO_PHOTOS');
      update dr_reports set assurance_state = 'NOT_APPLICABLE', assurance_claimed_at = null where id = r.id;
      continue;
    end if;

    -- Reports already assessed today, plus those being assessed right now.
    select (select count(*) from dr_ai_runs x
            where x.project_id = r.pid and x.capability = p_capability
              and x.status in ('SUCCEEDED', 'FAILED') and x.finished_at >= date_trunc('day', now()))
         + (select count(*) from dr_reports y
            where y.project_id = r.pid and y.assurance_state = 'AI_RUNNING'
              and y.assurance_claimed_at >= now() - interval '10 minutes')
      into v_used;
    if v_used >= r.day_limit then
      insert into dr_ai_runs (capability, project_id, unit_id, report_id, version_id, version_no, status, error)
      values (p_capability, r.pid, r.uid, r.id, r.vid, r.vno, 'SKIPPED_BUDGET',
              'The project''s daily limit of ' || r.day_limit || ' assessed reports was reached.');
      update dr_reports set assurance_state = 'AI_UNAVAILABLE', assurance_claimed_at = null where id = r.id;
      continue;
    end if;

    update dr_reports set assurance_state = 'AI_RUNNING', assurance_claimed_at = now() where id = r.id;
    report_id := r.id; version_id := r.vid; version_no := r.vno; project_id := r.pid; unit_id := r.uid;
    return next;
  end loop;
end;
$$;

-- Stores one finished attempt and its findings, and settles the report's
-- assurance state. p_status is SUCCEEDED or FAILED.
create or replace function public.dr_ai_record_run(
  p_capability text, p_version_id uuid, p_status text, p_model text, p_prompt_version text,
  p_input_tokens int default null, p_output_tokens int default null, p_images int default 0,
  p_error text default null, p_started_at timestamptz default null, p_findings jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version public.dr_report_versions%rowtype;
  v_report  public.dr_reports%rowtype;
  v_run     uuid;
  v_failed  int;
begin
  if p_status not in ('SUCCEEDED', 'FAILED') then
    raise exception 'DR_STATE: a run is recorded as SUCCEEDED or FAILED';
  end if;
  select * into v_version from dr_report_versions where id = p_version_id;
  if not found then
    raise exception 'DR_NOT_FOUND: report version not found';
  end if;
  select * into v_report from dr_reports where id = v_version.report_id for update;

  insert into dr_ai_runs (capability, project_id, unit_id, report_id, version_id, version_no, status, model,
                          prompt_version, input_tokens, output_tokens, images, error, started_at)
  values (p_capability, v_report.project_id, v_report.unit_id, v_report.id, v_version.id, v_version.version_no,
          p_status, p_model, p_prompt_version, p_input_tokens, p_output_tokens, coalesce(p_images, 0),
          left(p_error, 1000), p_started_at)
  returning id into v_run;

  if p_status = 'SUCCEEDED' then
    insert into dr_ai_findings (run_id, report_id, version_id, version_no, project_id, unit_id, capability,
                                finding_type, severity, assessment, message, target, source_refs,
                                recommended_action, model, prompt_version)
    select v_run, v_report.id, v_version.id, v_version.version_no, v_report.project_id, v_report.unit_id, p_capability,
           x.finding_type, x.severity, x.assessment, left(x.message, 600), coalesce(x.target, '{}'::jsonb),
           coalesce(x.source_refs, '[]'::jsonb), coalesce(x.recommended_action, 'NONE'), p_model, p_prompt_version
    from jsonb_to_recordset(coalesce(p_findings, '[]'::jsonb))
      as x(finding_type text, severity text, assessment text, message text, target jsonb, source_refs jsonb,
           recommended_action text);
  end if;

  -- Settle the state only if this is still the version under review.
  if v_report.current_version_no = v_version.version_no then
    select count(*) into v_failed from dr_ai_runs
    where version_id = v_version.id and capability = p_capability and status = 'FAILED';
    update dr_reports
    set assurance_state = case when p_status = 'SUCCEEDED' then 'COMPLETE' else 'AI_UNAVAILABLE' end,
        -- A failed attempt is tried again (up to three times) once the claim has aged out.
        assurance_claimed_at = case when p_status = 'FAILED' and v_failed < 3 then now() - interval '8 minutes' else null end
    where id = v_report.id;
  end if;

  perform dr_audit(v_report.project_id, v_report.unit_id, v_report.id, v_version.version_no, 'DR.AI_RUN', null, null,
                   jsonb_build_object('capability', p_capability, 'status', p_status, 'model', p_model,
                                      'prompt_version', p_prompt_version, 'run_id', v_run,
                                      'findings', case when p_status = 'SUCCEEDED'
                                                       then jsonb_array_length(coalesce(p_findings, '[]'::jsonb)) else 0 end));
  return v_run;
end;
$$;

revoke all on function public.dr_ai_claim(text, int) from public, anon, authenticated;
revoke all on function public.dr_ai_record_run(text, uuid, text, text, text, int, int, int, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.dr_ai_claim(text, int) to service_role;
grant execute on function public.dr_ai_record_run(text, uuid, text, text, text, int, int, int, text, timestamptz, jsonb)
  to service_role;

-- ── 5. Registry ─────────────────────────────────────────────────────────────
insert into public.dr_ai_capabilities (capability, name, purpose, model, prompt_version, input_schema, output_schema)
values (
  'EVIDENCE_ASSESSMENT',
  'Evidence assessment',
  'For each reported activity that has photos: do the photos support what was reported? Advisory, for the approver only.',
  'claude-sonnet-5-5',
  'evidence-v1',
  '{"activities": [{"line_id": "text", "activity": "text", "location": "text", "progress": "text", "quantity": "text", "remarks": "text (untrusted)", "photos": "images"}]}',
  '{"assessments": [{"line_id": "text", "assessment": "SUPPORTED | UNCLEAR | CONTRADICTED | NOT_ASSESSABLE", "reason": "text, 300 characters at most"}]}'
)
on conflict (capability) do nothing;

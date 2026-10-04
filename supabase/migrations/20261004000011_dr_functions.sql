-- Migration: 20261004000011_dr_functions.sql
-- Purpose: Module 10-01 Daily Reporting, Phase 1A — write gateway functions.
--          Every state change of a daily report happens in one of these
--          functions, in one transaction, with its audit event and its
--          notifications.
-- Calling convention:
--   - EXECUTE is granted to service_role only. app/api/dr/* authenticates the
--     user, runs the rules engine, then calls these with p_actor = the user.
--     Clients cannot call them directly, so the rules cannot be skipped.
--   - Each gateway function calls dr_set_actor(p_actor) first so auth.uid()
--     resolves to the acting user for nested helpers (is_admin, submit_progress).
--   - Errors are raised as 'DR_<CODE>: message'; the route maps the code.
-- Depends on: 20261004000010_dr_core_schema.sql, public.submit_progress(),
--             public.wbs_task_steps, public.plan_productivity_logs,
--             public.delay_register, public.delay_register_tasks

-- ── 0. Planning backlinks (mutable; one row per report line) ────────────────
create table public.dr_planning_links (
  report_id           uuid not null references public.dr_reports(id) on delete cascade,
  line_id             text not null,
  kind                text not null check (kind in ('ACTIVITY', 'DELAY')),
  synced_version_no   int not null,
  productivity_log_id uuid references public.plan_productivity_logs(id) on delete set null,
  progress_review_id  uuid references public.wbs_task_progress_reviews(id) on delete set null,
  delay_register_id   uuid references public.delay_register(id) on delete set null,
  sync_error          text,
  synced_at           timestamptz not null default now(),
  primary key (report_id, line_id, kind)
);
alter table public.dr_planning_links enable row level security;
revoke insert, update, delete, truncate on public.dr_planning_links from authenticated, anon;
revoke all on public.dr_planning_links from anon;
create policy dr_planning_links_select on public.dr_planning_links for select to authenticated
  using (exists (select 1 from public.dr_reports r
                 where r.id = report_id and public.dr_can_view_project(r.project_id)));

-- ── 1. Small helpers ────────────────────────────────────────────────────────
create or replace function public.dr_set_actor(p_actor uuid)
returns void
language plpgsql
as $$
begin
  if p_actor is null then
    raise exception 'DR_NO_ACTOR: an acting user is required';
  end if;
  -- Transaction-local: makes auth.uid() return the acting user for helpers
  -- that were written for direct client calls.
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', p_actor::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_actor::text, true);
end;
$$;

create or replace function public.dr_audit(
  p_project_id uuid, p_unit_id uuid, p_report_id uuid, p_version_no int,
  p_event text, p_actor uuid, p_channel text, p_details jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into dr_audit_log (project_id, unit_id, report_id, version_no, event_code, actor_id, channel, details)
  values (p_project_id, p_unit_id, p_report_id, p_version_no, p_event, p_actor, p_channel, coalesce(p_details, '{}'::jsonb));
$$;

-- One notification = an in-app alert now + an outbox row for Telegram/email.
-- p_source_key makes every notification idempotent per recipient.
create or replace function public.dr_notify(
  p_project_id uuid, p_recipient uuid, p_alert_type text, p_priority text,
  p_title text, p_body text, p_href text, p_source_key text,
  p_actor uuid default null, p_channels text[] default '{telegram,email}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_recipient is null or p_recipient = p_actor then
    return;
  end if;

  begin
    insert into task_alerts (project_id, recipient_id, actor_id, source_key, alert_type, title, body, metadata)
    values (p_project_id, p_recipient, p_actor, p_source_key || ':' || p_recipient, p_alert_type, p_title, p_body,
            jsonb_build_object('href', p_href, 'module', 'daily_reporting', 'priority', p_priority));
  exception when unique_violation then
    return; -- already notified for this event
  end;

  if array_length(p_channels, 1) is not null then
    insert into dr_notification_outbox
      (project_id, recipient_id, event_code, priority, title, body, href, channels, source_key)
    values
      (p_project_id, p_recipient, p_alert_type, p_priority, p_title, p_body, p_href, p_channels,
       p_source_key || ':' || p_recipient)
    on conflict (source_key) do nothing;
  end if;
end;
$$;

create or replace function public.dr_reviewers(p_project_id uuid)
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select a.user_id
  from dr_project_approvers a
  where a.project_id = p_project_id
    and a.valid_from <= current_date and (a.valid_to is null or a.valid_to >= current_date)
  union
  select p.project_manager_id
  from projects p
  where p.id = p_project_id and p.project_manager_id is not null
    and not exists (
      select 1 from dr_project_approvers a
      where a.project_id = p_project_id and a.approver_role = 'PRIMARY'
        and a.valid_from <= current_date and (a.valid_to is null or a.valid_to >= current_date));
$$;

-- "Project Director / Management": project members holding L1 or L2.
create or replace function public.dr_management(p_project_id uuid)
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select distinct pm.user_id
  from project_members pm
  join user_roles ur on ur.user_id = pm.user_id
  where pm.project_id = p_project_id and ur.role_code in ('L1', 'L2');
$$;

create or replace function public.dr_role_members(p_project_id uuid, p_role text)
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select distinct pm.user_id
  from project_members pm
  join user_roles ur on ur.user_id = pm.user_id
  where pm.project_id = p_project_id and ur.role_code = p_role;
$$;

create or replace function public.dr_unit_reporters(p_unit_id uuid, p_leads_only boolean default false)
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select m.user_id
  from dr_reporting_unit_members m
  where m.unit_id = p_unit_id and m.status = 'active' and m.member_role = 'REPORTER'
    and m.valid_from <= current_date and (m.valid_to is null or m.valid_to >= current_date)
    and (not p_leads_only or m.is_lead);
$$;

-- Effective schedule of a unit: its own, else the project's first, else defaults.
create or replace function public.dr_unit_schedule(p_unit_id uuid)
returns table (deadline_time time, reminder_time time, late_window_hours int, working_days int[], timezone text)
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(s.deadline_time, '18:00'::time),
         coalesce(s.reminder_time, '16:00'::time),
         coalesce(s.late_window_hours, 15),
         coalesce(s.working_days, '{1,2,3,4,5,6}'::int[]),
         coalesce(s.timezone, p.time_zone, 'Asia/Phnom_Penh')
  from dr_reporting_units u
  join projects p on p.id = u.project_id
  left join lateral (
    select *
    from dr_reporting_schedules rs
    where rs.id = u.schedule_id
       or (u.schedule_id is null and rs.project_id = u.project_id)
    order by (rs.id = u.schedule_id) desc, rs.created_at
    limit 1
  ) s on true
  where u.id = p_unit_id;
$$;

create or replace function public.dr_next_report_no(p_year int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_no int;
begin
  insert into dr_running_numbers (year, last_no) values (p_year, 1)
  on conflict (year) do update set last_no = dr_running_numbers.last_no + 1
  returning last_no into v_no;
  return 'DR-' || p_year::text || '-' || lpad(v_no::text, 6, '0');
end;
$$;

-- ── 2. Projection: payload → line tables (G4) ───────────────────────────────
create or replace function public.dr_project_version(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.dr_report_versions%rowtype;
  p jsonb;
begin
  select * into v from dr_report_versions where id = p_version_id;
  if not found then
    raise exception 'DR_NOT_FOUND: version % not found', p_version_id;
  end if;
  p := v.payload;

  if p ? 'weather' and jsonb_typeof(p->'weather') = 'object' then
    insert into dr_weather (version_id, project_id, condition, hours_lost, note)
    values (v.id, v.project_id, p->'weather'->>'condition',
            nullif(p->'weather'->>'hours_lost', '')::numeric, p->'weather'->>'note');
  end if;

  if p ? 'safety' and jsonb_typeof(p->'safety') = 'object' then
    insert into dr_safety (version_id, project_id, toolbox_talk_held, observations, incident_count, near_miss_count)
    values (v.id, v.project_id, (p->'safety'->>'toolbox_talk_held')::boolean, p->'safety'->>'observations',
            coalesce(nullif(p->'safety'->>'incident_count', '')::int, 0),
            coalesce(nullif(p->'safety'->>'near_miss_count', '')::int, 0));
  end if;

  insert into dr_manpower (version_id, project_id, line_id, trade, planned_count, reported_count, supervisors, hours)
  select v.id, v.project_id, x.line_id, x.trade, x.planned_count, coalesce(x.reported_count, 0), x.supervisors, x.hours
  from jsonb_to_recordset(coalesce(p->'manpower', '[]'::jsonb))
    as x(line_id text, trade text, planned_count int, reported_count int, supervisors int, hours numeric);

  insert into dr_activity_progress (
    version_id, report_id, project_id, line_id, task_id, wbs_node_id, discipline, work_status,
    progress_before, progress_today, reported_qty, uom, cumulative_reported_qty, trade_code, headcount,
    hours_normal, hours_ot, step_progress, actual_start_date, actual_finish_date,
    unplanned_flag, unplanned_reason, free_text_activity, remarks)
  select v.id, v.report_id, v.project_id, x.line_id, x.task_id, coalesce(x.wbs_node_id, t.wbs_node_id),
         coalesce(x.discipline, t.discipline), x.work_status, x.progress_before, x.progress_today,
         x.reported_qty, x.uom,
         -- Cumulative = approved history for this task + today's quantity.
         coalesce((
           select sum(coalesce(vq.verified_qty, ap.reported_qty))
           from dr_reports r
           join dr_report_versions pv on pv.report_id = r.id and pv.version_no = r.approved_version_no
           join dr_activity_progress ap on ap.version_id = pv.id
           left join dr_verified_quantities vq on vq.version_id = pv.id and vq.line_id = ap.line_id
           where r.unit_id = v.unit_id and r.id <> v.report_id and ap.task_id = x.task_id
             and r.report_date < (select report_date from dr_reports where id = v.report_id)
         ), 0) + coalesce(x.reported_qty, 0),
         x.trade_code, x.headcount, x.hours_normal, x.hours_ot, coalesce(x.step_progress, '[]'::jsonb),
         x.actual_start_date, x.actual_finish_date, coalesce(x.unplanned, false), x.unplanned_reason,
         x.free_text_activity, x.remarks
  from jsonb_to_recordset(coalesce(p->'activities', '[]'::jsonb))
    as x(line_id text, task_id uuid, wbs_node_id uuid, discipline text, work_status text,
         progress_before numeric, progress_today numeric, reported_qty numeric, uom text, trade_code text,
         headcount int, hours_normal numeric, hours_ot numeric, step_progress jsonb,
         actual_start_date date, actual_finish_date date, unplanned boolean, unplanned_reason text,
         free_text_activity text, remarks text)
  left join wbs_tasks t on t.id = x.task_id;

  insert into dr_equipment (version_id, project_id, line_id, equipment_type, asset_ref, hours_working, hours_idle, hours_breakdown)
  select v.id, v.project_id, x.line_id, x.equipment_type, x.asset_ref, x.hours_working, x.hours_idle, x.hours_breakdown
  from jsonb_to_recordset(coalesce(p->'equipment', '[]'::jsonb))
    as x(line_id text, equipment_type text, asset_ref text, hours_working numeric, hours_idle numeric, hours_breakdown numeric);

  insert into dr_materials (version_id, project_id, line_id, description, qty_delivered, qty_used, uom, delivery_note_ref)
  select v.id, v.project_id, x.line_id, x.description, x.qty_delivered, x.qty_used, x.uom, x.delivery_note_ref
  from jsonb_to_recordset(coalesce(p->'materials', '[]'::jsonb))
    as x(line_id text, description text, qty_delivered numeric, qty_used numeric, uom text, delivery_note_ref text);

  insert into dr_delay_events (version_id, report_id, project_id, line_id, cause_category, description,
                               start_at, end_at, hours_lost, task_id, wbs_node_id, notice_required)
  select v.id, v.report_id, v.project_id, x.line_id, x.cause_category, x.description, x.start_at, x.end_at,
         x.hours_lost, x.task_id, x.wbs_node_id, coalesce(x.notice_required, false)
  from jsonb_to_recordset(coalesce(p->'delays', '[]'::jsonb))
    as x(line_id text, cause_category text, description text, start_at timestamptz, end_at timestamptz,
         hours_lost numeric, task_id uuid, wbs_node_id uuid, notice_required boolean);

  insert into dr_issues (version_id, project_id, line_id, issue_type, severity, description, action_required_from)
  select v.id, v.project_id, x.line_id, x.issue_type, x.severity, x.description, x.action_required_from
  from jsonb_to_recordset(coalesce(p->'issues', '[]'::jsonb))
    as x(line_id text, issue_type text, severity text, description text, action_required_from text);

  insert into dr_instructions_received (version_id, project_id, line_id, instruction_type, given_by, reference, description)
  select v.id, v.project_id, x.line_id, x.instruction_type, x.given_by, x.reference, x.description
  from jsonb_to_recordset(coalesce(p->'instructions', '[]'::jsonb))
    as x(line_id text, instruction_type text, given_by text, reference text, description text);

  insert into dr_inspection_requests (version_id, project_id, line_id, wbs_node_id, reference, status)
  select v.id, v.project_id, x.line_id, x.wbs_node_id, x.reference, x.status
  from jsonb_to_recordset(coalesce(p->'inspections', '[]'::jsonb))
    as x(line_id text, wbs_node_id uuid, reference text, status text);

  insert into dr_area_access (version_id, project_id, line_id, wbs_node_id, access_state, note)
  select v.id, v.project_id, x.line_id, x.wbs_node_id, x.access_state, x.note
  from jsonb_to_recordset(coalesce(p->'area_access', '[]'::jsonb))
    as x(line_id text, wbs_node_id uuid, access_state text, note text);

  insert into dr_next_day_plan (version_id, project_id, line_id, task_id, description, planned_manpower, planned_qty)
  select v.id, v.project_id, x.line_id, x.task_id, x.description, x.planned_manpower, x.planned_qty
  from jsonb_to_recordset(coalesce(p->'next_day', '[]'::jsonb))
    as x(line_id text, task_id uuid, description text, planned_manpower int, planned_qty numeric);
end;
$$;

-- ── 3. Version writer shared by submit / resubmit / amend ───────────────────
create or replace function public.dr_write_version(
  p_actor uuid, p_report public.dr_reports, p_version_no int, p_kind text, p_report_kind text,
  p_payload jsonb, p_idempotency_key text, p_channel text, p_client_created_at timestamptz,
  p_rule_results jsonb, p_evidence jsonb, p_change_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version_id uuid;
  e jsonb;
  v_prev public.dr_evidence%rowtype;
begin
  insert into dr_report_versions (
    report_id, project_id, unit_id, version_no, version_kind, report_kind, payload, content_hash,
    submitted_by, client_created_at, idempotency_key, channel, change_reason)
  values (
    p_report.id, p_report.project_id, p_report.unit_id, p_version_no, p_kind, p_report_kind, p_payload,
    encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex'),
    p_actor, p_client_created_at, p_idempotency_key, p_channel, p_change_reason)
  returning id into v_version_id;

  perform dr_project_version(v_version_id);

  -- Evidence. A storage key already recorded on this report is carried
  -- forward from its first recording, so its hash and server receipt time
  -- can never be restated by a later version.
  for e in select * from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb))
  loop
    select * into v_prev from dr_evidence
    where report_id = p_report.id and storage_key = e->>'storage_key'
    order by received_at_server limit 1;

    if found then
      insert into dr_evidence (version_id, report_id, project_id, target_section, target_line_id, wbs_node_id,
                               storage_key, mime_type, size_bytes, sha256, captured_at_device, received_at_server,
                               gps_lat, gps_lng, source, caption, scan_status, scan_engine)
      values (v_version_id, p_report.id, p_report.project_id,
              coalesce(e->>'target_section', v_prev.target_section), coalesce(e->>'target_line_id', v_prev.target_line_id),
              v_prev.wbs_node_id, v_prev.storage_key, v_prev.mime_type, v_prev.size_bytes, v_prev.sha256,
              v_prev.captured_at_device, v_prev.received_at_server, v_prev.gps_lat, v_prev.gps_lng, v_prev.source,
              coalesce(e->>'caption', v_prev.caption), v_prev.scan_status, v_prev.scan_engine);
    else
      if position(p_report.project_id::text || '/' || p_report.unit_id::text || '/' in e->>'storage_key') <> 1 then
        raise exception 'DR_EVIDENCE_PATH: evidence % does not belong to this unit', e->>'storage_key';
      end if;
      insert into dr_evidence (version_id, report_id, project_id, target_section, target_line_id, wbs_node_id,
                               storage_key, mime_type, size_bytes, sha256, captured_at_device, gps_lat, gps_lng,
                               source, caption, scan_status, scan_engine)
      values (v_version_id, p_report.id, p_report.project_id,
              coalesce(e->>'target_section', 'general'), e->>'target_line_id', nullif(e->>'wbs_node_id', '')::uuid,
              e->>'storage_key', e->>'mime_type', (e->>'size_bytes')::bigint, e->>'sha256',
              nullif(e->>'captured_at_device', '')::timestamptz,
              nullif(e->>'gps_lat', '')::numeric, nullif(e->>'gps_lng', '')::numeric,
              case p_channel when 'TELEGRAM_MINIAPP' then 'MINIAPP' when 'FIELD_APP' then 'FIELD_APP'
                             when 'IMPORT' then 'IMPORT' else 'WEB' end,
              e->>'caption', coalesce(e->>'scan_status', 'Scanning'), e->>'scan_engine');
    end if;
  end loop;

  insert into dr_rule_results (report_id, version_id, project_id, rule_code, rule_version, status, severity,
                               message, params, target)
  select p_report.id, v_version_id, p_report.project_id, x.rule_code, coalesce(x.rule_version, 1),
         coalesce(x.status, 'FAILED'), x.severity, x.message, coalesce(x.params, '{}'::jsonb), coalesce(x.target, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(p_rule_results, '[]'::jsonb))
    as x(rule_code text, rule_version int, status text, severity text, message text, params jsonb, target jsonb);

  return v_version_id;
end;
$$;

-- Hard, database-side intake invariants. The TypeScript rules engine runs the
-- full catalogue first; these are the ones that must hold even if it did not.
create or replace function public.dr_assert_intake(
  p_actor uuid, p_unit public.dr_reporting_units, p_report_date date, p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text;
  v_bad uuid;
begin
  if p_unit.status <> 'Active' then
    raise exception 'DR_INV_UNIT: reporting unit % is not active', p_unit.unit_code;
  end if;

  if not exists (
    select 1 from dr_reporting_unit_members m
    where m.unit_id = p_unit.id and m.user_id = p_actor and m.status = 'active' and m.member_role = 'REPORTER'
      and m.valid_from <= current_date and (m.valid_to is null or m.valid_to >= current_date)
  ) then
    raise exception 'DR_INV_UNIT: you are not an active reporter of unit %', p_unit.unit_code;
  end if;

  select timezone into v_tz from dr_unit_schedule(p_unit.id);
  if p_report_date > (now() at time zone coalesce(v_tz, 'Asia/Phnom_Penh'))::date then
    raise exception 'DR_DATE_FUTURE: report date % is in the future', p_report_date;
  end if;

  -- Every referenced task must be in this project …
  select (a->>'task_id')::uuid into v_bad
  from jsonb_array_elements(coalesce(p_payload->'activities', '[]'::jsonb)) a
  where nullif(a->>'task_id', '') is not null
    and not exists (select 1 from wbs_tasks t where t.id = (a->>'task_id')::uuid and t.project_id = p_unit.project_id)
  limit 1;
  if v_bad is not null then
    raise exception 'DR_INV_WBS: activity % is not part of this project', v_bad;
  end if;

  -- … and, when the unit has a WBS scope, under one of its scope nodes.
  if exists (select 1 from dr_reporting_unit_wbs_scope s where s.unit_id = p_unit.id) then
    with recursive scope as (
      select s.wbs_node_id as id from dr_reporting_unit_wbs_scope s where s.unit_id = p_unit.id
      union
      select n.id from wbs_nodes n join scope on n.parent_id = scope.id
    )
    select (a->>'task_id')::uuid into v_bad
    from jsonb_array_elements(coalesce(p_payload->'activities', '[]'::jsonb)) a
    where nullif(a->>'task_id', '') is not null
      and not exists (
        select 1 from wbs_tasks t join scope on scope.id = t.wbs_node_id
        where t.id = (a->>'task_id')::uuid)
    limit 1;
    if v_bad is not null then
      raise exception 'DR_INV_WBS: activity % is outside the unit''s WBS scope', v_bad;
    end if;
  end if;
end;
$$;

-- ── 4. Drafts ───────────────────────────────────────────────────────────────
create or replace function public.dr_save_draft(p_actor uuid, p_unit_id uuid, p_report_date date, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit public.dr_reporting_units%rowtype;
begin
  perform dr_set_actor(p_actor);
  select * into v_unit from dr_reporting_units where id = p_unit_id;
  if not found or not dr_is_unit_member(p_unit_id, p_actor) then
    raise exception 'DR_INV_UNIT: not a member of this reporting unit';
  end if;
  insert into dr_drafts (unit_id, report_date, project_id, payload, updated_by)
  values (p_unit_id, p_report_date, v_unit.project_id, p_payload, p_actor)
  on conflict (unit_id, report_date)
  do update set payload = excluded.payload, updated_by = excluded.updated_by, updated_at = now();
end;
$$;

-- ── 5. Submit ───────────────────────────────────────────────────────────────
create or replace function public.dr_submit_report(
  p_actor uuid, p_unit_id uuid, p_report_date date, p_report_kind text, p_payload jsonb,
  p_idempotency_key text, p_channel text default 'WEB', p_client_created_at timestamptz default null,
  p_rule_results jsonb default '[]'::jsonb, p_evidence jsonb default '[]'::jsonb,
  p_change_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit       public.dr_reporting_units%rowtype;
  v_report     public.dr_reports%rowtype;
  v_existing   public.dr_report_versions%rowtype;
  v_sched      record;
  v_deadline   timestamptz;
  v_late       boolean;
  v_backdated  boolean;
  v_version_no int;
  v_kind       text := 'ORIGINAL';
  v_version_id uuid;
  v_warnings   int;
  v_incidents  int;
  v_notice     int;
  v_href       text;
  r            uuid;
begin
  perform dr_set_actor(p_actor);

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'DR_IDEMPOTENCY: an idempotency key is required';
  end if;
  if p_report_kind not in ('WORK', 'NO_WORK') then
    raise exception 'DR_REQ_FIELD: report kind must be WORK or NO_WORK';
  end if;

  select * into v_unit from dr_reporting_units where id = p_unit_id;
  if not found then
    raise exception 'DR_INV_UNIT: reporting unit not found';
  end if;

  -- Replay of the same submission returns the original receipt.
  select * into v_existing from dr_report_versions
  where project_id = v_unit.project_id and idempotency_key = p_idempotency_key;
  if found then
    select * into v_report from dr_reports where id = v_existing.report_id;
    return jsonb_build_object('report_id', v_report.id, 'report_no', v_report.report_no,
                              'version_no', v_existing.version_no, 'replayed', true);
  end if;

  perform dr_assert_intake(p_actor, v_unit, p_report_date, p_payload);

  if p_report_kind = 'NO_WORK' and coalesce(btrim(p_payload->>'no_work_reason'), '') = '' then
    raise exception 'DR_REQ_FIELD: a No Work Today report needs a reason';
  end if;

  select * into v_sched from dr_unit_schedule(p_unit_id);
  v_deadline  := (p_report_date + v_sched.deadline_time) at time zone v_sched.timezone;
  v_late      := now() > v_deadline;
  v_backdated := now() > v_deadline + make_interval(hours => v_sched.late_window_hours);

  -- Serialise concurrent submissions for the same unit and date.
  perform pg_advisory_xact_lock(hashtextextended(p_unit_id::text || p_report_date::text, 0));

  select * into v_report from dr_reports where unit_id = p_unit_id and report_date = p_report_date;

  if found then
    if v_report.submission_state = 'WITHDRAWN' then
      v_kind := 'CORRECTION';
    elsif v_report.report_kind = 'NO_WORK' and p_report_kind = 'WORK' then
      -- G11: a No Work report may be replaced by a work report until the day
      -- has an Official summary; after that it needs an amendment.
      if exists (select 1 from dr_project_daily_summaries s
                 where s.project_id = v_report.project_id and s.summary_date = p_report_date
                   and s.status = 'Official') then
        raise exception 'DR_DUP_REPORT: the summary for % is already official; use an amendment', p_report_date
          using detail = v_report.id::text;
      end if;
      if coalesce(btrim(p_change_reason), '') = '' then
        raise exception 'DR_REQ_FIELD: replacing a No Work report needs a reason';
      end if;
      v_kind := 'CORRECTION';
    else
      raise exception 'DR_DUP_REPORT: report % already exists for this unit and date', v_report.report_no
        using detail = v_report.id::text;
    end if;

    v_version_no := v_report.current_version_no + 1;
    update dr_reports
       set report_kind = p_report_kind, current_version_no = v_version_no,
           submission_state = 'SUBMITTED', review_state = 'AWAITING_REVIEW',
           assurance_state = 'NOT_APPLICABLE', approved_version_no = null, approved_at = null, approved_by = null,
           late_flag = late_flag or v_late, backdated_flag = backdated_flag or v_backdated
     where id = v_report.id
    returning * into v_report;
  else
    v_version_no := 1;
    insert into dr_reports (report_no, project_id, unit_id, report_date, report_kind, current_version_no,
                            submission_state, assurance_state, review_state, sync_state,
                            late_flag, backdated_flag, first_submitted_by)
    values (dr_next_report_no(extract(year from p_report_date)::int), v_unit.project_id, p_unit_id, p_report_date,
            p_report_kind, 1, 'SUBMITTED', 'NOT_APPLICABLE', 'AWAITING_REVIEW', 'SYNCED',
            v_late, v_backdated, p_actor)
    returning * into v_report;
  end if;

  v_version_id := dr_write_version(p_actor, v_report, v_version_no, v_kind, p_report_kind, p_payload,
                                   p_idempotency_key, p_channel, p_client_created_at, p_rule_results,
                                   p_evidence, p_change_reason);

  select count(*) into v_warnings from dr_rule_results where version_id = v_version_id and status = 'FAILED';
  update dr_reports set warning_count = v_warnings where id = v_report.id;

  update dr_missing_reports
     set status = 'Late Submitted', linked_report_id = v_report.id, closed_at = now()
   where unit_id = p_unit_id and report_date = p_report_date and status = 'Open';

  delete from dr_drafts where unit_id = p_unit_id and report_date = p_report_date;

  perform dr_audit(v_report.project_id, p_unit_id, v_report.id, v_version_no, 'DR.REPORT_SUBMITTED', p_actor, p_channel,
                   jsonb_build_object('report_no', v_report.report_no, 'kind', p_report_kind, 'version_kind', v_kind,
                                      'late', v_late, 'backdated', v_backdated, 'warnings', v_warnings));

  v_href := '/dashboard/site/daily-reporting?report=' || v_report.id::text;

  for r in select * from dr_reviewers(v_report.project_id) loop
    perform dr_notify(v_report.project_id, r, 'dr_review_required', 'High',
                      v_report.report_no || ' awaiting review',
                      v_unit.display_name || ' submitted the daily report for ' || p_report_date::text
                        || case when v_warnings > 0 then ' (' || v_warnings || ' flagged)' else '' end || '.',
                      v_href, 'dr:' || v_report.id || ':v' || v_version_no || ':review', p_actor);
  end loop;

  -- Safety incidents do not wait for review.
  select coalesce(incident_count, 0) into v_incidents from dr_safety where version_id = v_version_id;
  if coalesce(v_incidents, 0) > 0 then
    for r in
      select * from dr_reviewers(v_report.project_id)
      union select * from dr_management(v_report.project_id)
      union select * from dr_role_members(v_report.project_id, 'HSE')
    loop
      perform dr_notify(v_report.project_id, r, 'dr_safety_incident', 'Critical',
                        'Safety incident reported — ' || v_unit.display_name,
                        v_incidents || ' incident(s) recorded in ' || v_report.report_no || ' for ' || p_report_date::text
                          || '. The report is not yet reviewed.',
                        v_href, 'dr:' || v_report.id || ':v' || v_version_no || ':incident', p_actor);
    end loop;
  end if;

  -- G9: potential contractual notice is flagged at submission, not at approval.
  select count(*) into v_notice from dr_delay_events where version_id = v_version_id and notice_required;
  if v_notice > 0 then
    for r in
      select * from dr_reviewers(v_report.project_id)
      union select * from dr_role_members(v_report.project_id, 'QS')
    loop
      perform dr_notify(v_report.project_id, r, 'dr_delay_notice', 'Critical',
                        'Potential delay notice — ' || v_unit.display_name,
                        v_notice || ' delay event(s) flagged "notice required" in ' || v_report.report_no
                          || '. Unverified until the report is approved; check the contract time bar.',
                        v_href, 'dr:' || v_report.id || ':v' || v_version_no || ':notice', p_actor);
    end loop;
  end if;

  perform dr_refresh_live_summary(v_report.project_id, p_report_date);

  return jsonb_build_object('report_id', v_report.id, 'report_no', v_report.report_no,
                            'version_no', v_version_no, 'replayed', false,
                            'late', v_late, 'backdated', v_backdated);
end;
$$;

-- ── 6. Resubmit after a return (item-level correction) ──────────────────────
create or replace function public.dr_resubmit_report(
  p_actor uuid, p_report_id uuid, p_payload jsonb, p_idempotency_key text,
  p_channel text default 'WEB', p_client_created_at timestamptz default null,
  p_rule_results jsonb default '[]'::jsonb, p_evidence jsonb default '[]'::jsonb,
  p_response text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report     public.dr_reports%rowtype;
  v_unit       public.dr_reporting_units%rowtype;
  v_existing   public.dr_report_versions%rowtype;
  v_version_no int;
  v_version_id uuid;
  v_warnings   int;
  r            uuid;
begin
  perform dr_set_actor(p_actor);

  select * into v_report from dr_reports where id = p_report_id for update;
  if not found then
    raise exception 'DR_NOT_FOUND: report not found';
  end if;

  select * into v_existing from dr_report_versions
  where project_id = v_report.project_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('report_id', v_report.id, 'report_no', v_report.report_no,
                              'version_no', v_existing.version_no, 'replayed', true);
  end if;

  if v_report.review_state <> 'RETURNED' then
    raise exception 'DR_STATE: report % is not returned for correction', v_report.report_no;
  end if;

  select * into v_unit from dr_reporting_units where id = v_report.unit_id;
  perform dr_assert_intake(p_actor, v_unit, v_report.report_date, p_payload);

  v_version_no := v_report.current_version_no + 1;
  update dr_reports
     set current_version_no = v_version_no, submission_state = 'SUBMITTED', review_state = 'AWAITING_REVIEW'
   where id = v_report.id
  returning * into v_report;

  v_version_id := dr_write_version(p_actor, v_report, v_version_no, 'CORRECTION', v_report.report_kind, p_payload,
                                   p_idempotency_key, p_channel, p_client_created_at, p_rule_results,
                                   p_evidence, p_response);

  select count(*) into v_warnings from dr_rule_results where version_id = v_version_id and status = 'FAILED';
  update dr_reports set warning_count = v_warnings where id = v_report.id;

  update dr_correction_requests
     set status = 'Resubmitted', resolved_in_version_no = v_version_no, response = p_response
   where report_id = v_report.id and status in ('Sent', 'Acknowledged');

  perform dr_audit(v_report.project_id, v_report.unit_id, v_report.id, v_version_no, 'DR.CORRECTION_RESUBMITTED',
                   p_actor, p_channel, jsonb_build_object('report_no', v_report.report_no, 'warnings', v_warnings));

  for r in select * from dr_reviewers(v_report.project_id) loop
    perform dr_notify(v_report.project_id, r, 'dr_review_required', 'High',
                      v_report.report_no || ' corrected — awaiting review',
                      v_unit.display_name || ' resubmitted the report for ' || v_report.report_date::text || '.',
                      '/dashboard/site/daily-reporting?report=' || v_report.id::text,
                      'dr:' || v_report.id || ':v' || v_version_no || ':review', p_actor);
  end loop;

  return jsonb_build_object('report_id', v_report.id, 'report_no', v_report.report_no,
                            'version_no', v_version_no, 'replayed', false);
end;
$$;

-- Answer to an information request: no new version, the report goes back to review.
create or replace function public.dr_answer_info(p_actor uuid, p_report_id uuid, p_response text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.dr_reports%rowtype;
  r uuid;
begin
  perform dr_set_actor(p_actor);
  select * into v_report from dr_reports where id = p_report_id for update;
  if not found then
    raise exception 'DR_NOT_FOUND: report not found';
  end if;
  if v_report.review_state <> 'INFO_REQUESTED' then
    raise exception 'DR_STATE: no information request is open on %', v_report.report_no;
  end if;
  if not dr_is_unit_member(v_report.unit_id, p_actor) then
    raise exception 'DR_INV_UNIT: not a member of this reporting unit';
  end if;
  if coalesce(btrim(p_response), '') = '' then
    raise exception 'DR_REQ_FIELD: a response is required';
  end if;

  update dr_correction_requests
     set status = 'Resubmitted', response = p_response, closed_at = now()
   where report_id = p_report_id and request_kind = 'REQUEST_INFO' and status in ('Sent', 'Acknowledged');
  update dr_reports set review_state = 'AWAITING_REVIEW' where id = p_report_id;

  perform dr_audit(v_report.project_id, v_report.unit_id, v_report.id, v_report.current_version_no,
                   'DR.INFO_ANSWERED', p_actor, null, jsonb_build_object('response', p_response));

  for r in select * from dr_reviewers(v_report.project_id) loop
    perform dr_notify(v_report.project_id, r, 'dr_review_required', 'High',
                      v_report.report_no || ' — information provided',
                      'The reporting unit answered your question on ' || v_report.report_no || '.',
                      '/dashboard/site/daily-reporting?report=' || v_report.id::text,
                      'dr:' || v_report.id || ':info:' || extract(epoch from now())::bigint, p_actor);
  end loop;
end;
$$;

create or replace function public.dr_withdraw_report(p_actor uuid, p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.dr_reports%rowtype;
begin
  perform dr_set_actor(p_actor);
  select * into v_report from dr_reports where id = p_report_id for update;
  if not found then
    raise exception 'DR_NOT_FOUND: report not found';
  end if;
  if not dr_is_unit_member(v_report.unit_id, p_actor) then
    raise exception 'DR_INV_UNIT: not a member of this reporting unit';
  end if;
  if v_report.submission_state <> 'SUBMITTED' or v_report.review_state <> 'AWAITING_REVIEW' then
    raise exception 'DR_STATE: % can no longer be withdrawn (review has started)', v_report.report_no;
  end if;
  update dr_reports set submission_state = 'WITHDRAWN' where id = p_report_id;
  perform dr_audit(v_report.project_id, v_report.unit_id, v_report.id, v_report.current_version_no,
                   'DR.REPORT_WITHDRAWN', p_actor, null, '{}'::jsonb);
  perform dr_refresh_live_summary(v_report.project_id, v_report.report_date);
end;
$$;

-- ── 7. Planning sync, on approval only (ADR-2) ──────────────────────────────
create or replace function public.dr_sync_version_to_planning(p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v        public.dr_report_versions%rowtype;
  v_report public.dr_reports%rowtype;
  a        record;
  d        record;
  s        jsonb;
  v_res    jsonb;
  v_link   public.dr_planning_links%rowtype;
  v_qty    numeric;
  v_log    uuid;
  v_delay  uuid;
  v_err    text;
  v_synced int := 0;
  v_errors int := 0;
  v_delays int := 0;
begin
  select * into v from dr_report_versions where id = p_version_id;
  select * into v_report from dr_reports where id = v.report_id;

  for a in
    select ap.*, vq.verified_qty
    from dr_activity_progress ap
    left join dr_verified_quantities vq on vq.version_id = ap.version_id and vq.line_id = ap.line_id
    where ap.version_id = p_version_id and ap.task_id is not null
  loop
    v_err := null;
    v_qty := coalesce(a.verified_qty, a.reported_qty);
    select * into v_link from dr_planning_links
    where report_id = v.report_id and line_id = a.line_id and kind = 'ACTIVITY';

    -- Step progress
    if jsonb_typeof(a.step_progress) = 'array' then
      for s in select * from jsonb_array_elements(a.step_progress) loop
        if nullif(s->>'step_id', '') is not null and nullif(s->>'progress', '') is not null then
          update wbs_task_steps
             set progress = (s->>'progress')::numeric,
                 end_date = case when (s->>'progress')::numeric = 100
                                 then coalesce(end_date, v_report.report_date) else end_date end,
                 updated_at = now()
           where id = (s->>'step_id')::uuid and task_id = a.task_id;
        end if;
      end loop;
    end if;

    -- Physical progress, through the schedule's own governance.
    if a.progress_today is not null then
      begin
        v_res := submit_progress(a.task_id, a.progress_today,
                                 coalesce(a.remarks, 'Daily report') || ' [' || v_report.report_no || ']');
      exception when others then
        v_err := sqlerrm;
        v_errors := v_errors + 1;
      end;
    end if;

    if a.actual_start_date is not null then
      update wbs_tasks
         set actual_start_date = least(coalesce(actual_start_date, a.actual_start_date), a.actual_start_date)
       where id = a.task_id;
    end if;
    if a.progress_today = 100 and a.actual_finish_date is not null then
      update wbs_tasks set actual_finish_date = a.actual_finish_date, status = 'closed' where id = a.task_id;
    elsif a.progress_today > 0 and a.progress_today < 100 then
      update wbs_tasks set status = 'in_progress' where id = a.task_id and status = 'open';
    end if;
    if coalesce(btrim(a.remarks), '') <> '' then
      update wbs_tasks set field_observation_notes = a.remarks where id = a.task_id;
    end if;

    -- Productivity log: verified quantity when the PM adjusted it.
    v_log := v_link.productivity_log_id;
    if v_qty is not null and coalesce(a.headcount, 0) > 0
       and (coalesce(a.hours_normal, 0) + coalesce(a.hours_ot, 0)) > 0 then
      if v_log is not null then
        update plan_productivity_logs
           set trade_code = coalesce(nullif(btrim(a.trade_code), ''), 'General'), log_date = v_report.report_date,
               headcount = a.headcount, hours_normal = coalesce(a.hours_normal, 0), hours_ot = coalesce(a.hours_ot, 0),
               quantity_done = v_qty, unit = a.uom, condition_note = a.remarks, updated_at = now()
         where id = v_log;
      else
        insert into plan_productivity_logs (project_id, task_id, trade_code, log_date, headcount, hours_normal,
                                            hours_ot, quantity_done, unit, condition_note, source, created_by)
        values (v.project_id, a.task_id, coalesce(nullif(btrim(a.trade_code), ''), 'General'), v_report.report_date,
                a.headcount, coalesce(a.hours_normal, 0), coalesce(a.hours_ot, 0), v_qty, a.uom, a.remarks,
                'site_diary', v.submitted_by)
        returning id into v_log;
      end if;
    end if;

    insert into dr_planning_links (report_id, line_id, kind, synced_version_no, productivity_log_id,
                                   progress_review_id, sync_error)
    values (v.report_id, a.line_id, 'ACTIVITY', v.version_no, v_log,
            nullif(v_res->>'review_id', '')::uuid, v_err)
    on conflict (report_id, line_id, kind) do update
      set synced_version_no = excluded.synced_version_no, productivity_log_id = excluded.productivity_log_id,
          progress_review_id = coalesce(excluded.progress_review_id, dr_planning_links.progress_review_id),
          sync_error = excluded.sync_error, synced_at = now();
    v_synced := v_synced + 1;
    v_res := null;
  end loop;

  -- Delay register: only delays the PM classified at approval (A4).
  for d in
    select de.*, dc.delay_type, dc.id as class_id
    from dr_delay_events de
    join dr_delay_classifications dc on dc.version_id = de.version_id and dc.line_id = de.line_id
    where de.version_id = p_version_id
  loop
    select * into v_link from dr_planning_links
    where report_id = v.report_id and line_id = d.line_id and kind = 'DELAY';
    if v_link.delay_register_id is null then
      insert into delay_register (project_id, wbs_task_id, description, delay_type, cause, start_date, status,
                                  notes, created_by)
      values (v.project_id, d.task_id, d.description, d.delay_type, d.cause_category, v_report.report_date, 'open',
              'From daily report ' || v_report.report_no || '. Hours lost: ' || coalesce(d.hours_lost, 0)
                || case when d.notice_required then '. Notice required.' else '.' end,
              v.submitted_by)
      returning id into v_delay;
      if d.task_id is not null then
        insert into delay_register_tasks (delay_id, wbs_task_id) values (v_delay, d.task_id)
        on conflict do nothing;
      end if;
      insert into dr_planning_links (report_id, line_id, kind, synced_version_no, delay_register_id)
      values (v.report_id, d.line_id, 'DELAY', v.version_no, v_delay)
      on conflict (report_id, line_id, kind) do update
        set delay_register_id = excluded.delay_register_id, synced_version_no = excluded.synced_version_no,
            synced_at = now();
      update dr_delay_classifications set delay_register_id = v_delay where id = d.class_id;
      v_delays := v_delays + 1;
    end if;
  end loop;

  return jsonb_build_object('activities_synced', v_synced, 'errors', v_errors, 'delays_logged', v_delays);
end;
$$;

-- ── 8. Review ───────────────────────────────────────────────────────────────
create or replace function public.dr_open_review(p_actor uuid, p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.dr_reports%rowtype;
begin
  perform dr_set_actor(p_actor);
  select * into v_report from dr_reports where id = p_report_id for update;
  if not found then
    raise exception 'DR_NOT_FOUND: report not found';
  end if;
  if not dr_can_review(v_report.project_id, p_actor) then
    raise exception 'DR_FORBIDDEN: you are not an approver on this project';
  end if;
  if v_report.review_state = 'AWAITING_REVIEW' and v_report.submission_state = 'SUBMITTED' then
    update dr_reports set review_state = 'IN_REVIEW' where id = p_report_id;
  end if;
  perform dr_audit(v_report.project_id, v_report.unit_id, v_report.id, v_report.current_version_no,
                   'DR.REVIEW_OPENED', p_actor, null, '{}'::jsonb);
end;
$$;

create or replace function public.dr_decide_review(
  p_actor uuid, p_report_id uuid, p_version_no int, p_decision text, p_comment text default null,
  p_verified jsonb default '[]'::jsonb, p_correction_items jsonb default '[]'::jsonb,
  p_delay_classes jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report      public.dr_reports%rowtype;
  v_version     public.dr_report_versions%rowtype;
  v_unit        public.dr_reporting_units%rowtype;
  v_decision_id uuid;
  v_correction  uuid;
  v_sync        jsonb := '{}'::jsonb;
  v_href        text;
  v_was_amend   boolean;
  r             uuid;
begin
  perform dr_set_actor(p_actor);

  select * into v_report from dr_reports where id = p_report_id for update;
  if not found then
    raise exception 'DR_NOT_FOUND: report not found';
  end if;
  if not dr_can_review(v_report.project_id, p_actor) then
    raise exception 'DR_FORBIDDEN: you are not an approver on this project';
  end if;
  if p_decision not in ('APPROVE', 'APPROVE_WITH_REMARK', 'REQUEST_INFO', 'RETURN') then
    raise exception 'DR_REQ_FIELD: unknown decision %', p_decision;
  end if;
  if v_report.submission_state <> 'SUBMITTED'
     or v_report.review_state not in ('AWAITING_REVIEW', 'IN_REVIEW', 'AMENDMENT_PENDING') then
    raise exception 'DR_STATE: % is not open for a decision (state %/%)',
      v_report.report_no, v_report.submission_state, v_report.review_state;
  end if;
  if p_version_no <> v_report.current_version_no then
    raise exception 'DR_STALE: % has a newer version (v%); reload before deciding',
      v_report.report_no, v_report.current_version_no;
  end if;
  if p_decision <> 'APPROVE' and coalesce(btrim(p_comment), '') = '' then
    raise exception 'DR_REQ_FIELD: a comment is required for this decision';
  end if;

  select * into v_version from dr_report_versions where report_id = p_report_id and version_no = p_version_no;
  select * into v_unit from dr_reporting_units where id = v_report.unit_id;

  -- Segregation of duties: nobody approves a version they submitted.
  if v_version.submitted_by = p_actor and p_decision in ('APPROVE', 'APPROVE_WITH_REMARK') then
    raise exception 'DR_SOD: you submitted this version and cannot approve it';
  end if;

  v_was_amend := v_report.review_state = 'AMENDMENT_PENDING';
  v_href := '/dashboard/site/daily-reporting?report=' || v_report.id::text;

  insert into dr_review_decisions (report_id, version_id, project_id, reviewer_id, decision, comment)
  values (p_report_id, v_version.id, v_report.project_id, p_actor, p_decision, nullif(btrim(p_comment), ''))
  returning id into v_decision_id;

  if p_decision in ('APPROVE', 'APPROVE_WITH_REMARK') then
    -- Verified quantities: every adjustment carries a remark (table constraint).
    insert into dr_verified_quantities (decision_id, version_id, report_id, project_id, line_id,
                                        reported_qty, verified_qty, remark, decided_by)
    select v_decision_id, v_version.id, p_report_id, v_report.project_id, x.line_id, ap.reported_qty,
           x.verified_qty, x.remark, p_actor
    from jsonb_to_recordset(coalesce(p_verified, '[]'::jsonb)) as x(line_id text, verified_qty numeric, remark text)
    join dr_activity_progress ap on ap.version_id = v_version.id and ap.line_id = x.line_id;

    if (select count(*) from jsonb_array_elements(coalesce(p_verified, '[]'::jsonb)))
       <> (select count(*) from dr_verified_quantities where decision_id = v_decision_id) then
      raise exception 'DR_REQ_FIELD: a verified quantity refers to a line that is not in this version';
    end if;

    insert into dr_delay_classifications (decision_id, version_id, project_id, line_id, delay_type)
    select v_decision_id, v_version.id, v_report.project_id, x.line_id, x.delay_type
    from jsonb_to_recordset(coalesce(p_delay_classes, '[]'::jsonb)) as x(line_id text, delay_type text)
    join dr_delay_events de on de.version_id = v_version.id and de.line_id = x.line_id;

    -- Every delay that lost time must be classified before it reaches the register.
    if exists (
      select 1 from dr_delay_events de
      where de.version_id = v_version.id and coalesce(de.hours_lost, 0) > 0
        and not exists (select 1 from dr_delay_classifications dc
                        where dc.version_id = de.version_id and dc.line_id = de.line_id)
    ) then
      raise exception 'DR_REQ_FIELD: classify every delay event that lost time before approving';
    end if;

    update dr_reports
       set review_state = case p_decision when 'APPROVE' then 'APPROVED' else 'APPROVED_WITH_REMARK' end,
           approved_version_no = p_version_no, approved_at = now(), approved_by = p_actor
     where id = p_report_id;

    update dr_correction_requests set status = 'Closed', closed_at = now()
     where report_id = p_report_id and status in ('Sent', 'Acknowledged', 'Resubmitted');

    v_sync := dr_sync_version_to_planning(v_version.id);

    for r in select * from dr_unit_reporters(v_report.unit_id) loop
      perform dr_notify(v_report.project_id, r, 'dr_report_approved', 'Normal',
                        v_report.report_no || ' approved',
                        'Your daily report for ' || v_report.report_date::text || ' was approved'
                          || case when p_decision = 'APPROVE_WITH_REMARK' then ' with a remark: ' || p_comment else '.' end,
                        v_href, 'dr:' || v_report.id || ':v' || p_version_no || ':approved', p_actor);
    end loop;

    if exists (select 1 from dr_delay_events de where de.version_id = v_version.id and de.notice_required) then
      for r in
        select * from dr_role_members(v_report.project_id, 'QS')
        union select * from dr_management(v_report.project_id)
      loop
        perform dr_notify(v_report.project_id, r, 'dr_delay_notice', 'Critical',
                          'Delay notice required — ' || v_unit.display_name,
                          'Approved report ' || v_report.report_no || ' contains a delay event flagged "notice required".',
                          v_href, 'dr:' || v_report.id || ':v' || p_version_no || ':notice-approved', p_actor);
      end loop;
    end if;

  else
    insert into dr_correction_requests (report_id, project_id, based_on_version_no, request_kind, drafted_by,
                                        sent_by, status, message)
    values (p_report_id, v_report.project_id, p_version_no,
            case p_decision when 'RETURN' then 'RETURN' else 'REQUEST_INFO' end, 'PM', p_actor, 'Sent', p_comment)
    returning id into v_correction;

    insert into dr_correction_items (correction_id, project_id, target_section, target_line_id, reason, required_action)
    select v_correction, v_report.project_id, x.target_section, nullif(x.target_line_id, ''), x.reason, x.required_action
    from jsonb_to_recordset(coalesce(p_correction_items, '[]'::jsonb))
      as x(target_section text, target_line_id text, reason text, required_action text);

    if p_decision = 'RETURN' then
      if not exists (select 1 from dr_correction_items where correction_id = v_correction) then
        raise exception 'DR_REQ_FIELD: select at least one item to return for correction';
      end if;
      update dr_reports set submission_state = 'RETURNED', review_state = 'RETURNED' where id = p_report_id;
    else
      update dr_reports set review_state = 'INFO_REQUESTED' where id = p_report_id;
    end if;

    for r in select * from dr_unit_reporters(v_report.unit_id) loop
      perform dr_notify(v_report.project_id, r,
                        case p_decision when 'RETURN' then 'dr_report_returned' else 'dr_info_requested' end, 'High',
                        v_report.report_no || case p_decision when 'RETURN' then ' returned — action required'
                                                               else ' — information requested' end,
                        p_comment, v_href,
                        'dr:' || v_report.id || ':v' || p_version_no || ':' || lower(p_decision) || ':' || v_correction,
                        p_actor);
    end loop;
  end if;

  perform dr_audit(v_report.project_id, v_report.unit_id, v_report.id, p_version_no, 'DR.REVIEW_DECISION', p_actor, null,
                   jsonb_build_object('decision', p_decision, 'comment', p_comment, 'verified', p_verified,
                                      'amendment', v_was_amend, 'planning_sync', v_sync));
  if v_correction is not null then
    perform dr_audit(v_report.project_id, v_report.unit_id, v_report.id, p_version_no, 'DR.CORRECTION_SENT', p_actor, null,
                     jsonb_build_object('correction_id', v_correction, 'items', p_correction_items));
  end if;

  perform dr_refresh_live_summary(v_report.project_id, v_report.report_date);

  return jsonb_build_object('decision_id', v_decision_id, 'correction_id', v_correction, 'planning_sync', v_sync);
end;
$$;

-- ── 9. Post-approval amendment ──────────────────────────────────────────────
create or replace function public.dr_submit_amendment(
  p_actor uuid, p_report_id uuid, p_payload jsonb, p_reason text, p_idempotency_key text,
  p_channel text default 'WEB', p_rule_results jsonb default '[]'::jsonb, p_evidence jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report     public.dr_reports%rowtype;
  v_existing   public.dr_report_versions%rowtype;
  v_version_no int;
  v_old_no     int;
  r            uuid;
begin
  perform dr_set_actor(p_actor);
  select * into v_report from dr_reports where id = p_report_id for update;
  if not found then
    raise exception 'DR_NOT_FOUND: report not found';
  end if;

  select * into v_existing from dr_report_versions
  where project_id = v_report.project_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('report_id', v_report.id, 'report_no', v_report.report_no,
                              'version_no', v_existing.version_no, 'replayed', true);
  end if;

  if v_report.review_state not in ('APPROVED', 'APPROVED_WITH_REMARK') then
    raise exception 'DR_STATE: only an approved report can be amended';
  end if;
  if not (dr_can_review(v_report.project_id, p_actor) or dr_is_unit_member(v_report.unit_id, p_actor)) then
    raise exception 'DR_FORBIDDEN: not allowed to amend this report';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'DR_REQ_FIELD: an amendment needs a reason';
  end if;

  v_old_no := v_report.current_version_no;
  v_version_no := v_old_no + 1;
  -- approved_version_no is left untouched: the previously approved version
  -- stays the official one until the amendment itself is approved.
  update dr_reports set current_version_no = v_version_no, review_state = 'AMENDMENT_PENDING'
   where id = p_report_id
  returning * into v_report;

  perform dr_write_version(p_actor, v_report, v_version_no, 'AMENDMENT', v_report.report_kind, p_payload,
                           p_idempotency_key, p_channel, null, p_rule_results, p_evidence, p_reason);

  perform dr_audit(v_report.project_id, v_report.unit_id, v_report.id, v_version_no, 'DR.REPORT_AMENDED', p_actor,
                   p_channel, jsonb_build_object('reason', p_reason, 'old_version', v_old_no, 'new_version', v_version_no));

  for r in select * from dr_reviewers(v_report.project_id) loop
    perform dr_notify(v_report.project_id, r, 'dr_review_required', 'High',
                      v_report.report_no || ' amendment awaiting approval', 'Reason: ' || p_reason,
                      '/dashboard/site/daily-reporting?report=' || v_report.id::text,
                      'dr:' || v_report.id || ':v' || v_version_no || ':review', p_actor);
  end loop;

  return jsonb_build_object('report_id', v_report.id, 'report_no', v_report.report_no,
                            'version_no', v_version_no, 'replayed', false);
end;
$$;

-- ── 10. Project daily summary ───────────────────────────────────────────────
-- Whether p_date is a working day for the unit.
create or replace function public.dr_is_working_day(p_unit_id uuid, p_date date)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select extract(isodow from p_date)::int = any (s.working_days)
     and not exists (select 1 from dr_non_working_days n
                     join dr_reporting_units u on u.id = p_unit_id
                     where n.project_id = u.project_id and n.day = p_date)
  from dr_unit_schedule(p_unit_id) s;
$$;

create or replace function public.dr_refresh_live_summary(p_project_id uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coverage jsonb;
  v_totals   jsonb;
  v_included jsonb;
begin
  with expected as (
    select u.id
    from dr_reporting_units u
    where u.project_id = p_project_id
      and (u.mobilised_at is null or u.mobilised_at <= p_date)
      and (u.demobilised_at is null or u.demobilised_at >= p_date)
      and (u.status = 'Active' or exists (select 1 from dr_reports r where r.unit_id = u.id and r.report_date = p_date))
      and (dr_is_working_day(u.id, p_date)
           or exists (select 1 from dr_reports r where r.unit_id = u.id and r.report_date = p_date))
  ),
  rep as (
    select r.* from dr_reports r
    where r.project_id = p_project_id and r.report_date = p_date and r.submission_state <> 'WITHDRAWN'
  )
  select jsonb_build_object(
    'expected',  (select count(*) from expected),
    'submitted', (select count(*) from rep),
    'approved',  (select count(*) from rep where approved_version_no is not null),
    'no_work',   (select count(*) from rep where report_kind = 'NO_WORK'),
    'pending',   (select count(*) from rep where approved_version_no is null),
    'late',      (select count(*) from rep where late_flag),
    'missing',   (select count(*) from expected e where not exists (select 1 from rep where rep.unit_id = e.id)),
    'units',     coalesce((
      select jsonb_agg(jsonb_build_object(
               'unit_id', u.id, 'unit_code', u.unit_code, 'display_name', u.display_name,
               'report_id', rep.id, 'report_no', rep.report_no, 'report_kind', rep.report_kind,
               'state', case when rep.id is null then 'MISSING'
                             when rep.approved_version_no is not null then 'APPROVED'
                             else 'PENDING' end,
               'late', coalesce(rep.late_flag, false)) order by u.unit_code)
      from expected e join dr_reporting_units u on u.id = e.id
      left join rep on rep.unit_id = u.id), '[]'::jsonb))
  into v_coverage;

  -- Official figures come from approved versions only.
  with av as (
    select v.id as version_id, r.id as report_id, r.unit_id, v.version_no
    from dr_reports r
    join dr_report_versions v on v.report_id = r.id and v.version_no = r.approved_version_no
    where r.project_id = p_project_id and r.report_date = p_date and r.submission_state <> 'WITHDRAWN'
  )
  select
    jsonb_build_object(
      'manpower_total', coalesce((select sum(m.reported_count) from dr_manpower m join av on av.version_id = m.version_id), 0),
      'manpower_by_trade', coalesce((
        select jsonb_agg(jsonb_build_object('trade', t.trade, 'count', t.cnt) order by t.trade)
        from (select m.trade, sum(m.reported_count) as cnt
              from dr_manpower m join av on av.version_id = m.version_id group by m.trade) t), '[]'::jsonb),
      'manpower_by_unit', coalesce((
        select jsonb_agg(jsonb_build_object('unit_id', t.unit_id, 'count', t.cnt))
        from (select av.unit_id, sum(m.reported_count) as cnt
              from dr_manpower m join av on av.version_id = m.version_id group by av.unit_id) t), '[]'::jsonb),
      'activities', coalesce((
        select jsonb_object_agg(t.work_status, t.cnt)
        from (select coalesce(ap.work_status, 'unspecified') as work_status, count(*) as cnt
              from dr_activity_progress ap join av on av.version_id = ap.version_id group by 1) t), '{}'::jsonb),
      'quantities', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'task_id', ap.task_id, 'task_code', wt.task_code, 'task_name', coalesce(wt.task_name, ap.free_text_activity),
                 'uom', ap.uom, 'reported_qty', ap.reported_qty,
                 'verified_qty', coalesce(vq.verified_qty, ap.reported_qty),
                 'adjusted', vq.id is not null, 'progress', ap.progress_today) order by wt.task_code)
        from dr_activity_progress ap join av on av.version_id = ap.version_id
        left join dr_verified_quantities vq on vq.version_id = ap.version_id and vq.line_id = ap.line_id
        left join wbs_tasks wt on wt.id = ap.task_id), '[]'::jsonb),
      'delay_events', (select count(*) from dr_delay_events de join av on av.version_id = de.version_id),
      'delay_hours_lost', coalesce((select sum(de.hours_lost) from dr_delay_events de join av on av.version_id = de.version_id), 0),
      'delay_notices', (select count(*) from dr_delay_events de join av on av.version_id = de.version_id where de.notice_required),
      'weather_hours_lost', coalesce((select sum(w.hours_lost) from dr_weather w join av on av.version_id = w.version_id), 0),
      'issues', (select count(*) from dr_issues i join av on av.version_id = i.version_id),
      'issues_high', (select count(*) from dr_issues i join av on av.version_id = i.version_id where i.severity in ('HIGH', 'CRITICAL')),
      'instructions', (select count(*) from dr_instructions_received i join av on av.version_id = i.version_id),
      'incidents', coalesce((select sum(s.incident_count) from dr_safety s join av on av.version_id = s.version_id), 0),
      'near_misses', coalesce((select sum(s.near_miss_count) from dr_safety s join av on av.version_id = s.version_id), 0),
      'equipment_hours', coalesce((select sum(e.hours_working) from dr_equipment e join av on av.version_id = e.version_id), 0),
      'open_returns', (select count(*) from dr_reports r where r.project_id = p_project_id and r.report_date = p_date
                         and r.review_state in ('RETURNED', 'INFO_REQUESTED'))
    ),
    coalesce((select jsonb_agg(jsonb_build_object('report_id', av.report_id, 'version_no', av.version_no)
                               order by av.report_id) from av), '[]'::jsonb)
  into v_totals, v_included;

  insert into dr_project_daily_summaries (project_id, summary_date, revision_no, status, coverage, totals,
                                          included_report_versions)
  values (p_project_id, p_date, 0, 'Live', v_coverage, v_totals, v_included)
  on conflict (project_id, summary_date, revision_no)
  do update set coverage = excluded.coverage, totals = excluded.totals,
                included_report_versions = excluded.included_report_versions, updated_at = now();
end;
$$;

create or replace function public.dr_publish_summary(p_actor uuid, p_project_id uuid, p_date date, p_narrative text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live public.dr_project_daily_summaries%rowtype;
  v_last public.dr_project_daily_summaries%rowtype;
  v_rev  int;
  v_id   uuid;
  r      uuid;
begin
  perform dr_set_actor(p_actor);
  if not dr_can_review(p_project_id, p_actor) then
    raise exception 'DR_FORBIDDEN: only a project approver can publish the summary';
  end if;

  perform dr_refresh_live_summary(p_project_id, p_date);
  select * into v_live from dr_project_daily_summaries
  where project_id = p_project_id and summary_date = p_date and revision_no = 0;

  select * into v_last from dr_project_daily_summaries
  where project_id = p_project_id and summary_date = p_date and status = 'Official';

  -- G10: a revision is issued only when something actually changed.
  if found
     and v_last.included_report_versions = v_live.included_report_versions
     and v_last.totals = v_live.totals
     and coalesce(v_last.narrative_final, '') = coalesce(p_narrative, '') then
    raise exception 'DR_NO_CHANGE: nothing changed since revision %', v_last.revision_no;
  end if;

  select coalesce(max(revision_no), 0) + 1 into v_rev from dr_project_daily_summaries
  where project_id = p_project_id and summary_date = p_date;

  update dr_project_daily_summaries set status = 'Superseded'
  where project_id = p_project_id and summary_date = p_date and status = 'Official';

  insert into dr_project_daily_summaries (project_id, summary_date, revision_no, status, coverage, totals,
                                          included_report_versions, narrative_final, published_by, published_at)
  values (p_project_id, p_date, v_rev, 'Official', v_live.coverage, v_live.totals,
          v_live.included_report_versions, p_narrative, p_actor, now())
  returning id into v_id;

  perform dr_audit(p_project_id, null, null, null,
                   case when v_rev = 1 then 'DR.SUMMARY_PUBLISHED' else 'DR.SUMMARY_SUPERSEDED' end, p_actor, null,
                   jsonb_build_object('summary_date', p_date, 'revision', v_rev,
                                      'included', v_live.included_report_versions, 'coverage', v_live.coverage - 'units'));

  for r in select * from dr_management(p_project_id) loop
    perform dr_notify(p_project_id, r, 'dr_summary_published', 'Normal',
                      'Daily summary ' || p_date::text || case when v_rev > 1 then ' — revision ' || v_rev else ' published' end,
                      (v_live.coverage->>'approved') || ' of ' || (v_live.coverage->>'expected') || ' reports approved; '
                        || (v_live.coverage->>'pending') || ' pending, ' || (v_live.coverage->>'missing') || ' missing.',
                      '/dashboard/site/daily-reporting?tab=summary&date=' || p_date::text,
                      'dr:summary:' || p_project_id || ':' || p_date || ':r' || v_rev, p_actor,
                      case when v_rev = 1 then '{telegram,email}'::text[] else '{}'::text[] end);
  end loop;

  return jsonb_build_object('summary_id', v_id, 'revision_no', v_rev);
end;
$$;

-- ── 11. Missing reports, reminders and escalation (scheduled) ───────────────
-- Idempotent: every notification is keyed, so running it every few minutes
-- sends each reminder and each escalation exactly once.
create or replace function public.dr_run_schedule(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u          record;
  m          record;
  rp         record;
  c          record;
  v_local    timestamp;
  v_today    date;
  v_day      date;
  v_raised   int := 0;
  v_reminded int := 0;
  v_href     text := '/dashboard/site/daily-reporting';
  r          uuid;
begin
  for u in
    select ru.*, s.deadline_time, s.reminder_time, s.late_window_hours, s.working_days, s.timezone
    from dr_reporting_units ru
    join projects p on p.id = ru.project_id and p.dr_enabled
    cross join lateral dr_unit_schedule(ru.id) s
    where ru.status = 'Active'
  loop
    v_local := p_now at time zone u.timezone;
    v_today := v_local::date;

    -- Reminder for today.
    if dr_is_working_day(u.id, v_today) and v_local::time >= u.reminder_time and v_local::time < u.deadline_time
       and coalesce(u.mobilised_at, (u.created_at at time zone u.timezone)::date) <= v_today
       and not exists (select 1 from dr_reports r where r.unit_id = u.id and r.report_date = v_today
                         and r.submission_state <> 'WITHDRAWN') then
      for r in select * from dr_unit_reporters(u.id) loop
        perform dr_notify(u.project_id, r, 'dr_report_missing', 'Normal',
                          'Daily report due at ' || to_char(u.deadline_time, 'HH24:MI'),
                          u.display_name || ' has not submitted today''s daily report yet.',
                          v_href, 'dr:reminder:' || u.id || ':' || v_today);
        v_reminded := v_reminded + 1;
      end loop;
    end if;

    -- Missing: today (after the deadline) and yesterday.
    foreach v_day in array array[v_today, v_today - 1] loop
      if dr_is_working_day(u.id, v_day)
         -- A unit owes no report for days before it was mobilised (or set up).
         and coalesce(u.mobilised_at, (u.created_at at time zone u.timezone)::date) <= v_day
         and v_local >= (v_day + u.deadline_time)
         and not exists (select 1 from dr_reports r where r.unit_id = u.id and r.report_date = v_day
                           and r.submission_state <> 'WITHDRAWN')
         and not exists (select 1 from dr_missing_reports x where x.unit_id = u.id and x.report_date = v_day) then
        insert into dr_missing_reports (project_id, unit_id, report_date) values (u.project_id, u.id, v_day);
        perform dr_audit(u.project_id, u.id, null, null, 'DR.MISSING_REPORT_RAISED', null, null,
                         jsonb_build_object('report_date', v_day));
        for r in select * from dr_unit_reporters(u.id) loop
          perform dr_notify(u.project_id, r, 'dr_report_missing', 'High',
                            'Daily report missing — ' || v_day::text,
                            u.display_name || ' has no daily report for ' || v_day::text
                              || '. Submit it now, or submit "No Work Today" with a reason.',
                            v_href, 'dr:missing:' || u.id || ':' || v_day);
        end loop;
        perform dr_refresh_live_summary(u.project_id, v_day);
        v_raised := v_raised + 1;
      end if;
    end loop;
  end loop;

  -- Escalation of open missing reports.
  for m in
    select x.*, ru.display_name, s.timezone
    from dr_missing_reports x
    join dr_reporting_units ru on ru.id = x.unit_id
    cross join lateral dr_unit_schedule(ru.id) s
    where x.status = 'Open'
  loop
    v_local := p_now at time zone m.timezone;
    if m.escalation_level < 1 and v_local >= (m.report_date + 1) + time '09:00' then
      for r in select * from dr_reviewers(m.project_id) loop
        perform dr_notify(m.project_id, r, 'dr_report_missing', 'High',
                          'Missing daily report — ' || m.display_name,
                          'No report for ' || m.report_date::text || '.', v_href || '?tab=missing',
                          'dr:missing:' || m.unit_id || ':' || m.report_date || ':l1');
      end loop;
      update dr_missing_reports set escalation_level = 1 where id = m.id;
    end if;
    if m.escalation_level < 2 and v_local >= (m.report_date + 2) + time '09:00' then
      for r in select * from dr_management(m.project_id) union select * from dr_reviewers(m.project_id) loop
        perform dr_notify(m.project_id, r, 'dr_report_missing', 'Critical',
                          'Daily report still missing — ' || m.display_name,
                          'No report for ' || m.report_date::text || ' after two days.', v_href || '?tab=missing',
                          'dr:missing:' || m.unit_id || ':' || m.report_date || ':l2');
      end loop;
      update dr_missing_reports set escalation_level = 2 where id = m.id;
    end if;
  end loop;

  -- Review pending 12 h / 24 h.
  for rp in
    select r.id, r.project_id, r.report_no, r.current_version_no, v.submitted_at
    from dr_reports r
    join dr_report_versions v on v.report_id = r.id and v.version_no = r.current_version_no
    where r.submission_state = 'SUBMITTED'
      and r.review_state in ('AWAITING_REVIEW', 'IN_REVIEW', 'AMENDMENT_PENDING')
      and v.submitted_at < p_now - interval '12 hours'
  loop
    for r in select * from dr_reviewers(rp.project_id) loop
      perform dr_notify(rp.project_id, r, 'dr_review_overdue', 'High',
                        rp.report_no || ' waiting more than 12 hours', 'This daily report is still awaiting your review.',
                        v_href || '?report=' || rp.id, 'dr:' || rp.id || ':v' || rp.current_version_no || ':overdue12');
    end loop;
    if rp.submitted_at < p_now - interval '24 hours' then
      for r in select * from dr_management(rp.project_id) loop
        perform dr_notify(rp.project_id, r, 'dr_review_overdue', 'Critical',
                          rp.report_no || ' not reviewed after 24 hours', 'A daily report has been awaiting review for over a day.',
                          v_href || '?report=' || rp.id, 'dr:' || rp.id || ':v' || rp.current_version_no || ':overdue24');
      end loop;
    end if;
  end loop;

  -- Correction pending 24 h / 48 h / 72 h.
  for c in
    select cr.id, cr.sent_at, r.id as report_id, r.report_no, r.project_id, r.unit_id
    from dr_correction_requests cr
    join dr_reports r on r.id = cr.report_id
    where cr.status in ('Sent', 'Acknowledged') and cr.sent_at < p_now - interval '24 hours'
  loop
    for r in select * from dr_unit_reporters(c.unit_id) loop
      perform dr_notify(c.project_id, r, 'dr_correction_overdue', 'High',
                        c.report_no || ' — correction still pending', 'A returned daily report is waiting for your correction.',
                        v_href || '?report=' || c.report_id, 'dr:corr:' || c.id || ':24');
    end loop;
    if c.sent_at < p_now - interval '48 hours' then
      for r in select * from dr_reviewers(c.project_id) loop
        perform dr_notify(c.project_id, r, 'dr_correction_overdue', 'High',
                          c.report_no || ' — correction overdue 48 h', 'The reporting unit has not corrected a returned report.',
                          v_href || '?report=' || c.report_id, 'dr:corr:' || c.id || ':48');
      end loop;
    end if;
    if c.sent_at < p_now - interval '72 hours' then
      for r in select * from dr_management(c.project_id) loop
        perform dr_notify(c.project_id, r, 'dr_correction_overdue', 'Critical',
                          c.report_no || ' — correction overdue 72 h', 'A returned daily report is uncorrected after three days.',
                          v_href || '?report=' || c.report_id, 'dr:corr:' || c.id || ':72');
      end loop;
    end if;
  end loop;

  return jsonb_build_object('missing_raised', v_raised, 'reminders', v_reminded);
end;
$$;

create or replace function public.dr_excuse_missing(p_actor uuid, p_missing_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.dr_missing_reports%rowtype;
begin
  perform dr_set_actor(p_actor);
  select * into m from dr_missing_reports where id = p_missing_id for update;
  if not found then
    raise exception 'DR_NOT_FOUND: missing-report record not found';
  end if;
  if not dr_can_review(m.project_id, p_actor) then
    raise exception 'DR_FORBIDDEN: only a project approver can excuse a missing report';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'DR_REQ_FIELD: a reason is required';
  end if;
  if m.status <> 'Open' then
    raise exception 'DR_STATE: this record is already %', m.status;
  end if;
  update dr_missing_reports
     set status = 'Excused', excuse_reason = p_reason, excused_by = p_actor, closed_at = now()
   where id = p_missing_id;
  perform dr_audit(m.project_id, m.unit_id, null, null, 'DR.MISSING_REPORT_EXCUSED', p_actor, null,
                   jsonb_build_object('report_date', m.report_date, 'reason', p_reason));
end;
$$;

-- Audit of an online intake rejection: no report is created, the attempt is kept.
create or replace function public.dr_audit_intake_rejected(
  p_actor uuid, p_unit_id uuid, p_report_date date, p_channel text, p_rule_codes text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
begin
  select project_id into v_project from dr_reporting_units where id = p_unit_id;
  perform dr_audit(v_project, p_unit_id, null, null, 'DR.INTAKE_REJECTED', p_actor, p_channel,
                   jsonb_build_object('report_date', p_report_date, 'rule_codes', to_jsonb(p_rule_codes)));
end;
$$;

-- ── 12. Grants: service role only ───────────────────────────────────────────
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'dr_set_actor', 'dr_audit', 'dr_notify', 'dr_reviewers', 'dr_management', 'dr_role_members',
        'dr_unit_reporters', 'dr_unit_schedule', 'dr_next_report_no', 'dr_project_version', 'dr_write_version',
        'dr_assert_intake', 'dr_save_draft', 'dr_submit_report', 'dr_resubmit_report', 'dr_answer_info',
        'dr_withdraw_report', 'dr_sync_version_to_planning', 'dr_open_review', 'dr_decide_review',
        'dr_submit_amendment', 'dr_is_working_day', 'dr_refresh_live_summary', 'dr_publish_summary',
        'dr_run_schedule', 'dr_excuse_missing', 'dr_audit_intake_rejected')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- ── 13. Schedule: every 15 minutes, where pg_cron is available ──────────────
-- Raises missing reports, reminders and escalations (in-app immediately).
-- Telegram/email delivery of the outbox is done by app/api/dr/cron/tick.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.unschedule(jobid) from cron.job where jobname = 'dr_run_schedule';
      perform cron.schedule('dr_run_schedule', '*/15 * * * *', 'select public.dr_run_schedule()');
    exception when others then
      raise notice 'dr_run_schedule was not scheduled: %', sqlerrm;
    end;
  end if;
end $$;

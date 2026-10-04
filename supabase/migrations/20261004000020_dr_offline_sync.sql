-- Migration: 20261004000020_dr_offline_sync.sql
-- Purpose: Module 10-01 Daily Reporting, Phase 1B — offline capture and sync
--          for the Field App.
-- Rules this implements (design §12, decisions D18/D19, amendments G1/G2):
--   - A device gets an OFFLINE GRANT while online. It names the user, the
--     device, the units the user could report for, and an expiry.
--   - A report created offline is pushed later with its grant. If a grant
--     covered it when it was written, the report is ALWAYS kept:
--       · nothing wrong            → normal report, awaiting review
--       · grant or membership since revoked, unit no longer active, rule
--         errors, activity outside scope, future date
--                                  → stored, sync_state REQUIRES_REVIEW, with
--                                    the reasons, for the approver to judge
--       · a report already exists  → dr_sync_conflicts (CONFLICT), resolved by
--         for that unit and date     the reporter or an approver
--       · the payload cannot be    → dr_sync_conflicts (QUARANTINE) with the
--         stored at all              payload and the database error
--     Only a push that no grant ever covered is refused.
--   - Photos may arrive after the report (EVIDENCE_PENDING).
--   - Review and approval stay online-only: no function here decides anything.
-- Depends on: 20261004000010, 20261004000011

-- ── 1. Devices and offline grants ───────────────────────────────────────────
create table public.dr_devices (
  id            uuid primary key,              -- generated on the device
  user_id       uuid not null references public.profiles(id) on delete cascade,
  label         text,
  user_agent    text,
  registered_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  revoked_at    timestamptz
);
create index idx_dr_devices_user on public.dr_devices(user_id);

create table public.dr_offline_grants (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  device_id  uuid not null references public.dr_devices(id) on delete cascade,
  unit_ids   uuid[] not null,
  issued_at  timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index idx_dr_grants_user on public.dr_offline_grants(user_id, issued_at desc);

-- Where an offline-created version came from (append-only).
create table public.dr_version_origins (
  version_id        uuid primary key references public.dr_report_versions(id) on delete restrict,
  project_id        uuid not null references public.projects(id) on delete cascade,
  grant_id          uuid references public.dr_offline_grants(id) on delete set null,
  device_id         uuid references public.dr_devices(id) on delete set null,
  client_created_at timestamptz,
  queue_age_seconds int,
  expected_evidence int not null default 0
);
create trigger trg_dr_version_origins_immutable before update or delete on public.dr_version_origins
  for each row execute function public.dr_block_mutation();

-- Why an offline report needs the approver's attention.
alter table public.dr_reports
  add column if not exists review_flags text[] not null default '{}';

-- ── 2. Conflicts and quarantine ─────────────────────────────────────────────
create table public.dr_sync_conflicts (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects(id) on delete cascade,
  unit_id              uuid not null references public.dr_reporting_units(id) on delete cascade,
  report_date          date not null,
  kind                 text not null check (kind in ('CONFLICT', 'QUARANTINE')),
  existing_report_id   uuid references public.dr_reports(id) on delete set null,
  -- The whole incoming submission, kept exactly as received.
  incoming             jsonb not null,
  submitted_by         uuid references public.profiles(id) on delete set null,
  device_id            uuid references public.dr_devices(id) on delete set null,
  grant_id             uuid references public.dr_offline_grants(id) on delete set null,
  idempotency_key      text not null,
  error                text,
  status               text not null default 'Open'
                       check (status in ('Open', 'Resolved — Merged', 'Resolved — Kept Existing',
                                         'Resolved — Kept Both', 'Resolved — Discarded')),
  resolution_note      text,
  resulting_version_no int,
  detected_at          timestamptz not null default now(),
  resolved_by          uuid references public.profiles(id) on delete set null,
  resolved_at          timestamptz,
  unique (project_id, idempotency_key)
);
create index idx_dr_conflicts_open on public.dr_sync_conflicts(project_id, status);

-- The incoming submission and its origin can never be altered or removed.
create or replace function public.dr_sync_conflict_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'DR_IMMUTABLE: a sync conflict record cannot be deleted' using errcode = 'P0001';
  end if;
  if (to_jsonb(new) - 'status' - 'resolution_note' - 'resulting_version_no' - 'resolved_by' - 'resolved_at')
     is distinct from
     (to_jsonb(old) - 'status' - 'resolution_note' - 'resulting_version_no' - 'resolved_by' - 'resolved_at') then
    raise exception 'DR_IMMUTABLE: only the resolution of a sync conflict may change' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger trg_dr_sync_conflict_guard before update or delete on public.dr_sync_conflicts
  for each row execute function public.dr_sync_conflict_guard();

-- ── 3. RLS ──────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['dr_devices', 'dr_offline_grants', 'dr_version_origins', 'dr_sync_conflicts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated, anon', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

create policy dr_devices_select on public.dr_devices for select to authenticated
  using (user_id = auth.uid() or is_admin(auth.uid()));
create policy dr_grants_select on public.dr_offline_grants for select to authenticated
  using (user_id = auth.uid() or is_admin(auth.uid()));
create policy dr_version_origins_select on public.dr_version_origins for select to authenticated
  using (dr_can_view_project(project_id));
-- The reporter who pushed it and anyone who may see the unit's reports.
create policy dr_sync_conflicts_select on public.dr_sync_conflicts for select to authenticated
  using (submitted_by = auth.uid() or dr_has_project_access(project_id, unit_id));

-- ── 4. A decision on a flagged report settles its sync state ────────────────
create or replace function public.dr_settle_sync_state()
returns trigger
language plpgsql
as $$
begin
  if new.review_state in ('APPROVED', 'APPROVED_WITH_REMARK')
     and old.review_state not in ('APPROVED', 'APPROVED_WITH_REMARK')
     and new.sync_state = 'REQUIRES_REVIEW' then
    new.sync_state := 'SYNCED';
  end if;
  return new;
end;
$$;
create trigger trg_dr_settle_sync_state before update of review_state on public.dr_reports
  for each row execute function public.dr_settle_sync_state();

-- ── 5. Grant issue and revocation ───────────────────────────────────────────
create or replace function public.dr_issue_offline_grant(
  p_actor uuid, p_device_id uuid, p_label text default null, p_user_agent text default null,
  p_grace_hours int default 72
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.dr_devices%rowtype;
  v_units  uuid[];
  v_grant  public.dr_offline_grants%rowtype;
begin
  perform dr_set_actor(p_actor);
  if p_device_id is null then
    raise exception 'DR_REQ_FIELD: a device id is required';
  end if;

  select * into v_device from dr_devices where id = p_device_id;
  if found and v_device.user_id <> p_actor then
    raise exception 'DR_FORBIDDEN: this device is registered to another user';
  end if;
  if found and v_device.revoked_at is not null then
    raise exception 'DR_FORBIDDEN: offline use has been revoked for this device';
  end if;

  insert into dr_devices (id, user_id, label, user_agent) values (p_device_id, p_actor, p_label, p_user_agent)
  on conflict (id) do update set last_seen_at = now(), label = coalesce(excluded.label, dr_devices.label),
                                 user_agent = coalesce(excluded.user_agent, dr_devices.user_agent);

  select coalesce(array_agg(m.unit_id), '{}') into v_units
  from dr_reporting_unit_members m
  join dr_reporting_units u on u.id = m.unit_id
  where m.user_id = p_actor and m.status = 'active' and m.member_role = 'REPORTER'
    and m.valid_from <= current_date and (m.valid_to is null or m.valid_to >= current_date)
    and u.status = 'Active';

  -- A device that checks in often keeps one grant, extended each time, as long
  -- as the units it covers are unchanged. A new grant is cut when they change.
  update dr_offline_grants g
     set expires_at = now() + make_interval(hours => least(greatest(p_grace_hours, 1), 168))
   where g.id = (
           select id from dr_offline_grants
           where user_id = p_actor and device_id = p_device_id and revoked_at is null and expires_at > now()
             and unit_ids @> v_units and unit_ids <@ v_units
           order by issued_at desc limit 1)
  returning * into v_grant;

  if v_grant.id is null then
    insert into dr_offline_grants (user_id, device_id, unit_ids, expires_at)
    values (p_actor, p_device_id, v_units, now() + make_interval(hours => least(greatest(p_grace_hours, 1), 168)))
    returning * into v_grant;
  end if;

  return jsonb_build_object('grant_id', v_grant.id, 'issued_at', v_grant.issued_at,
                            'expires_at', v_grant.expires_at, 'unit_ids', to_jsonb(v_units));
end;
$$;

-- Administrator revokes a user's offline access (lost phone, leaver). Reports
-- already written under a grant are still accepted, flagged for review.
create or replace function public.dr_revoke_offline_access(p_actor uuid, p_user_id uuid, p_device_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  perform dr_set_actor(p_actor);
  if not is_admin(p_actor) and p_actor <> p_user_id then
    raise exception 'DR_FORBIDDEN: only an administrator or the user can revoke offline access';
  end if;
  update dr_offline_grants set revoked_at = now()
   where user_id = p_user_id and revoked_at is null and (p_device_id is null or device_id = p_device_id);
  get diagnostics v_count = row_count;
  update dr_devices set revoked_at = now()
   where user_id = p_user_id and revoked_at is null and (p_device_id is null or id = p_device_id);
  perform dr_audit(null, null, null, null, 'DR.OFFLINE_ACCESS_REVOKED', p_actor, null,
                   jsonb_build_object('user_id', p_user_id, 'device_id', p_device_id, 'grants', v_count));
  return v_count;
end;
$$;

-- ── 6. Push of a report written offline ─────────────────────────────────────
create or replace function public.dr_submit_offline_report(
  p_actor uuid, p_unit_id uuid, p_report_date date, p_report_kind text, p_payload jsonb,
  p_idempotency_key text, p_client_created_at timestamptz, p_grant_id uuid, p_device_id uuid,
  p_rule_results jsonb default '[]'::jsonb, p_evidence jsonb default '[]'::jsonb,
  p_expected_evidence int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit       public.dr_reporting_units%rowtype;
  v_grant      public.dr_offline_grants%rowtype;
  v_existing   public.dr_report_versions%rowtype;
  v_conflict   public.dr_sync_conflicts%rowtype;
  v_report     public.dr_reports%rowtype;
  v_sched      record;
  v_deadline   timestamptz;
  v_late       boolean;
  v_backdated  boolean;
  v_reasons    text[] := '{}';
  v_incoming   jsonb;
  v_version_no int := 1;
  v_kind       text := 'ORIGINAL';
  v_version_id uuid;
  v_warnings   int;
  v_incidents  int;
  v_sync       text;
  v_received   int;
  v_error      text;
  v_href       text;
  r            uuid;
begin
  perform dr_set_actor(p_actor);

  if coalesce(btrim(p_idempotency_key), '') = '' then
    raise exception 'DR_IDEMPOTENCY: an idempotency key is required';
  end if;
  if p_report_kind not in ('WORK', 'NO_WORK') then
    raise exception 'DR_REQ_FIELD: report kind must be WORK or NO_WORK';
  end if;
  select * into v_unit from dr_reporting_units where id = p_unit_id;
  if not found then
    raise exception 'DR_INV_UNIT: reporting unit not found';
  end if;

  -- Replay: the same queued item pushed twice returns what happened the first time.
  select * into v_existing from dr_report_versions
  where project_id = v_unit.project_id and idempotency_key = p_idempotency_key;
  if found then
    select * into v_report from dr_reports where id = v_existing.report_id;
    return jsonb_build_object('outcome', 'ACCEPTED', 'report_id', v_report.id, 'report_no', v_report.report_no,
                              'version_no', v_existing.version_no, 'sync_state', v_report.sync_state,
                              'review_flags', to_jsonb(v_report.review_flags), 'replayed', true);
  end if;
  select * into v_conflict from dr_sync_conflicts
  where project_id = v_unit.project_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('outcome', v_conflict.kind, 'conflict_id', v_conflict.id,
                              'existing_report_id', v_conflict.existing_report_id, 'replayed', true);
  end if;

  -- The one hard refusal: no grant ever covered this user, device, unit and time.
  select * into v_grant from dr_offline_grants
  where id = p_grant_id and user_id = p_actor and device_id = p_device_id and p_unit_id = any (unit_ids);
  if not found
     or p_client_created_at is null
     or p_client_created_at < v_grant.issued_at - interval '10 minutes'
     or p_client_created_at > v_grant.expires_at then
    raise exception 'DR_FORBIDDEN: no offline authorisation covers this report';
  end if;

  -- Everything else is a reason for review, never for dropping the report.
  if v_grant.revoked_at is not null then
    v_reasons := array_append(v_reasons, 'offline_grant_revoked');
  end if;
  if not exists (
    select 1 from dr_reporting_unit_members m
    where m.unit_id = p_unit_id and m.user_id = p_actor and m.status = 'active' and m.member_role = 'REPORTER'
      and m.valid_from <= current_date and (m.valid_to is null or m.valid_to >= current_date)
  ) then
    v_reasons := array_append(v_reasons, 'membership_revoked');
  end if;
  if v_unit.status <> 'Active' then
    v_reasons := array_append(v_reasons, 'unit_not_active');
  end if;
  if p_client_created_at > now() + interval '10 minutes' then
    v_reasons := array_append(v_reasons, 'device_clock_ahead');
  end if;

  select * into v_sched from dr_unit_schedule(p_unit_id);
  if p_report_date > (now() at time zone v_sched.timezone)::date then
    v_reasons := array_append(v_reasons, 'future_date');
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_rule_results, '[]'::jsonb)) x where x->>'severity' = 'ERROR') then
    v_reasons := array_append(v_reasons, 'rule_errors');
  end if;
  if exists (select 1 from dr_reporting_unit_wbs_scope s where s.unit_id = p_unit_id) and exists (
    with recursive scope as (
      select s.wbs_node_id as id from dr_reporting_unit_wbs_scope s where s.unit_id = p_unit_id
      union
      select n.id from wbs_nodes n join scope on n.parent_id = scope.id
    )
    select 1 from jsonb_array_elements(coalesce(p_payload->'activities', '[]'::jsonb)) a
    where nullif(a->>'task_id', '') is not null
      and not exists (select 1 from wbs_tasks t join scope on scope.id = t.wbs_node_id
                      where t.id::text = a->>'task_id')
  ) then
    v_reasons := array_append(v_reasons, 'outside_wbs_scope');
  end if;
  if p_report_kind = 'NO_WORK' and coalesce(btrim(p_payload->>'no_work_reason'), '') = '' then
    v_reasons := array_append(v_reasons, 'rule_errors');
  end if;

  v_incoming := jsonb_build_object(
    'report_kind', p_report_kind, 'payload', p_payload, 'evidence', coalesce(p_evidence, '[]'::jsonb),
    'rule_results', coalesce(p_rule_results, '[]'::jsonb), 'client_created_at', p_client_created_at,
    'expected_evidence', p_expected_evidence, 'review_flags', to_jsonb(v_reasons));
  v_href := '/dashboard/site/daily-reporting';

  perform pg_advisory_xact_lock(hashtextextended(p_unit_id::text || p_report_date::text, 0));
  select * into v_report from dr_reports where unit_id = p_unit_id and report_date = p_report_date;

  -- A report already exists for that unit and date: hold the incoming one.
  if v_report.id is not null and v_report.submission_state <> 'WITHDRAWN' then
    insert into dr_sync_conflicts (project_id, unit_id, report_date, kind, existing_report_id, incoming,
                                   submitted_by, device_id, grant_id, idempotency_key)
    values (v_unit.project_id, p_unit_id, p_report_date, 'CONFLICT', v_report.id, v_incoming,
            p_actor, p_device_id, p_grant_id, p_idempotency_key)
    returning * into v_conflict;
    update dr_reports set sync_state = 'CONFLICT' where id = v_report.id and sync_state = 'SYNCED';
    perform dr_audit(v_unit.project_id, p_unit_id, v_report.id, null, 'DR.SYNC_CONFLICT_RAISED', p_actor, 'FIELD_APP',
                     jsonb_build_object('conflict_id', v_conflict.id, 'existing_report', v_report.report_no));
    for r in select * from dr_reviewers(v_unit.project_id) loop
      perform dr_notify(v_unit.project_id, r, 'dr_requires_review', 'High',
                        'Sync conflict — ' || v_unit.display_name,
                        'An offline report for ' || p_report_date::text || ' arrived, but ' || v_report.report_no
                          || ' already exists. Choose which to keep.',
                        v_href || '?tab=review', 'dr:conflict:' || v_conflict.id, p_actor);
    end loop;
    return jsonb_build_object('outcome', 'CONFLICT', 'conflict_id', v_conflict.id,
                              'existing_report_id', v_report.id, 'report_no', v_report.report_no, 'replayed', false);
  end if;

  v_deadline  := (p_report_date + v_sched.deadline_time) at time zone v_sched.timezone;
  -- Lateness is judged on when the report was written on site, not on when
  -- the phone found a signal.
  v_late      := p_client_created_at > v_deadline;
  v_backdated := p_client_created_at > v_deadline + make_interval(hours => v_sched.late_window_hours);
  v_sync := case when array_length(v_reasons, 1) > 0 then 'REQUIRES_REVIEW'
                 when p_expected_evidence > jsonb_array_length(coalesce(p_evidence, '[]'::jsonb)) then 'EVIDENCE_PENDING'
                 else 'SYNCED' end;

  -- Store it. If the database itself cannot hold the payload (a value outside
  -- its range, a reference that does not exist), keep the submission in
  -- quarantine with the reason instead of losing it.
  begin
    if v_report.id is not null then -- a withdrawn report for the same date: continue its numbering
      v_version_no := v_report.current_version_no + 1;
      v_kind := 'CORRECTION';
      update dr_reports
         set report_kind = p_report_kind, current_version_no = v_version_no, submission_state = 'SUBMITTED',
             review_state = 'AWAITING_REVIEW', approved_version_no = null, approved_at = null, approved_by = null,
             sync_state = v_sync, review_flags = v_reasons,
             late_flag = late_flag or v_late, backdated_flag = backdated_flag or v_backdated
       where id = v_report.id
      returning * into v_report;
    else
      insert into dr_reports (report_no, project_id, unit_id, report_date, report_kind, current_version_no,
                              submission_state, assurance_state, review_state, sync_state, review_flags,
                              late_flag, backdated_flag, first_submitted_by)
      values (dr_next_report_no(extract(year from p_report_date)::int), v_unit.project_id, p_unit_id, p_report_date,
              p_report_kind, 1, 'SUBMITTED', 'NOT_APPLICABLE', 'AWAITING_REVIEW', v_sync, v_reasons,
              v_late, v_backdated, p_actor)
      returning * into v_report;
    end if;

    v_version_id := dr_write_version(p_actor, v_report, v_version_no, v_kind, p_report_kind, p_payload,
                                     p_idempotency_key, 'FIELD_APP', p_client_created_at, p_rule_results,
                                     p_evidence, null);
    insert into dr_version_origins (version_id, project_id, grant_id, device_id, client_created_at,
                                    queue_age_seconds, expected_evidence)
    values (v_version_id, v_unit.project_id, p_grant_id, p_device_id, p_client_created_at,
            greatest(extract(epoch from now() - p_client_created_at)::int, 0), greatest(p_expected_evidence, 0));
  exception when others then
    v_error := sqlerrm;
    insert into dr_sync_conflicts (project_id, unit_id, report_date, kind, incoming, submitted_by, device_id,
                                   grant_id, idempotency_key, error)
    values (v_unit.project_id, p_unit_id, p_report_date, 'QUARANTINE', v_incoming, p_actor, p_device_id,
            p_grant_id, p_idempotency_key, v_error)
    returning * into v_conflict;
    perform dr_audit(v_unit.project_id, p_unit_id, null, null, 'DR.SYNC_QUARANTINED', p_actor, 'FIELD_APP',
                     jsonb_build_object('conflict_id', v_conflict.id, 'error', v_error));
    for r in select * from dr_reviewers(v_unit.project_id) loop
      perform dr_notify(v_unit.project_id, r, 'dr_requires_review', 'High',
                        'Offline report could not be stored — ' || v_unit.display_name,
                        'A report for ' || p_report_date::text || ' written offline is held in quarantine: ' || v_error,
                        v_href || '?tab=review', 'dr:quarantine:' || v_conflict.id, p_actor);
    end loop;
    return jsonb_build_object('outcome', 'QUARANTINE', 'conflict_id', v_conflict.id, 'error', v_error, 'replayed', false);
  end;

  select count(*) into v_warnings from dr_rule_results where version_id = v_version_id and status = 'FAILED';
  update dr_reports set warning_count = v_warnings where id = v_report.id;
  update dr_missing_reports
     set status = 'Late Submitted', linked_report_id = v_report.id, closed_at = now()
   where unit_id = p_unit_id and report_date = p_report_date and status = 'Open';

  perform dr_audit(v_unit.project_id, p_unit_id, v_report.id, v_version_no, 'DR.REPORT_SYNCED', p_actor, 'FIELD_APP',
                   jsonb_build_object('report_no', v_report.report_no, 'sync_state', v_sync, 'review_flags', v_reasons,
                                      'queue_age_seconds', extract(epoch from now() - p_client_created_at)::int,
                                      'device_id', p_device_id, 'grant_id', p_grant_id, 'late', v_late));

  v_href := v_href || '?report=' || v_report.id::text;
  for r in select * from dr_reviewers(v_unit.project_id) loop
    if array_length(v_reasons, 1) > 0 then
      perform dr_notify(v_unit.project_id, r, 'dr_requires_review', 'High',
                        v_report.report_no || ' needs your review — written offline',
                        v_unit.display_name || ' · ' || p_report_date::text || ' · ' || array_to_string(v_reasons, ', '),
                        v_href, 'dr:' || v_report.id || ':v' || v_version_no || ':requires-review', p_actor);
    else
      perform dr_notify(v_unit.project_id, r, 'dr_review_required', 'High',
                        v_report.report_no || ' awaiting review',
                        v_unit.display_name || ' submitted the daily report for ' || p_report_date::text
                          || case when v_warnings > 0 then ' (' || v_warnings || ' flagged)' else '' end || '.',
                        v_href, 'dr:' || v_report.id || ':v' || v_version_no || ':review', p_actor);
    end if;
  end loop;

  select coalesce(incident_count, 0) into v_incidents from dr_safety where version_id = v_version_id;
  if coalesce(v_incidents, 0) > 0 then
    for r in
      select * from dr_reviewers(v_unit.project_id)
      union select * from dr_management(v_unit.project_id)
      union select * from dr_role_members(v_unit.project_id, 'HSE')
    loop
      perform dr_notify(v_unit.project_id, r, 'dr_safety_incident', 'Critical',
                        'Safety incident reported — ' || v_unit.display_name,
                        v_incidents || ' incident(s) recorded in ' || v_report.report_no || ' for ' || p_report_date::text
                          || ' (written offline, received now). The report is not yet reviewed.',
                        v_href, 'dr:' || v_report.id || ':v' || v_version_no || ':incident', p_actor);
    end loop;
  end if;

  perform dr_refresh_live_summary(v_unit.project_id, p_report_date);

  select count(*) into v_received from dr_evidence where version_id = v_version_id;
  return jsonb_build_object('outcome', 'ACCEPTED', 'report_id', v_report.id, 'report_no', v_report.report_no,
                            'version_no', v_version_no, 'sync_state', v_sync, 'review_flags', to_jsonb(v_reasons),
                            'evidence_received', v_received, 'replayed', false);
end;
$$;

-- ── 7. Photos that arrive after the report ──────────────────────────────────
create or replace function public.dr_attach_evidence(
  p_actor uuid, p_report_id uuid, p_version_no int, p_evidence jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report  public.dr_reports%rowtype;
  v_version public.dr_report_versions%rowtype;
  v_origin  public.dr_version_origins%rowtype;
  v_have    int;
  e         jsonb;
begin
  perform dr_set_actor(p_actor);
  select * into v_report from dr_reports where id = p_report_id for update;
  select * into v_version from dr_report_versions where report_id = p_report_id and version_no = p_version_no;
  if v_report.id is null or v_version.id is null then
    raise exception 'DR_NOT_FOUND: report version not found';
  end if;
  select * into v_origin from dr_version_origins where version_id = v_version.id;
  if not found or v_version.submitted_by is distinct from p_actor then
    raise exception 'DR_FORBIDDEN: evidence can only be completed by the person who sent the offline report';
  end if;

  for e in select * from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) loop
    select count(*) into v_have from dr_evidence where version_id = v_version.id;
    exit when v_have >= v_origin.expected_evidence;
    if exists (select 1 from dr_evidence where version_id = v_version.id and storage_key = e->>'storage_key') then
      continue;
    end if;
    if position(v_report.project_id::text || '/' || v_report.unit_id::text || '/' in e->>'storage_key') <> 1 then
      raise exception 'DR_EVIDENCE_PATH: evidence % does not belong to this unit', e->>'storage_key';
    end if;
    insert into dr_evidence (version_id, report_id, project_id, target_section, target_line_id, storage_key,
                             mime_type, size_bytes, sha256, captured_at_device, gps_lat, gps_lng, source, caption,
                             scan_status, scan_engine)
    values (v_version.id, v_report.id, v_report.project_id, coalesce(e->>'target_section', 'general'),
            e->>'target_line_id', e->>'storage_key', e->>'mime_type', (e->>'size_bytes')::bigint, e->>'sha256',
            nullif(e->>'captured_at_device', '')::timestamptz, nullif(e->>'gps_lat', '')::numeric,
            nullif(e->>'gps_lng', '')::numeric, 'FIELD_APP', e->>'caption',
            coalesce(e->>'scan_status', 'Scanning'), e->>'scan_engine');
  end loop;

  select count(*) into v_have from dr_evidence where version_id = v_version.id;
  if v_have >= v_origin.expected_evidence and v_report.sync_state = 'EVIDENCE_PENDING' then
    update dr_reports set sync_state = 'SYNCED' where id = v_report.id;
  end if;
  perform dr_audit(v_report.project_id, v_report.unit_id, v_report.id, p_version_no, 'DR.EVIDENCE_UPLOADED', p_actor,
                   'FIELD_APP', jsonb_build_object('received', v_have, 'expected', v_origin.expected_evidence));
  return jsonb_build_object('received', v_have, 'expected', v_origin.expected_evidence,
                            'complete', v_have >= v_origin.expected_evidence);
end;
$$;

-- ── 8. Conflict resolution (online only) ────────────────────────────────────
-- KEEP_EXISTING  the report already in DCOS stands; the incoming one stays on
--                file in this record.
-- KEEP_BOTH      the incoming report becomes the next version of the existing
--                report, unchanged (G2).
-- MERGE          as KEEP_BOTH, with a payload the resolver combined.
-- DISCARD        for a QUARANTINE record only, by an approver, with a reason.
create or replace function public.dr_resolve_conflict(
  p_actor uuid, p_conflict_id uuid, p_resolution text, p_payload jsonb default null, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c            public.dr_sync_conflicts%rowtype;
  v_report     public.dr_reports%rowtype;
  v_payload    jsonb;
  v_approved   boolean;
  v_version_no int;
  v_version_id uuid;
  r            uuid;
begin
  perform dr_set_actor(p_actor);
  select * into c from dr_sync_conflicts where id = p_conflict_id for update;
  if not found then
    raise exception 'DR_NOT_FOUND: conflict not found';
  end if;
  if c.status <> 'Open' then
    raise exception 'DR_STATE: this conflict is already resolved';
  end if;
  if not (dr_can_review(c.project_id, p_actor) or c.submitted_by = p_actor) then
    raise exception 'DR_FORBIDDEN: only the reporter or an approver can resolve this';
  end if;

  if c.kind = 'QUARANTINE' then
    if p_resolution <> 'DISCARD' or not dr_can_review(c.project_id, p_actor) or coalesce(btrim(p_note), '') = '' then
      raise exception 'DR_REQ_FIELD: a quarantined report can only be closed by an approver, with a reason';
    end if;
    update dr_sync_conflicts
       set status = 'Resolved — Discarded', resolution_note = p_note, resolved_by = p_actor, resolved_at = now()
     where id = c.id;
    perform dr_audit(c.project_id, c.unit_id, null, null, 'DR.SYNC_CONFLICT_RESOLVED', p_actor, null,
                     jsonb_build_object('conflict_id', c.id, 'resolution', 'DISCARD', 'note', p_note));
    return jsonb_build_object('status', 'Resolved — Discarded');
  end if;

  if p_resolution not in ('KEEP_EXISTING', 'KEEP_BOTH', 'MERGE') then
    raise exception 'DR_REQ_FIELD: unknown resolution %', p_resolution;
  end if;

  select * into v_report from dr_reports where id = c.existing_report_id for update;

  if p_resolution = 'KEEP_EXISTING' then
    update dr_sync_conflicts
       set status = 'Resolved — Kept Existing', resolution_note = p_note, resolved_by = p_actor, resolved_at = now()
     where id = c.id;
  else
    v_payload := case when p_resolution = 'MERGE' then p_payload else c.incoming->'payload' end;
    if v_payload is null then
      raise exception 'DR_REQ_FIELD: a merged report is required';
    end if;
    v_approved := v_report.review_state in ('APPROVED', 'APPROVED_WITH_REMARK');
    v_version_no := v_report.current_version_no + 1;

    update dr_reports
       set current_version_no = v_version_no,
           report_kind = coalesce(c.incoming->>'report_kind', report_kind),
           submission_state = 'SUBMITTED',
           -- An approved report stays official until the new version is approved.
           review_state = case when v_approved or review_state = 'AMENDMENT_PENDING'
                               then 'AMENDMENT_PENDING' else 'AWAITING_REVIEW' end,
           review_flags = coalesce((select array_agg(x) from jsonb_array_elements_text(c.incoming->'review_flags') x), '{}')
     where id = v_report.id
    returning * into v_report;

    -- Authorship stays with the person who wrote the report on site.
    v_version_id := dr_write_version(
      coalesce(c.submitted_by, p_actor), v_report, v_version_no,
      case when v_approved then 'AMENDMENT' else 'CORRECTION' end,
      v_report.report_kind, v_payload, c.idempotency_key, 'FIELD_APP',
      nullif(c.incoming->>'client_created_at', '')::timestamptz,
      case when p_resolution = 'MERGE' then '[]'::jsonb else c.incoming->'rule_results' end,
      c.incoming->'evidence',
      case when p_resolution = 'MERGE' then 'Merged with a report written offline' else 'Report written offline, kept after a sync conflict' end);

    insert into dr_version_origins (version_id, project_id, grant_id, device_id, client_created_at, expected_evidence)
    values (v_version_id, c.project_id, c.grant_id, c.device_id,
            nullif(c.incoming->>'client_created_at', '')::timestamptz,
            coalesce((c.incoming->>'expected_evidence')::int, 0));

    update dr_correction_requests set status = 'Resubmitted', resolved_in_version_no = v_version_no
     where report_id = v_report.id and status in ('Sent', 'Acknowledged');
    update dr_sync_conflicts
       set status = case when p_resolution = 'MERGE' then 'Resolved — Merged' else 'Resolved — Kept Both' end,
           resolution_note = p_note, resulting_version_no = v_version_no, resolved_by = p_actor, resolved_at = now()
     where id = c.id;

    for r in select * from dr_reviewers(c.project_id) loop
      perform dr_notify(c.project_id, r, 'dr_review_required', 'High',
                        v_report.report_no || ' has a new version from a sync conflict',
                        'Version ' || v_version_no || ' awaits your review.',
                        '/dashboard/site/daily-reporting?report=' || v_report.id::text,
                        'dr:' || v_report.id || ':v' || v_version_no || ':review', p_actor);
    end loop;
  end if;

  -- The existing report leaves CONFLICT once no conflict on it is open.
  update dr_reports r set sync_state = case when array_length(r.review_flags, 1) > 0 then 'REQUIRES_REVIEW' else 'SYNCED' end
   where r.id = c.existing_report_id and r.sync_state = 'CONFLICT'
     and not exists (select 1 from dr_sync_conflicts x where x.existing_report_id = r.id and x.status = 'Open');

  perform dr_audit(c.project_id, c.unit_id, c.existing_report_id, v_version_no, 'DR.SYNC_CONFLICT_RESOLVED', p_actor, null,
                   jsonb_build_object('conflict_id', c.id, 'resolution', p_resolution, 'note', p_note));
  perform dr_refresh_live_summary(c.project_id, c.report_date);
  return jsonb_build_object('status', (select status from dr_sync_conflicts where id = c.id),
                            'report_id', c.existing_report_id, 'version_no', v_version_no);
end;
$$;

-- ── 9. Grants: service role only ────────────────────────────────────────────
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('dr_issue_offline_grant', 'dr_revoke_offline_access', 'dr_submit_offline_report',
                        'dr_attach_evidence', 'dr_resolve_conflict')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

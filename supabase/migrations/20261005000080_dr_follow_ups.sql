-- Module 10-01 Daily Reporting, Phase 3: follow-up records in other modules
-- (design 16, 19).
--
-- A daily report mentions things that belong to other registers: an issue
-- that needs a design answer, an inspection that was asked for, an incident,
-- the day's toolbox talk. Until now those were text in the report. This file
-- lets them become real records, each linked back to the report line it came
-- from:
--
--   issue line        -> design_rfi            raised by the approver
--   inspection line   -> inspection_requests   raised by the approver
--   safety section    -> hse_incidents         raised by the approver
--   toolbox talk held -> hse_toolbox_talks     written automatically on approval
--
-- The approver raises the first three deliberately, one at a time, and
-- completes what the report does not hold (a title, a type, a severity): not
-- every issue is an RFI, and a count of incidents is not an incident record.
-- Nothing a reporter typed becomes a record in another module by itself,
-- except the toolbox talk of an approved report.
--
-- Depends on: design_rfi (20260531000040), inspection_requests
-- (20260531000010), hse_incidents and hse_toolbox_talks (20260531000046).

create table public.dr_follow_ups (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.dr_reports(id) on delete cascade,
  version_no int not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id    uuid,
  kind       text not null check (kind in ('RFI', 'INSPECTION_REQUEST', 'HSE_INCIDENT', 'TOOLBOX_TALK')),
  section    text not null,
  -- The report line it came from; 'incident-<n>' and 'toolbox' for the safety section.
  line_id    text not null,
  -- Row in the other module. No foreign key: the kind decides the table.
  target_id  uuid not null,
  reference  text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (report_id, kind, line_id)
);
create index idx_dr_follow_ups_project on public.dr_follow_ups(project_id, created_at desc);

alter table public.dr_follow_ups enable row level security;
revoke all on public.dr_follow_ups from anon, authenticated;
grant select on public.dr_follow_ups to authenticated;
grant all on public.dr_follow_ups to service_role;
-- Whoever may see the whole project's reports; a reporting unit does not.
create policy dr_follow_ups_select on public.dr_follow_ups for select to authenticated
  using (dr_can_view_project(project_id));

-- ── Raise one record ────────────────────────────────────────────────────────
create or replace function public.dr_raise_follow_up(
  p_actor uuid, p_report_id uuid, p_kind text, p_line_id text default null, p_fields jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report  public.dr_reports%rowtype;
  v_version public.dr_report_versions%rowtype;
  v_unit    text;
  v_line    jsonb;
  v_line_id text := p_line_id;
  v_section text;
  v_n       int;
  v_ref     text;
  v_target  uuid;
  v_source  text;
  v_text    text;
  f         jsonb := coalesce(p_fields, '{}'::jsonb);
begin
  perform dr_set_actor(p_actor);
  select * into v_report from dr_reports where id = p_report_id for update;
  if not found then
    raise exception 'DR_NOT_FOUND: report not found';
  end if;
  if not dr_can_review(v_report.project_id, p_actor) then
    raise exception 'DR_FORBIDDEN: only an approver of the project can raise a follow-up record';
  end if;
  if v_report.submission_state = 'WITHDRAWN' then
    raise exception 'DR_STATE: the report was withdrawn';
  end if;
  select * into v_version from dr_report_versions
  where report_id = v_report.id and version_no = v_report.current_version_no;
  select display_name into v_unit from dr_reporting_units where id = v_report.unit_id;
  v_source := 'Raised from daily report ' || v_report.report_no || ' (' || coalesce(v_unit, 'reporting unit') || ', '
              || v_report.report_date || ').';
  select count(*) + 1 into v_n from dr_follow_ups where report_id = v_report.id and kind = p_kind;

  if p_kind = 'RFI' then
    v_section := 'issues';
    select x into v_line from jsonb_array_elements(coalesce(v_version.payload->'issues', '[]'::jsonb)) x
    where x->>'line_id' = p_line_id;
    if v_line is null then
      raise exception 'DR_NOT_FOUND: that issue is not on the current version of the report';
    end if;
    if exists (select 1 from dr_follow_ups where report_id = v_report.id and kind = p_kind and line_id = p_line_id) then
      raise exception 'DR_STATE: an RFI was already raised for this issue';
    end if;
    if btrim(coalesce(f->>'title', '')) = '' then
      raise exception 'DR_REQ_FIELD: give the RFI a title';
    end if;
    -- The design RFI lists are per discipline, so an RFI without one would be seen by nobody.
    if f->>'discipline' is null or f->>'discipline' not in ('arc', 'str', 'mep') then
      raise exception 'DR_REQ_FIELD: choose the discipline that should answer';
    end if;
    v_ref := 'RFI-' || v_report.report_no || '-' || v_n;
    v_text := coalesce(nullif(btrim(f->>'question'), ''), v_line->>'description');
    insert into design_rfi (project_id, discipline, rfi_no, title, question, priority, due_date, created_by)
    values (
      v_report.project_id,
      f->>'discipline',
      v_ref, left(btrim(f->>'title'), 200), v_text || E'\n\n' || v_source,
      case when f->>'priority' in ('low', 'normal', 'high', 'critical') then f->>'priority'
           else case v_line->>'severity' when 'LOW' then 'low' when 'HIGH' then 'high' when 'CRITICAL' then 'critical' else 'normal' end end,
      nullif(f->>'due_date', '')::date, p_actor)
    returning id into v_target;

  elsif p_kind = 'INSPECTION_REQUEST' then
    v_section := 'inspections';
    select x into v_line from jsonb_array_elements(coalesce(v_version.payload->'inspections', '[]'::jsonb)) x
    where x->>'line_id' = p_line_id;
    if v_line is null then
      raise exception 'DR_NOT_FOUND: that inspection line is not on the current version of the report';
    end if;
    if exists (select 1 from dr_follow_ups where report_id = v_report.id and kind = p_kind and line_id = p_line_id) then
      raise exception 'DR_STATE: an inspection request was already raised for this line';
    end if;
    v_ref := 'IR-' || v_report.report_no || '-' || v_n;
    insert into inspection_requests (project_id, wbs_node_id, ir_number, location, requested_by, request_date,
                                     inspection_date, status, notes)
    values (
      v_report.project_id,
      (select n.id from wbs_nodes n where n.id = nullif(v_line->>'wbs_node_id', '')::uuid and n.project_id = v_report.project_id),
      v_ref, nullif(btrim(f->>'location'), ''), v_version.submitted_by, v_report.report_date,
      nullif(f->>'inspection_date', '')::date, 'submitted',
      concat_ws(E'\n', nullif(btrim(f->>'notes'), ''),
                case when nullif(v_line->>'reference', '') is not null then 'Site reference: ' || (v_line->>'reference') end,
                v_source))
    returning id into v_target;

  elsif p_kind = 'HSE_INCIDENT' then
    v_section := 'safety';
    v_line_id := 'incident-' || v_n;
    if f->>'incident_type' is null or f->>'incident_type' not in
       ('near_miss', 'first_aid', 'medical_treatment', 'lost_time', 'fatality', 'property_damage', 'environmental') then
      raise exception 'DR_REQ_FIELD: choose the type of incident';
    end if;
    if btrim(coalesce(f->>'description', '')) = '' then
      raise exception 'DR_REQ_FIELD: describe the incident';
    end if;
    v_ref := 'INC-' || v_report.report_no || '-' || v_n;
    insert into hse_incidents (project_id, incident_number, incident_type, incident_date, location, description,
                               immediate_action, severity, reported_by)
    values (
      v_report.project_id, v_ref, f->>'incident_type', v_report.report_date, nullif(btrim(f->>'location'), ''),
      btrim(f->>'description') || E'\n\n' || v_source, nullif(btrim(f->>'immediate_action'), ''),
      case when f->>'severity' in ('minor', 'moderate', 'serious', 'critical') then f->>'severity' else 'minor' end,
      v_unit)
    returning id into v_target;

  else
    raise exception 'DR_REQ_FIELD: unknown kind of follow-up record';
  end if;

  insert into dr_follow_ups (report_id, version_no, project_id, unit_id, kind, section, line_id, target_id, reference, created_by)
  values (v_report.id, v_report.current_version_no, v_report.project_id, v_report.unit_id, p_kind, v_section, v_line_id,
          v_target, v_ref, p_actor);
  perform dr_audit(v_report.project_id, v_report.unit_id, v_report.id, v_report.current_version_no, 'DR.FOLLOW_UP_RAISED',
                   p_actor, 'WEB', jsonb_build_object('kind', p_kind, 'line_id', v_line_id, 'reference', v_ref, 'target_id', v_target));
  return jsonb_build_object('kind', p_kind, 'line_id', v_line_id, 'reference', v_ref, 'target_id', v_target);
end;
$$;

revoke all on function public.dr_raise_follow_up(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.dr_raise_follow_up(uuid, uuid, text, text, jsonb) to service_role;

-- ── Toolbox talk of an approved report ──────────────────────────────────────
-- Once per report. A failure here must never stop an approval.
create or replace function public.dr_record_toolbox_talk()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_unit    text;
  v_target  uuid;
begin
  if new.approved_version_no is null or new.approved_version_no is not distinct from old.approved_version_no then
    return new;
  end if;
  begin
    if exists (select 1 from dr_follow_ups where report_id = new.id and kind = 'TOOLBOX_TALK') then
      return new;
    end if;
    select payload into v_payload from dr_report_versions
    where report_id = new.id and version_no = new.approved_version_no;
    if coalesce((v_payload->'safety'->>'toolbox_talk_held')::boolean, false) is not true then
      return new;
    end if;
    select display_name into v_unit from dr_reporting_units where id = new.unit_id;

    insert into hse_toolbox_talks (project_id, talk_date, topic, attendees_count, notes, created_by)
    values (
      new.project_id, new.report_date, 'Daily toolbox talk: ' || coalesce(v_unit, 'reporting unit'),
      (select coalesce(sum(nullif(m->>'reported_count', '')::numeric), 0)::int
       from jsonb_array_elements(coalesce(v_payload->'manpower', '[]'::jsonb)) m),
      'Recorded from approved daily report ' || new.report_no || '. Attendance is the manpower reported that day.',
      (select u.id from auth.users u where u.id = new.approved_by))
    returning id into v_target;

    insert into dr_follow_ups (report_id, version_no, project_id, unit_id, kind, section, line_id, target_id, reference, created_by)
    values (new.id, new.approved_version_no, new.project_id, new.unit_id, 'TOOLBOX_TALK', 'safety', 'toolbox', v_target,
            'Toolbox talk ' || new.report_date, new.approved_by);
  exception when others then
    raise warning 'dr_record_toolbox_talk: % (report %)', sqlerrm, new.report_no;
  end;
  return new;
end;
$$;

revoke all on function public.dr_record_toolbox_talk() from public, anon, authenticated;

drop trigger if exists trg_dr_record_toolbox_talk on public.dr_reports;
create trigger trg_dr_record_toolbox_talk
  after update of approved_version_no on public.dr_reports
  for each row execute function public.dr_record_toolbox_talk();

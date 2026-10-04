-- Migration: 20261004000012_dr_legacy_backfill.sql
-- Purpose: Module 10-01 Daily Reporting, Phase 1A — cut-over helper (see
--          Phase0-04-Cutover-Plan.md, stages S2–S4). Defines
--          dr_backfill_project(); it is NOT run by this migration. An
--          administrator runs it per project before switching dr_enabled on.
-- Behaviour:
--   - One IN_HOUSE_TEAM unit 'LEGACY' per project holds every imported report:
--     the old model has no reporting unit, so imported history cannot be
--     attributed to a subcontractor.
--   - One dr_reports row + version 1 (channel IMPORT) per old report date. Where
--     the old table holds several reports for one date, the most recently
--     updated one is imported and the others are listed in the result.
--   - Old drafts are not imported.
--   - Old 'verified_by_pm' / 'closed' become APPROVED with imported_flag set.
--     Planning is never re-synced: the old flow already pushed that data.
--   - Idempotent: a report already imported (source_site_report_id) is skipped.
-- Depends on: 20261004000010, 20261004000011, public.site_daily_reports,
--             public.site_daily_report_activities, public.site_manpower

create or replace function public.dr_backfill_project(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit     public.dr_reporting_units%rowtype;
  o          record;
  v_report   public.dr_reports%rowtype;
  v_payload  jsonb;
  v_version  uuid;
  v_approved boolean;
  v_imported int := 0;
  v_skipped  jsonb := '[]'::jsonb;
  v_drafts   int := 0;
begin
  select * into v_unit from dr_reporting_units where project_id = p_project_id and unit_code = 'LEGACY';
  if not found then
    insert into dr_reporting_units (project_id, unit_code, unit_type, display_name, status)
    values (p_project_id, 'LEGACY', 'IN_HOUSE_TEAM', 'Imported site diary (legacy)', 'Demobilised')
    returning * into v_unit;
  end if;

  select count(*) into v_drafts from site_daily_reports where project_id = p_project_id and status = 'draft';

  for o in
    select s.*,
           row_number() over (partition by s.report_date order by s.updated_at desc) as rn
    from site_daily_reports s
    where s.project_id = p_project_id and s.status <> 'draft'
  loop
    if o.rn > 1 then
      v_skipped := v_skipped || jsonb_build_object('site_report_id', o.id, 'report_date', o.report_date,
                                                   'reason', 'older duplicate for the same date');
      continue;
    end if;
    if exists (select 1 from dr_reports r where r.source_site_report_id = o.id) then
      continue;
    end if;
    if exists (select 1 from dr_reports r where r.unit_id = v_unit.id and r.report_date = o.report_date) then
      v_skipped := v_skipped || jsonb_build_object('site_report_id', o.id, 'report_date', o.report_date,
                                                   'reason', 'date already imported from another report');
      continue;
    end if;

    v_payload := jsonb_build_object(
      'schema_version', 1,
      'imported_from', 'site_daily_reports',
      'weather', jsonb_build_object(
        'condition', o.weather_conditions,
        'note', nullif(concat_ws(' ', o.site_conditions,
                 case when o.temperature_low is not null or o.temperature_high is not null
                      then '(' || coalesce(o.temperature_low::text, '?') || '–' || coalesce(o.temperature_high::text, '?') || ' °C)' end), '')),
      'work_summary', o.work_summary,
      'issues', case when coalesce(btrim(o.issues_encountered), '') = '' then '[]'::jsonb
                     else jsonb_build_array(jsonb_build_object('line_id', 'i1', 'description', o.issues_encountered)) end,
      'next_day', case when coalesce(btrim(o.planned_next_day), '') = '' then '[]'::jsonb
                       else jsonb_build_array(jsonb_build_object('line_id', 'n1', 'description', o.planned_next_day)) end,
      'manpower', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'line_id', 'm' || m.id::text, 'trade', m.trade, 'reported_count', m.total_workers,
                 'hours', coalesce(m.regular_hours, 0) + coalesce(m.ot_hours, 0)))
        from site_manpower m where m.project_id = p_project_id and m.report_date = o.report_date), '[]'::jsonb),
      'activities', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'line_id', 'a' || a.id::text, 'task_id', a.task_id, 'work_status', a.activity_status,
                 'progress_before', a.progress_before, 'progress_today', a.progress_today,
                 'reported_qty', a.quantity_done, 'uom', a.quantity_unit, 'trade_code', a.trade_code,
                 'headcount', a.headcount, 'hours_normal', a.hours_normal, 'hours_ot', a.hours_ot,
                 'step_progress', coalesce(a.step_progress, '[]'::jsonb),
                 'actual_start_date', a.actual_start_date, 'actual_finish_date', a.actual_finish_date,
                 'remarks', a.work_description))
        from site_daily_report_activities a where a.daily_report_id = o.id), '[]'::jsonb),
      'delays', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'line_id', 'd' || a.id::text,
                 'cause_category', case a.delay_category
                                     when 'weather' then 'WEATHER' when 'material' then 'MATERIAL_SUPPLY'
                                     when 'labor' then 'CONTRACTOR_CAUSED' when 'subcontractor' then 'SUBCONTRACTOR_CAUSED'
                                     when 'rfi_design' then 'DESIGN_INFORMATION' when 'client' then 'EMPLOYER_CAUSED'
                                     else 'OTHER' end,
                 'description', coalesce(a.delay_reason, 'Delay recorded in site diary'),
                 'hours_lost', a.delay_hours_lost, 'task_id', a.task_id, 'notice_required', false))
        from site_daily_report_activities a where a.daily_report_id = o.id and a.has_delay), '[]'::jsonb));

    v_approved := o.status in ('verified_by_pm', 'closed');

    insert into dr_reports (report_no, project_id, unit_id, report_date, report_kind, current_version_no,
                            approved_version_no, submission_state, assurance_state, review_state, sync_state,
                            imported_flag, first_submitted_at, first_submitted_by, approved_at, approved_by,
                            source_site_report_id)
    values (dr_next_report_no(extract(year from o.report_date)::int), p_project_id, v_unit.id, o.report_date, 'WORK', 1,
            case when v_approved then 1 end, 'SUBMITTED', 'NOT_APPLICABLE',
            case when v_approved then 'APPROVED' else 'AWAITING_REVIEW' end, 'SYNCED', true,
            coalesce(o.submitted_at, o.created_at), coalesce(o.submitted_by, o.created_by),
            case when v_approved then coalesce(o.verified_at, o.updated_at) end,
            case when v_approved then o.verified_by end, o.id)
    returning * into v_report;

    insert into dr_report_versions (report_id, project_id, unit_id, version_no, version_kind, report_kind, payload,
                                    content_hash, submitted_by, submitted_at, client_created_at, idempotency_key,
                                    channel, change_reason)
    values (v_report.id, p_project_id, v_unit.id, 1, 'ORIGINAL', 'WORK', v_payload,
            encode(sha256(convert_to(v_payload::text, 'UTF8')), 'hex'),
            coalesce(o.submitted_by, o.created_by), coalesce(o.submitted_at, o.created_at), o.created_at,
            'import:' || o.id::text, 'IMPORT', 'Imported from site_daily_reports')
    returning id into v_version;

    perform dr_project_version(v_version);
    perform dr_audit(p_project_id, v_unit.id, v_report.id, 1, 'DR.REPORT_IMPORTED', auth.uid(), 'IMPORT',
                     jsonb_build_object('site_report_id', o.id, 'old_status', o.status));
    perform dr_refresh_live_summary(p_project_id, o.report_date);
    v_imported := v_imported + 1;
  end loop;

  return jsonb_build_object('imported', v_imported, 'drafts_not_imported', v_drafts, 'skipped', v_skipped,
                            'legacy_unit_id', v_unit.id);
end;
$$;

revoke all on function public.dr_backfill_project(uuid) from public, anon, authenticated;
grant execute on function public.dr_backfill_project(uuid) to service_role;

comment on function public.dr_backfill_project(uuid) is
  'Module 10-01 cut-over: imports a project''s legacy site_daily_reports into dr_reports as '
  'version 1 (channel IMPORT). Idempotent. Does not touch planning tables.';

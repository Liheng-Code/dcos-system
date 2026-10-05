-- Module 10-01 Daily Reporting, Phase 2: PHOTO_REUSE (design 10.2).
--
-- A photo gets a perceptual hash when it is registered (computed by the upload
-- gateway, 16 hex characters). The rules engine compares a new photo with the
-- unit's earlier ones and warns the approver when one is the same file or
-- looks the same.
--
--   1. dr_evidence.phash, written once at insert like the SHA-256. The
--      existing guard already refuses any later change to it.
--   2. dr_write_version and dr_attach_evidence store it and carry it forward.
--      Their bodies are otherwise unchanged; grants are kept by "or replace".
--   3. The PHOTO_REUSE rule definition.
--
-- Photos registered before this migration have no hash and are compared by
-- SHA-256 only.

alter table public.dr_evidence add column if not exists phash text
  check (phash is null or phash ~ '^[0-9a-f]{16}$');

comment on column public.dr_evidence.phash is
  'Perceptual (difference) hash of a photo, 64 bits as hex. Null for PDFs, undecodable files and rows older than this column.';

CREATE OR REPLACE FUNCTION public.dr_write_version(p_actor uuid, p_report dr_reports, p_version_no integer, p_kind text, p_report_kind text, p_payload jsonb, p_idempotency_key text, p_channel text, p_client_created_at timestamp with time zone, p_rule_results jsonb, p_evidence jsonb, p_change_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                               gps_lat, gps_lng, source, caption, scan_status, scan_engine, phash)
      values (v_version_id, p_report.id, p_report.project_id,
              coalesce(e->>'target_section', v_prev.target_section), coalesce(e->>'target_line_id', v_prev.target_line_id),
              v_prev.wbs_node_id, v_prev.storage_key, v_prev.mime_type, v_prev.size_bytes, v_prev.sha256,
              v_prev.captured_at_device, v_prev.received_at_server, v_prev.gps_lat, v_prev.gps_lng, v_prev.source,
              coalesce(e->>'caption', v_prev.caption), v_prev.scan_status, v_prev.scan_engine, v_prev.phash);
    else
      if position(p_report.project_id::text || '/' || p_report.unit_id::text || '/' in e->>'storage_key') <> 1 then
        raise exception 'DR_EVIDENCE_PATH: evidence % does not belong to this unit', e->>'storage_key';
      end if;
      insert into dr_evidence (version_id, report_id, project_id, target_section, target_line_id, wbs_node_id,
                               storage_key, mime_type, size_bytes, sha256, captured_at_device, gps_lat, gps_lng,
                               source, caption, scan_status, scan_engine, phash)
      values (v_version_id, p_report.id, p_report.project_id,
              coalesce(e->>'target_section', 'general'), e->>'target_line_id', nullif(e->>'wbs_node_id', '')::uuid,
              e->>'storage_key', e->>'mime_type', (e->>'size_bytes')::bigint, e->>'sha256',
              nullif(e->>'captured_at_device', '')::timestamptz,
              nullif(e->>'gps_lat', '')::numeric, nullif(e->>'gps_lng', '')::numeric,
              case p_channel when 'TELEGRAM_MINIAPP' then 'MINIAPP' when 'FIELD_APP' then 'FIELD_APP'
                             when 'IMPORT' then 'IMPORT' else 'WEB' end,
              e->>'caption', coalesce(e->>'scan_status', 'Scanning'), e->>'scan_engine', nullif(e->>'phash', ''));
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
$function$;

CREATE OR REPLACE FUNCTION public.dr_attach_evidence(p_actor uuid, p_report_id uuid, p_version_no integer, p_evidence jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                             scan_status, scan_engine, phash)
    values (v_version.id, v_report.id, v_report.project_id, coalesce(e->>'target_section', 'general'),
            e->>'target_line_id', e->>'storage_key', e->>'mime_type', (e->>'size_bytes')::bigint, e->>'sha256',
            nullif(e->>'captured_at_device', '')::timestamptz, nullif(e->>'gps_lat', '')::numeric,
            nullif(e->>'gps_lng', '')::numeric, 'FIELD_APP', e->>'caption',
            coalesce(e->>'scan_status', 'Scanning'), e->>'scan_engine', nullif(e->>'phash', ''));
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
$function$;

insert into public.dr_rule_definitions (project_id, rule_code, point, severity, params, min_history_days) values
  (null, 'PHOTO_REUSE', 'POST_SUBMIT', 'WARNING', '{"max_distance": 5, "lookback_days": 60}', 0)
on conflict do nothing;

-- Migration: 20260919000016_programme_transmittal.sql
-- Purpose: Planning & Scheduling Completion Plan Continuation, R2.3 — close
--          the transmittal gap left by 20260919000010: that migration adds
--          plan_schedule_revisions.transmittal_id but never CREATES the
--          transmittal. This migration supplies create_programme_transmittal(),
--          which finds the client-approved revision's project, ensures the
--          'Programme' document type, files the revision as a documents row,
--          sequences and issues a transmittal (existing Document Control
--          tables), links it, and records the link.
-- Depends on:
--   public.plan_schedule_revisions / plan_schedule_streams (20260905100449,
--     status/transmittal_id columns added by 20260919000010)
--   public.transmittals / transmittal_documents / transmittal_running_numbers
--     (20260527000029_create_transmittal_tables.sql)
--   public.documents / public.document_types (20260527000010_create_document_control.sql)
--   public.has_permission(text,text,text) (20260919000001)
--
-- Schema verification notes:
--   - document_types columns confirmed: id, code (NOT NULL), name (NOT NULL),
--     description, is_active boolean default true. A 'Programme' type is
--     ensured below (upsert on code 'PRG') so PRG-R{n} documents always have
--     a home; existing row wins, never duplicated.
--   - documents columns confirmed: project_id NOT NULL, wbs_node_id FK null,
--     document_type_id NOT NULL, document_number NOT NULL, title NOT NULL,
--     discipline null, status check includes 'ifc', current_revision int
--     default 0, created_by NOT NULL, created_at/updated_at. The document is
--     inserted with current_revision left at its default 0 (the snapshot is
--     the transmittal payload; no physical revision is uploaded here).
--   - transmittals columns confirmed: project_id NOT NULL, transmittal_code
--     NOT NULL unique(project_id, transmittal_code), issuer_company_id NOT
--     NULL, receiver_stakeholder_id NOT NULL, subject null, status check
--     ('draft','sent'), sent_at, created_by NOT NULL, created_at/updated_at.
--   - transmittal_running_numbers columns confirmed: project_id NOT NULL
--     UNIQUE, last_sequence int NOT NULL default 0, created_at/updated_at.
--   - transmittal code format: no existing project uses a documented code
--     mask; `TRM-{sequence:4}` is chosen below (mirrors nothing, collides
--     with nothing, unique per project by construction). Sequence is
--     race-safe: the running-number row is locked FOR UPDATE inside the
--     transaction the RPC runs in (a single-statement call).
--   - RLS: the writes below go through the caller's own RLS. plan members
--     holding ('planning','programme','approve') — L0-L4/PE per
--     20260919000007 — can pass the transmittals/documents policies (both are
--     still permissive catch-alls in the applied Phase-1 schema; the
--     20260919000008 set covers the planning side). The permission CHECK in
--     the function body is the real gate.

create or replace function public.create_programme_transmittal(
  p_revision_id          uuid,
  p_issuer_company_id    uuid,
  p_receiver_stakeholder_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_project_id   uuid;
  v_stream_name  text;
  v_status       text;
  v_rev_number   int;
  v_type_id      uuid;
  v_doc_id       uuid;
  v_doc_number   text;
  v_seq          int;
  v_code         text;
  v_transmittal_id uuid;
begin
  select pss.project_id, pss.name, pr.status, pr.revision_number
    into v_project_id, v_stream_name, v_status, v_rev_number
  from public.plan_schedule_revisions pr
  join public.plan_schedule_streams pss on pss.id = pr.stream_id
  where pr.id = p_revision_id;

  if v_project_id is null then
    raise exception 'Revision % not found', p_revision_id;
  end if;

  if v_status <> 'approved_client' then
    raise exception 'Only a client-approved revision can be transmitted (status is %)', v_status;
  end if;

  if not public.has_permission('planning', 'programme', 'approve') then
    raise exception 'You do not have permission to transmit a programme revision';
  end if;

  -- 1. Ensure the Programme document type (upsert on code).
  insert into public.document_types (code, name, description, is_active)
  values ('PRG', 'Programme', 'Issued programme / schedule revision', true)
  on conflict (code) do nothing;

  select id into v_type_id
  from public.document_types
  where code = 'PRG'
  limit 1;

  -- 2. File the revision as a documents row.
  v_doc_number := 'PRG-R' || v_rev_number::text;

  insert into public.documents
    (project_id, wbs_node_id, document_type_id, document_number, title, status, created_by)
  values
    (v_project_id, null, v_type_id, v_doc_number,
     'Programme revision ' || v_rev_number || ' — ' || coalesce(v_stream_name, 'Programme'),
     'ifc', auth.uid())
  returning id into v_doc_id;

  -- 3. Sequence the transmittal code (race-safe lock).
  insert into public.transmittal_running_numbers (project_id, last_sequence)
  values (v_project_id, 0)
  on conflict (project_id) do nothing;

  select last_sequence into v_seq
  from public.transmittal_running_numbers
  where project_id = v_project_id
  for update;

  v_seq := v_seq + 1;
  v_code := 'TRM-' || lpad(v_seq::text, 4, '0');

  update public.transmittal_running_numbers
  set last_sequence = v_seq, updated_at = now()
  where project_id = v_project_id;

  -- 4. Issue the transmittal and link the document.
  insert into public.transmittals
    (project_id, transmittal_code, issuer_company_id, receiver_stakeholder_id,
     subject, status, sent_at, created_by)
  values
    (v_project_id, v_code, p_issuer_company_id, p_receiver_stakeholder_id,
     'Transmission of approved programme revision ' || v_rev_number,
     'sent', now(), auth.uid())
  returning id into v_transmittal_id;

  insert into public.transmittal_documents (transmittal_id, document_id)
  values (v_transmittal_id, v_doc_id);

  -- 5. Link back onto the revision.
  update public.plan_schedule_revisions
  set transmittal_id = v_transmittal_id
  where id = p_revision_id;

  -- 6. Audit (additive action — no alert trigger matches it, by design).
  insert into public.wbs_audit_log
    (project_id, wbs_task_id, wbs_node_id, user_id, action, field_name, old_value, new_value)
  values
    (v_project_id, null, null, auth.uid(), 'Transmittal Created', 'transmittal_code', null, v_code);

  return jsonb_build_object(
    'transmittal_id',  v_transmittal_id,
    'transmittal_code', v_code,
    'document_id',     v_doc_id,
    'document_number', v_doc_number
  );
end;
$$;

grant execute on function public.create_programme_transmittal(uuid, uuid, uuid) to authenticated;
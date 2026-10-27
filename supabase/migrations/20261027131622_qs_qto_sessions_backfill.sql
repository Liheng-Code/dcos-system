-- Migration: 20261027131622_qs_qto_sessions_backfill.sql
-- Purpose: Quantity Take-off P0 seed and backfill (follows 20261027131621_qs_qto_sessions.sql):
--   1. RBAC actions qto_sessions / qto_publish / qto_transfer / qto_rules, derived from the
--      existing qto_* matrix (20260805000002) so every role keeps its current reach.
--   2. A global default measurement ruleset "DCOS-STD" v1 (approved).
--   3. V1 items (tender-scoped, no session) are placed in one migrated session per tender.
--   4. tenant_id on the existing qto_* rows, from the creator's company.
-- Idempotent: re-running changes nothing.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. RBAC
-- ──────────────────────────────────────────────────────────────────────────
-- qto_sessions: the session register; same reach as qto_register (create, edit, submit, cancel = delete).
insert into public.role_permissions (role_code, module, action, view, can_create, edit, delete, submit, approve,
                                     reject, export, transmit, configure, reassign, scope)
select role_code, 'qto', 'qto_sessions', view, can_create, edit, delete, submit, false, false, export, false,
       false, false, scope
  from public.role_permissions where module = 'qto' and action = 'qto_register'
on conflict (role_code, module, action) do nothing;

-- qto_publish: whoever may approve may publish.
insert into public.role_permissions (role_code, module, action, view, approve, scope)
select role_code, 'qto', 'qto_publish', view, approve, scope
  from public.role_permissions where module = 'qto' and action = 'qto_approval'
on conflict (role_code, module, action) do nothing;

-- qto_transfer: whoever may map to the BOQ may transfer (submit).
insert into public.role_permissions (role_code, module, action, view, submit, scope)
select role_code, 'qto', 'qto_transfer', view, can_create, scope
  from public.role_permissions where module = 'qto' and action = 'qto_boq_mapping'
on conflict (role_code, module, action) do nothing;

-- qto_rules: everyone with the dashboard may read the rules; MD and GM may configure them.
insert into public.role_permissions (role_code, module, action, view, configure, scope)
select role_code, 'qto', 'qto_rules', view, role_code in ('L1', 'L2'), scope
  from public.role_permissions where module = 'qto' and action = 'qto_dashboard'
on conflict (role_code, module, action) do nothing;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Default ruleset (global: tenant_id null, read-only for tenants)
-- ──────────────────────────────────────────────────────────────────────────
do $$
declare v_set uuid; v_ver uuid;
begin
  select id into v_set from public.qto_measurement_rulesets where tenant_id is null and code = 'DCOS-STD';
  if v_set is null then
    insert into public.qto_measurement_rulesets (tenant_id, code, name, description, standard, created_by)
    values (null, 'DCOS-STD', 'DCOS standard measurement rules',
            'Default company rules: net measurement, explicit deductions, authorised factors only, rounding at the final stage to 3 dp.',
            'Company', null)
    returning id into v_set;
  end if;

  if not exists (select 1 from public.qto_measurement_rule_versions where ruleset_id = v_set and version_no = 1) then
    insert into public.qto_measurement_rule_versions (ruleset_id, version_no, status, definition, change_note, created_by)
    values (v_set, 1, 'draft', $json$
{
  "rounding": {"stage": "final", "dp": 3, "mode": "half_up"},
  "validations": {"max_variance_pct": 25, "max_dimension_m": 500},
  "factors": [
    {"name": "Waste", "min": 1, "max": 1.2},
    {"name": "Lap", "min": 1, "max": 1.3},
    {"name": "Bulking", "min": 1, "max": 1.5},
    {"name": "Compaction", "min": 1, "max": 1.5},
    {"name": "Repeat", "min": 1, "max": 1000}
  ],
  "rules": [
    {"code": "VOL-LWD", "name": "Volume L × W × D", "unit": "m3", "formula": "L * W * D",
     "inputs": [{"name": "L", "unit": "m"}, {"name": "W", "unit": "m"}, {"name": "D", "unit": "m"}],
     "deduction_policy": "Deduct voids and openings over 0.05 m3", "allowed_factors": ["Waste", "Repeat"]},
    {"code": "VOL-AT", "name": "Volume area × thickness", "unit": "m3", "formula": "A * T",
     "inputs": [{"name": "A", "unit": "m2"}, {"name": "T", "unit": "m"}],
     "deduction_policy": "Deduct voids and openings over 0.05 m3", "allowed_factors": ["Waste", "Repeat"]},
    {"code": "AREA-LW", "name": "Area L × W", "unit": "m2", "formula": "L * W",
     "inputs": [{"name": "L", "unit": "m"}, {"name": "W", "unit": "m"}],
     "deduction_policy": "Deduct openings over 0.5 m2", "allowed_factors": ["Waste", "Lap", "Repeat"]},
    {"code": "AREA-MEAS", "name": "Measured area", "unit": "m2", "formula": "A",
     "inputs": [{"name": "A", "unit": "m2"}],
     "deduction_policy": "Deduct openings over 0.5 m2", "allowed_factors": ["Waste", "Lap", "Repeat"]},
    {"code": "LEN-MEAS", "name": "Measured length", "unit": "m", "formula": "L",
     "inputs": [{"name": "L", "unit": "m"}],
     "deduction_policy": "None", "allowed_factors": ["Waste", "Lap", "Repeat"]},
    {"code": "COUNT", "name": "Count", "unit": "No.", "formula": "N",
     "inputs": [{"name": "N", "unit": "No."}],
     "deduction_policy": "None", "allowed_factors": ["Repeat"]},
    {"code": "FREE", "name": "Free formula (allowlisted operators)", "unit": null, "formula": null,
     "inputs": [], "deduction_policy": "As stated on the item", "allowed_factors": ["Waste", "Lap", "Bulking", "Compaction", "Repeat"]}
  ]
}
$json$::jsonb, 'Initial company ruleset', null)
    returning id into v_ver;
    update public.qto_measurement_rule_versions set status = 'approved' where id = v_ver;
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. tenant_id on existing rows (creator's company, else the main company)
-- ──────────────────────────────────────────────────────────────────────────
do $$
declare v_main uuid;
begin
  select company_id into v_main from public.profiles where company_id is not null
   group by company_id order by count(*) desc limit 1;

  update public.qto_document_register d set tenant_id = coalesce(
    (select company_id from public.profiles where id = d.created_by), v_main) where tenant_id is null;
  update public.qto_drawing_register d set tenant_id = coalesce(
    (select company_id from public.profiles where id = d.uploaded_by), v_main) where tenant_id is null;
  update public.qto_drawing_revisions r set tenant_id = coalesce(
    (select company_id from public.profiles where id = r.uploaded_by), v_main) where tenant_id is null;
  -- Items, measurements and calculations: the migrated version is still open, so the edit guard allows this.
  update public.qto_items i set tenant_id = coalesce(
    (select company_id from public.profiles where id = i.prepared_by), v_main) where tenant_id is null;
  update public.qto_measurements m set tenant_id = coalesce(
    (select company_id from public.profiles where id = m.created_by), v_main) where tenant_id is null;
  update public.qto_calculations c set tenant_id = coalesce(
    (select company_id from public.profiles where id = c.created_by), v_main) where tenant_id is null;
end $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. One migrated session per tender for V1 items without a version
-- ──────────────────────────────────────────────────────────────────────────
do $$
declare
  t         record;
  v_session uuid;
  v_version uuid;
  v_ruleset uuid;
  v_rev     uuid;
  v_all_ok  boolean;
begin
  select v.id into v_ruleset from public.qto_measurement_rule_versions v
    join public.qto_measurement_rulesets r on r.id = v.ruleset_id
   where r.tenant_id is null and r.code = 'DCOS-STD' and v.version_no = 1;

  for t in
    select i.tender_id, min(i.tenant_id::text)::uuid as tenant_id, tr.project_id
      from public.qto_items i join public.tender_register tr on tr.id = i.tender_id
     where i.session_version_id is null
     group by i.tender_id, tr.project_id
  loop
    select drawing_revision_id into v_rev from public.qto_items
     where tender_id = t.tender_id and session_version_id is null and drawing_revision_id is not null
     group by drawing_revision_id order by count(*) desc, drawing_revision_id limit 1;

    insert into public.qto_sessions (tenant_id, tender_id, project_id, session_code, name, description, purpose)
    values (t.tenant_id, t.tender_id, t.project_id,
            'QTS-' || lpad(((select count(*) from public.qto_sessions where tender_id = t.tender_id) + 1)::text, 3, '0'),
            'Take-off (migrated from V1)', 'Items measured before take-off sessions existed.', 'TENDER')
    returning id into v_session;

    insert into public.qto_session_versions (tenant_id, session_id, version_no, reason, drawing_revision_id,
                                             ruleset_version_id, status)
    values (t.tenant_id, v_session, 1, 'Migrated from item-level take-off (V1)', v_rev, v_ruleset, 'IN_PROGRESS')
    returning id into v_version;

    update public.qto_sessions set current_version_id = v_version where id = v_session;

    update public.qto_items
       set session_version_id = v_version,
           quantity_status = case when confidence = 'PROVISIONAL' then 'PROVISIONAL' else quantity_status end,
           provisional_assumption = case when confidence = 'PROVISIONAL'
                                         then coalesce(provisional_assumption, assumption, 'Marked PROVISIONAL in V1')
                                         else provisional_assumption end
     where tender_id = t.tender_id and session_version_id is null;

    -- Fully approved V1 tenders become an approved (not yet published) version.
    select bool_and(status in ('APPROVED', 'POSTED TO BOQ')) into v_all_ok
      from public.qto_items where session_version_id = v_version;
    if v_all_ok then
      update public.qto_session_versions
         set status = 'APPROVED',
             approved_by = (select max(approved_by::text)::uuid from public.qto_items where session_version_id = v_version),
             approved_at = (select max(approved_date) from public.qto_items where session_version_id = v_version)
       where id = v_version;
    end if;

    insert into public.qto_version_reviews (tenant_id, version_id, from_status, to_status, comment)
    values (t.tenant_id, v_version, null,
            (select status from public.qto_session_versions where id = v_version),
            'Migrated from V1 item-level take-off');
  end loop;
end $$;

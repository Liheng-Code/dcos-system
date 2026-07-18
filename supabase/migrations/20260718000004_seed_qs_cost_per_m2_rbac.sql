-- Migration: 20260718000004_seed_qs_cost_per_m2_rbac.sql
-- Purpose: RBAC rows for the GFA/Cost-per-m2 report per DCOS-QS-GDL-001 V1.1 §5 /
--          design doc §5 (BR-G7) — sell-basis vs cost-basis dual-rate firewall.
-- Depends on: role_permissions (20260527000002_create_rbac_tables.sql),
--             roles seed (20260527000003_seed_rbac_data.sql),
--             pattern precedent: 20260612000001_qs_rbac_and_vo_approvals.sql

-- ─── QS Module Role Permissions: Cost / m² ───────────────────────────────────
INSERT INTO public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, transmit, configure, reassign, scope)
VALUES
  -- COST PER M2 (sell-basis, incl. OH&P) — reporting-only action, same broad
  -- view/export visibility as the existing 'boq'/'claims' rows (L6 excluded,
  -- matching the existing precedent that plain Staff don't see company/project
  -- financial reports either).
  ('L0',      'qs','cost_per_m2', true,  false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('L1',      'qs','cost_per_m2', true,  false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('L2',      'qs','cost_per_m2', true,  false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('L3',      'qs','cost_per_m2', true,  false, false, false, false, false, false, true,  false, false, false, 'project'),
  ('QS',      'qs','cost_per_m2', true,  false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('AC',      'qs','cost_per_m2', true,  false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('L4',      'qs','cost_per_m2', true,  false, false, false, false, false, false, false, false, false, false, 'project'),
  ('L5',      'qs','cost_per_m2', true,  false, false, false, false, false, false, false, false, false, false, 'project'),
  ('L6',      'qs','cost_per_m2', false, false, false, false, false, false, false, false, false, false, false, null),
  ('EXT-CLT', 'qs','cost_per_m2', true,  false, false, false, false, false, false, false, false, false, false, 'project'),
  ('EXT-CON', 'qs','cost_per_m2', true,  false, false, false, false, false, false, false, false, false, false, 'project'),
  ('EXT-SUB', 'qs','cost_per_m2', true,  false, false, false, false, false, false, false, false, false, false, 'project'),

  -- COST PER M2 INTERNAL (cost-basis, no-margin) — QS Manager+ tier only, per
  -- SOP-QS-05A / BR-G7: view = true ONLY for L0/L1/L2/QS, false for every other
  -- role including client-facing exports (EXT-CLT/EXT-CON/EXT-SUB never see this).
  ('L0',      'qs','cost_per_m2_internal', true,  false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('L1',      'qs','cost_per_m2_internal', true,  false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('L2',      'qs','cost_per_m2_internal', true,  false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('QS',      'qs','cost_per_m2_internal', true,  false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('L3',      'qs','cost_per_m2_internal', false, false, false, false, false, false, false, false, false, false, false, null),
  ('L4',      'qs','cost_per_m2_internal', false, false, false, false, false, false, false, false, false, false, false, null),
  ('L5',      'qs','cost_per_m2_internal', false, false, false, false, false, false, false, false, false, false, false, null),
  ('L6',      'qs','cost_per_m2_internal', false, false, false, false, false, false, false, false, false, false, false, null),
  ('AC',      'qs','cost_per_m2_internal', false, false, false, false, false, false, false, false, false, false, false, null),
  ('EXT-CLT', 'qs','cost_per_m2_internal', false, false, false, false, false, false, false, false, false, false, false, null),
  ('EXT-CON', 'qs','cost_per_m2_internal', false, false, false, false, false, false, false, false, false, false, false, null),
  ('EXT-SUB', 'qs','cost_per_m2_internal', false, false, false, false, false, false, false, false, false, false, false, null)

ON CONFLICT (role_code, module, action) DO NOTHING;

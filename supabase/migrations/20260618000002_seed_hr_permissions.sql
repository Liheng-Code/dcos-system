-- Seed HR module role permissions
-- Matrix source: DCOS_HR_ELeave_Module_Design_R1_Full.docx §8 Role Permission Matrix

INSERT INTO public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, transmit, configure, reassign, scope)
VALUES
  -- ── APPLY LEAVE ───────────────────────────────────────────────────────────
  ('L0',  'hr','apply_leave',     false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L1',  'hr','apply_leave',     false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L2',  'hr','apply_leave',     false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L3',  'hr','apply_leave',     true,  true,  false, false, false, false, false, false, false, false, false, 'department'),
  ('L4',  'hr','apply_leave',     true,  true,  false, false, false, false, false, false, false, false, false, 'department'),
  ('L5',  'hr','apply_leave',     true,  true,  false, false, false, false, false, false, false, false, false, 'own'),
  ('L6',  'hr','apply_leave',     true,  true,  false, false, false, false, false, false, false, false, false, 'own'),
  ('HR',  'hr','apply_leave',     true,  true,  false, false, false, false, false, false, false, false, false, 'company'),
  ('AC',  'hr','apply_leave',     true,  true,  false, false, false, false, false, false, false, false, false, 'own'),

  -- ── CANCEL LEAVE ──────────────────────────────────────────────────────────
  ('L0',  'hr','cancel_leave',    false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L1',  'hr','cancel_leave',    false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L2',  'hr','cancel_leave',    false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L3',  'hr','cancel_leave',    false, false, false, false, true,  false, false, false, false, false, false, 'department'),
  ('L4',  'hr','cancel_leave',    false, false, false, false, true,  false, false, false, false, false, false, 'department'),
  ('L5',  'hr','cancel_leave',    false, false, false, false, true,  false, false, false, false, false, false, 'own'),
  ('L6',  'hr','cancel_leave',    false, false, false, false, true,  false, false, false, false, false, false, 'own'),
  ('HR',  'hr','cancel_leave',    false, false, false, false, true,  false, false, false, false, false, false, 'company'),
  ('AC',  'hr','cancel_leave',    false, false, false, false, true,  false, false, false, false, false, false, 'own'),

  -- ── APPROVE LEAVE ─────────────────────────────────────────────────────────
  ('L0',  'hr','approve_leave',   false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L1',  'hr','approve_leave',   false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L2',  'hr','approve_leave',   false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L3',  'hr','approve_leave',   false, false, false, false, false, true,  false, false, false, false, true,  'department'),
  ('L4',  'hr','approve_leave',   false, false, false, false, false, true,  false, false, false, false, true,  'department'),
  ('L5',  'hr','approve_leave',   false, false, false, false, false, true,  false, false, false, false, false, 'department'),
  ('L6',  'hr','approve_leave',   false, false, false, false, false, false, false, false, false, false, false, null),
  ('HR',  'hr','approve_leave',   false, false, false, false, false, true,  false, false, false, false, true,  'company'),
  ('AC',  'hr','approve_leave',   false, false, false, false, false, false, false, false, false, false, false, null),

  -- ── REJECT LEAVE ──────────────────────────────────────────────────────────
  ('L0',  'hr','reject_leave',    false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L1',  'hr','reject_leave',    false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L2',  'hr','reject_leave',    false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L3',  'hr','reject_leave',    false, false, false, false, false, false, true,  false, false, false, false, 'department'),
  ('L4',  'hr','reject_leave',    false, false, false, false, false, false, true,  false, false, false, false, 'department'),
  ('L5',  'hr','reject_leave',    false, false, false, false, false, false, true,  false, false, false, false, 'department'),
  ('L6',  'hr','reject_leave',    false, false, false, false, false, false, false, false, false, false, false, null),
  ('HR',  'hr','reject_leave',    false, false, false, false, false, false, true,  false, false, false, false, 'company'),
  ('AC',  'hr','reject_leave',    false, false, false, false, false, false, false, false, false, false, false, null),

  -- ── VIEW BALANCE ──────────────────────────────────────────────────────────
  ('L0',  'hr','view_balance',    false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L1',  'hr','view_balance',    false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L2',  'hr','view_balance',    false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L3',  'hr','view_balance',    true,  false, false, false, false, false, false, false, false, false, false, 'department'),
  ('L4',  'hr','view_balance',    true,  false, false, false, false, false, false, false, false, false, false, 'department'),
  ('L5',  'hr','view_balance',    true,  false, false, false, false, false, false, false, false, false, false, 'own'),
  ('L6',  'hr','view_balance',    true,  false, false, false, false, false, false, false, false, false, false, 'own'),
  ('HR',  'hr','view_balance',    true,  false, false, false, false, false, false, false, false, false, false, 'company'),
  ('AC',  'hr','view_balance',    true,  false, false, false, false, false, false, false, false, false, false, 'own'),

  -- ── ADJUST BALANCE ────────────────────────────────────────────────────────
  ('L0',  'hr','adjust_balance',  false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L1',  'hr','adjust_balance',  false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L2',  'hr','adjust_balance',  false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L3',  'hr','adjust_balance',  false, false, false, false, false, false, false, false, false, false, false, null),
  ('L4',  'hr','adjust_balance',  false, false, false, false, false, false, false, false, false, false, false, null),
  ('L5',  'hr','adjust_balance',  false, false, false, false, false, false, false, false, false, false, false, null),
  ('L6',  'hr','adjust_balance',  false, false, false, false, false, false, false, false, false, false, false, null),
  ('HR',  'hr','adjust_balance',  false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('AC',  'hr','adjust_balance',  false, false, false, false, false, false, false, false, false, false, false, null),

  -- ── EXPORT REPORT ─────────────────────────────────────────────────────────
  ('L0',  'hr','export_report',   false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L1',  'hr','export_report',   false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L2',  'hr','export_report',   false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L3',  'hr','export_report',   false, false, false, false, false, false, false, true,  false, false, false, 'department'),
  ('L4',  'hr','export_report',   false, false, false, false, false, false, false, true,  false, false, false, 'department'),
  ('L5',  'hr','export_report',   false, false, false, false, false, false, false, false, false, false, false, null),
  ('L6',  'hr','export_report',   false, false, false, false, false, false, false, false, false, false, false, null),
  ('HR',  'hr','export_report',   false, false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('AC',  'hr','export_report',   false, false, false, false, false, false, false, true,  false, false, false, 'company'),

  -- ── DELETE LEAVE ──────────────────────────────────────────────────────────
  ('L0',  'hr','delete_leave',    false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L1',  'hr','delete_leave',    false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L2',  'hr','delete_leave',    false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L3',  'hr','delete_leave',    false, false, false, false, false, false, false, false, false, false, false, null),
  ('L4',  'hr','delete_leave',    false, false, false, false, false, false, false, false, false, false, false, null),
  ('L5',  'hr','delete_leave',    false, false, false, false, false, false, false, false, false, false, false, null),
  ('L6',  'hr','delete_leave',    false, false, false, false, false, false, false, false, false, false, false, null),
  ('HR',  'hr','delete_leave',    false, false, false, false, false, false, false, false, false, false, false, null),
  ('AC',  'hr','delete_leave',    false, false, false, false, false, false, false, false, false, false, false, null),

  -- ── CONFIGURE POLICY ──────────────────────────────────────────────────────
  ('L0',  'hr','configure_policy', false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L1',  'hr','configure_policy', false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L2',  'hr','configure_policy', false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L3',  'hr','configure_policy', false, false, false, false, false, false, false, false, false, false, false, null),
  ('L4',  'hr','configure_policy', false, false, false, false, false, false, false, false, false, false, false, null),
  ('L5',  'hr','configure_policy', false, false, false, false, false, false, false, false, false, false, false, null),
  ('L6',  'hr','configure_policy', false, false, false, false, false, false, false, false, false, false, false, null),
  ('HR',  'hr','configure_policy', false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('AC',  'hr','configure_policy', false, false, false, false, false, false, false, false, false, false, false, null),

  -- ── CONFIGURE HOLIDAY ─────────────────────────────────────────────────────
  ('L0',  'hr','configure_holiday', false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L1',  'hr','configure_holiday', false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L2',  'hr','configure_holiday', false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('L3',  'hr','configure_holiday', false, false, false, false, false, false, false, false, false, false, false, null),
  ('L4',  'hr','configure_holiday', false, false, false, false, false, false, false, false, false, false, false, null),
  ('L5',  'hr','configure_holiday', false, false, false, false, false, false, false, false, false, false, false, null),
  ('L6',  'hr','configure_holiday', false, false, false, false, false, false, false, false, false, false, false, null),
  ('HR',  'hr','configure_holiday', false, false, false, false, false, false, false, false, false, true,  false, 'company'),
  ('AC',  'hr','configure_holiday', false, false, false, false, false, false, false, false, false, false, false, null)

ON CONFLICT (role_code, module, action) DO NOTHING;

-- QS module: add unique constraint for VO approval steps + seed role permissions

ALTER TABLE public.qs_vo_approvals
  ADD CONSTRAINT qs_vo_approvals_vo_step_unique UNIQUE (vo_id, step);

-- ─── QS Module Role Permissions ──────────────────────────────────────────────
INSERT INTO public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, transmit, configure, reassign, scope)
VALUES
  -- COST LIBRARY
  ('L0',      'qs','cost_library', true,  true,  true,  true,  false, false, false, true,  false, true,  false, 'company'),
  ('L1',      'qs','cost_library', true,  true,  true,  true,  false, false, false, true,  false, true,  false, 'company'),
  ('L2',      'qs','cost_library', true,  true,  true,  true,  false, false, false, true,  false, false, false, 'company'),
  ('L3',      'qs','cost_library', true,  false, false, false, false, false, false, false, false, false, false, 'company'),
  ('QS',      'qs','cost_library', true,  true,  true,  true,  false, false, false, true,  false, true,  false, 'company'),
  ('AC',      'qs','cost_library', true,  false, false, false, false, false, false, false, false, false, false, 'company'),
  ('L4',      'qs','cost_library', true,  false, false, false, false, false, false, false, false, false, false, 'company'),
  ('L5',      'qs','cost_library', true,  false, false, false, false, false, false, false, false, false, false, 'company'),
  ('L6',      'qs','cost_library', false, false, false, false, false, false, false, false, false, false, false, null),
  ('EXT-CLT', 'qs','cost_library', false, false, false, false, false, false, false, false, false, false, false, null),
  ('EXT-CON', 'qs','cost_library', true,  false, false, false, false, false, false, false, false, false, false, 'company'),

  -- BILL OF QUANTITIES
  ('L0',      'qs','boq', true,  true,  true,  true,  true,  true,  true,  true,  false, true,  false, 'company'),
  ('L1',      'qs','boq', true,  true,  true,  true,  true,  true,  true,  true,  false, true,  false, 'company'),
  ('L2',      'qs','boq', true,  true,  true,  true,  true,  true,  true,  true,  false, false, false, 'company'),
  ('L3',      'qs','boq', true,  true,  true,  true,  true,  true,  false, true,  false, false, false, 'project'),
  ('QS',      'qs','boq', true,  true,  true,  true,  true,  false, false, true,  false, false, false, 'company'),
  ('AC',      'qs','boq', true,  false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('L4',      'qs','boq', true,  false, false, false, false, false, false, false, false, false, false, 'project'),
  ('L5',      'qs','boq', true,  false, false, false, false, false, false, false, false, false, false, 'project'),
  ('L6',      'qs','boq', false, false, false, false, false, false, false, false, false, false, false, null),
  ('EXT-CLT', 'qs','boq', true,  false, false, false, false, false, false, false, false, false, false, 'project'),
  ('EXT-CON', 'qs','boq', true,  false, false, false, false, false, false, false, false, false, false, 'project'),
  ('EXT-SUB', 'qs','boq', true,  false, false, false, false, false, false, false, false, false, false, 'project'),

  -- COST TRANSACTIONS
  ('L0',      'qs','costs', true,  true,  true,  true,  true,  true,  true,  true,  false, true,  false, 'company'),
  ('L1',      'qs','costs', true,  true,  true,  true,  true,  true,  true,  true,  false, true,  false, 'company'),
  ('L2',      'qs','costs', true,  true,  true,  true,  true,  true,  true,  true,  false, false, false, 'company'),
  ('L3',      'qs','costs', true,  true,  true,  false, true,  true,  true,  true,  false, false, false, 'project'),
  ('QS',      'qs','costs', true,  true,  true,  true,  true,  false, false, true,  false, false, false, 'company'),
  ('AC',      'qs','costs', true,  true,  true,  false, true,  true,  false, true,  false, false, false, 'company'),
  ('L4',      'qs','costs', true,  false, false, false, false, false, false, false, false, false, false, 'project'),
  ('L5',      'qs','costs', true,  true,  false, false, false, false, false, false, false, false, false, 'own'),
  ('L6',      'qs','costs', false, false, false, false, false, false, false, false, false, false, false, null),
  ('EXT-CLT', 'qs','costs', true,  false, false, false, false, false, false, false, false, false, false, 'project'),
  ('EXT-CON', 'qs','costs', true,  false, false, false, false, false, false, false, false, false, false, 'project'),

  -- VARIATION ORDERS
  ('L0',      'qs','variation_orders', true,  true,  true,  true,  true,  true,  true,  true,  false, true,  false, 'company'),
  ('L1',      'qs','variation_orders', true,  true,  true,  true,  true,  true,  true,  true,  false, true,  false, 'company'),
  ('L2',      'qs','variation_orders', true,  true,  true,  true,  true,  true,  true,  true,  false, false, false, 'company'),
  ('L3',      'qs','variation_orders', true,  true,  true,  false, true,  true,  true,  true,  false, false, false, 'project'),
  ('QS',      'qs','variation_orders', true,  true,  true,  true,  true,  true,  true,  true,  false, false, false, 'company'),
  ('AC',      'qs','variation_orders', true,  false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('L4',      'qs','variation_orders', true,  false, false, false, false, false, false, false, false, false, false, 'project'),
  ('L5',      'qs','variation_orders', true,  false, false, false, false, false, false, false, false, false, false, 'project'),
  ('L6',      'qs','variation_orders', false, false, false, false, false, false, false, false, false, false, false, null),
  ('EXT-CLT', 'qs','variation_orders', true,  false, false, false, false, true,  true,  false, false, false, false, 'project'),
  ('EXT-CON', 'qs','variation_orders', true,  false, false, false, false, false, false, false, false, false, false, 'project'),

  -- PROGRESS CLAIMS (IPC)
  ('L0',      'qs','claims', true,  true,  true,  true,  true,  true,  true,  true,  false, true,  false, 'company'),
  ('L1',      'qs','claims', true,  true,  true,  true,  true,  true,  true,  true,  false, true,  false, 'company'),
  ('L2',      'qs','claims', true,  true,  true,  true,  true,  true,  true,  true,  false, false, false, 'company'),
  ('L3',      'qs','claims', true,  true,  true,  false, true,  true,  true,  true,  false, false, false, 'project'),
  ('QS',      'qs','claims', true,  true,  true,  true,  true,  false, false, true,  false, false, false, 'company'),
  ('AC',      'qs','claims', true,  false, false, false, false, true,  false, true,  false, false, false, 'company'),
  ('L4',      'qs','claims', true,  false, false, false, false, false, false, false, false, false, false, 'project'),
  ('L5',      'qs','claims', true,  false, false, false, false, false, false, false, false, false, false, 'project'),
  ('L6',      'qs','claims', false, false, false, false, false, false, false, false, false, false, false, null),
  ('EXT-CLT', 'qs','claims', true,  false, false, false, false, true,  true,  false, false, false, false, 'project'),
  ('EXT-CON', 'qs','claims', true,  false, false, false, false, true,  true,  false, false, false, false, 'project'),
  ('EXT-SUB', 'qs','claims', true,  false, false, false, false, false, false, false, false, false, false, 'own'),

  -- RETENTION REGISTER
  ('L0',      'qs','retention', true,  true,  true,  true,  true,  true,  true,  true,  false, true,  false, 'company'),
  ('L1',      'qs','retention', true,  true,  true,  true,  true,  true,  true,  true,  false, true,  false, 'company'),
  ('L2',      'qs','retention', true,  true,  true,  true,  true,  true,  true,  true,  false, false, false, 'company'),
  ('L3',      'qs','retention', true,  false, false, false, true,  false, false, true,  false, false, false, 'project'),
  ('QS',      'qs','retention', true,  true,  false, false, true,  false, false, true,  false, false, false, 'company'),
  ('AC',      'qs','retention', true,  false, false, false, false, true,  false, true,  false, false, false, 'company'),
  ('L4',      'qs','retention', true,  false, false, false, false, false, false, false, false, false, false, 'project'),
  ('L5',      'qs','retention', true,  false, false, false, false, false, false, false, false, false, false, 'project'),
  ('L6',      'qs','retention', false, false, false, false, false, false, false, false, false, false, false, null),
  ('EXT-CLT', 'qs','retention', true,  false, false, false, false, true,  false, false, false, false, false, 'project'),
  ('EXT-CON', 'qs','retention', true,  false, false, false, false, false, false, false, false, false, false, 'project'),
  ('EXT-SUB', 'qs','retention', true,  false, false, false, false, false, false, false, false, false, false, 'own')

ON CONFLICT (role_code, module, action) DO NOTHING;

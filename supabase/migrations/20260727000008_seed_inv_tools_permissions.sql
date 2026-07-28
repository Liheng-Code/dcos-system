-- Migration: 20260727000008_seed_inv_tools_permissions.sql
-- Purpose: CWIMS Stage 1+2 gap-closure — seed role_permissions for the new 'tools' action
--          in the inventory module (tool custody: register / issue / return).
-- Depends on: role_permissions (20260527000002), roles seeded (20260527000003),
--             20260621000002_seed_inv_permissions.sql (established pattern)
--
-- Note on 'returns': the inventory module already has a 'material_return' action seeded
-- in 20260621000002_seed_inv_permissions.sql, covering exactly the return-to-store
-- workflow the new inv_returns/inv_return_lines tables implement (SK and SS already have
-- create/submit there, and QS already has approve/export). That action key is reused as-is
-- for inv_returns rather than seeding a duplicate 'returns' action — no new rows are added
-- for returns in this migration.

-- Column order: role_code, module, action,
--               view, can_create, edit, delete, submit, approve, reject,
--               export, transmit, configure, reassign, scope

insert into public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, transmit, configure, reassign, scope)
values

  -- ── Tools (serialized returnable tool custody) ────────────────────────────
  ('L0',  'inventory', 'tools', true, true,  true,  true,  true,  true,  true,  true,  false, true,  false, 'company'),
  ('L1',  'inventory', 'tools', true, true,  true,  true,  true,  true,  true,  true,  false, false, false, 'company'),
  -- L2: warehouse-manager-equivalent, full company-wide access
  ('L2',  'inventory', 'tools', true, true,  true,  true,  true,  true,  true,  true,  false, false, false, 'company'),
  -- L3: warehouse-manager-equivalent, full project-scoped access
  ('L3',  'inventory', 'tools', true, true,  true,  false, true,  true,  true,  false, false, false, false, 'project'),
  ('L4',  'inventory', 'tools', true, false, false, false, false, false, false, false, false, false, false, 'project'),
  ('L5',  'inventory', 'tools', true, false, false, false, false, false, false, false, false, false, false, 'project'),
  ('L6',  'inventory', 'tools', true, false, false, false, false, false, false, false, false, false, false, 'project'),
  ('PO',  'inventory', 'tools', true, false, false, false, false, false, false, false, false, false, false, 'company'),
  -- Storekeeper: register (create), issue + return (edit), issue action (submit)
  ('SK',  'inventory', 'tools', true, true,  true,  false, true,  false, false, false, false, false, false, 'project'),
  -- Site Supervisor: approve issuance of restricted (is_restricted) tools
  ('SS',  'inventory', 'tools', true, false, false, false, false, true,  true,  false, false, false, false, 'project'),
  ('QS',  'inventory', 'tools', true, false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('AC',  'inventory', 'tools', true, false, false, false, false, false, false, false, false, false, false, 'company'),
  ('QA',  'inventory', 'tools', true, false, false, false, false, false, false, false, false, false, false, 'project'),
  ('EXT-AUD', 'inventory', 'tools', true, false, false, false, false, false, false, false, false, false, false, 'company')

on conflict (role_code, module, action) do nothing;

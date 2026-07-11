-- Migration: 20260621000002_seed_inv_permissions.sql
-- Purpose: Seed role_permissions for the INV (Inventory/Stock) module
-- Spec: docs/03-Business-Modules/26-INV-Inventory/07-Permission-Matrix.md
-- Depends on: role_permissions table (20260527000002), roles seeded (20260527000003)

-- Column order: role_code, module, action,
--               view, can_create, edit, delete, submit, approve, reject,
--               export, transmit, configure, reassign, scope

insert into public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, transmit, configure, reassign, scope)
values

  -- ── Item Master ────────────────────────────────────────────────────────────
  -- L0/L1/L2 = full access; PO = create/edit; all others = view only
  ('L0',  'inventory', 'item_master', true, true,  true,  true,  false, false, false, true,  false, true,  false, 'company'),
  ('L1',  'inventory', 'item_master', true, true,  true,  true,  false, false, false, true,  false, false, false, 'company'),
  ('L2',  'inventory', 'item_master', true, true,  true,  true,  false, false, false, true,  false, false, false, 'company'),
  ('L3',  'inventory', 'item_master', true, false, false, false, false, false, false, false, false, false, false, 'project'),
  ('L4',  'inventory', 'item_master', true, false, false, false, false, false, false, false, false, false, false, 'project'),
  ('L5',  'inventory', 'item_master', true, false, false, false, false, false, false, false, false, false, false, 'project'),
  ('L6',  'inventory', 'item_master', true, false, false, false, false, false, false, false, false, false, false, 'project'),
  ('PO',  'inventory', 'item_master', true, true,  true,  false, false, false, false, false, false, false, false, 'company'),
  ('SK',  'inventory', 'item_master', true, false, false, false, false, false, false, false, false, false, false, 'project'),
  ('SS',  'inventory', 'item_master', true, false, false, false, false, false, false, false, false, false, false, 'project'),
  ('QS',  'inventory', 'item_master', true, false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('AC',  'inventory', 'item_master', true, false, false, false, false, false, false, false, false, false, false, 'company'),
  ('QA',  'inventory', 'item_master', true, false, false, false, false, false, false, false, false, false, false, 'project'),

  -- ── Store Management ───────────────────────────────────────────────────────
  ('L0',  'inventory', 'store_management', true, true,  true,  true,  false, false, false, false, false, true,  false, 'company'),
  ('L1',  'inventory', 'store_management', true, true,  true,  true,  false, false, false, false, false, false, false, 'company'),
  ('L2',  'inventory', 'store_management', true, true,  true,  true,  false, false, false, false, false, false, false, 'company'),
  ('L3',  'inventory', 'store_management', true, true,  true,  false, false, false, false, false, false, false, false, 'project'),
  ('SK',  'inventory', 'store_management', true, false, false, false, false, false, false, false, false, false, false, 'project'),
  ('SS',  'inventory', 'store_management', true, false, false, false, false, false, false, false, false, false, false, 'project'),
  ('QS',  'inventory', 'store_management', true, false, false, false, false, false, false, false, false, false, false, 'company'),

  -- ── GRN (Goods Received Note) ──────────────────────────────────────────────
  ('L0',  'inventory', 'grn', true, true,  true,  true,  true,  true,  true,  true,  false, false, false, 'company'),
  ('L1',  'inventory', 'grn', true, true,  true,  true,  true,  true,  true,  true,  false, false, false, 'company'),
  ('L2',  'inventory', 'grn', true, true,  true,  false, true,  false, false, true,  false, false, false, 'company'),
  ('L3',  'inventory', 'grn', true, false, false, false, false, false, false, false, false, false, false, 'project'),
  ('L5',  'inventory', 'grn', true, false, false, false, false, false, false, false, false, false, false, 'project'),
  ('L6',  'inventory', 'grn', true, false, false, false, false, false, false, false, false, false, false, 'project'),
  -- Storekeeper: create + confirm (submit) GRNs; Store Supervisor: can also cancel
  ('SK',  'inventory', 'grn', true, true,  true,  false, true,  false, false, false, false, false, false, 'project'),
  ('SS',  'inventory', 'grn', true, true,  true,  false, true,  false, false, true,  false, false, false, 'project'),
  ('PO',  'inventory', 'grn', true, false, false, false, false, false, false, false, false, false, false, 'company'),
  ('QS',  'inventory', 'grn', true, false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('QA',  'inventory', 'grn', true, false, false, false, false, false, false, false, false, false, false, 'project'),
  ('AC',  'inventory', 'grn', true, false, false, false, false, false, false, false, false, false, false, 'company'),

  -- ── GRN Inspection (QAQC role only) ───────────────────────────────────────
  ('QA',  'inventory', 'grn_inspect', true, false, true,  false, false, true,  true,  false, false, false, false, 'project'),
  ('L0',  'inventory', 'grn_inspect', true, false, true,  false, false, true,  true,  false, false, false, false, 'company'),
  ('L3',  'inventory', 'grn_inspect', true, false, false, false, false, false, false, false, false, false, false, 'project'),
  ('SS',  'inventory', 'grn_inspect', true, false, false, false, false, false, false, false, false, false, false, 'project'),

  -- ── Material Requisition (MR) ──────────────────────────────────────────────
  ('L0',  'inventory', 'material_requisition', true, true,  true,  true,  true,  true,  true,  true,  false, false, false, 'company'),
  ('L1',  'inventory', 'material_requisition', true, true,  true,  true,  true,  true,  true,  true,  false, false, false, 'company'),
  ('L2',  'inventory', 'material_requisition', true, true,  true,  false, true,  true,  true,  true,  false, false, false, 'company'),
  -- PM: view + approve; can create but would typically delegate
  ('L3',  'inventory', 'material_requisition', true, true,  true,  false, true,  true,  true,  false, false, false, false, 'project'),
  ('L4',  'inventory', 'material_requisition', true, true,  true,  false, true,  true,  true,  false, false, false, false, 'project'),
  -- Site Engineer (L5/L6): create + submit own MRs
  ('L5',  'inventory', 'material_requisition', true, true,  true,  false, true,  false, false, false, false, false, false, 'own'),
  ('L6',  'inventory', 'material_requisition', true, true,  true,  false, true,  false, false, false, false, false, false, 'own'),
  -- Site Supervisor: create + approve
  ('SS',  'inventory', 'material_requisition', true, true,  true,  false, true,  true,  true,  false, false, false, false, 'project'),
  -- Storekeeper: view + issue (approve = confirm issue in this context)
  ('SK',  'inventory', 'material_requisition', true, false, false, false, false, true,  false, false, false, false, false, 'project'),
  ('QS',  'inventory', 'material_requisition', true, false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('AC',  'inventory', 'material_requisition', true, false, false, false, false, false, false, false, false, false, false, 'company'),

  -- ── Material Return to Store ───────────────────────────────────────────────
  ('L0',  'inventory', 'material_return', true, true,  true,  false, true,  true,  true,  false, false, false, false, 'company'),
  ('L3',  'inventory', 'material_return', true, false, false, false, false, false, false, false, false, false, false, 'project'),
  ('L5',  'inventory', 'material_return', true, true,  false, false, true,  false, false, false, false, false, false, 'own'),
  ('L6',  'inventory', 'material_return', true, true,  false, false, true,  false, false, false, false, false, false, 'own'),
  ('SS',  'inventory', 'material_return', true, true,  false, false, true,  true,  false, false, false, false, false, 'project'),
  ('SK',  'inventory', 'material_return', true, true,  true,  false, true,  false, false, false, false, false, false, 'project'),
  -- Write-off approval requires SS or above
  ('QS',  'inventory', 'material_return', true, false, false, false, false, false, false, true,  false, false, false, 'company'),

  -- ── Stock Transfer ────────────────────────────────────────────────────────
  ('L0',  'inventory', 'transfer', true, true,  true,  false, true,  true,  true,  true,  false, false, false, 'company'),
  ('L1',  'inventory', 'transfer', true, true,  true,  false, true,  true,  true,  true,  false, false, false, 'company'),
  ('L2',  'inventory', 'transfer', true, true,  true,  false, true,  true,  true,  true,  false, false, false, 'company'),
  ('L3',  'inventory', 'transfer', true, true,  true,  false, true,  true,  true,  false, false, false, false, 'project'),
  ('SS',  'inventory', 'transfer', true, true,  true,  false, true,  true,  true,  false, false, false, false, 'project'),
  -- Storekeeper: view + dispatch/receive (submit = dispatch; approve = confirm receipt)
  ('SK',  'inventory', 'transfer', true, false, false, false, true,  true,  false, false, false, false, false, 'project'),
  ('QS',  'inventory', 'transfer', true, false, false, false, false, false, false, true,  false, false, false, 'company'),

  -- ── Stock Adjustment ──────────────────────────────────────────────────────
  ('L0',  'inventory', 'adjustment', true, true,  true,  false, true,  true,  true,  true,  false, false, false, 'company'),
  ('L1',  'inventory', 'adjustment', true, true,  true,  false, true,  true,  true,  true,  false, false, false, 'company'),
  ('L2',  'inventory', 'adjustment', true, true,  true,  false, true,  true,  true,  true,  false, false, false, 'company'),
  ('L3',  'inventory', 'adjustment', true, false, false, false, false, true,  true,  false, false, false, false, 'project'),
  -- SS: create + approve (cannot self-approve own — enforced at app layer)
  ('SS',  'inventory', 'adjustment', true, true,  false, false, true,  true,  true,  false, false, false, false, 'project'),
  -- Storekeeper: create only (cannot approve)
  ('SK',  'inventory', 'adjustment', true, true,  false, false, true,  false, false, false, false, false, false, 'project'),
  ('QS',  'inventory', 'adjustment', true, false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('AC',  'inventory', 'adjustment', true, false, false, false, false, false, false, false, false, false, false, 'company'),
  ('EXT-AUD', 'inventory', 'adjustment', true, false, false, false, false, false, false, false, false, false, false, 'company'),

  -- ── Physical Stock Take ───────────────────────────────────────────────────
  ('L0',  'inventory', 'stocktake', true, true,  true,  false, true,  true,  false, true,  false, false, false, 'company'),
  ('L1',  'inventory', 'stocktake', true, true,  true,  false, true,  true,  false, true,  false, false, false, 'company'),
  ('L2',  'inventory', 'stocktake', true, true,  true,  false, true,  true,  false, true,  false, false, false, 'company'),
  ('L3',  'inventory', 'stocktake', true, true,  true,  false, true,  true,  false, false, false, false, false, 'project'),
  ('SS',  'inventory', 'stocktake', true, true,  true,  false, true,  true,  false, false, false, false, false, 'project'),
  -- Storekeeper: enter counts (edit = submit count)
  ('SK',  'inventory', 'stocktake', true, false, true,  false, true,  false, false, false, false, false, false, 'project'),
  ('QS',  'inventory', 'stocktake', true, false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('AC',  'inventory', 'stocktake', true, false, false, false, false, false, false, false, false, false, false, 'company'),
  ('EXT-AUD', 'inventory', 'stocktake', true, false, false, false, false, false, false, false, false, false, false, 'company'),

  -- ── Movement Ledger (read-only for most; export for QS/Finance) ────────────
  ('L0',  'inventory', 'movements', true, false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('L1',  'inventory', 'movements', true, false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('L2',  'inventory', 'movements', true, false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('L3',  'inventory', 'movements', true, false, false, false, false, false, false, true,  false, false, false, 'project'),
  ('SS',  'inventory', 'movements', true, false, false, false, false, false, false, false, false, false, false, 'project'),
  ('SK',  'inventory', 'movements', true, false, false, false, false, false, false, false, false, false, false, 'project'),
  ('QS',  'inventory', 'movements', true, false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('AC',  'inventory', 'movements', true, false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('EXT-AUD', 'inventory', 'movements', true, false, false, false, false, false, false, false, false, false, false, 'company'),

  -- ── Reports & Dashboard ────────────────────────────────────────────────────
  ('L0',  'inventory', 'reports', true, false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('L1',  'inventory', 'reports', true, false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('L2',  'inventory', 'reports', true, false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('L3',  'inventory', 'reports', true, false, false, false, false, false, false, true,  false, false, false, 'project'),
  ('L4',  'inventory', 'reports', true, false, false, false, false, false, false, false, false, false, false, 'project'),
  ('SS',  'inventory', 'reports', true, false, false, false, false, false, false, false, false, false, false, 'project'),
  ('SK',  'inventory', 'reports', true, false, false, false, false, false, false, false, false, false, false, 'project'),
  ('PO',  'inventory', 'reports', true, false, false, false, false, false, false, false, false, false, false, 'company'),
  ('QS',  'inventory', 'reports', true, false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('AC',  'inventory', 'reports', true, false, false, false, false, false, false, true,  false, false, false, 'company'),
  ('EXT-AUD', 'inventory', 'reports', true, false, false, false, false, false, false, false, false, false, false, 'company')

on conflict (role_code, module, action) do nothing;

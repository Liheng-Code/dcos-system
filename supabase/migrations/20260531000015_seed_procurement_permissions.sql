-- Seed procurement module role permissions
-- These govern what each role can see / do in the procurement UI

insert into public.role_permissions (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, configure, scope)
values
  -- Super Admin / Managing Director / General Manager — full access
  ('L0', 'procurement', 'pr',            true, true, true, true, true, true, true, true, true, 'company'),
  ('L1', 'procurement', 'pr',            true, true, true, true, true, true, true, true, true, 'company'),
  ('L2', 'procurement', 'pr',            true, true, true, true, true, true, true, true, false, 'company'),
  ('L3', 'procurement', 'pr',            true, true, true, true, true, true, true, false, false, 'project'),
  ('PO',  'procurement', 'pr',           true, true, true, false, true, false, false, false, false, 'company'),
  ('QS',  'procurement', 'pr',           true, false, false, false, false, true, true, false, false, 'company'),
  ('AC',  'procurement', 'pr',           true, false, false, false, false, false, false, false, false, 'company'),
  ('L5',  'procurement', 'pr',           true, false, false, false, false, false, false, false, false, 'department'),
  ('L6',  'procurement', 'pr',           true, false, false, false, false, false, false, false, false, 'own'),
  ('EXT-CLT', 'procurement', 'pr',       true, false, false, false, false, false, false, false, false, 'project'),
  ('EXT-CON', 'procurement', 'pr',       true, false, false, false, false, false, false, false, false, 'project'),

  -- Purchase Orders
  ('L0', 'procurement', 'po',            true, true, true, true, true, true, true, true, true, 'company'),
  ('L1', 'procurement', 'po',            true, true, true, true, true, true, true, true, true, 'company'),
  ('L2', 'procurement', 'po',            true, true, true, true, true, true, true, true, false, 'company'),
  ('L3', 'procurement', 'po',            true, true, true, true, true, false, false, false, false, 'project'),
  ('PO',  'procurement', 'po',           true, true, true, false, true, false, false, false, false, 'company'),
  ('AC',  'procurement', 'po',           true, false, false, false, false, false, false, false, false, 'company'),
  ('L5',  'procurement', 'po',           true, false, false, false, false, false, false, false, false, 'department'),
  ('L6',  'procurement', 'po',           true, false, false, false, false, false, false, false, false, 'own'),

  -- Goods Receipt
  ('L0', 'procurement', 'goods_receipt',  true, true, true, true, true, true, true, true, true, 'company'),
  ('L1', 'procurement', 'goods_receipt',  true, true, true, true, true, true, true, true, true, 'company'),
  ('L2', 'procurement', 'goods_receipt',  true, true, true, true, true, false, false, false, false, 'company'),
  ('L3', 'procurement', 'goods_receipt',  true, true, true, true, false, false, false, false, false, 'project'),
  ('PO',  'procurement', 'goods_receipt', true, true, true, false, true, false, false, false, false, 'company'),
  ('SK',  'procurement', 'goods_receipt', true, true, true, false, false, false, false, false, false, 'company'),
  ('L5',  'procurement', 'goods_receipt', true, false, false, false, false, false, false, false, false, 'department'),

  -- Invoice Matching
  ('L0', 'procurement', 'invoice',       true, true, true, true, true, true, true, true, true, 'company'),
  ('L1', 'procurement', 'invoice',       true, true, true, true, true, true, true, true, true, 'company'),
  ('L2', 'procurement', 'invoice',       true, true, true, true, true, true, true, true, false, 'company'),
  ('AC',  'procurement', 'invoice',      true, true, true, false, true, false, false, false, false, 'company'),
  ('L3', 'procurement', 'invoice',       true, false, false, false, false, true, true, false, false, 'project'),
  ('L5',  'procurement', 'invoice',      true, false, false, false, false, false, false, false, false, 'department'),

  -- RFQ
  ('L0', 'procurement', 'rfq',           true, true, true, true, true, true, true, true, true, 'company'),
  ('L1', 'procurement', 'rfq',           true, true, true, true, true, true, true, true, true, 'company'),
  ('L2', 'procurement', 'rfq',           true, true, true, true, true, true, true, true, false, 'company'),
  ('L3', 'procurement', 'rfq',           true, true, true, true, true, true, true, false, false, 'project'),
  ('PO',  'procurement', 'rfq',          true, true, true, false, true, false, false, false, false, 'company'),
  ('L5',  'procurement', 'rfq',          true, false, false, false, false, false, false, false, false, 'department'),

  -- Suppliers
  ('L0', 'procurement', 'supplier',      true, true, true, true, true, true, true, true, true, 'company'),
  ('L1', 'procurement', 'supplier',      true, true, true, true, true, true, true, true, true, 'company'),
  ('L2', 'procurement', 'supplier',      true, true, true, true, true, false, false, false, false, 'company'),
  ('L3', 'procurement', 'supplier',      true, true, true, false, false, false, false, false, false, 'project'),
  ('PO',  'procurement', 'supplier',     true, true, true, false, true, false, false, false, false, 'company'),
  ('AC',  'procurement', 'supplier',     true, false, false, false, false, false, false, false, false, 'company'),

  -- Inventory
  ('L0', 'procurement', 'inventory',     true, true, true, true, true, true, true, true, true, 'company'),
  ('L1', 'procurement', 'inventory',     true, true, true, true, true, true, true, true, true, 'company'),
  ('L2', 'procurement', 'inventory',     true, true, true, true, true, false, false, false, false, 'company'),
  ('L3', 'procurement', 'inventory',     true, true, true, false, false, false, false, false, false, 'project'),
  ('SK',  'procurement', 'inventory',    true, true, true, false, false, false, false, false, false, 'company'),
  ('PO',  'procurement', 'inventory',    true, true, true, false, false, false, false, false, false, 'company'),
  ('QS',  'procurement', 'inventory',    true, false, false, false, false, false, false, false, false, 'company'),

  -- Notifications
  ('L0', 'procurement', 'notifications', true, false, true, true, false, false, false, false, true, 'company'),
  ('L1', 'procurement', 'notifications', true, false, true, true, false, false, false, false, true, 'company'),
  ('L2', 'procurement', 'notifications', true, false, true, true, false, false, false, false, true, 'company'),
  ('L3', 'procurement', 'notifications', true, false, false, false, false, false, false, false, false, 'project'),
  ('PO',  'procurement', 'notifications', true, false, false, false, false, false, false, false, false, 'company'),

  -- Audit Log
  ('L0', 'procurement', 'audit_log',     true, false, false, false, false, false, false, false, true, 'company'),
  ('L1', 'procurement', 'audit_log',     true, false, false, false, false, false, false, false, true, 'company'),
  ('L2', 'procurement', 'audit_log',     true, false, false, false, false, false, false, false, true, 'company'),
  ('L3', 'procurement', 'audit_log',     true, false, false, false, false, false, false, false, false, 'project'),
  ('PO',  'procurement', 'audit_log',    true, false, false, false, false, false, false, false, false, 'company')
on conflict (role_code, module, action) do nothing;

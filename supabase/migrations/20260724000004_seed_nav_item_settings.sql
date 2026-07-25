-- Migration: 20260724000004_seed_nav_item_settings.sql
-- Purpose: Seed public.nav_item_settings with the full catalog of sidebar sub-group
--          headings and leaf nav links, all marked is_active = true (visible), so that
--          applying this migration causes ZERO visible change to the sidebar -- it only
--          establishes the known catalog as rows an admin can later toggle off via the
--          "Manage navigation items" dialog. The catalog itself lives in
--          apps/web/lib/nav-item-catalog.ts (NAV_ITEM_CATALOG) and must be kept in sync
--          with apps/web/components/dashboard/sidebar.tsx -- this migration is a
--          point-in-time snapshot of that file, not a live mirror of it.
-- Depends on: public.nav_item_settings (20260724000003_create_nav_item_settings.sql),
--             public.module_settings (20260720000001_create_module_settings.sql)
--
-- nav_key format (must match nav-item-catalog.ts / sidebar.tsx exactly):
--   - leaf items:  the real href rendered by NavItem/TabNavItem, including any
--                  "?tab=" query string for TabNavItem entries (e.g.
--                  '/dashboard/qs?tab=cost-control')
--   - sub-group headings: a synthetic 'group:<module_key>:<slug>' string passed to
--                  FolderHeader's `navKey` prop (e.g. 'group:qs:cost_control')
--
-- Row count / known catalog discrepancy (read before modifying this file):
-- apps/web/lib/nav-item-catalog.ts currently contains 141 entries across its 11
-- module_key sections. This migration inserts 139 rows, not 141, because nav_key is
-- the PRIMARY KEY of nav_item_settings (one row per distinct href/group-key -- see
-- 20260724000003) while the catalog itself lists two hrefs twice, once under the
-- "reporting" module as a contextual shortcut and once under the module that actually
-- owns the page:
--   1. '/dashboard/account/reports'  -- reporting: "Financial Reports" (dropped here)
--                                       account:   "Reports" (kept, sort_order 11)
--   2. '/dashboard/planning/reports' -- reporting: "Schedule Reports" (dropped here)
--                                       planning:  "Reports" (kept, sort_order 7)
-- A single INSERT ... ON CONFLICT (nav_key) DO UPDATE cannot target the same nav_key
-- twice in one command (Postgres raises "ON CONFLICT DO UPDATE command cannot affect
-- row a second time"), so only one row per nav_key can exist here. The row kept in
-- each pair is the one belonging to the module whose path segment actually owns the
-- href (account/* -> account, planning/* -> planning); the "reporting" module's two
-- shortcut entries for these particular items are consequently not independently
-- toggleable -- hiding/showing the page's own row also governs its reporting-hub
-- shortcut, since both point at the exact same href. The "reporting" module's
-- sort_order sequence below intentionally skips 3 and 4 (its original catalog
-- positions for these two entries) so its remaining rows' sort_order still matches
-- their position in nav-item-catalog.ts. This was not resolved by editing
-- nav-item-catalog.ts or the schema migration, per instructions -- flagged here for
-- human/system-architect review if independent toggling of these two shortcuts is
-- later required (would need a schema change, e.g. a synthetic key per occurrence).

BEGIN;

insert into public.nav_item_settings
  (nav_key, module_key, node_type, label, is_active, sort_order)
values
  -- project (4)
  ('/dashboard', 'project', 'item', 'Dashboard', true, 1),
  ('/dashboard/projects', 'project', 'item', 'Projects', true, 2),
  ('/dashboard/wbs', 'project', 'item', 'WBS', true, 3),
  ('/dashboard/tasks', 'project', 'item', 'Tasks', true, 4),

  -- reporting (5 in catalog, 3 rows here -- see header note re: positions 3 and 4)
  ('/dashboard/reports', 'reporting', 'item', 'Reports Hub', true, 1),
  ('/dashboard/reports/schedule', 'reporting', 'item', 'Scheduled Reports', true, 2),
  ('/dashboard/insights', 'reporting', 'item', 'Insights', true, 5),

  -- document_control (4)
  ('/dashboard/documents', 'document_control', 'item', 'Documents', true, 1),
  ('/dashboard/documents/transmittals', 'document_control', 'item', 'Transmittals', true, 2),
  ('/dashboard/documents/controller', 'document_control', 'item', 'Controller Dashboard', true, 3),
  ('/dashboard/documents/audit-log', 'document_control', 'item', 'Audit Log', true, 4),

  -- planning (7)
  ('/dashboard/planning', 'planning', 'item', 'Dashboard', true, 1),
  ('/dashboard/planning/gantt', 'planning', 'item', 'Gantt Chart', true, 2),
  ('/dashboard/wbs/lookahead', 'planning', 'item', 'Look-ahead', true, 3),
  ('/dashboard/planning/calendars', 'planning', 'item', 'Calendars', true, 4),
  ('/dashboard/planning/comparison', 'planning', 'item', 'Comparison', true, 5),
  ('/dashboard/planning/resource-loading', 'planning', 'item', 'Resources', true, 6),
  ('/dashboard/planning/reports', 'planning', 'item', 'Reports', true, 7),

  -- design (28)
  ('/dashboard/design', 'design', 'item', 'Dashboard', true, 1),
  ('/dashboard/design/coordination', 'design', 'item', 'Coordination', true, 2),
  ('/dashboard/design/markup', 'design', 'item', 'Drawing Markup', true, 3),
  ('/dashboard/design/bim', 'design', 'item', 'BIM Viewer', true, 4),
  ('group:design:architecture', 'design', 'group', 'Architecture', true, 5),
  ('/dashboard/design/arc/drawings', 'design', 'item', 'ARC Drawings', true, 6),
  ('/dashboard/design/arc/room-data', 'design', 'item', 'Room Data', true, 7),
  ('/dashboard/design/arc/rfi', 'design', 'item', 'ARC RFI', true, 8),
  ('/dashboard/design/arc/door-schedule', 'design', 'item', 'Door Schedule', true, 9),
  ('/dashboard/design/arc/window-schedule', 'design', 'item', 'Window Schedule', true, 10),
  ('/dashboard/design/arc/finish-schedule', 'design', 'item', 'Finish Schedule', true, 11),
  ('/dashboard/design/arc/material-approval', 'design', 'item', 'Material Approval', true, 12),
  ('group:design:structure', 'design', 'group', 'Structure', true, 13),
  ('/dashboard/design/str/drawings', 'design', 'item', 'STR Drawings', true, 14),
  ('/dashboard/design/str/calculations', 'design', 'item', 'Calculations', true, 15),
  ('/dashboard/design/str/models', 'design', 'item', 'BIM Models', true, 16),
  ('/dashboard/design/str/rebar', 'design', 'item', 'Rebar Scheduling', true, 17),
  ('/dashboard/design/str/rfi', 'design', 'item', 'STR RFI', true, 18),
  ('/dashboard/design/str/technical-queries', 'design', 'item', 'Tech. Queries', true, 19),
  ('/dashboard/design/str/design-changes', 'design', 'item', 'Design Changes', true, 20),
  ('group:design:mep', 'design', 'group', 'MEP', true, 21),
  ('/dashboard/design/mep/drawings', 'design', 'item', 'MEP Drawings', true, 22),
  ('/dashboard/design/mep/equipment', 'design', 'item', 'Equipment', true, 23),
  ('/dashboard/design/mep/load-schedule', 'design', 'item', 'Load Schedule', true, 24),
  ('/dashboard/design/mep/sleeves', 'design', 'item', 'Sleeve Details', true, 25),
  ('/dashboard/design/mep/submittals', 'design', 'item', 'Submittals', true, 26),
  ('/dashboard/design/mep/rfi', 'design', 'item', 'MEP RFI', true, 27),
  ('/dashboard/design/mep/commissioning', 'design', 'item', 'Commissioning', true, 28),

  -- procurement (16)
  ('/dashboard/procurement', 'procurement', 'item', 'Dashboard', true, 1),
  ('/dashboard/procurement/analytics', 'procurement', 'item', 'Analytics', true, 2),
  ('/dashboard/procurement/boq', 'procurement', 'item', 'BOQ', true, 3),
  ('/dashboard/procurement/supplier-portal', 'procurement', 'item', 'Supplier Portal', true, 4),
  ('/dashboard/procurement/suppliers', 'procurement', 'item', 'Suppliers', true, 5),
  ('/dashboard/procurement/prequalification', 'procurement', 'item', 'Supplier PQ', true, 6),
  ('/dashboard/procurement/supplier-performance', 'procurement', 'item', 'Supplier Perf.', true, 7),
  ('/dashboard/procurement/rfq', 'procurement', 'item', 'RFQs', true, 8),
  ('/dashboard/procurement/pr', 'procurement', 'item', 'Purchase Requisitions', true, 9),
  ('/dashboard/procurement/po', 'procurement', 'item', 'Purchase Orders', true, 10),
  ('/dashboard/procurement/inventory', 'procurement', 'item', 'Inventory', true, 11),
  ('/dashboard/procurement/auto-reorder', 'procurement', 'item', 'Auto Reorder', true, 12),
  ('/dashboard/procurement/goods-receipt', 'procurement', 'item', 'Goods Receipt', true, 13),
  ('/dashboard/procurement/invoice-matches', 'procurement', 'item', 'Invoice Matching', true, 14),
  ('/dashboard/procurement/notifications', 'procurement', 'item', 'Notifications', true, 15),
  ('/dashboard/procurement/audit-log', 'procurement', 'item', 'Audit Log', true, 16),

  -- qs (35)
  ('group:qs:tendering', 'qs', 'group', 'Tender & Estimate', true, 1),
  ('/dashboard/tenders/register', 'qs', 'item', 'Tender Register', true, 2),
  ('/dashboard/tenders/cost-estimation', 'qs', 'item', 'Cost Estimation', true, 3),
  ('/dashboard/tenders/tender-management', 'qs', 'item', 'Tender Management', true, 4),
  ('/dashboard/tenders/submissions', 'qs', 'item', 'Submissions', true, 5),
  ('/dashboard/tenders/bid-evaluation', 'qs', 'item', 'Bid Evaluation', true, 6),
  ('group:qs:libraries', 'qs', 'group', 'Libraries', true, 7),
  ('/dashboard/qs/dwl-resources', 'qs', 'item', 'Direct Works Resources', true, 8),
  ('/dashboard/qs/dwl-work-items', 'qs', 'item', 'Direct Works Rate Build-Up', true, 9),
  ('/dashboard/qs/dwl-assemblies', 'qs', 'item', 'Direct Works Assemblies', true, 10),
  ('/dashboard/qs/dwl-estimate', 'qs', 'item', 'Direct Works Quick Estimate', true, 11),
  ('/dashboard/qs/dwl-price-dashboard', 'qs', 'item', 'Direct Works Price Dashboard', true, 12),
  ('/dashboard/tenders/budget-codes', 'qs', 'item', 'Budget Codes', true, 13),
  ('/dashboard/qs/element-library', 'qs', 'item', 'Element Library', true, 14),
  ('/dashboard/tenders/cost-library', 'qs', 'item', 'Prelim Cost Library', true, 15),
  ('/dashboard/tenders/unit-rates', 'qs', 'item', 'Unit Rate Library', true, 16),
  ('group:qs:cost_control', 'qs', 'group', 'Cost Control', true, 17),
  ('/dashboard/qs/boq', 'qs', 'item', 'BOQ', true, 18),
  ('/dashboard/qs?tab=cost-control', 'qs', 'item', 'Cost Control', true, 19),
  ('/dashboard/qs?tab=contingency', 'qs', 'item', 'Contingency', true, 20),
  ('/dashboard/qs/evm', 'qs', 'item', 'Earned Value', true, 21),
  ('/dashboard/qs?tab=portfolio', 'qs', 'item', 'Portfolio', true, 22),
  ('/dashboard/qs?tab=audit', 'qs', 'item', 'Audit Log', true, 23),
  ('/dashboard/qs?tab=currency', 'qs', 'item', 'Currency', true, 24),
  ('/dashboard/qs/claims', 'qs', 'item', 'Progress Claims', true, 25),
  ('/dashboard/qs/variations', 'qs', 'item', 'Variations', true, 26),
  ('group:qs:subcontractor', 'qs', 'group', 'Subcon Mgmt', true, 27),
  ('/dashboard/subcontractors/back-charges', 'qs', 'item', 'Back Charges', true, 28),
  ('/dashboard/subcontractors/performance-notices', 'qs', 'item', 'Performance Notices', true, 29),
  ('group:qs:contract_admin', 'qs', 'group', 'Contract Admin', true, 30),
  ('/dashboard/contracts/register', 'qs', 'item', 'Contract Register', true, 31),
  ('/dashboard/contracts/notices', 'qs', 'item', 'Notices', true, 32),
  ('/dashboard/contracts/employer-instructions', 'qs', 'item', 'Employer Instructions', true, 33),
  ('/dashboard/contracts/correspondence', 'qs', 'item', 'Correspondence', true, 34),
  ('/dashboard/contracts/entitlements', 'qs', 'item', 'Entitlements', true, 35),

  -- construction (14)
  ('/dashboard/site', 'construction', 'item', 'Dashboard', true, 1),
  ('/dashboard/site/daily-reports', 'construction', 'item', 'Daily Reports', true, 2),
  ('/dashboard/site/manpower', 'construction', 'item', 'Manpower', true, 3),
  ('/dashboard/site/equipment', 'construction', 'item', 'Equipment', true, 4),
  ('/dashboard/site/progress-photos', 'construction', 'item', 'Progress Photos', true, 5),
  ('/dashboard/qaqc', 'construction', 'item', 'Inspections & ITP', true, 6),
  ('/dashboard/qaqc/ncrs', 'construction', 'item', 'NCR Management', true, 7),
  ('group:construction:hse', 'construction', 'group', 'HSE', true, 8),
  ('/dashboard/hse', 'construction', 'item', 'Dashboard', true, 9),
  ('/dashboard/hse/permits', 'construction', 'item', 'Work Permits', true, 10),
  ('/dashboard/hse/toolbox-talks', 'construction', 'item', 'Toolbox Talks', true, 11),
  ('/dashboard/hse/incidents', 'construction', 'item', 'Incidents', true, 12),
  ('/dashboard/hse/risk-assessments', 'construction', 'item', 'Risk Assessments', true, 13),
  ('/dashboard/hse/observations', 'construction', 'item', 'Observations', true, 14),

  -- hr (13)
  ('/dashboard/hr/dashboard', 'hr', 'item', 'Workforce Dashboard', true, 1),
  ('/dashboard/hr/organization', 'hr', 'item', 'Organization Setup', true, 2),
  ('/dashboard/hr/employees', 'hr', 'item', 'Employee Master', true, 3),
  ('/dashboard/hr/resources', 'hr', 'item', 'Resource Allocation', true, 4),
  ('/dashboard/hr/attendance', 'hr', 'item', 'Attendance', true, 5),
  ('/dashboard/hr/leave', 'hr', 'item', 'E-Leave', true, 6),
  ('/dashboard/hr/payroll', 'hr', 'item', 'Payroll', true, 7),
  ('/dashboard/hr/timesheet', 'hr', 'item', 'Timesheet', true, 8),
  ('/dashboard/hr/overtime', 'hr', 'item', 'OT Management', true, 9),
  ('/dashboard/hr/training', 'hr', 'item', 'Training & Competency', true, 10),
  ('/dashboard/hr/performance', 'hr', 'item', 'Performance', true, 11),
  ('/dashboard/hr/recruitment', 'hr', 'item', 'Recruitment', true, 12),
  ('/dashboard/hr/assets', 'hr', 'item', 'Employee Assets', true, 13),

  -- account (12)
  ('/dashboard/account', 'account', 'item', 'Overview', true, 1),
  ('/dashboard/account/coa', 'account', 'item', 'Chart of Accounts', true, 2),
  ('/dashboard/account/ap', 'account', 'item', 'AP Invoices', true, 3),
  ('/dashboard/account/ar', 'account', 'item', 'AR Invoices', true, 4),
  ('/dashboard/account/payments', 'account', 'item', 'Payments', true, 5),
  ('/dashboard/account/journals', 'account', 'item', 'Journal Entries', true, 6),
  ('/dashboard/account/gl', 'account', 'item', 'General Ledger', true, 7),
  ('/dashboard/account/bank', 'account', 'item', 'Bank Accounts', true, 8),
  ('/dashboard/account/payment-runs', 'account', 'item', 'Payment Runs', true, 9),
  ('/dashboard/account/wht', 'account', 'item', 'Withholding Tax', true, 10),
  ('/dashboard/account/reports', 'account', 'item', 'Reports', true, 11),
  ('/dashboard/account/currencies', 'account', 'item', 'Multi-Currency', true, 12),

  -- administration (3)
  ('/dashboard/settings', 'administration', 'item', 'Settings', true, 1),
  ('/dashboard/administration/stakeholders', 'administration', 'item', 'Stakeholders', true, 2),
  ('/dashboard/administration/stakeholder-templates', 'administration', 'item', 'Stakeholder Templates', true, 3)
on conflict (nav_key) do update
  set label = excluded.label,
      node_type = excluded.node_type,
      sort_order = excluded.sort_order,
      updated_at = now();

COMMIT;

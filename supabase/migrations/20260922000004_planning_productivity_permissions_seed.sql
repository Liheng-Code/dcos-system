-- Migration: 20260922000004_planning_productivity_permissions_seed.sql
-- Purpose: Productivity & Resource-Costing Plan, Phase 0 — seed role_permissions for the three new
--          planning actions the Phase 1+ tables will be gated on (mirrors
--          20260919000007_planning_role_permissions_seed.sql):
--            norms         productivity norm library
--            task_work     task quantity / norm / work-hours / cost lines
--            productivity  actual productivity logs (site output records)
-- Depends on: public.role_permissions (20260527000002), public.roles (20260527000003)
--
-- Inert until the Phase 1 RLS policies reference these actions; no table is gated on them yet.
-- has_permission() treats "no row" as false, so roles not listed here get no access.
--
-- Grants:
--   L0-L4, PE   every action, full access                         (same as the existing planning seed)
--   L5, L6      view on all three; create+edit on 'productivity'   (site engineers record daily output,
--                                                                   like their edit right on 'lookahead')
--   QS          norms: view/create/edit/approve; task_work: view/create/edit
--                                                                  (QS owns rates and BOQ quantities; the
--                                                                   plan makes QS co-approver of norms)
-- Every other role code deliberately gets nothing.

-- ── 1. Full access: L0-L4, PE ───────────────────────────────────────────────
insert into public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, configure, scope)
select r.role_code, 'planning', a.action,
       true, true, true, true, true, true, true, true, true, 'project'
from (values ('L0'), ('L1'), ('L2'), ('L3'), ('L4'), ('PE')) as r(role_code)
cross join (values ('norms'), ('task_work'), ('productivity')) as a(action)
on conflict (role_code, module, action) do update set
  view = excluded.view, can_create = excluded.can_create, edit = excluded.edit,
  delete = excluded.delete, submit = excluded.submit, approve = excluded.approve,
  reject = excluded.reject, export = excluded.export, configure = excluded.configure,
  scope = excluded.scope;

-- ── 2. L5, L6: view-only on all three ───────────────────────────────────────
insert into public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, configure, scope)
select r.role_code, 'planning', a.action,
       true, false, false, false, false, false, false, false, false, 'project'
from (values ('L5'), ('L6')) as r(role_code)
cross join (values ('norms'), ('task_work'), ('productivity')) as a(action)
on conflict (role_code, module, action) do update set
  view = excluded.view, can_create = excluded.can_create, edit = excluded.edit,
  delete = excluded.delete, submit = excluded.submit, approve = excluded.approve,
  reject = excluded.reject, export = excluded.export, configure = excluded.configure,
  scope = excluded.scope;

-- ── 2b. L5, L6: create + edit on 'productivity' (daily output records) ──────
insert into public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, configure, scope)
values
  ('L5', 'planning', 'productivity', true, true, true, false, false, false, false, false, false, 'project'),
  ('L6', 'planning', 'productivity', true, true, true, false, false, false, false, false, false, 'project')
on conflict (role_code, module, action) do update set
  view = excluded.view, can_create = excluded.can_create, edit = excluded.edit, scope = excluded.scope;

-- ── 3. QS: co-owner of norms and task quantities ────────────────────────────
insert into public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, configure, scope)
values
  ('QS', 'planning', 'norms',     true, true,  true,  false, false, true,  false, false, false, 'project'),
  ('QS', 'planning', 'task_work', true, true,  true,  false, false, false, false, false, false, 'project')
on conflict (role_code, module, action) do update set
  view = excluded.view, can_create = excluded.can_create, edit = excluded.edit,
  approve = excluded.approve, scope = excluded.scope;
-- (QS can CREATE task_work rows: entering a quantity against a task that has no work record yet is their
--  core job, and a row must exist before it can be edited.)

-- Migration: 20260919000007_planning_role_permissions_seed.sql
-- Purpose: Planning & Scheduling Completion Plan, Phase 2, item 2.1 (part 1) —
--          seed public.role_permissions for a new module 'planning' across
--          the ten actions the Phase 2 RLS policies (next migration) will
--          gate on: schedule, calendars, resources, delays, lookahead,
--          baseline, programme, progress_review, tia, levelling.
-- Depends on:
--   public.role_permissions (20260527000002_create_rbac_tables.sql)
--   public.roles seed data   (20260527000003_seed_rbac_data.sql)
--
-- Schema verification notes:
--   - role_permissions' primary key is confirmed as
--     primary key (role_code, module, action) (20260527000002), exactly as
--     the completion plan assumed — used as the ON CONFLICT target below.
--   - role_permissions' full column list (20260527000002): role_code, module,
--     action, view, can_create, edit, delete, submit, approve, reject,
--     export, transmit, configure, reassign, scope. `transmit` and `reassign`
--     are both `boolean not null default false` (NOT NULL *with* a default),
--     so per the plan's own instruction ("set transmit/reassign=true only if
--     NOT NULL without a default") they are left unset (defaulting to false)
--     on every row below — none of the ten planning actions correspond to a
--     document-transmittal or task-reassignment concept.
--   - `scope` is `text default null check (scope in ('own','department',
--     'project','company'))` — nullable, so strictly nothing needs to be set.
--     It is set to 'project' on every row below anyway, as a deliberate
--     legibility choice (every one of these permissions is paired with
--     is_project_member() at the RLS layer in the next migration) — not a
--     schema requirement.
--   - Confirmed role codes actually seeded (20260527000003_seed_rbac_data.sql):
--     internal levels L0-L6; functional DC, PO, QA, HSE, QS, SS, SK, HR, AC,
--     BIM, PE; external EXT-CLT, EXT-CON, EXT-SUB, EXT-SUP, EXT-REG, EXT-AUD.
--     All role codes referenced below (L0-L6, PE, EXT-CLT, EXT-CON) exist
--     exactly as spelled. Every other functional/external code intentionally
--     gets no 'planning' rows at all — has_permission()'s `exists(...)`
--     already returns false for a role/module/action with no row, so "no
--     access" requires no explicit false-row.

-- ── 1. Full access: L0-L4, PE — every planning action ──────────────────────
insert into public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, configure, scope)
select r.role_code, 'planning', a.action,
       true, true, true, true, true, true, true, true, true, 'project'
from (values ('L0'), ('L1'), ('L2'), ('L3'), ('L4'), ('PE')) as r(role_code)
cross join (values
  ('schedule'), ('calendars'), ('resources'), ('delays'), ('lookahead'),
  ('baseline'), ('programme'), ('progress_review'), ('tia'), ('levelling')
) as a(action)
on conflict (role_code, module, action) do update set
  view       = excluded.view,
  can_create = excluded.can_create,
  edit       = excluded.edit,
  delete     = excluded.delete,
  submit     = excluded.submit,
  approve    = excluded.approve,
  reject     = excluded.reject,
  export     = excluded.export,
  configure  = excluded.configure,
  scope      = excluded.scope;

-- ── 2. L5, L6 — view-only baseline across every action ─────────────────────
insert into public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, configure, scope)
select r.role_code, 'planning', a.action,
       true, false, false, false, false, false, false, false, false, 'project'
from (values ('L5'), ('L6')) as r(role_code)
cross join (values
  ('schedule'), ('calendars'), ('resources'), ('delays'), ('lookahead'),
  ('baseline'), ('programme'), ('progress_review'), ('tia'), ('levelling')
) as a(action)
on conflict (role_code, module, action) do update set
  view       = excluded.view,
  can_create = excluded.can_create,
  edit       = excluded.edit,
  delete     = excluded.delete,
  submit     = excluded.submit,
  approve    = excluded.approve,
  reject     = excluded.reject,
  export     = excluded.export,
  configure  = excluded.configure,
  scope      = excluded.scope;

-- ── 2b. L5, L6 — additionally edit=true on 'lookahead' only ────────────────
-- (Site engineers update look-ahead / weekly plan progress.) Applied as a
-- second, narrower upsert so step 2 above stays a simple uniform grant.
insert into public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, configure, scope)
values
  ('L5', 'planning', 'lookahead', true, false, true, false, false, false, false, false, false, 'project'),
  ('L6', 'planning', 'lookahead', true, false, true, false, false, false, false, false, false, 'project')
on conflict (role_code, module, action) do update set
  view = excluded.view,
  edit = excluded.edit,
  scope = excluded.scope;

-- ── 3. EXT-CLT, EXT-CON — view-only on 'programme' only ────────────────────
-- No rows at all for the other nine actions: the client/PMC portal is a
-- separate summary view (item 2.4), not raw schedule/baseline/resource
-- access, and has_permission() already treats "no row" as false.
insert into public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, configure, scope)
values
  ('EXT-CLT', 'planning', 'programme', true, false, false, false, false, false, false, false, false, 'project'),
  ('EXT-CON', 'planning', 'programme', true, false, false, false, false, false, false, false, false, 'project')
on conflict (role_code, module, action) do update set
  view       = excluded.view,
  can_create = excluded.can_create,
  edit       = excluded.edit,
  delete     = excluded.delete,
  submit     = excluded.submit,
  approve    = excluded.approve,
  reject     = excluded.reject,
  export     = excluded.export,
  configure  = excluded.configure,
  scope      = excluded.scope;

-- Every other existing role code (DC, PO, QA, HSE, QS, SS, SK, HR, AC, BIM,
-- EXT-SUB, EXT-SUP, EXT-REG, EXT-AUD) deliberately gets no 'planning' rows.

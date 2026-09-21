-- Migration: 20260919000015_project_members_rls.sql
-- Purpose: Planning & Scheduling Completion Plan Continuation, R2.1 — replace
--          project_members' permissive Phase-1 policies (authored in
--          20260919000001) with the standard 4-policy
--          is_project_member() + has_permission('planning','members',<field>)
--          pattern, and seed that new action so existing role codes keep the
--          exact access the completion plan describes ("a project Members tab
--          lets a PM manage project_members").
-- Depends on:
--   public.project_members (20260919000001_project_members_and_permission_helpers.sql)
--   public.is_project_member(uuid), public.has_permission(text,text,text)
--     (20260919000001)
--   public.role_permissions / public.roles (20260527000002/3)
--
-- Schema verification notes:
--   - project_members' columns are exactly those created in 20260919000001:
--     project_id uuid NOT NULL FK projects, user_id uuid NOT NULL FK profiles,
--     role_code text references roles(code) (null), added_by uuid references
--     profiles(id), created_at timestamptz default now(), primary key
--     (project_id, user_id). No changes below — purely additive to the
--     policy set.
--   - The four policies being replaced are named "project_members_select/
--     insert/update/delete_authenticated" (20260919000001:67-77). Dropped and
--     recreated below.
--   - role_permissions PK is (role_code, module, action) and every column is
--     confirmed in 20260919000001's header; `transmit`/`reassign` are boolean
--     NOT NULL default false and are intentionally left unset on the seed
--     rows below (same rule as 20260919000007).
--   - `scope` is nullable; set to 'project' on each row for legibility, the
--     same convention 20260919000007 uses — every grant is paired with
--     is_project_member() at the RLS layer.
--   - Role codes L0-L6 and PE confirmed seeded (20260527000003). 'members' is
--     a NEW action not present in 20260919000007's ten-action list; adding it
--     here is additive and does not disturb the existing seed (ON CONFLICT
--     DO UPDATE leaves other fields to this file's values, which for
--     'members' are all-new rows anyway).

-- ── 1. project_members: role-scoped RLS ─────────────────────────────────────
drop policy if exists "project_members_select_authenticated" on public.project_members;
drop policy if exists "project_members_insert_authenticated" on public.project_members;
drop policy if exists "project_members_update_authenticated" on public.project_members;
drop policy if exists "project_members_delete_authenticated" on public.project_members;

-- Select: any project member can read the roster (the members tab must list
-- every member, including for users who can only view).
create policy "project_members_select" on public.project_members for select to authenticated
  using (is_project_member(project_id));

-- Write: a project member with the 'members' edit field manages the roster.
-- Note the circular-safety rule already established by the 20260919000001
-- backfill (owner/PM/admin rows pre-seeded), so the first member never needs
-- to be created by a non-member; and is_project_member() short-circuits true
-- for admins, so a superuser can always bootstrap a project.
create policy "project_members_insert" on public.project_members for insert to authenticated
  with check (is_project_member(project_id) and has_permission('planning', 'members', 'edit'));
create policy "project_members_update" on public.project_members for update to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'members', 'edit'))
  with check (is_project_member(project_id) and has_permission('planning', 'members', 'edit'));
create policy "project_members_delete" on public.project_members for delete to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'members', 'delete'));

-- ── 2. role_permissions seed for the new 'members' action ──────────────────
-- Full management: L0-L4 + the Planning Engineer (PE) functional role.
insert into public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, configure, scope)
select r.role_code, 'planning', 'members',
       true, true, true, true, true, true, true, true, true, 'project'
from (values ('L0'), ('L1'), ('L2'), ('L3'), ('L4'), ('PE')) as r(role_code)
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

-- View-only: L5, L6 (site/field staff see the roster, cannot change it).
insert into public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, configure, scope)
select r.role_code, 'planning', 'members',
       true, false, false, false, false, false, false, false, false, 'project'
from (values ('L5'), ('L6')) as r(role_code)
on conflict (role_code, module, action) do update set
  view       = excluded.view,
  edit       = excluded.edit,
  scope      = excluded.scope;

-- Every other role code deliberately gets no 'members' row (has_permission()
-- treats "no row" as false).
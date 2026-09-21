-- Migration: 20260919000001_project_members_and_permission_helpers.sql
-- Purpose: Planning & Scheduling Completion Plan, Phase 1, item F5 — project
--          membership table + generic permission helpers, laying the ground
--          for role-based RLS in Phase 2 (see
--          docs/04-Business-Modules/06-Planning-Scheduling/14-Completion-Plan.md).
--          RLS on project_members itself is permissive (`using (true)`) for
--          now, matching the phased approach — Phase 2 replaces this with
--          proper role-scoped policies once is_project_member()/has_permission()
--          have real callers to protect.
-- Depends on:
--   public.projects        (20260527000008_create_projects.sql)
--   public.profiles        (20260526_0001_create_profiles.sql)
--   public.roles           (20260527000002_create_rbac_tables.sql)
--   public.user_roles      (20260527000002_create_rbac_tables.sql)
--   public.role_permissions(20260527000002_create_rbac_tables.sql)
--   public.wbs_tasks       (20260527000016_create_wbs_enterprise_tables.sql)
--   public.is_admin(uuid)  (20260824035808_usr_rbac_helper_functions.sql)
--
-- Schema verification notes:
--   - role_permissions' exact columns were confirmed against
--     20260527000002_create_rbac_tables.sql: role_code, module, action, view,
--     can_create, edit, delete, submit, approve, reject, export, transmit,
--     configure, reassign, scope. has_permission() below matches the plan's
--     requested p_field mapping exactly (view/edit/can_create/delete/submit/
--     approve/reject/export/configure); `transmit`/`reassign` are not in the
--     plan's requested field list and are intentionally left unreachable via
--     has_permission() for now.
--   - is_admin(uuid) was confirmed to already exist with signature
--     `is_admin(uid uuid default auth.uid()) returns boolean security definer
--     set search_path = ''`, fully-qualifying `public.profiles`/`public.user_roles`
--     internally. is_project_member()/has_permission() below use `security
--     definer set search_path = public` instead (unqualified table refs),
--     matching the literal instruction given for this migration and the
--     search_path style already used by public.create_task_alert_from_audit()
--     (20260527000024_create_task_alerts.sql) — a second established pattern
--     in this codebase alongside the newer usr_ helpers' `search_path = ''`.
--   - public.projects has no `created_by` or `owner` column (confirmed against
--     20260527000008_create_projects.sql: id, project_code, project_name,
--     project_type, client_id, contract_type, contract_value, currency,
--     start_date, end_date, project_status, project_manager_id, description,
--     created_at, updated_at). There is no literal "created_by"/"owner" column
--     to backfill from. `project_manager_id` is the closest semantic
--     equivalent (the person accountable for the project) and is backfilled
--     below so a project's PM is never locked out once RLS tightens in
--     Phase 2 — this is a deliberate substitution for the plan's "project
--     creator" backfill, not a literal match, and is called out here for
--     visibility.

-- ── 1. project_members ─────────────────────────────────────────────────────
create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role_code  text references public.roles(code),
  added_by   uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- project_id is already indexed as the leading column of the primary key;
-- add the reverse lookup.
create index idx_project_members_user on public.project_members(user_id);

alter table public.project_members enable row level security;

-- Permissive for Phase 1 — Phase 2 replaces these with is_project_member() /
-- has_permission()-scoped policies.
create policy "project_members_select_authenticated"
  on public.project_members for select to authenticated using (true);

create policy "project_members_insert_authenticated"
  on public.project_members for insert to authenticated with check (true);

create policy "project_members_update_authenticated"
  on public.project_members for update to authenticated using (true) with check (true);

create policy "project_members_delete_authenticated"
  on public.project_members for delete to authenticated using (true);

-- ── 2. is_project_member() ─────────────────────────────────────────────────
create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select is_admin(auth.uid())
    or exists (
      select 1
      from project_members pm
      where pm.project_id = p_project_id
        and pm.user_id = auth.uid()
    );
$$;

comment on function public.is_project_member(uuid) is
  'RLS helper: true if the current user is an admin (is_admin()) or has a '
  'project_members row for p_project_id. Enforced in Phase 2 RLS policies.';

grant execute on function public.is_project_member(uuid) to authenticated, service_role;

-- ── 3. has_permission() ────────────────────────────────────────────────────
create or replace function public.has_permission(
  p_module text,
  p_action text,
  p_field  text default 'view'
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when is_admin(auth.uid()) then true
    else exists (
      select 1
      from user_roles ur
      join role_permissions rp on rp.role_code = ur.role_code
      where ur.user_id = auth.uid()
        and rp.module = p_module
        and rp.action = p_action
        and (
          case p_field
            when 'view'       then rp.view
            when 'edit'       then rp.edit
            when 'can_create' then rp.can_create
            when 'delete'     then rp.delete
            when 'submit'     then rp.submit
            when 'approve'    then rp.approve
            when 'reject'     then rp.reject
            when 'export'     then rp.export
            when 'configure'  then rp.configure
            else false
          end
        )
    )
  end;
$$;

comment on function public.has_permission(text, text, text) is
  'RLS/app helper mirroring apps/web/lib/permissions.ts hasPermission(): true '
  'for admins, else checks role_permissions for the caller''s role_code(s) on '
  '(p_module, p_action) with the p_field boolean column. Enforced in Phase 2.';

grant execute on function public.has_permission(text, text, text) to authenticated, service_role;

-- ── 4. Backfill ─────────────────────────────────────────────────────────────
-- Every (project_id, owner_id) pair already present on wbs_tasks.
insert into public.project_members (project_id, user_id, role_code)
select distinct wt.project_id, wt.owner_id, null
from public.wbs_tasks wt
where wt.owner_id is not null
on conflict do nothing;

-- projects has no created_by/owner column — substituting project_manager_id
-- (see schema verification note above) so a project's manager is never
-- locked out once RLS tightens in Phase 2.
insert into public.project_members (project_id, user_id, role_code)
select p.id, p.project_manager_id, null
from public.projects p
where p.project_manager_id is not null
on conflict do nothing;

-- Migration: 20260904000001_wbs_lock_backbone.sql
-- Purpose: WBS "Planning backbone" lock. When a wbs_nodes row is locked, that
--          node and its whole subtree stop being structurally editable (name,
--          code, node_type, parent, sort_order) and its GFA
--          (wbs_node_quantities, metric_code = 'GFA') is frozen. Toggling the
--          lock is restricted to admin / project_manager.
-- Depends on: public.wbs_nodes (20260527000009), public.wbs_node_quantities
--             (20260718000002), public.is_admin() (20260824035808),
--             public.profiles / public.user_roles.
-- Note: GFA storage itself is unchanged — the builder grid reuses the existing
--       wbs_node_quantities table.

-- ── 1. Lock columns ────────────────────────────────────────────────────────
alter table public.wbs_nodes
  add column if not exists is_locked boolean not null default false,
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by uuid references auth.users(id);

comment on column public.wbs_nodes.is_locked is
  'When true this node and its whole subtree are the Planning "backbone": '
  'structure (name, code, node_type, parent, sort_order) and GFA are frozen. '
  'Toggled by admin / project_manager only. See 20260904000001.';

-- ── 2. Role helper — admin OR project manager ─────────────────────────────
-- Mirrors public.is_admin() (20260824035808): union of profiles.role and
-- user_roles.role_code. 'L3' is the RBAC code for "Project Manager"
-- (20260527000003_seed_rbac_data.sql); 'project_manager' is the profiles.role
-- string used by the demo seed (seed_demo_users.sql).
create or replace function public.is_wbs_manager(uid uuid default auth.uid())
returns boolean
language sql
security definer set search_path = ''
stable
as $$
  select public.is_admin(uid)
      or exists (
        select 1 from public.profiles p
        where p.id = uid and p.role = 'project_manager'
      )
      or exists (
        select 1 from public.user_roles ur
        where ur.user_id = uid and ur.role_code in ('project_manager', 'L3')
      );
$$;

comment on function public.is_wbs_manager(uuid) is
  'RLS/trigger helper: true if uid is an admin (public.is_admin) or a project '
  'manager (profiles.role = ''project_manager'' OR user_roles.role_code IN '
  '(''project_manager'',''L3'')). Gates WBS lock/unlock and edits to a locked '
  'subtree. See 20260904000001.';

grant execute on function public.is_wbs_manager(uuid) to authenticated, service_role;

-- ── 3. Effective lock: is this node, or any ancestor, locked? ─────────────
create or replace function public.wbs_node_effectively_locked(p_id uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  with recursive up as (
    select id, parent_id, is_locked
    from public.wbs_nodes
    where id = p_id
    union all
    select n.id, n.parent_id, n.is_locked
    from public.wbs_nodes n
    join up on n.id = up.parent_id
  )
  select coalesce(bool_or(is_locked), false) from up;
$$;

comment on function public.wbs_node_effectively_locked(uuid) is
  'True if the node or any of its ancestors has is_locked = true. See 20260904000001.';

grant execute on function public.wbs_node_effectively_locked(uuid) to authenticated, service_role;

-- ── 4. Guard trigger on wbs_nodes ────────────────────────────────────────
-- Blocks structural UPDATE / DELETE on a (transitively) locked node unless the
-- caller is admin/PM. Toggling is_locked / locked_at / locked_by is itself
-- admin/PM only.
create or replace function public.wbs_nodes_lock_guard()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if public.wbs_node_effectively_locked(old.id) and not public.is_wbs_manager() then
      raise exception 'WBS node "%" is locked (Planning backbone) — unlock it first', old.wbs_name
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  -- lock-flag change: admin / project manager only
  if (new.is_locked is distinct from old.is_locked) and not public.is_wbs_manager() then
    raise exception 'Only an admin or project manager can lock or unlock a WBS node'
      using errcode = 'check_violation';
  end if;

  -- structural edit to a locked subtree: admin / project manager only
  if not public.is_wbs_manager()
     and public.wbs_node_effectively_locked(old.id)
     and (new.wbs_name   is distinct from old.wbs_name
       or new.wbs_code   is distinct from old.wbs_code
       or new.node_type  is distinct from old.node_type
       or new.parent_id  is distinct from old.parent_id
       or new.sort_order is distinct from old.sort_order) then
    raise exception 'WBS node "%" is locked (Planning backbone) — unlock it first', old.wbs_name
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_wbs_nodes_lock_guard on public.wbs_nodes;
create trigger trg_wbs_nodes_lock_guard
  before update or delete on public.wbs_nodes
  for each row execute function public.wbs_nodes_lock_guard();

-- ── 5. Freeze GFA writes on a locked subtree (non-admin/PM) ──────────────
create or replace function public.wbs_node_quantities_lock_guard()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_node uuid := coalesce(new.wbs_node_id, old.wbs_node_id);
begin
  if public.wbs_node_effectively_locked(v_node) and not public.is_wbs_manager() then
    raise exception 'GFA for this WBS node is locked (Planning backbone) — unlock it first'
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_wbs_node_quantities_lock_guard on public.wbs_node_quantities;
create trigger trg_wbs_node_quantities_lock_guard
  before insert or update or delete on public.wbs_node_quantities
  for each row execute function public.wbs_node_quantities_lock_guard();

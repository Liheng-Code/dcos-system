-- Migration: 20260919000013_ipc_planning_progress.sql
-- Purpose: Planning & Scheduling Completion Plan, Phase 2, item 2.7 — make
--          Planning's progress % the source of truth QS claim pages read
--          from, via a new as-of-date RPC and provenance columns on the
--          claim items/claims themselves.
-- Depends on:
--   public.qs_claim_items / public.qs_progress_claims (20260531000033)
--   public.qs_boq_items (20260531000023 — wbs_node_id confirmed)
--   public.progress_snapshots (20260531000003, RLS added 20260919000008)
--   public.wbs_nodes (20260527000009_create_wbs_nodes.sql — progress_percent confirmed)
--
-- Schema verification notes:
--   - qs_claim_items' exact current columns (20260531000033): id, claim_id,
--     boq_section_id, boq_item_id, description, unit, scheduled_value,
--     prev_completed, this_period, materials_stored, total_to_date
--     (GENERATED), pct_complete (GENERATED). planning_pct/
--     planning_snapshot_date/override_reason are purely additive below.
--   - qs_boq_items.wbs_node_id (20260531000023) is confirmed to exist,
--     nullable, `references public.wbs_nodes(id) on delete set null` — the
--     link get_node_progress_asof()'s caller (the QS claim-seeding logic,
--     app-side, out of scope for this migration) will join through.
--   - progress_snapshots' exact columns (20260531000003, confirmed again
--     here): id, project_id, wbs_node_id (nullable), snapshot_date,
--     planned_progress, actual_progress, planned_cost, actual_cost,
--     created_by, created_at — matches the plan's assumption exactly.
--   - wbs_nodes.progress_percent (20260527000009) confirmed as the live
--     rollup column name (`numeric not null default 0 check (progress_percent
--     between 0 and 100)`), used as the per-node fallback below.
--   - IMPORTANT dependency note, resolved: progress_snapshots had **zero**
--     RLS policies before 20260919000008_planning_rls_v2.sql landed (RLS was
--     enabled but nothing was ever granted). QS is deliberately NOT granted
--     any 'planning' module permissions in 20260919000007's seed matrix — QS
--     is exactly who this function is for (item 2.7's whole point is QS
--     reading Planning's progress for claims), so a plain SECURITY INVOKER
--     function would see zero snapshot rows for a QS caller and silently
--     fall through to the live wbs_nodes.progress_percent fallback for every
--     node, defeating the "as of a specific date" purpose entirely. Resolved
--     by making get_node_progress_asof() SECURITY DEFINER instead (same
--     pattern as is_project_member()/has_permission() in 20260919000001 and
--     create_task_alert_from_audit() in 20260527000024) rather than widening
--     the QS role's grants — it only returns a percentage per node, nothing
--     sensitive, and this is exactly the narrow read-only cross-module
--     accessor that pattern is for.

-- ── 1. Provenance columns ───────────────────────────────────────────────────
alter table public.qs_claim_items
  add column if not exists planning_pct numeric,
  add column if not exists planning_snapshot_date date,
  add column if not exists override_reason text;

comment on column public.qs_claim_items.planning_pct is
  'The Planning-confirmed progress % (from get_node_progress_asof()) that this claim item''s this_period/pct_complete was pre-filled from. Null for legacy rows created before this pass.';
comment on column public.qs_claim_items.planning_snapshot_date is
  'The as-of date used when planning_pct was looked up (typically the claim''s period_end / data_date).';
comment on column public.qs_claim_items.override_reason is
  'Required by app-level validation (not a DB CHECK) whenever a QS user manually overrides planning_pct with a different claimed quantity.';

alter table public.qs_progress_claims
  add column if not exists data_date date;

comment on column public.qs_progress_claims.data_date is
  'The project data date this claim''s progress figures are anchored to — feeds get_node_progress_asof() and the EVM service''s Planned Value calculation (anchored on data_date instead of wall-clock time, per the completion plan).';

-- ── 2. get_node_progress_asof() ─────────────────────────────────────────────
-- SECURITY DEFINER bypasses RLS entirely, so this must do its own
-- authorization — is_project_member(p_project_id) in the WHERE clause is not
-- optional; without it, any authenticated caller could read any project's
-- progress regardless of membership.
create or replace function public.get_node_progress_asof(p_project_id uuid, p_date date)
returns table (wbs_node_id uuid, progress_pct numeric)
language sql
security definer
set search_path = public
stable
as $$
  select
    n.id as wbs_node_id,
    coalesce(
      (
        select ps.actual_progress
        from public.progress_snapshots ps
        where ps.wbs_node_id = n.id
          and ps.snapshot_date <= p_date
        order by ps.snapshot_date desc
        limit 1
      ),
      n.progress_percent
    ) as progress_pct
  from public.wbs_nodes n
  where n.project_id = p_project_id
    and is_project_member(p_project_id)
$$;

grant execute on function public.get_node_progress_asof(uuid, date) to authenticated;

-- Migration: 20260919000019_procurement_constraint_feed.sql
-- Purpose: Planning & Scheduling Completion Plan Continuation, 3.3 — drive the
--          ready-to-start 'materials' constraint from live procurement state.
--          When a PR/PO reaches a decisive approval / delivery status, its
--          task's materials constraint row is upserted automatically. User
--          overrides are FROZEN: any task_constraints row with source =
--          'manual' is never touched by these triggers.
-- Depends on:
--   public.task_constraints (20260905100449) — already exists in the hosted
--     DB (Phase 1 applied), so these triggers start working immediately once
--     this migration is applied, independent of 20260919000008.
--   public.procurement_prs / procurement_pos / procurement_po_items
--     (20260531000005_create_procurement_tables.sql)
--   public.wbs_tasks (task id + wbs_node_id link for the node fallback)
--
-- Design notes / deviations recorded here per the continuation plan:
--   - The plan called for a central refresh_task_constraint(p_task_id,
--     p_constraint_type) that re-resolves status from source rows. The
--     decision recorded here is the MORE robust variant: a central
--     upsert_constraint(p_task_id, p_constraint_type, p_status, p_source,
--     p_source_ref, p_notes) that centralizes the WRITE + the manual-freeze
--     rule, while each trigger computes its own status from the row it fired
--     on (no broad rescans, no trigger recursion, idempotent). The pure
--     status-mapping used by the readiness board lives in
--     apps/web/lib/planning/constraint-feed-mapping.ts and mirrors these
--     tables exactly (verified by vitest in 3.5).
--   - upsert_constraint() is SECURITY DEFINER deliberately: the triggering
--     user is usually a procurement/build officer who must NOT be blocked by
--     (or granted) planning RLS. The definer writes are confined to
--     task_constraints with a fixed column set; task/type/status are still
--     enforcement-gated by the table's own CHECK/unique constraints. The
--     manual-freeze rule is caveated in the docs: a manual row can still be
--     replaced by a manual edit (same source), never by automation.
--   - procurement_po_items triggers only refine the notes on an existing
--     row's expected-delivery date (PO items have no task link of their own;
--     the material status itself comes from the PO).

-- ── 1. Central writer (manual-freeze aware) ────────────────────────────────
create or replace function public.upsert_constraint(
  p_task_id          uuid,
  p_constraint_type  text,
  p_status           text,
  p_source           text,
  p_source_ref       uuid,
  p_notes            text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.task_constraints
    (task_id, constraint_type, status, source, source_ref, notes, updated_by)
  values (p_task_id, p_constraint_type, p_status, p_source, p_source_ref, p_notes, auth.uid())
  on conflict (task_id, constraint_type)
  do update set
    status     = excluded.status,
    source     = excluded.source,
    source_ref = excluded.source_ref,
    notes      = coalesce(excluded.notes, task_constraints.notes),
    updated_by = excluded.updated_by,
    updated_at = now()
  where task_constraints.source <> 'manual';
end;
$$;

-- ── 2. PR → materials ──────────────────────────────────────────────────────
create or replace function public.sync_pr_to_constraint()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.task_id is null then
    return new;
  end if;

  if new.approval_status = 'approved' then
    perform public.upsert_constraint(
      new.task_id, 'materials', 'pending', 'pr', new.id,
      'PR ' || new.pr_number || ' approved'
    );
  elsif new.approval_status in ('rejected', 'cancelled', 'closed') then
    perform public.upsert_constraint(
      new.task_id, 'materials', 'missing', 'pr', new.id,
      'PR ' || new.pr_number || ' ' || new.approval_status
    );
  elsif new.approval_status = 'returned' then
    perform public.upsert_constraint(
      new.task_id, 'materials', 'missing', 'pr', new.id,
      'PR ' || new.pr_number || ' returned for correction'
    );
  end if;

  return new;
end;
$$;

-- Postgres forbids referencing OLD in an INSERT trigger's WHEN clause (there
-- is no OLD row to compare on insert), so the insert and update cases are
-- split into two triggers rather than one combined "insert or update" one.
drop trigger if exists trg_procurement_prs_constraint on public.procurement_prs;
drop trigger if exists trg_procurement_prs_constraint_ins on public.procurement_prs;
drop trigger if exists trg_procurement_prs_constraint_upd on public.procurement_prs;
create trigger trg_procurement_prs_constraint_ins
  after insert on public.procurement_prs
  for each row
  execute function public.sync_pr_to_constraint();
create trigger trg_procurement_prs_constraint_upd
  after update of approval_status on public.procurement_prs
  for each row
  when (old.approval_status is distinct from new.approval_status)
  execute function public.sync_pr_to_constraint();

-- ── 3. PO → materials ──────────────────────────────────────────────────────
create or replace function public.sync_po_to_constraint()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v record;
begin
  -- Resolve target task(s): prefer PR.task_id, fall back to tasks directly
  -- under the PO's wbs_node_id. Never propagates to an arbitrary subtree.
  for v in
    select pr.task_id as tid
    from public.procurement_prs pr
    where pr.id = new.pr_id and pr.task_id is not null
    union
    select t.id as tid
    from public.wbs_tasks t
    where t.wbs_node_id = new.wbs_node_id
  loop
    if new.status = 'delivered' then
      perform public.upsert_constraint(
        v.tid, 'materials', 'ok', 'pos', new.id,
        'PO ' || new.po_number || ' delivered'
      );
    elsif new.status in ('approved', 'issued', 'partially_delivered') then
      perform public.upsert_constraint(
        v.tid, 'materials', 'pending', 'pos', new.id,
        'PO ' || new.po_number || ' ' || new.status
      );
    elsif new.status in ('on_hold', 'cancelled') then
      perform public.upsert_constraint(
        v.tid, 'materials', 'missing', 'pos', new.id,
        'PO ' || new.po_number || ' ' || new.status
      );
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_procurement_pos_constraint on public.procurement_pos;
drop trigger if exists trg_procurement_pos_constraint_ins on public.procurement_pos;
drop trigger if exists trg_procurement_pos_constraint_upd on public.procurement_pos;
create trigger trg_procurement_pos_constraint_ins
  after insert on public.procurement_pos
  for each row
  execute function public.sync_po_to_constraint();
create trigger trg_procurement_pos_constraint_upd
  after update of status on public.procurement_pos
  for each row
  when (old.status is distinct from new.status)
  execute function public.sync_po_to_constraint();

-- ── 4. PO item expected delivery → notes on the materials row ──────────────
-- Po_items have no task link; they land on the same task(s) as their PO and
-- only annotate the delivery date expected. Status remains the PO's call.
create or replace function public.sync_po_item_delivery_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po_number text;
begin
  if new.delivery_date_expected is null then
    return new;
  end if;

  select po.po_number into v_po_number
  from public.procurement_pos po
  where po.id = new.po_id;

  if v_po_number is null then
    return new;
  end if;

  update public.task_constraints tc
  set notes = 'PO ' || v_po_number || ' expected ' || new.delivery_date_expected::text,
      updated_at = now()
  where tc.constraint_type = 'materials'
    and tc.source <> 'manual'
    and tc.task_id in (
      select pr.task_id
      from public.procurement_pos po
      join public.procurement_prs pr on pr.id = po.pr_id
      where po.id = new.po_id
        and pr.task_id is not null
    );

  return new;
end;
$$;

drop trigger if exists trg_procurement_po_item_constraint_note on public.procurement_po_items;
drop trigger if exists trg_procurement_po_item_constraint_note_ins on public.procurement_po_items;
drop trigger if exists trg_procurement_po_item_constraint_note_upd on public.procurement_po_items;
create trigger trg_procurement_po_item_constraint_note_ins
  after insert on public.procurement_po_items
  for each row
  execute function public.sync_po_item_delivery_note();
create trigger trg_procurement_po_item_constraint_note_upd
  after update of delivery_date_expected on public.procurement_po_items
  for each row
  when (old.delivery_date_expected is distinct from new.delivery_date_expected)
  execute function public.sync_po_item_delivery_note();

grant execute on function public.upsert_constraint(uuid, text, text, text, uuid, text) to authenticated;
-- Migration: 20260919000020_document_rfi_inspection_feed.sql
-- Purpose: Planning & Scheduling Completion Plan Continuation, 3.4 — drive the
--          remaining ready-to-start constraints from live Design / QA-QC
--          state:
--            'drawings' <- documents.   (document_revisions as the transit)
--            'permits'  <- design_rfi + ITP hold-point inspection results
--          Behaviour follows the SAME contract as 20260919000019:
--          upsert_constraint() centralizes the write and FROZENS user
--          overrides (any row with source='manual' is never touched). Where
--          two feeds share a constraint_type (rfi + inspection both feed
--          'permits'), the last automatic write wins — a row the planner has
--          manually pinned (source='manual') is exempt from every feed. This
--          last-write-wins contract is recorded here explicitly; the
--          readiness board surfaces which feed owns the row via
--          task_constraints.source/source_ref.
-- Depends on:
--   public.task_constraints (20260905100449), public.upsert_constraint()
--     (20260919000019)
--   public.documents / document_revisions / document_revision_task_links
--     (20260527000010_create_document_control.sql + 20260531000001)
--   public.design_rfi (20260531000052_drawing_markup_redline.sql)
--   public.inspection_results / inspection_requests / itp_items
--     (20260531000010_create_qaqc_tables.sql)
--   public.wbs_nodes(id, parent_id), public.wbs_tasks(id, wbs_node_id)
--
-- Shape/deviations recorded per the continuation plan:
--   - documents.status CHECK confirmed: draft, submitted, under_review,
--     approved, approved_with_comment, rejected, ifc, superseded, archived.
--   - design_rfi.status CHECK confirmed: open, answered, closed, cancelled.
--   - inspection_requests.status CHECK: draft, submitted, scheduled,
--     inspected, passed, failed, closed. inspection_results.result CONFOUND:
--     pass, fail, na, pending (nullable). itp_items.inspection_type: hold,
--     witness, review.
--   - Node→task resolution is the wbs SUBTREE (recursive CTE on parent_id),
--     not just direct children, so constraints inherited by sub-packages land
--     on their own tasks. The recursive helper tasks_below_node() is SECURITY
--     DEFINER but is read-only and scoped, mirroring upsert_constraint().
--   - superseded/archived documents deliberately LEAVE their drawings row as
--     it stands (the current issue chain is the drawing controller's call, not
--     an automatic unblock).

-- ── 0. Shared node→task helper ─────────────────────────────────────────────
create or replace function public.tasks_below_node(p_node uuid)
returns table (task_id uuid)
language sql
security definer
set search_path = public
as $$
  with recursive sub as (
    select n.id from public.wbs_nodes n where n.id = p_node
    union all
    select n.id from public.wbs_nodes n join sub s on n.parent_id = s.id
  )
  select t.id as task_id
  from public.wbs_tasks t
  join sub s on t.wbs_node_id = s.id
$$;

-- ── 1. Drawings feed (documents / document_revisions → 'drawings') ─────────
create or replace function public.sync_document_to_constraint(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_target text := 'unknown';
  v_doc_number text;
  v_task uuid;
begin
  select d.status, d.document_number into v_status, v_doc_number
  from public.documents d where d.id = p_document_id;
  if v_status is null then return; end if;

  if v_status in ('approved', 'ifc') then
    v_target := 'ok';
  elsif v_status in ('submitted', 'under_review', 'approved_with_comment') then
    v_target := 'pending';
  elsif v_status in ('draft', 'rejected') then
    v_target := 'missing';
  else
    return; -- superseded / archived: leave the current row untouched
  end if;

  for v_task in
    select distinct l.task_id
    from public.document_revision_task_links l
    join public.document_revisions r on r.id = l.revision_id
    where r.document_id = p_document_id and l.link_type = 'constraint'

    union

    select t.task_id
    from public.tasks_below_node((select d.wbs_node_id from public.documents d where d.id = p_document_id)) t
  loop
    perform public.upsert_constraint(
      v_task, 'drawings', v_target::text, 'document', p_document_id,
      v_doc_number || ' (' || v_status || ')'
    );
  end loop;
end;
$$;

create or replace function public.trg_sync_document_status()
returns trigger language plpgsql
as $$
begin
  perform public.sync_document_to_constraint(new.id);
  return new;
end;
$$;

create or replace function public.trg_sync_document_revision_status()
returns trigger language plpgsql
as $$
begin
  perform public.sync_document_to_constraint(new.document_id);
  return new;
end;
$$;

-- Postgres forbids referencing OLD in an INSERT trigger's WHEN clause (there
-- is no OLD row to compare on insert), so the insert and update cases are
-- split into two triggers rather than one combined "insert or update" one.
drop trigger if exists trg_documents_to_constraint on public.documents;
drop trigger if exists trg_documents_to_constraint_ins on public.documents;
drop trigger if exists trg_documents_to_constraint_upd on public.documents;
create trigger trg_documents_to_constraint_ins
  after insert on public.documents
  for each row
  execute function public.trg_sync_document_status();
create trigger trg_documents_to_constraint_upd
  after update of status on public.documents
  for each row
  when (old.status is distinct from new.status)
  execute function public.trg_sync_document_status();

drop trigger if exists trg_document_revisions_to_constraint on public.document_revisions;
drop trigger if exists trg_document_revisions_to_constraint_ins on public.document_revisions;
drop trigger if exists trg_document_revisions_to_constraint_upd on public.document_revisions;
create trigger trg_document_revisions_to_constraint_ins
  after insert on public.document_revisions
  for each row
  execute function public.trg_sync_document_revision_status();
create trigger trg_document_revisions_to_constraint_upd
  after update of status on public.document_revisions
  for each row
  when (old.status is distinct from new.status)
  execute function public.trg_sync_document_revision_status();

-- ── 2. RFI feed (design_rfi → 'permits') ───────────────────────────────────
create or replace function public.sync_rfi_to_constraint()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_remaining int;
  v_task uuid;
begin
  if new.wbs_node_id is null then
    return new;
  end if;

  if new.status = 'open' then
    for v_task in
      select t.task_id from public.tasks_below_node(new.wbs_node_id) t
    loop
      perform public.upsert_constraint(
        v_task, 'permits', 'missing', 'rfi', new.id,
        'RFI ' || new.rfi_no || ' open — design answer pending'
      );
    end loop;
  elsif new.status in ('answered', 'closed', 'cancelled') then
    -- Recompute: only free the hold when NO other RFI on that node is open.
    -- (Shared 'permits' rows are last-write-wins across feeds; a manual pin
    --  is exempt via upsert_constraint().)
    for v_task in
      select t.task_id from public.tasks_below_node(new.wbs_node_id) t
    loop
      select count(*) into v_remaining
      from public.design_rfi r
      where r.wbs_node_id = new.wbs_node_id
        and r.status = 'open'
        and r.id <> new.id;

      perform public.upsert_constraint(
        v_task, 'permits',
        case when v_remaining > 0 then 'missing' else 'unknown' end,
        'rfi', new.id,
        'RFI ' || new.rfi_no || ' ' || new.status
      );
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_design_rfi_to_constraint on public.design_rfi;
drop trigger if exists trg_design_rfi_to_constraint_ins on public.design_rfi;
drop trigger if exists trg_design_rfi_to_constraint_upd on public.design_rfi;
create trigger trg_design_rfi_to_constraint_ins
  after insert on public.design_rfi
  for each row
  execute function public.sync_rfi_to_constraint();
create trigger trg_design_rfi_to_constraint_upd
  after update of status on public.design_rfi
  for each row
  when (old.status is distinct from new.status)
  execute function public.sync_rfi_to_constraint();

-- ── 3. Inspection hold-point feed (inspection_results → 'permits') ─────────
create or replace function public.sync_inspection_holds_to_constraint()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_req_id   uuid;
  v_ir_number text;
  v_task_id  uuid;
  v_node_id  uuid;
  v_failed   int;
  v_task     uuid;
  v_notes    text;
begin
  -- Only hold-point items gate the constraint.
  if not exists (
    select 1 from public.itp_items ii
    where ii.id = new.itp_item_id and ii.inspection_type = 'hold'
  ) then
    return new;
  end if;

  select ir.id, ir.ir_number, ir.wbs_task_id, ir.wbs_node_id
    into v_req_id, v_ir_number, v_task_id, v_node_id
  from public.inspection_requests ir
  where ir.id = new.inspection_request_id;

  if v_req_id is null then
    return new;
  end if;

  if new.result in ('fail', 'pending') then
    for v_task in
      select t.task_id
      from public.tasks_below_node(v_node_id) t
      where v_task_id is null
      union
      select v_task_id
      where v_task_id is not null
    loop
      perform public.upsert_constraint(
        v_task, 'permits', 'missing', 'inspection', v_req_id,
        'IR ' || v_ir_number || ' — hold point ' || new.result
      );
    end loop;
  elsif new.result in ('pass', 'na') then
    -- Recompute the whole request: any hold item still failed/pending blocks.
    select count(*) into v_failed
    from public.inspection_results r
    join public.itp_items ii on ii.id = r.itp_item_id
    where r.inspection_request_id = v_req_id
      and ii.inspection_type = 'hold'
      and r.result in ('fail', 'pending');

    v_notes := case when v_failed > 0
      then 'IR ' || v_ir_number || ' — hold items outstanding'
      else 'IR ' || v_ir_number || ' — hold points cleared' end;

    for v_task in
      select t.task_id
      from public.tasks_below_node(v_node_id) t
      where v_task_id is null
      union
      select v_task_id
      where v_task_id is not null
    loop
      perform public.upsert_constraint(
        v_task, 'permits',
        case when v_failed > 0 then 'missing' else 'unknown' end,
        'inspection', v_req_id, v_notes
      );
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_inspection_holds_to_constraint on public.inspection_results;
drop trigger if exists trg_inspection_holds_to_constraint_ins on public.inspection_results;
drop trigger if exists trg_inspection_holds_to_constraint_upd on public.inspection_results;
create trigger trg_inspection_holds_to_constraint_ins
  after insert on public.inspection_results
  for each row
  execute function public.sync_inspection_holds_to_constraint();
create trigger trg_inspection_holds_to_constraint_upd
  after update of result on public.inspection_results
  for each row
  when (old.result is distinct from new.result)
  execute function public.sync_inspection_holds_to_constraint();
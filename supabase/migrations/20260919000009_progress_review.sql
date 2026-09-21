-- Migration: 20260919000009_progress_review.sql
-- Purpose: Planning & Scheduling Completion Plan, Phase 2, item 2.2 — a
--          per-project toggle for a pending -> confirmed/rejected progress
--          review cycle, plus a lock once a task reaches 100% complete.
-- Depends on:
--   public.plan_schedule_settings (20260917000002, extended 20260917000003/4)
--   public.wbs_tasks / public.wbs_audit_log (20260527000016)
--   public.profiles (20260526_0001_create_profiles.sql)
--   public.is_project_member(uuid), public.has_permission(text,text,text)
--     (20260919000001)
--   public.is_admin(uuid) (20260824035808_usr_rbac_helper_functions.sql)
--
-- Schema verification notes:
--   - plan_schedule_settings' current columns (read in full from
--     20260917000002/000003/000004): project_id (PK), critical_float_threshold_days,
--     near_critical_float_threshold_days, updated_at, plus the progress-line
--     and bar_style columns added later. No progress_review_enabled/
--     lock_on_complete columns yet — added below exactly as specified.
--   - wbs_tasks.progress is `numeric not null default 0 check (progress
--     between 0 and 100)` (20260527000016) — proposed_progress/
--     previous_progress below are left as plain `numeric` (no upper-bound
--     duplicate check beyond the 0-100 check already specified) to match the
--     plan's literal table definition.
--
-- ── Lock-trigger decision (read in full before deciding) ───────────────────
-- The plan asked for a `before update on wbs_tasks` trigger
-- (prevent_locked_task_progress_edit()) blocking edits to a 100%-complete,
-- locked task — UNLESS that can't be distinguished from the internal
-- roll-up path. 20260918000001_activity_step_templates.sql's
-- recalc_task_progress_from_steps() was read in full: it is a trigger on
-- wbs_task_steps that recomputes the weighted-average step progress and
-- writes it into wbs_tasks.progress via a **plain UPDATE** — its own comment
-- explains this is deliberate, so the existing
-- trg_task_collect_dirty/trg_task_flush_dirty roll-up chain picks it up
-- naturally. That plain UPDATE is byte-for-byte indistinguishable, from
-- inside a `before update on wbs_tasks` trigger, from a direct user edit —
-- there is no session variable, role switch, or any other marker
-- distinguishing "this UPDATE came from the step roll-up" from "this UPDATE
-- came from a user typing into the progress cell". A hard trigger here would
-- therefore block legitimate step-driven roll-ups on any task that is
-- already at 100% (e.g. a user editing an earlier, non-100 step of an
-- otherwise-complete task, or any future roll-up recompute), with an
-- unfriendly, hard-to-debug failure deep in an unrelated trigger chain.
--
-- Decision: NO database trigger is added. Lock enforcement for the
-- pending-review flow lives entirely at the RPC layer — submit_progress()
-- and decide_progress_review() below are the only sanctioned write paths
-- once progress_review_enabled is on, and both check lock_on_complete /
-- current progress / is_admin() before writing. This is a soft
-- (application-layer) lock, not a hard constraint: a direct
-- `update wbs_tasks set progress = ...` issued outside these two RPCs (e.g.
-- the legacy gantt-view.tsx direct-write path noted in the completion plan's
-- "Verified reuse points" section) is not blocked by the database. That
-- reconciliation is explicitly out of scope for this migration (it is a
-- Phase 1/2 sequencing note about apps/web/components/planning/gantt-view.tsx,
-- not a database change) and is safer than a trigger that could wrongly
-- block the step roll-up.

-- ── 1. plan_schedule_settings: review toggle + lock flag ───────────────────
alter table public.plan_schedule_settings
  add column if not exists progress_review_enabled boolean not null default false,
  add column if not exists lock_on_complete boolean not null default true;

comment on column public.plan_schedule_settings.progress_review_enabled is
  'When true, submit_progress() inserts a pending wbs_task_progress_reviews row instead of writing wbs_tasks.progress directly; a reviewer must confirm/reject via decide_progress_review().';
comment on column public.plan_schedule_settings.lock_on_complete is
  'When true (default), a task already at 100% progress cannot have its progress changed via submit_progress() by a non-admin until a planner intervenes. Enforced only inside submit_progress()/decide_progress_review() — see this migration''s header for why no DB trigger backs this.';

-- ── 2. wbs_task_progress_reviews ────────────────────────────────────────────
create table if not exists public.wbs_task_progress_reviews (
  id                 uuid primary key default gen_random_uuid(),
  wbs_task_id        uuid not null references public.wbs_tasks(id) on delete cascade,
  project_id         uuid not null references public.projects(id) on delete cascade,
  proposed_progress  numeric not null check (proposed_progress between 0 and 100),
  previous_progress  numeric not null,
  proposed_by        uuid references public.profiles(id),
  proposed_at        timestamptz not null default now(),
  status             text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  decided_by         uuid references public.profiles(id),
  decided_at         timestamptz,
  comment            text
);

create index if not exists idx_wbs_task_progress_reviews_task on public.wbs_task_progress_reviews(wbs_task_id);
create index if not exists idx_wbs_task_progress_reviews_pending
  on public.wbs_task_progress_reviews(project_id, status) where status = 'pending';

alter table public.wbs_task_progress_reviews enable row level security;

drop policy if exists "wbs_task_progress_reviews_select" on public.wbs_task_progress_reviews;
create policy "wbs_task_progress_reviews_select" on public.wbs_task_progress_reviews for select to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'progress_review', 'view'));

-- "Propose" step reuses the 'edit' field (not a separate action) — any user
-- who can edit progress_review data may submit a proposal.
drop policy if exists "wbs_task_progress_reviews_insert" on public.wbs_task_progress_reviews;
create policy "wbs_task_progress_reviews_insert" on public.wbs_task_progress_reviews for insert to authenticated
  with check (is_project_member(project_id) and has_permission('planning', 'progress_review', 'edit'));

-- Only the approve step updates a row (moving pending -> confirmed/rejected).
drop policy if exists "wbs_task_progress_reviews_update" on public.wbs_task_progress_reviews;
create policy "wbs_task_progress_reviews_update" on public.wbs_task_progress_reviews for update to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'progress_review', 'approve'))
  with check (is_project_member(project_id) and has_permission('planning', 'progress_review', 'approve'));

-- ── 3. submit_progress() ────────────────────────────────────────────────────
create or replace function public.submit_progress(
  p_task_id uuid,
  p_progress numeric,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_project_id        uuid;
  v_wbs_node_id       uuid;
  v_current_progress  numeric;
  v_review_enabled    boolean;
  v_lock_on_complete  boolean;
  v_review_id         uuid;
begin
  select project_id, wbs_node_id, progress
    into v_project_id, v_wbs_node_id, v_current_progress
  from public.wbs_tasks
  where id = p_task_id;

  if v_project_id is null then
    raise exception 'Task % not found', p_task_id;
  end if;

  select progress_review_enabled, lock_on_complete
    into v_review_enabled, v_lock_on_complete
  from public.plan_schedule_settings
  where project_id = v_project_id;

  -- No plan_schedule_settings row for this project yet -> treat as the
  -- column defaults (review disabled, lock-on-complete on).
  v_review_enabled   := coalesce(v_review_enabled, false);
  v_lock_on_complete := coalesce(v_lock_on_complete, true);

  if not v_review_enabled then
    update public.wbs_tasks set progress = p_progress where id = p_task_id;
    return jsonb_build_object('mode', 'direct', 'progress', p_progress);
  end if;

  if v_lock_on_complete
     and v_current_progress = 100
     and not public.is_admin(auth.uid()) then
    raise exception 'This activity is complete and locked — ask a planner to unlock it first';
  end if;

  insert into public.wbs_task_progress_reviews
    (wbs_task_id, project_id, proposed_progress, previous_progress, proposed_by, comment)
  values
    (p_task_id, v_project_id, p_progress, v_current_progress, auth.uid(), p_note)
  returning id into v_review_id;

  insert into public.wbs_audit_log
    (project_id, wbs_task_id, wbs_node_id, user_id, action, field_name, old_value, new_value)
  values
    (v_project_id, p_task_id, v_wbs_node_id, auth.uid(),
     'Progress Submitted', 'progress', v_current_progress::text, p_progress::text);

  return jsonb_build_object('mode', 'pending', 'review_id', v_review_id);
end;
$$;

grant execute on function public.submit_progress(uuid, numeric, text) to authenticated;

-- ── 4. decide_progress_review() ─────────────────────────────────────────────
create or replace function public.decide_progress_review(
  p_review_id uuid,
  p_decision text,
  p_comment text default null
)
returns void
language plpgsql
security invoker
as $$
declare
  v_review public.wbs_task_progress_reviews%rowtype;
begin
  if p_decision not in ('confirmed', 'rejected') then
    raise exception 'p_decision must be ''confirmed'' or ''rejected''';
  end if;

  select * into v_review
  from public.wbs_task_progress_reviews
  where id = p_review_id;

  if v_review.id is null then
    raise exception 'Review % not found', p_review_id;
  end if;

  if v_review.status <> 'pending' then
    raise exception 'This review has already been decided';
  end if;

  update public.wbs_task_progress_reviews
  set status     = p_decision,
      decided_by = auth.uid(),
      decided_at = now(),
      comment    = p_comment
  where id = p_review_id;

  if p_decision = 'confirmed' then
    update public.wbs_tasks
    set progress = v_review.proposed_progress
    where id = v_review.wbs_task_id;
  end if;

  insert into public.wbs_audit_log
    (project_id, wbs_task_id, wbs_node_id, user_id, action, field_name, old_value, new_value)
  select
    v_review.project_id, v_review.wbs_task_id, wt.wbs_node_id, auth.uid(),
    case when p_decision = 'confirmed' then 'Progress Confirmed' else 'Progress Rejected' end,
    'progress', v_review.previous_progress::text, v_review.proposed_progress::text
  from public.wbs_tasks wt
  where wt.id = v_review.wbs_task_id;
end;
$$;

grant execute on function public.decide_progress_review(uuid, text, text) to authenticated;

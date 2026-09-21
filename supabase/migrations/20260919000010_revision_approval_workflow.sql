-- Migration: 20260919000010_revision_approval_workflow.sql
-- Purpose: Planning & Scheduling Completion Plan, Phase 2, item 2.3 —
--          status lifecycle + step-chain approvals for plan_schedule_revisions
--          (draft -> submitted_internal -> approved_internal ->
--          submitted_client -> approved_client | rejected), with four-eyes
--          review and automatic client-accepted baseline creation.
-- Depends on:
--   public.plan_schedule_revisions / plan_schedule_streams (20260905100449)
--   public.qs_claim_approvals (20260728000003 — shape mirrored)
--   public.project_approval_flows (20260527000015_extend_project_setup.sql)
--   public.transmittals (20260527000029_create_transmittal_tables.sql)
--   public.wbs_baselines / public.set_baseline (…, extended in 20260919000004)
--   public.is_project_member(uuid), public.has_permission(text,text,text)
--     (20260919000001)
--
-- Schema verification notes:
--   - plan_schedule_revisions' exact current columns (read in full from
--     20260905100449_plan_schedule_streams.sql): id, stream_id, revision_number,
--     note, snapshot_data, created_by, created_at. No mismatches versus the
--     plan's assumptions — the new columns below are purely additive.
--   - qs_claim_approvals' shape (20260728000003_qs_claim_approval_chain.sql):
--     id, claim_id, step, approver_role, user_id, decision, comments,
--     decided_at, created_at, unique(claim_id, step). plan_revision_approvals
--     below mirrors this exactly (substituting revision_id for claim_id),
--     plus a created_at column for consistency with that mirrored shape
--     (the plan's literal column list omitted it; added here as a harmless,
--     purely additive column matching the pattern being mirrored).
--   - project_approval_flows' exact shape (20260527000015_extend_project_setup.sql):
--     id, project_id, flow_type, role_chain jsonb, created_at, updated_at,
--     unique(project_id, flow_type). IMPORTANT MISMATCH: flow_type has a CHECK
--     constraint limited to ('drawing_approval','rfi_response',
--     'material_approval','method_statement','pr_po_approval',
--     'inspection_request','ncr_closeout') — 'programme_revision' is NOT an
--     allowed value, so a project_approval_flows row with that flow_type can
--     never exist under the current schema (inserting one would violate the
--     CHECK). Per the plan's own "use your judgement, document the fallback"
--     instruction: transition_revision()'s 'submit' branch below still
--     performs the lookup (so it starts respecting a configured chain
--     automatically if that CHECK is ever widened in a future migration —
--     out of scope here), but it is documented that the lookup will always
--     return no rows today, and the single-step approver_role='PE' fallback
--     is what actually executes on every 'submit' call.
--   - public.transmittals (20260527000029_create_transmittal_tables.sql) DOES
--     exist with an `id uuid primary key` — plan_schedule_revisions.transmittal_id
--     below is therefore a real `references public.transmittals(id)` FK, not
--     a bare uuid.
--   - public.set_baseline(uuid, int, uuid[], text, text, text) (extended in
--     20260919000004_baseline_governance.sql) is SECURITY INVOKER and raises
--     'A reason is required to create a revised baseline' when p_type =
--     'revised' and p_reason is null or shorter than 10 characters after
--     trim() — transition_revision()'s client_approve branch below catches
--     exactly that message and re-raises a clearer, caller-facing one asking
--     for a longer p_comment, per the plan's instruction.

-- ── 1. plan_schedule_revisions: status lifecycle columns ───────────────────
alter table public.plan_schedule_revisions
  add column if not exists status text not null default 'draft'
    check (status in ('draft', 'submitted_internal', 'approved_internal', 'submitted_client', 'approved_client', 'rejected')),
  add column if not exists submitted_by uuid references public.profiles(id),
  add column if not exists submitted_at timestamptz,
  add column if not exists transmittal_id uuid references public.transmittals(id),
  add column if not exists decision_comment text;

-- ── 2. plan_revision_approvals ───────────────────────────────────────────────
create table public.plan_revision_approvals (
  id             uuid primary key default gen_random_uuid(),
  revision_id    uuid not null references public.plan_schedule_revisions(id) on delete cascade,
  step           int not null,
  approver_role  text,
  user_id        uuid references public.profiles(id),
  decision       text not null default 'pending' check (decision in ('pending', 'approved', 'rejected')),
  comments       text,
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),
  unique (revision_id, step)
);

create index idx_plan_revision_approvals_revision on public.plan_revision_approvals(revision_id);

alter table public.plan_revision_approvals enable row level security;

create policy "plan_revision_approvals_select" on public.plan_revision_approvals for select to authenticated
  using (
    exists (
      select 1
      from public.plan_schedule_revisions pr
      join public.plan_schedule_streams pss on pss.id = pr.stream_id
      where pr.id = plan_revision_approvals.revision_id
        and is_project_member(pss.project_id)
    )
  );

create policy "plan_revision_approvals_insert" on public.plan_revision_approvals for insert to authenticated
  with check (
    exists (
      select 1
      from public.plan_schedule_revisions pr
      join public.plan_schedule_streams pss on pss.id = pr.stream_id
      where pr.id = plan_revision_approvals.revision_id
        and is_project_member(pss.project_id)
    )
    and has_permission('planning', 'programme', 'approve')
  );

create policy "plan_revision_approvals_update" on public.plan_revision_approvals for update to authenticated
  using (
    exists (
      select 1
      from public.plan_schedule_revisions pr
      join public.plan_schedule_streams pss on pss.id = pr.stream_id
      where pr.id = plan_revision_approvals.revision_id
        and is_project_member(pss.project_id)
    )
    and has_permission('planning', 'programme', 'approve')
  )
  with check (
    exists (
      select 1
      from public.plan_schedule_revisions pr
      join public.plan_schedule_streams pss on pss.id = pr.stream_id
      where pr.id = plan_revision_approvals.revision_id
        and is_project_member(pss.project_id)
    )
    and has_permission('planning', 'programme', 'approve')
  );

create policy "plan_revision_approvals_delete" on public.plan_revision_approvals for delete to authenticated
  using (
    exists (
      select 1
      from public.plan_schedule_revisions pr
      join public.plan_schedule_streams pss on pss.id = pr.stream_id
      where pr.id = plan_revision_approvals.revision_id
        and is_project_member(pss.project_id)
    )
    and has_permission('planning', 'programme', 'approve')
  );

-- ── 3. transition_revision() ────────────────────────────────────────────────
create or replace function public.transition_revision(
  p_revision_id uuid,
  p_action text,
  p_comment text default null
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_project_id         uuid;
  v_stream_name        text;
  v_status             text;
  v_old_status         text;
  v_submitted_by       uuid;
  v_role_chain         jsonb;
  v_step               int;
  v_pending_approval_id uuid;
  v_total_steps        int;
  v_approved_steps     int;
  v_baseline_slot      int;
  v_baseline_type      text;
begin
  select pss.project_id, pss.name, pr.status, pr.submitted_by
    into v_project_id, v_stream_name, v_status, v_submitted_by
  from public.plan_schedule_revisions pr
  join public.plan_schedule_streams pss on pss.id = pr.stream_id
  where pr.id = p_revision_id;

  if v_project_id is null then
    raise exception 'Revision % not found', p_revision_id;
  end if;

  v_old_status := v_status;

  if p_action = 'submit' then
    if v_status <> 'draft' then
      raise exception 'Cannot submit a revision that is not in draft status';
    end if;
    if not public.has_permission('planning', 'programme', 'submit') then
      raise exception 'You do not have permission to submit a programme revision';
    end if;

    update public.plan_schedule_revisions
    set status = 'submitted_internal', submitted_by = auth.uid(), submitted_at = now()
    where id = p_revision_id;

    -- See this migration's header: this lookup can never find a row today
    -- because project_approval_flows.flow_type's CHECK constraint does not
    -- include 'programme_revision'. Kept for forward compatibility.
    select role_chain into v_role_chain
    from public.project_approval_flows
    where project_id = v_project_id and flow_type = 'programme_revision';

    if v_role_chain is not null and jsonb_array_length(v_role_chain) > 0 then
      for v_step in 1..jsonb_array_length(v_role_chain) loop
        insert into public.plan_revision_approvals (revision_id, step, approver_role)
        values (p_revision_id, v_step, v_role_chain ->> (v_step - 1));
      end loop;
    else
      insert into public.plan_revision_approvals (revision_id, step, approver_role)
      values (p_revision_id, 1, 'PE');
    end if;

    insert into public.wbs_audit_log
      (project_id, wbs_task_id, wbs_node_id, user_id, action, field_name, old_value, new_value)
    values
      (v_project_id, null, null, auth.uid(), 'Revision Submitted', 'status', v_old_status, 'submitted_internal');

    return jsonb_build_object('status', 'submitted_internal');

  elsif p_action = 'approve' then
    if v_status <> 'submitted_internal' then
      raise exception 'Cannot approve a revision that is not submitted for internal review';
    end if;
    if auth.uid() = v_submitted_by then
      raise exception 'Four-eyes check failed: the submitter cannot also approve this revision';
    end if;
    if not public.has_permission('planning', 'programme', 'approve') then
      raise exception 'You do not have permission to approve a programme revision';
    end if;

    select id into v_pending_approval_id
    from public.plan_revision_approvals
    where revision_id = p_revision_id and decision = 'pending'
    order by step
    limit 1;

    if v_pending_approval_id is null then
      raise exception 'No pending approval step found for this revision';
    end if;

    update public.plan_revision_approvals
    set decision = 'approved', user_id = auth.uid(), decided_at = now(), comments = p_comment
    where id = v_pending_approval_id;

    select count(*), count(*) filter (where decision = 'approved')
      into v_total_steps, v_approved_steps
    from public.plan_revision_approvals
    where revision_id = p_revision_id;

    if v_approved_steps = v_total_steps then
      update public.plan_schedule_revisions set status = 'approved_internal' where id = p_revision_id;
      v_status := 'approved_internal';
    end if;

    insert into public.wbs_audit_log
      (project_id, wbs_task_id, wbs_node_id, user_id, action, field_name, old_value, new_value)
    values
      (v_project_id, null, null, auth.uid(), 'Revision Approved', 'status', v_old_status, v_status);

    return jsonb_build_object('status', v_status);

  elsif p_action = 'reject' then
    if v_status <> 'submitted_internal' then
      raise exception 'Cannot reject a revision that is not submitted for internal review';
    end if;
    if auth.uid() = v_submitted_by then
      raise exception 'Four-eyes check failed: the submitter cannot also reject this revision';
    end if;
    if not public.has_permission('planning', 'programme', 'approve') then
      raise exception 'You do not have permission to reject a programme revision';
    end if;

    update public.plan_schedule_revisions
    set status = 'rejected', decision_comment = p_comment
    where id = p_revision_id;

    update public.plan_revision_approvals
    set decision = 'rejected', user_id = auth.uid(), decided_at = now(), comments = p_comment
    where revision_id = p_revision_id and decision = 'pending';

    insert into public.wbs_audit_log
      (project_id, wbs_task_id, wbs_node_id, user_id, action, field_name, old_value, new_value)
    values
      (v_project_id, null, null, auth.uid(), 'Revision Rejected', 'status', v_old_status, 'rejected');

    return jsonb_build_object('status', 'rejected');

  elsif p_action = 'submit_client' then
    if v_status <> 'approved_internal' then
      raise exception 'Cannot submit to client a revision that is not approved_internal';
    end if;
    if not public.has_permission('planning', 'programme', 'submit') then
      raise exception 'You do not have permission to submit a programme revision to the client';
    end if;

    update public.plan_schedule_revisions set status = 'submitted_client' where id = p_revision_id;

    insert into public.wbs_audit_log
      (project_id, wbs_task_id, wbs_node_id, user_id, action, field_name, old_value, new_value)
    values
      (v_project_id, null, null, auth.uid(), 'Revision Submitted', 'status', v_old_status, 'submitted_client');

    return jsonb_build_object('status', 'submitted_client');

  elsif p_action = 'client_approve' then
    if v_status <> 'submitted_client' then
      raise exception 'Cannot record client approval on a revision that is not submitted_client';
    end if;
    if not public.has_permission('planning', 'programme', 'approve') then
      raise exception 'You do not have permission to record client approval of a programme revision';
    end if;

    select least(1 + count(*), 10) into v_baseline_slot
    from public.wbs_baselines where project_id = v_project_id;

    select case
             when not exists (
               select 1 from public.wbs_baselines
               where project_id = v_project_id and baseline_type = 'contract'
             ) then 'contract'
             else 'revised'
           end
      into v_baseline_type;

    begin
      perform public.set_baseline(
        v_project_id, v_baseline_slot, null,
        p_name   => coalesce(v_stream_name, 'Client-approved revision'),
        p_type   => v_baseline_type,
        p_reason => case when v_baseline_type = 'revised'
                         then coalesce(p_comment, 'Client-approved programme revision')
                         else null end
      );
    exception when others then
      if sqlerrm ilike '%reason is required%' then
        raise exception 'A longer description (at least 10 characters) is required to record this client-approved revision as a baseline — please provide more detail in the comment and try again.';
      else
        raise exception 'Failed to create the client-approved baseline: %', sqlerrm;
      end if;
    end;

    update public.plan_schedule_revisions set status = 'approved_client' where id = p_revision_id;

    insert into public.wbs_audit_log
      (project_id, wbs_task_id, wbs_node_id, user_id, action, field_name, old_value, new_value)
    values
      (v_project_id, null, null, auth.uid(), 'Revision Approved', 'status', v_old_status, 'approved_client');

    return jsonb_build_object('status', 'approved_client', 'baseline_number', v_baseline_slot, 'baseline_type', v_baseline_type);

  elsif p_action = 'client_reject' then
    if v_status <> 'submitted_client' then
      raise exception 'Cannot record client rejection on a revision that is not submitted_client';
    end if;

    update public.plan_schedule_revisions
    set status = 'rejected', decision_comment = p_comment
    where id = p_revision_id;

    insert into public.wbs_audit_log
      (project_id, wbs_task_id, wbs_node_id, user_id, action, field_name, old_value, new_value)
    values
      (v_project_id, null, null, auth.uid(), 'Revision Rejected', 'status', v_old_status, 'rejected');

    return jsonb_build_object('status', 'rejected');

  else
    raise exception 'Unknown transition_revision action: %', p_action;
  end if;
end;
$$;

grant execute on function public.transition_revision(uuid, text, text) to authenticated;

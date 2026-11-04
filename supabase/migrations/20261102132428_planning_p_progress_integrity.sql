-- Phase P (doc 35; PRD doc 34 MOD-09): progress integrity.
-- P1  plan_task_quantity_progress: installed quantity per activity, one row per entry (date, source,
--     status, who decided). Installed to date = approved rows; remaining = scope - installed, where
--     scope is plan_task_work.quantity. task_quantity_status() returns the figures.
-- P2  Installed + pending can never exceed the scope; more needs a scope change (plan_task_work.quantity,
--     already recorded with a reason in plan_task_work_quantity_history).
-- P3  Progress method per activity (wbs_tasks.progress_method: percentage, deliverable = steps,
--     quantity, milestone = weighted milestones) with a project default
--     (plan_schedule_settings.progress_method_default); unset = steps when the activity has steps,
--     else percentage. Quantity: progress is calculated from installed quantity and cannot be typed.
--     Steps / milestones: progress comes from the weighted steps; milestone steps are 0 or 100.
-- P4  v_plan_progress_history: every approved progress and quantity change with its source report
--     and approver.
-- Entries go through record_task_quantity (manual) and the daily-report sync. With progress
-- approval on, they wait on the activity's progress review and follow its decision.

alter table public.plan_schedule_settings
  add column if not exists progress_method_default text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plan_schedule_settings_progress_method_default_check') then
    alter table public.plan_schedule_settings add constraint plan_schedule_settings_progress_method_default_check
      check (progress_method_default is null or progress_method_default in ('percentage', 'deliverable', 'quantity', 'milestone'));
  end if;
end $$;

create table if not exists public.plan_task_quantity_progress (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  task_id     uuid not null references public.wbs_tasks(id) on delete cascade,
  quantity    numeric not null check (quantity <> 0),
  unit        text,
  as_of       date not null default current_date,
  note        text,
  source      text not null default 'manual' check (source in ('manual', 'daily_report')),
  source_id   uuid,
  review_id   uuid references public.wbs_task_progress_reviews(id) on delete set null,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by  uuid references public.profiles(id) on delete set null,
  decided_at  timestamptz,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_plan_task_quantity_progress_task on public.plan_task_quantity_progress(task_id, status);
create index if not exists idx_plan_task_quantity_progress_review on public.plan_task_quantity_progress(review_id) where review_id is not null;

alter table public.plan_task_quantity_progress enable row level security;
drop policy if exists plan_task_quantity_progress_select on public.plan_task_quantity_progress;
create policy plan_task_quantity_progress_select on public.plan_task_quantity_progress
  for select to authenticated
  using (public.is_project_member(project_id)
         and (public.has_permission('planning', 'schedule', 'view') or public.has_permission('task_management', 'update_progress', 'view')));
revoke all on public.plan_task_quantity_progress from anon;
grant select on public.plan_task_quantity_progress to authenticated;

-- ---------------------------------------------------------------------------------------------
create or replace function public.task_effective_progress_method(p_task_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    t.progress_method,
    (select s.progress_method_default from public.plan_schedule_settings s where s.project_id = t.project_id),
    case when exists (select 1 from public.wbs_task_steps st where st.task_id = t.id) then 'deliverable' else 'percentage' end)
  from public.wbs_tasks t where t.id = p_task_id;
$$;

create or replace function public.task_quantity_status(p_task_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'method', public.task_effective_progress_method(p_task_id),
    'scope', w.quantity,
    'unit', w.quantity_unit,
    'installed', coalesce(sum(q.quantity) filter (where q.status = 'approved'), 0),
    'pending', coalesce(sum(q.quantity) filter (where q.status = 'pending'), 0),
    'remaining', case when w.quantity is null then null
                      else w.quantity - coalesce(sum(q.quantity) filter (where q.status = 'approved'), 0) end,
    'percent', case when coalesce(w.quantity, 0) > 0
                    then round(least(100, greatest(0, coalesce(sum(q.quantity) filter (where q.status = 'approved'), 0) / w.quantity * 100)), 2) end)
  from public.wbs_tasks t
  left join public.plan_task_work w on w.task_id = t.id
  left join public.plan_task_quantity_progress q on q.task_id = t.id
  where t.id = p_task_id
  group by w.quantity, w.quantity_unit;
$$;

revoke all on function public.task_effective_progress_method(uuid) from public, anon;
grant execute on function public.task_effective_progress_method(uuid) to authenticated;
revoke all on function public.task_quantity_status(uuid) from public, anon;
grant execute on function public.task_quantity_status(uuid) to authenticated;

-- Quantity method: progress follows installed quantity (and the first installation stamps the actual start).
create or replace function public.apply_task_quantity_progress(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v      jsonb := public.task_quantity_status(p_task_id);
  v_prev text := coalesce(current_setting('dcos.schedule_write', true), '');
  v_first date;
begin
  if v ->> 'method' <> 'quantity' or (v ->> 'percent') is null then
    return;
  end if;
  select min(as_of) into v_first from public.plan_task_quantity_progress where task_id = p_task_id and status = 'approved';
  perform set_config('dcos.schedule_write', 'on', true);
  update public.wbs_tasks
     set progress = (v ->> 'percent')::numeric,
         actual_start_date = coalesce(actual_start_date, v_first)
   where id = p_task_id
     and (progress is distinct from (v ->> 'percent')::numeric or (actual_start_date is null and v_first is not null));
  perform set_config('dcos.schedule_write', v_prev, true);
end;
$$;
revoke all on function public.apply_task_quantity_progress(uuid) from public, anon, authenticated;

-- Adds one entry, enforcing the scope cap (P2). Internal: callers check permissions.
create or replace function public.add_task_quantity_entry(
  p_task_id uuid, p_quantity numeric, p_as_of date, p_note text, p_source text, p_source_id uuid,
  p_status text, p_review_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task  public.wbs_tasks%rowtype;
  v_scope numeric;
  v_unit  text;
  v_used  numeric;
  v_id    uuid;
begin
  select * into v_task from public.wbs_tasks where id = p_task_id;
  if v_task.id is null then
    raise exception 'Activity not found';
  end if;
  select quantity, quantity_unit into v_scope, v_unit from public.plan_task_work where task_id = p_task_id;
  if coalesce(v_scope, 0) <= 0 then
    raise exception 'This activity has no scope quantity: set its quantity in Task Work first';
  end if;
  if p_quantity is null or p_quantity = 0 then
    raise exception 'Enter a quantity';
  end if;
  select coalesce(sum(quantity), 0) into v_used
    from public.plan_task_quantity_progress where task_id = p_task_id and status in ('approved', 'pending');
  if v_used + p_quantity > v_scope then
    raise exception 'Installed quantity would reach % % against a scope of % %: change the scope (with a reason) first',
      round(v_used + p_quantity, 3), coalesce(v_unit, ''), round(v_scope, 3), coalesce(v_unit, '')
      using errcode = 'check_violation';
  end if;
  if v_used + p_quantity < 0 then
    raise exception 'A correction cannot take the installed quantity below zero' using errcode = 'check_violation';
  end if;

  insert into public.plan_task_quantity_progress
    (project_id, task_id, quantity, unit, as_of, note, source, source_id, review_id, status, decided_by, decided_at)
  values
    (v_task.project_id, p_task_id, p_quantity, v_unit, coalesce(p_as_of, current_date), nullif(btrim(coalesce(p_note, '')), ''),
     p_source, p_source_id, p_review_id, p_status,
     case when p_status = 'approved' then auth.uid() end, case when p_status = 'approved' then now() end)
  returning id into v_id;

  if p_status = 'approved' then
    perform public.apply_task_quantity_progress(p_task_id);
  end if;
  return v_id;
end;
$$;
revoke all on function public.add_task_quantity_entry(uuid, numeric, date, text, text, uuid, text, uuid) from public, anon, authenticated;

-- Manual entry (task drawer). Planners record directly; others wait for approval where it is required.
create or replace function public.record_task_quantity(p_task_id uuid, p_quantity numeric, p_as_of date default current_date, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task      public.wbs_tasks%rowtype;
  v_planner   boolean := public.has_permission('planning', 'schedule', 'edit');
  v_review    jsonb;
  v_status    jsonb;
  v_projected numeric;
  v_id        uuid;
begin
  select * into v_task from public.wbs_tasks where id = p_task_id;
  if v_task.id is null then
    raise exception 'Activity not found';
  end if;
  if not public.is_project_member(v_task.project_id)
     or not (v_planner or public.has_permission('task_management', 'update_progress', 'edit')) then
    raise exception 'Recording installed quantity needs Planning schedule edit or Tasks update-progress on this project'
      using errcode = 'insufficient_privilege';
  end if;
  if p_as_of is not null and p_as_of > current_date then
    raise exception 'The date of an installed quantity cannot be in the future';
  end if;

  if v_planner or not public.progress_review_required(v_task.project_id) then
    v_id := public.add_task_quantity_entry(p_task_id, p_quantity, p_as_of, p_note, 'manual', null, 'approved', null);
    return jsonb_build_object('mode', 'direct', 'entry_id', v_id, 'status', public.task_quantity_status(p_task_id));
  end if;

  -- Approval required: a progress review carries the projected % for a planner to confirm.
  v_status := public.task_quantity_status(p_task_id);
  v_projected := case when (v_status ->> 'scope')::numeric > 0 and v_status ->> 'method' = 'quantity'
                      then round(least(100, ((v_status ->> 'installed')::numeric + (v_status ->> 'pending')::numeric + p_quantity)
                                             / (v_status ->> 'scope')::numeric * 100), 2)
                      else coalesce(v_task.progress, 0) end;
  v_review := public.submit_progress(p_task_id, v_projected,
    coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Installed quantity ' || p_quantity));
  v_id := public.add_task_quantity_entry(p_task_id, p_quantity, p_as_of, p_note, 'manual', null, 'pending',
                                         (v_review ->> 'review_id')::uuid);
  return jsonb_build_object('mode', 'pending', 'entry_id', v_id, 'review_id', v_review ->> 'review_id');
end;
$$;
revoke all on function public.record_task_quantity(uuid, numeric, date, text) from public, anon;
grant execute on function public.record_task_quantity(uuid, numeric, date, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- P3: method-driven progress.
create or replace function public.wbs_tasks_progress_method_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('dcos.schedule_write', true), '') = 'on' or auth.uid() is null then
    return new;
  end if;
  if new.progress is distinct from old.progress and public.task_effective_progress_method(new.id) = 'quantity' then
    raise exception 'Progress of this activity comes from its installed quantity: record the quantity instead'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_wbs_tasks_progress_method_guard on public.wbs_tasks;
create trigger trg_wbs_tasks_progress_method_guard
  before update of progress on public.wbs_tasks
  for each row execute function public.wbs_tasks_progress_method_guard();

-- Steps drive progress only for the steps and milestone methods.
create or replace function public.recalc_task_progress_from_steps()
returns trigger
language plpgsql
as $$
declare
  v_task_id uuid := coalesce(new.task_id, old.task_id);
  v_weighted numeric;
  v_total_weight numeric;
  v_progress numeric;
  v_prev text := coalesce(current_setting('dcos.schedule_write', true), '');
begin
  if public.task_effective_progress_method(v_task_id) not in ('deliverable', 'milestone') then
    return coalesce(new, old);
  end if;

  select sum(progress * weight), sum(weight)
    into v_weighted, v_total_weight
  from public.wbs_task_steps
  where task_id = v_task_id;

  if v_total_weight is not null and v_total_weight > 0 then
    v_progress := round(v_weighted / v_total_weight, 2);
    -- Plain UPDATE so trg_task_collect_dirty / trg_task_flush_dirty cascade the
    -- roll-up (see 20260918000001). Skipped when nothing changes.
    perform set_config('dcos.schedule_write', 'on', true);
    update public.wbs_tasks
    set progress = v_progress
    where id = v_task_id
      and progress is distinct from v_progress;
    perform set_config('dcos.schedule_write', v_prev, true);
  end if;

  return coalesce(new, old);
end;
$$;

-- Weighted milestones: each step is either done or not.
create or replace function public.wbs_task_steps_milestone_check()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.progress, 0) not in (0, 100) and public.task_effective_progress_method(new.task_id) = 'milestone' then
    raise exception 'This activity is measured by weighted milestones: a step is 0%% or 100%% complete'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_wbs_task_steps_milestone_check on public.wbs_task_steps;
create trigger trg_wbs_task_steps_milestone_check
  before insert or update of progress on public.wbs_task_steps
  for each row execute function public.wbs_task_steps_milestone_check();

-- ---------------------------------------------------------------------------------------------
-- decide_progress_review (as 20261102115400 / …120904) plus: quantity entries waiting on the
-- review follow its decision, and quantity-method progress is recalculated last.
create or replace function public.decide_progress_review(p_review_id uuid, p_decision text, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review public.wbs_task_progress_reviews%rowtype;
  v_step   jsonb;
  v_date   date;
begin
  if p_decision not in ('confirmed', 'rejected') then
    raise exception 'p_decision must be ''confirmed'' or ''rejected''';
  end if;

  select * into v_review
  from public.wbs_task_progress_reviews
  where id = p_review_id
  for update;

  if v_review.id is null then
    raise exception 'Review % not found', p_review_id;
  end if;

  if v_review.status <> 'pending' then
    raise exception 'This review has already been decided';
  end if;

  if not public.has_permission('planning', 'progress_review', 'approve')
     or not public.is_project_member(v_review.project_id) then
    raise exception 'Deciding a progress review needs Planning progress-review approve permission on this project'
      using errcode = 'insufficient_privilege';
  end if;

  update public.wbs_task_progress_reviews
  set status     = p_decision,
      decided_by = auth.uid(),
      decided_at = now(),
      comment    = coalesce(p_comment, comment)
  where id = p_review_id;

  update public.plan_task_quantity_progress
     set status = case when p_decision = 'confirmed' then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now()
   where review_id = p_review_id and status = 'pending';

  if p_decision = 'confirmed' then
    perform set_config('dcos.schedule_write', 'on', true);
    v_date := coalesce(v_review.proposed_actual_finish, v_review.proposed_actual_start, v_review.proposed_at::date);

    if v_review.proposed_steps is not null and jsonb_typeof(v_review.proposed_steps) = 'array' then
      for v_step in select * from jsonb_array_elements(v_review.proposed_steps) loop
        if (v_step ->> 'step_id') is not null and (v_step ->> 'progress') is not null then
          update public.wbs_task_steps
             set progress = (v_step ->> 'progress')::numeric,
                 end_date = case when (v_step ->> 'progress')::numeric = 100 then coalesce(end_date, v_date) else end_date end,
                 updated_at = now()
           where id = (v_step ->> 'step_id')::uuid and task_id = v_review.wbs_task_id;
        end if;
      end loop;
    end if;

    update public.wbs_tasks
       set progress = v_review.proposed_progress
     where id = v_review.wbs_task_id;

    if v_review.proposed_actual_start is not null then
      update public.wbs_tasks
         set actual_start_date = least(coalesce(actual_start_date, v_review.proposed_actual_start), v_review.proposed_actual_start)
       where id = v_review.wbs_task_id;
    end if;
    if v_review.proposed_actual_finish is not null then
      update public.wbs_tasks set actual_finish_date = v_review.proposed_actual_finish
       where id = v_review.wbs_task_id;
    end if;
    if v_review.proposed_status = 'closed' then
      update public.wbs_tasks set status = 'closed' where id = v_review.wbs_task_id;
    elsif v_review.proposed_status = 'in_progress' then
      update public.wbs_tasks set status = 'in_progress' where id = v_review.wbs_task_id and status = 'open';
    end if;
    perform set_config('dcos.schedule_write', '', true);
    -- quantity method: the approved quantity decides the progress
    perform public.apply_task_quantity_progress(v_review.wbs_task_id);
  end if;

  update public.site_daily_report_activities
     set sync_status = case when p_decision = 'confirmed' then 'synced' else 'rejected' end,
         sync_error  = case when p_decision = 'rejected' then coalesce(p_comment, 'Rejected by planner') end
   where progress_review_id = p_review_id;

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

-- ---------------------------------------------------------------------------------------------
-- Daily-report sync (as 20261102115400) plus installed quantity: a pending entry on the review when
-- approval is on, an approved entry otherwise. A quantity over scope fails that line only.
create or replace function public.sync_daily_report_to_planning(p_daily_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_report            RECORD;
  v_item              RECORD;
  v_review_res        JSONB;
  v_review_required   BOOLEAN;
  v_prod_id           UUID;
  v_delay_id          UUID;
  v_step_item         JSONB;
  v_step_id           UUID;
  v_step_prog         NUMERIC;
  v_synced_count      INTEGER := 0;
  v_pending_count     INTEGER := 0;
  v_prod_count        INTEGER := 0;
  v_delay_count       INTEGER := 0;
  v_error_count       INTEGER := 0;
  v_total_act_count   INTEGER := 0;
  v_has_scope         BOOLEAN;
BEGIN
  SELECT * INTO v_report FROM public.site_daily_reports WHERE id = p_daily_report_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Daily Report % not found', p_daily_report_id;
  END IF;

  IF NOT public.is_project_member(v_report.project_id) THEN
    RAISE EXCEPTION 'Not authorized to submit daily reports for this project';
  END IF;

  v_review_required := public.progress_review_required(v_report.project_id);

  FOR v_item IN
    SELECT * FROM public.site_daily_report_activities
    WHERE daily_report_id = p_daily_report_id
  LOOP
    v_total_act_count := v_total_act_count + 1;
    v_has_scope := COALESCE(v_item.quantity_done, 0) <> 0
      AND EXISTS (SELECT 1 FROM public.plan_task_work w WHERE w.task_id = v_item.task_id AND COALESCE(w.quantity, 0) > 0);

    IF v_review_required THEN
      -- Approval on: nothing reaches the schedule until a planner confirms the review.
      BEGIN
        v_review_res := public.submit_progress(
          v_item.task_id,
          v_item.progress_today,
          COALESCE(v_item.work_description, 'Daily Report: ' || v_report.report_date::text)
        );

        UPDATE public.wbs_task_progress_reviews
        SET daily_report_id = p_daily_report_id,
            daily_report_activity_id = v_item.id,
            proposed_steps = CASE WHEN v_item.step_progress IS NOT NULL AND jsonb_typeof(v_item.step_progress) = 'array'
                                       AND jsonb_array_length(v_item.step_progress) > 0
                                  THEN v_item.step_progress END,
            proposed_actual_start = v_item.actual_start_date,
            proposed_actual_finish = CASE WHEN v_item.progress_today = 100 THEN v_item.actual_finish_date END,
            proposed_status = CASE WHEN v_item.progress_today = 100 AND v_item.actual_finish_date IS NOT NULL THEN 'closed'
                                   WHEN v_item.progress_today > 0 AND v_item.progress_today < 100 THEN 'in_progress' END
        WHERE id = (v_review_res->>'review_id')::uuid;

        IF v_has_scope THEN
          PERFORM public.add_task_quantity_entry(v_item.task_id, v_item.quantity_done, v_report.report_date,
            v_item.work_description, 'daily_report', v_item.id, 'pending', (v_review_res->>'review_id')::uuid);
        END IF;

        UPDATE public.site_daily_report_activities
        SET sync_status = 'pending_approval',
            progress_review_id = (v_review_res->>'review_id')::uuid,
            sync_error = NULL
        WHERE id = v_item.id;
        v_pending_count := v_pending_count + 1;
      EXCEPTION WHEN OTHERS THEN
        UPDATE public.site_daily_report_activities
        SET sync_status = 'rejected', sync_error = SQLERRM
        WHERE id = v_item.id;
        v_error_count := v_error_count + 1;
      END;
    ELSE
      -- Approval off: the report updates the schedule directly (as before).
      IF v_item.step_progress IS NOT NULL AND jsonb_typeof(v_item.step_progress) = 'array' AND jsonb_array_length(v_item.step_progress) > 0 THEN
        FOR v_step_item IN SELECT * FROM jsonb_array_elements(v_item.step_progress)
        LOOP
          v_step_id := (v_step_item->>'step_id')::uuid;
          v_step_prog := (v_step_item->>'progress')::numeric;

          IF v_step_id IS NOT NULL AND v_step_prog IS NOT NULL THEN
            UPDATE public.wbs_task_steps
            SET progress = v_step_prog,
                end_date = CASE WHEN v_step_prog = 100 THEN COALESCE(end_date, v_report.report_date) ELSE end_date END,
                updated_at = NOW()
            WHERE id = v_step_id AND task_id = v_item.task_id;
          END IF;
        END LOOP;
      END IF;

      BEGIN
        IF public.task_effective_progress_method(v_item.task_id) <> 'quantity' THEN
          v_review_res := public.submit_progress(
            v_item.task_id,
            v_item.progress_today,
            COALESCE(v_item.work_description, 'Daily Report: ' || v_report.report_date::text)
          );
        END IF;
        IF v_has_scope THEN
          PERFORM public.add_task_quantity_entry(v_item.task_id, v_item.quantity_done, v_report.report_date,
            v_item.work_description, 'daily_report', v_item.id, 'approved', NULL);
        END IF;
        UPDATE public.site_daily_report_activities
        SET sync_status = 'synced', sync_error = NULL
        WHERE id = v_item.id;
        v_synced_count := v_synced_count + 1;
      EXCEPTION WHEN OTHERS THEN
        UPDATE public.site_daily_report_activities
        SET sync_status = 'rejected', sync_error = SQLERRM
        WHERE id = v_item.id;
        v_error_count := v_error_count + 1;
      END;

      PERFORM set_config('dcos.schedule_write', 'on', true);
      IF v_item.actual_start_date IS NOT NULL THEN
        UPDATE public.wbs_tasks
        SET actual_start_date = LEAST(COALESCE(actual_start_date, v_item.actual_start_date), v_item.actual_start_date)
        WHERE id = v_item.task_id;
      END IF;

      IF v_item.progress_today = 100 AND v_item.actual_finish_date IS NOT NULL THEN
        UPDATE public.wbs_tasks
        SET actual_finish_date = v_item.actual_finish_date,
            status = 'closed'
        WHERE id = v_item.task_id;
      ELSIF v_item.progress_today > 0 AND v_item.progress_today < 100 THEN
        UPDATE public.wbs_tasks
        SET status = 'in_progress'
        WHERE id = v_item.task_id AND status = 'open';
      END IF;
      PERFORM set_config('dcos.schedule_write', '', true);
    END IF;

    IF v_item.work_description IS NOT NULL AND btrim(v_item.work_description) <> '' THEN
      UPDATE public.wbs_tasks
      SET field_observation_notes = v_item.work_description
      WHERE id = v_item.task_id;
    END IF;

    -- D. Productivity Logs (Phase 5 of Productivity Plan)
    IF v_item.quantity_done IS NOT NULL AND (COALESCE(v_item.hours_normal, 0) + COALESCE(v_item.hours_ot, 0)) > 0 THEN
      IF v_item.productivity_log_id IS NOT NULL THEN
        UPDATE public.plan_productivity_logs
        SET trade_code = COALESCE(v_item.trade_code, 'General'),
            log_date = v_report.report_date,
            headcount = COALESCE(v_item.headcount, 1),
            hours_normal = COALESCE(v_item.hours_normal, 8),
            hours_ot = COALESCE(v_item.hours_ot, 0),
            quantity_done = v_item.quantity_done,
            unit = v_item.quantity_unit,
            condition_note = v_item.work_description,
            updated_at = NOW()
        WHERE id = v_item.productivity_log_id;
        v_prod_count := v_prod_count + 1;
      ELSE
        INSERT INTO public.plan_productivity_logs (
          project_id, task_id, trade_code, log_date, headcount,
          hours_normal, hours_ot, quantity_done, unit, condition_note,
          source, daily_report_activity_id, created_by
        ) VALUES (
          v_report.project_id, v_item.task_id, COALESCE(v_item.trade_code, 'General'),
          v_report.report_date, COALESCE(v_item.headcount, 1),
          COALESCE(v_item.hours_normal, 8), COALESCE(v_item.hours_ot, 0),
          v_item.quantity_done, v_item.quantity_unit,
          v_item.work_description, 'site_diary', v_item.id, auth.uid()
        )
        RETURNING id INTO v_prod_id;

        UPDATE public.site_daily_report_activities
        SET productivity_log_id = v_prod_id
        WHERE id = v_item.id;
        v_prod_count := v_prod_count + 1;
      END IF;
    END IF;

    -- E. Delay Register linkage
    IF v_item.has_delay AND COALESCE(v_item.delay_hours_lost, 0) > 0 THEN
      IF v_item.delay_event_id IS NULL THEN
        INSERT INTO public.delay_register (
          project_id, wbs_task_id, description, delay_type, cause, responsible_party,
          start_date, status, notes, created_by
        ) VALUES (
          v_report.project_id,
          v_item.task_id,
          COALESCE(v_item.delay_reason, 'Delay reported on ' || v_report.report_date::text),
          CASE WHEN v_item.delay_category IN ('weather', 'client', 'rfi_design') THEN 'excusable' ELSE 'non_excusable' END,
          v_item.delay_category,
          v_item.trade_code,
          v_report.report_date,
          'open',
          'Logged via Site Daily Report on ' || v_report.report_date::text || '. Impact: ' || v_item.delay_hours_lost || ' hours lost.',
          auth.uid()
        )
        RETURNING id INTO v_delay_id;

        INSERT INTO public.delay_register_tasks (delay_id, wbs_task_id)
        VALUES (v_delay_id, v_item.task_id)
        ON CONFLICT DO NOTHING;

        UPDATE public.site_daily_report_activities
        SET delay_event_id = v_delay_id
        WHERE id = v_item.id;

        v_delay_count := v_delay_count + 1;
      END IF;
    END IF;
  END LOOP;

  UPDATE public.site_daily_reports
  SET status = 'submitted',
      submitted_at = NOW(),
      submitted_by = auth.uid(),
      activities_count = v_total_act_count
  WHERE id = p_daily_report_id;

  RETURN jsonb_build_object(
    'success', true,
    'total_activities', v_total_act_count,
    'activities_direct_synced', v_synced_count,
    'activities_pending_review', v_pending_count,
    'productivity_logs_recorded', v_prod_count,
    'delays_logged', v_delay_count,
    'errors', v_error_count
  );
END;
$function$;

revoke execute on function public.sync_daily_report_to_planning(uuid) from public, anon;
grant execute on function public.sync_daily_report_to_planning(uuid) to authenticated;
revoke execute on function public.decide_progress_review(uuid, text, text) from public, anon;
grant execute on function public.decide_progress_review(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- P4: approved progress history, each change with its source and approver (RLS of the base tables applies).
create or replace view public.v_plan_progress_history
with (security_invoker = true)
as
select r.project_id, r.wbs_task_id as task_id, coalesce(r.decided_at, r.proposed_at)::date as as_of,
       'progress'::text as kind, r.proposed_progress as value, r.previous_progress as previous_value,
       case when r.daily_report_id is not null then 'daily_report' else 'review' end as source,
       coalesce(r.daily_report_id, r.id) as source_id, r.proposed_by as recorded_by, r.decided_by as approved_by,
       r.decided_at as approved_at, r.comment as note
  from public.wbs_task_progress_reviews r
 where r.status = 'confirmed'
union all
select q.project_id, q.task_id, q.as_of, 'quantity', q.quantity, null,
       q.source, coalesce(q.source_id, q.review_id, q.id), q.created_by, q.decided_by, q.decided_at, q.note
  from public.plan_task_quantity_progress q
 where q.status = 'approved'
union all
select t.project_id, h.wbs_task_id, h.created_at::date, 'progress', h.new_progress, h.previous_progress,
       'tasks', h.id, h.created_by, h.created_by, h.created_at, h.comment
  from public.task_progress_history h
  join public.wbs_tasks t on t.id = h.wbs_task_id
 where not exists (select 1 from public.wbs_task_progress_reviews r2
                    where r2.wbs_task_id = h.wbs_task_id -- the review row already covers it
                      and abs(extract(epoch from (r2.proposed_at - h.created_at))) < 5);

grant select on public.v_plan_progress_history to authenticated;
revoke all on public.v_plan_progress_history from anon;

-- ---------------------------------------------------------------------------------------------
-- Roll-up temp table fix (found while testing Phase P). _wbs_dirty_projects lives for the whole
-- database session, which PostgREST reuses across requests. When a security-definer function
-- (record_task_progress, the daily-report sync, task_transition, decide_progress_review) touched
-- progress first, the table belonged to the function owner and a later ordinary request on the same
-- connection failed with "permission denied for table _wbs_dirty_projects". Both trigger functions
-- now always run as the owner, so the table has one owner whoever triggers it.
create or replace function public.collect_dirty_wbs_project()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  create temp table if not exists _wbs_dirty_projects
    (project_id uuid primary key) on commit delete rows;
  insert into pg_temp._wbs_dirty_projects (project_id)
  values (coalesce(new.project_id, old.project_id))
  on conflict do nothing;
  return coalesce(new, old);
end;
$function$;

create or replace function public.flush_dirty_wbs_progress()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  -- Nothing has been marked dirty in this session yet.
  if to_regclass('pg_temp._wbs_dirty_projects') is null then
    return null;
  end if;
  -- A bulk writer (e.g. plan_boq_commit_programme) defers the roll-up and runs it once at its end.
  if coalesce(current_setting('dcos.defer_wbs_progress', true), '') = 'on' then
    return null;
  end if;

  perform public.recalculate_wbs_progress(project_id)
  from pg_temp._wbs_dirty_projects;

  truncate pg_temp._wbs_dirty_projects;
  return null;
end;
$function$;

revoke all on function public.collect_dirty_wbs_project() from public, anon;
revoke all on function public.flush_dirty_wbs_progress() from public, anon;

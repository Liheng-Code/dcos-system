-- Phase R4 (doc 35; doc 22 D2, F7): progress reaches the schedule only through approval where the
-- project requires it.
--   * plan_schedule_settings.progress_review_enabled becomes nullable: null = follow the project type
--     (awarded: approval on; tender: off), see progress_review_required() (R1). Rows still on the
--     old default false follow the project type from now on.
--   * submit_progress uses progress_review_required().
--   * sync_daily_report_to_planning: with approval on, step progress, actual dates and status are
--     stored on the pending review instead of being written to the schedule, so a rejected report
--     changes nothing. With approval off, it writes directly as before.
--   * decide_progress_review needs Planning progress-review approve permission and applies
--     everything the review carries when it is confirmed.

alter table public.wbs_task_progress_reviews
  add column if not exists proposed_steps jsonb,
  add column if not exists proposed_actual_start date,
  add column if not exists proposed_actual_finish date,
  add column if not exists proposed_status text;

alter table public.plan_schedule_settings alter column progress_review_enabled drop not null;
alter table public.plan_schedule_settings alter column progress_review_enabled set default null;
update public.plan_schedule_settings set progress_review_enabled = null where progress_review_enabled = false;

-- ---------------------------------------------------------------------------------------------
create or replace function public.submit_progress(p_task_id uuid, p_progress numeric, p_note text default null)
returns jsonb
language plpgsql
as $$
declare
  v_project_id        uuid;
  v_wbs_node_id       uuid;
  v_current_progress  numeric;
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

  if not public.progress_review_required(v_project_id) then
    update public.wbs_tasks set progress = p_progress where id = p_task_id;
    return jsonb_build_object('mode', 'direct', 'progress', p_progress);
  end if;

  select coalesce(lock_on_complete, true) into v_lock_on_complete
  from public.plan_schedule_settings where project_id = v_project_id;
  v_lock_on_complete := coalesce(v_lock_on_complete, true);

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

-- ---------------------------------------------------------------------------------------------
create or replace function public.decide_progress_review(p_review_id uuid, p_decision text, p_comment text default null)
returns void
language plpgsql
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
  end if;

  -- the daily-report line follows the decision
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
        v_review_res := public.submit_progress(
          v_item.task_id,
          v_item.progress_today,
          COALESCE(v_item.work_description, 'Daily Report: ' || v_report.report_date::text)
        );
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

revoke execute on function public.sync_daily_report_to_planning(uuid) from anon;

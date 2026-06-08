-- SOP-TSK-001 §21: Update task alert trigger to:
--   1. Use assignee_id directly instead of querying audit log for assigner
--   2. Add task_overdue alert type
--   3. Fire progress_updated alert at milestone percentages (25/50/75/100)

-- ─── 1. Expand task_alerts.alert_type CHECK ──────────────────────────────────

ALTER TABLE public.task_alerts DROP CONSTRAINT IF EXISTS task_alerts_alert_type_check;

ALTER TABLE public.task_alerts
  ADD CONSTRAINT task_alerts_alert_type_check
  CHECK (alert_type IN (
    'task_assigned',
    'task_reassigned',
    'task_assignment_accepted',
    'task_assignment_rejected',
    'task_submitted',
    'task_approved',
    'task_rejected',
    'task_progress_updated',
    'task_overdue'
  ));

-- ─── 2. Replace trigger function ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_task_alert_from_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task     record;
  v_actor_name text;
  v_alert_type text;
  v_title    text;
  v_body     text;
  v_recipient_id uuid;
  v_new_progress numeric;
BEGIN
  IF new.wbs_task_id IS NULL THEN
    RETURN new;
  END IF;

  SELECT * INTO v_task FROM public.wbs_tasks WHERE id = new.wbs_task_id;
  IF NOT FOUND THEN RETURN new; END IF;

  SELECT full_name INTO v_actor_name FROM public.profiles WHERE id = new.user_id;

  -- ── ASSIGNMENT ─────────────────────────────────────────────────────────────
  IF new.action = 'Assignee Changed' THEN
    v_alert_type := CASE
      WHEN new.old_value IS NULL OR new.old_value = '' THEN 'task_assigned'
      ELSE 'task_reassigned'
    END;
    v_title := CASE WHEN v_alert_type = 'task_assigned'
      THEN 'Task assigned to you'
      ELSE 'Task reassigned to you'
    END;
    v_body := COALESCE('Assigned by ' || v_actor_name, 'You have received a task assignment');

    IF v_task.owner_id IS NOT NULL THEN
      INSERT INTO public.task_alerts (
        project_id, wbs_task_id, actor_id, actor_name,
        recipient_id, source_key, alert_type, title, body, task_code, task_name, metadata
      ) VALUES (
        v_task.project_id, v_task.id, new.user_id, v_actor_name,
        v_task.owner_id, new.id::text, v_alert_type, v_title, v_body,
        v_task.task_code, v_task.task_name,
        jsonb_build_object('audit_log_id', new.id, 'action', new.action)
      )
      ON CONFLICT (source_key) WHERE source_key IS NOT NULL DO NOTHING;
    END IF;

  -- ── TASK ACCEPTED ──────────────────────────────────────────────────────────
  ELSIF new.action = 'Task Accepted' THEN
    v_recipient_id := v_task.assignee_id;
    IF v_recipient_id IS NOT NULL THEN
      INSERT INTO public.task_alerts (
        project_id, wbs_task_id, actor_id, actor_name,
        recipient_id, source_key, alert_type, title, body, task_code, task_name, metadata
      ) VALUES (
        v_task.project_id, v_task.id, new.user_id, v_actor_name,
        v_recipient_id, new.id::text, 'task_assignment_accepted',
        'Assignment accepted',
        COALESCE(v_actor_name, 'The receiver') || ' accepted the task',
        v_task.task_code, v_task.task_name,
        jsonb_build_object('audit_log_id', new.id, 'action', new.action)
      )
      ON CONFLICT (source_key) WHERE source_key IS NOT NULL DO NOTHING;
    END IF;

  -- ── ASSIGNMENT REJECTED ────────────────────────────────────────────────────
  ELSIF new.action = 'Assignment Rejected' THEN
    v_recipient_id := v_task.assignee_id;
    IF v_recipient_id IS NOT NULL THEN
      INSERT INTO public.task_alerts (
        project_id, wbs_task_id, actor_id, actor_name,
        recipient_id, source_key, alert_type, title, body, task_code, task_name, metadata
      ) VALUES (
        v_task.project_id, v_task.id, new.user_id, v_actor_name,
        v_recipient_id, new.id::text, 'task_assignment_rejected',
        'Assignment rejected',
        COALESCE(new.new_value, 'The assignment was rejected'),
        v_task.task_code, v_task.task_name,
        jsonb_build_object('audit_log_id', new.id, 'action', new.action)
      )
      ON CONFLICT (source_key) WHERE source_key IS NOT NULL DO NOTHING;
    END IF;

  -- ── APPROVAL REJECTED ──────────────────────────────────────────────────────
  ELSIF new.action = 'Rejected' THEN
    IF v_task.owner_id IS NOT NULL THEN
      INSERT INTO public.task_alerts (
        project_id, wbs_task_id, actor_id, actor_name,
        recipient_id, source_key, alert_type, title, body, task_code, task_name, metadata
      ) VALUES (
        v_task.project_id, v_task.id, new.user_id, v_actor_name,
        v_task.owner_id, new.id::text, 'task_rejected',
        'Task rejected for redo',
        COALESCE(new.new_value, 'The task was rejected'),
        v_task.task_code, v_task.task_name,
        jsonb_build_object('audit_log_id', new.id, 'action', new.action)
      )
      ON CONFLICT (source_key) WHERE source_key IS NOT NULL DO NOTHING;
    END IF;

  -- ── APPROVED ───────────────────────────────────────────────────────────────
  ELSIF new.action = 'Approved' THEN
    IF v_task.owner_id IS NOT NULL THEN
      INSERT INTO public.task_alerts (
        project_id, wbs_task_id, actor_id, actor_name,
        recipient_id, source_key, alert_type, title, body, task_code, task_name, metadata
      ) VALUES (
        v_task.project_id, v_task.id, new.user_id, v_actor_name,
        v_task.owner_id, new.id::text, 'task_approved',
        'Task approved',
        'Your submitted task was approved',
        v_task.task_code, v_task.task_name,
        jsonb_build_object('audit_log_id', new.id, 'action', new.action)
      )
      ON CONFLICT (source_key) WHERE source_key IS NOT NULL DO NOTHING;
    END IF;

  -- ── PROGRESS UPDATED (milestones + 100% submission) ────────────────────────
  ELSIF new.action = 'Progress Updated' THEN
    BEGIN
      v_new_progress := new.new_value::numeric;
    EXCEPTION WHEN OTHERS THEN
      v_new_progress := NULL;
    END;

    IF v_new_progress IS NOT NULL AND v_task.assignee_id IS NOT NULL THEN
      -- Submitted at 100%
      IF v_new_progress >= 100 AND v_task.status = 'submitted' THEN
        INSERT INTO public.task_alerts (
          project_id, wbs_task_id, actor_id, actor_name,
          recipient_id, source_key, alert_type, title, body, task_code, task_name, metadata
        ) VALUES (
          v_task.project_id, v_task.id, new.user_id, v_actor_name,
          v_task.assignee_id, new.id::text || '_sub', 'task_submitted',
          'Task submitted for approval',
          COALESCE(v_actor_name, 'The receiver') || ' submitted this task at 100%',
          v_task.task_code, v_task.task_name,
          jsonb_build_object('audit_log_id', new.id, 'progress', v_new_progress)
        )
        ON CONFLICT (source_key) WHERE source_key IS NOT NULL DO NOTHING;

      -- Milestone progress alerts (25, 50, 75)
      ELSIF v_new_progress IN (25, 50, 75) THEN
        INSERT INTO public.task_alerts (
          project_id, wbs_task_id, actor_id, actor_name,
          recipient_id, source_key, alert_type, title, body, task_code, task_name, metadata
        ) VALUES (
          v_task.project_id, v_task.id, new.user_id, v_actor_name,
          v_task.assignee_id, new.id::text || '_prog', 'task_progress_updated',
          'Task progress: ' || v_new_progress::text || '%',
          COALESCE(v_actor_name, 'Receiver') || ' updated progress to ' || v_new_progress::text || '%',
          v_task.task_code, v_task.task_name,
          jsonb_build_object('audit_log_id', new.id, 'progress', v_new_progress)
        )
        ON CONFLICT (source_key) WHERE source_key IS NOT NULL DO NOTHING;
      END IF;
    END IF;
  END IF;

  RETURN new;
END;
$$;

-- ─── 3. Re-register trigger ───────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_create_task_alert_from_audit ON public.wbs_audit_log;
CREATE TRIGGER trg_create_task_alert_from_audit
  AFTER INSERT ON public.wbs_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.create_task_alert_from_audit();

-- Persist personal in-app task workflow alerts.
create table if not exists public.task_alerts (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  wbs_task_id   uuid not null references public.wbs_tasks(id) on delete cascade,
  actor_id      uuid references public.profiles(id) on delete set null,
  actor_name    text,
  recipient_id  uuid not null references public.profiles(id) on delete cascade,
  source_key    text,
  alert_type    text not null check (alert_type in (
    'task_assigned',
    'task_reassigned',
    'task_assignment_accepted',
    'task_assignment_rejected',
    'task_submitted',
    'task_approved',
    'task_rejected'
  )),
  title         text not null,
  body          text,
  task_code     text not null,
  task_name     text not null,
  metadata      jsonb not null default '{}'::jsonb,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_task_alerts_recipient_created
  on public.task_alerts(recipient_id, created_at desc);
create index if not exists idx_task_alerts_recipient_unread
  on public.task_alerts(recipient_id, read_at)
  where read_at is null;
create index if not exists idx_task_alerts_task
  on public.task_alerts(wbs_task_id);
create unique index if not exists idx_task_alerts_source_key
  on public.task_alerts(source_key)
  where source_key is not null;

alter table public.task_alerts enable row level security;

create or replace function public.create_task_alert_from_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task record;
  v_assigner_id uuid;
  v_actor_name text;
  v_alert_type text;
  v_title text;
  v_body text;
begin
  if new.wbs_task_id is null then
    return new;
  end if;

  select *
    into v_task
  from public.wbs_tasks
  where id = new.wbs_task_id;

  if not found then
    return new;
  end if;

  select p.full_name
    into v_actor_name
  from public.profiles p
  where p.id = new.user_id;

  if new.action = 'Assignee Changed' then
    v_alert_type := case when new.old_value is null or new.old_value = '' then 'task_assigned' else 'task_reassigned' end;
    v_title := case when v_alert_type = 'task_assigned' then 'Task assigned to you' else 'Task reassigned to you' end;
    v_body := case
      when v_actor_name is not null then 'Assigned by ' || v_actor_name
      else 'You have received a task assignment'
    end;

    if v_task.owner_id is not null then
      insert into public.task_alerts (
        project_id,
        wbs_task_id,
        actor_id,
        actor_name,
        recipient_id,
        source_key,
        alert_type,
        title,
        body,
        task_code,
        task_name,
        metadata
      ) values (
        v_task.project_id,
        v_task.id,
        new.user_id,
        v_actor_name,
        v_task.owner_id,
        new.id::text,
        v_alert_type,
        v_title,
        v_body,
        v_task.task_code,
        v_task.task_name,
        jsonb_build_object(
          'audit_log_id', new.id,
          'field_name', new.field_name,
          'action', new.action
        )
      );
    end if;

  elsif new.action = 'Task Accepted' or new.action = 'Assignment Rejected' or new.action = 'Rejected' or new.action = 'Approved' then
    select user_id
      into v_assigner_id
    from public.wbs_audit_log
    where wbs_task_id = new.wbs_task_id
      and field_name = 'owner_name'
      and action ilike '%assign%'
      and id <> new.id
    order by created_at desc
    limit 1;

    if new.action = 'Task Accepted' then
      v_alert_type := 'task_assignment_accepted';
      v_title := 'Assignment accepted';
      v_body := case when v_actor_name is not null then v_actor_name || ' accepted the task' else 'The assignee accepted the task' end;
    elsif new.action = 'Assignment Rejected' then
      v_alert_type := 'task_assignment_rejected';
      v_title := 'Assignment rejected';
      v_body := coalesce(new.new_value, 'The assignment was rejected');
    elsif new.action = 'Rejected' then
      v_alert_type := 'task_rejected';
      v_title := 'Task rejected for redo';
      v_body := coalesce(new.new_value, 'The task was rejected');
    else
      v_alert_type := 'task_approved';
      v_title := 'Task approved';
      v_body := 'Your submitted task was approved and moved to Completed';
    end if;

    if v_assigner_id is not null then
      insert into public.task_alerts (
        project_id,
        wbs_task_id,
        actor_id,
        actor_name,
        recipient_id,
        source_key,
        alert_type,
        title,
        body,
        task_code,
        task_name,
        metadata
      ) values (
        v_task.project_id,
        v_task.id,
        new.user_id,
        v_actor_name,
        v_assigner_id,
        new.id::text,
        v_alert_type,
        v_title,
        v_body,
        v_task.task_code,
        v_task.task_name,
        jsonb_build_object(
          'audit_log_id', new.id,
          'field_name', new.field_name,
          'action', new.action,
          'old_value', new.old_value,
          'new_value', new.new_value
        )
      );
    end if;

  elsif new.action = 'Progress Updated' and v_task.status = 'submitted' and coalesce(nullif(new.new_value, ''), '0')::numeric >= 100 then
    select user_id
      into v_assigner_id
    from public.wbs_audit_log
    where wbs_task_id = new.wbs_task_id
      and field_name = 'owner_name'
      and action ilike '%assign%'
      and id <> new.id
    order by created_at desc
    limit 1;

    if v_assigner_id is not null then
      v_alert_type := 'task_submitted';
      v_title := 'Task submitted for approval';
      v_body := case when v_actor_name is not null then v_actor_name || ' submitted this task at 100% progress' else 'The task was submitted for approval' end;

      insert into public.task_alerts (
        project_id,
        wbs_task_id,
        actor_id,
        actor_name,
        recipient_id,
        source_key,
        alert_type,
        title,
        body,
        task_code,
        task_name,
        metadata
      ) values (
        v_task.project_id,
        v_task.id,
        new.user_id,
        v_actor_name,
        v_assigner_id,
        new.id::text,
        v_alert_type,
        v_title,
        v_body,
        v_task.task_code,
        v_task.task_name,
        jsonb_build_object(
          'audit_log_id', new.id,
          'field_name', new.field_name,
          'action', new.action,
          'old_value', new.old_value,
          'new_value', new.new_value
        )
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_create_task_alert_from_audit on public.wbs_audit_log;
create trigger trg_create_task_alert_from_audit
  after insert on public.wbs_audit_log
  for each row
  execute function public.create_task_alert_from_audit();

do $$
begin
  alter publication supabase_realtime add table public.task_alerts;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

create policy "Users can view own task alerts"
  on public.task_alerts for select to authenticated
  using (recipient_id = auth.uid());

create policy "Authenticated users can create task alerts"
  on public.task_alerts for insert to authenticated
  with check (auth.uid() is not null);

create policy "Users can update own task alerts"
  on public.task_alerts for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

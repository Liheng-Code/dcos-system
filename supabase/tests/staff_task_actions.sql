-- Rolled-back check for migration 20261013000007 (task_transition / record_task_progress / review_task).
-- Run: docker exec -i supabase_db_dcos-system psql -U postgres -d postgres -f - < this file
begin;
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
      perform set_config('role','authenticated', true); end $f$;
create or replace function pg_temp.as_db() returns void language plpgsql as $f$
begin perform set_config('role','postgres', true); end $f$;

do $$
declare
  own uuid := 'd12566af-4e73-4bd7-8bf1-e117a145df49';   -- admin, member of proj
  rev uuid := 'aa123ed6-f8bf-464c-984b-c191e888ac97';   -- admin
  other uuid := '0b268e83-4c22-4f79-bf75-06154a7d496c'; -- admin, not the owner/reviewer
  proj uuid := '1181449f-7991-4605-8a3e-4437e17df886';
  t uuid; tt uuid; res jsonb; n int; msg text;
begin
  select id into tt from task_types where code = 'STR-CALC';
  select id into t from wbs_tasks where project_id = proj and status = 'open' order by id limit 1;
  update wbs_tasks set owner_id = own, reviewer_id = rev, task_type_id = tt, status = 'assigned', progress = 0 where id = t;
  insert into project_members(project_id, user_id) select proj, rev where not exists
    (select 1 from project_members where project_id = proj and user_id = rev);

  perform pg_temp.as_user(other);
  begin perform task_transition(t, 'in_progress'); raise notice 'FAIL non-owner started task';
  exception when others then raise notice 'non-owner start blocked: OK'; end;

  perform pg_temp.as_user(own);
  begin perform record_task_progress(t, 10); raise notice 'FAIL progress before start';
  exception when others then raise notice 'progress before start blocked: OK'; end;
  res := task_transition(t, 'in_progress');
  raise notice 'start: % (expect in_progress)', res;
  res := record_task_progress(t, 40, 3.5, 12, 'Foundation loads done');
  perform pg_temp.as_db();
  raise notice 'progress=% actual_hours=% remaining=% (expect 40, 3.5, 12)',
    (select progress from wbs_tasks where id = t), (select actual_hours from wbs_tasks where id = t), (select remaining_hours from wbs_tasks where id = t);
  raise notice 'history rows=% effort rows=% (expect 1,1)',
    (select count(*) from task_progress_history where wbs_task_id = t), (select count(*) from task_effort_log where wbs_task_id = t);

  perform pg_temp.as_user(own);
  begin perform record_task_progress(t, 20); raise notice 'FAIL reduction without comment';
  exception when others then raise notice 'progress reduction needs comment: OK'; end;
  begin perform record_task_progress(t, 150); raise notice 'FAIL >100';
  exception when others then raise notice 'progress >100 blocked: OK'; end;
  begin perform record_task_progress(t, 50, 30); raise notice 'FAIL >24h';
  exception when others then raise notice '>24h blocked: OK'; end;

  -- type requires a deliverable
  begin perform task_transition(t, 'submitted'); raise notice 'FAIL submit without deliverable';
  exception when others then get stacked diagnostics msg = message_text; raise notice 'submit without deliverable blocked: OK (%)', msg; end;
  perform pg_temp.as_db();
  insert into task_deliverables(wbs_task_id, name, is_required, status) values (t, 'Design calculations', true, 'pending');
  perform pg_temp.as_user(own);
  begin perform task_transition(t, 'submitted'); raise notice 'FAIL submit with pending deliverable';
  exception when others then get stacked diagnostics msg = message_text; raise notice 'submit with pending deliverable blocked: OK (%)', msg; end;
  perform pg_temp.as_db();
  update task_deliverables set status = 'submitted' where wbs_task_id = t;
  perform pg_temp.as_user(own);
  begin perform task_transition(t, 'completed'); raise notice 'FAIL completed without review';
  exception when others then raise notice 'complete skipping review blocked: OK'; end;
  res := task_transition(t, 'submitted', 'Please review');
  raise notice 'submit: % (expect review)', res;

  -- reviewer decides
  perform pg_temp.as_user(own);
  begin perform review_task(t, 'approved'); raise notice 'FAIL owner reviewed own work';
  exception when others then raise notice 'self-review blocked: OK'; end;
  perform pg_temp.as_user(other);
  begin perform review_task(t, 'approved'); raise notice 'FAIL stranger reviewed';
  exception when others then raise notice 'non-reviewer blocked: OK'; end;
  perform pg_temp.as_user(rev);
  begin perform review_task(t, 'returned'); raise notice 'FAIL return without comment';
  exception when others then raise notice 'return without comment blocked: OK'; end;
  res := review_task(t, 'returned', 'Check pile cap reinforcement', 'Redo section 3');
  raise notice 'return: % (expect in_progress)', res;
  perform pg_temp.as_db();
  raise notice 'deliverable status=% (expect returned)', (select status from task_deliverables where wbs_task_id = t);
  raise notice 'alert to owner: % (expect 1)', (select count(*) from task_alerts where recipient_id = own and wbs_task_id = t and alert_type = 'task_rejected');

  -- resubmit and approve
  update task_deliverables set status = 'submitted' where wbs_task_id = t;
  perform pg_temp.as_user(own);
  res := task_transition(t, 'submitted', 'Corrected');
  perform pg_temp.as_user(rev);
  res := review_task(t, 'approved', 'Good');
  raise notice 'approve: % (expect completed)', res;
  perform pg_temp.as_db();
  raise notice 'task progress=% status=% deliverable=% (expect 100, completed, accepted)',
    (select progress from wbs_tasks where id = t), (select status from wbs_tasks where id = t), (select status from task_deliverables where wbs_task_id = t);
  raise notice 'submissions=% reviews=% (expect 2, 2: returned + approved)',
    (select count(*) from task_submissions where wbs_task_id = t), (select count(*) from task_reviews where wbs_task_id = t);
  raise notice 'audit events=% (expect >=4)', (select count(*) from task_audit_events where wbs_task_id = t);

  -- two-step sign-off with a separate approver
  update wbs_tasks set status = 'in_progress', approver_id = other where id = t;
  update task_deliverables set status = 'submitted' where wbs_task_id = t;
  perform pg_temp.as_user(own);
  perform task_transition(t, 'submitted', 'Round 3');
  perform pg_temp.as_user(rev);
  res := review_task(t, 'approved');
  raise notice 'reviewer approves, approver pending: % (expect review)', res;
  perform pg_temp.as_user(other);
  res := review_task(t, 'approved');
  raise notice 'approver approves: % (expect completed)', res;
end $$;
rollback;

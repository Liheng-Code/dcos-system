-- doc 22 P0.6 (Wave 1 gate): no Planning function may be executed by the anon role.
-- Postgres grants EXECUTE to PUBLIC by default, so earlier Planning functions were callable without signing in
-- (55 on the local stack on 2026-11-03). Each one keeps EXECUTE for authenticated and service_role, so nothing changes
-- for a signed-in user, the server routes or triggers. Only the anon grant goes. Idempotent; the same rule as the
-- test in supabase/tests/planning/planning_release_checks.sql.

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and (p.proname like 'plan\_%' or p.proname like '%baseline%'
            or p.proname in ('advance_data_date', 'submit_progress', 'decide_progress_review', 'sync_daily_report_to_planning',
                             'apply_schedule_dates', 'task_transition', 'wbs_node_delete_check'))
       and has_function_privilege('anon', p.oid, 'execute')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

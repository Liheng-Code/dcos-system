-- Rolled-back RLS/trigger check for migration 20261013000005. Run: docker exec -i supabase_db_dcos-system psql -U postgres -d postgres -f - < this file
-- Uses fixed local profile ids and task id from the local DB; adjust if they no longer exist.
begin;
create temp table ids as select
 'd12566af-4e73-4bd7-8bf1-e117a145df49'::uuid o, 'aa123ed6-f8bf-464c-984b-c191e888ac97'::uuid r,
 (select id from profiles where role<>'admin' and id not in (select user_id from user_roles where role_code='admin') limit 1) x,
 'ac33e954-2912-42d5-a503-1ba6b92d3142'::uuid t;
grant select on ids to authenticated;
update wbs_tasks set owner_id=(select o from ids), reviewer_id=(select r from ids) where id=(select t from ids);
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
      perform set_config('role','authenticated', true); end $f$;
do $$
declare i ids%rowtype; sid uuid; n int;
begin
 select * into i from ids;
 perform pg_temp.as_user(i.o);
 insert into task_submissions(wbs_task_id,round,submitted_by) values (i.t,1,i.o) returning id into sid;
 raise notice 'owner submit: OK';
 begin insert into task_reviews(wbs_task_id,submission_id,reviewer_id,decision) values (i.t,sid,i.o,'approved'); raise notice 'FAIL owner self-review allowed';
 exception when others then raise notice 'owner self-review blocked: OK (%)', sqlerrm; end;
 perform set_config('role','postgres',true); perform pg_temp.as_user(i.r);
 insert into task_reviews(wbs_task_id,submission_id,reviewer_id,decision) values (i.t,sid,i.r,'returned');
 raise notice 'reviewer decide: OK';
 begin update task_reviews set decision='approved' where submission_id=sid; get diagnostics n=row_count; raise notice 'review update rows=% (expect 0)', n; end;
 begin delete from task_reviews where submission_id=sid; get diagnostics n=row_count; raise notice 'review delete rows=% (expect 0)', n; end;
 perform set_config('role','postgres',true); perform pg_temp.as_user(i.x);
 select count(*) into n from task_submissions; raise notice 'outsider sees submissions=% (expect 0)', n;
 begin insert into task_comments(wbs_task_id,author_id,body) values (i.t,i.x,'hi'); raise notice 'FAIL outsider comment allowed';
 exception when others then raise notice 'outsider comment blocked: OK'; end;
 begin insert into task_types(code,name) values ('ZZ','x'); raise notice 'FAIL outsider config allowed';
 exception when others then raise notice 'outsider task_type write blocked: OK'; end;
 perform set_config('role','postgres',true);
 insert into task_effort_log(wbs_task_id,profile_id,work_date,hours) values (i.t,i.o,current_date,3);
 insert into task_effort_log(wbs_task_id,profile_id,work_date,hours) values (i.t,i.o,current_date,2.5);
 raise notice 'actual_hours=% (expect 5.5)', (select actual_hours from wbs_tasks where id=i.t);
 insert into task_blockers(wbs_task_id,title,reported_by) values (i.t,'b',i.o);
 raise notice 'is_blocked=% (expect t)', (select is_blocked from wbs_tasks where id=i.t);
 update task_blockers set status='resolved' where wbs_task_id=i.t;
 raise notice 'is_blocked=% (expect f)', (select is_blocked from wbs_tasks where id=i.t);
end $$;
rollback;

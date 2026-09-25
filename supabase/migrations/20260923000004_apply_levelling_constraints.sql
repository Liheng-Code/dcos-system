-- Planning ▸ Resource Levelling: batch-apply a levelling run's moves in one
-- round-trip, mirroring apply_schedule_dates() (20260903000001). Before this,
-- applyLevellingRun() (lib/planning/levelling-service.ts) wrote one
-- start_no_earlier_than constraint per moved task in a sequential loop — N
-- round-trips for an N-task levelling run. This does it in one statement.
--
-- SECURITY INVOKER: the caller's RLS on wbs_tasks still governs the write —
-- this grants no extra privilege, it only saves N round-trips per apply.
create or replace function public.apply_levelling_constraints(
  p_project_id uuid,
  p_rows       jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return 0;
  end if;

  update public.wbs_tasks t
     set constraint_type = 'start_no_earlier_than',
         constraint_date = r.new_start,
         updated_at = now()
    from jsonb_to_recordset(p_rows)
      as r(id uuid, new_start date)
   where t.id = r.id
     and t.project_id = p_project_id;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

comment on function public.apply_levelling_constraints(uuid, jsonb) is
  'Applies a batch of resource-levelling start-no-earlier-than constraints for one project in a single statement. Rows: [{"id":uuid,"new_start":date}].';

revoke all on function public.apply_levelling_constraints(uuid, jsonb) from public;
grant execute on function public.apply_levelling_constraints(uuid, jsonb) to authenticated;

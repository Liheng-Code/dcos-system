-- Procurement: project Package Plan and long-lead register (2026-11-04, Work Library roadmap Wave 2 item 7).
--
-- One row per procurement package that the project's unfinished schedule needs: the package is linked
-- (plan_act_master_procurement_packages) to the Activity Master of a task (wbs_tasks.activity_master_id). Dates follow
-- the Planning materials feed (plan_feed_rows 'materials'), but per package instead of per resource:
--   required_on_site = earliest start of those tasks - site buffer (plan_schedule_settings.feed_site_buffer_days, 3)
--   order_by         = required_on_site - package default lead time (else feed_material_lead_days, 14)
-- PR coverage uses procurement_prs.package_id on the project (rejected / cancelled PRs ignored):
--   no_pr, pr_late (earliest PR required date after required_on_site), covered.
-- Only unfinished tasks count (started-or-not, no actual finish, progress < 100), as in the feed.
-- Readable by whoever may read the materials feed (plan_feed_reader: project member + Planning schedule view or
-- Procurement PR view). Read-only; additive.

create or replace function public.proc_project_package_plan(p_project_id uuid)
returns table (
  package_id uuid, package_code text, package_name text, package_type text, trade_category text, is_long_lead boolean,
  lead_time_days integer, lead_time_source text,
  activity_count integer, task_count integer,
  first_task_id uuid, first_task_code text, first_task_name text, first_start date, last_finish date,
  required_on_site date, order_by date,
  pr_count integer, pr_numbers text, pr_required_date date, coverage text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_buffer int;
  v_default_lead int;
begin
  if not public.plan_feed_reader(p_project_id, 'materials') then
    raise exception 'You do not have access to this project''s package plan' using errcode = '42501';
  end if;
  select coalesce(s.feed_site_buffer_days, 3), coalesce(s.feed_material_lead_days, 14)
    into v_buffer, v_default_lead
    from (select 1) one left join public.plan_schedule_settings s on s.project_id = p_project_id;

  return query
  with t as (
    select wt.id, wt.task_code, wt.task_name, wt.start_date, wt.end_date, wt.activity_master_id
      from public.wbs_tasks wt
     where wt.project_id = p_project_id and wt.activity_master_id is not null and wt.start_date is not null
       and wt.actual_finish_date is null and coalesce(wt.progress, 0) < 100),
  tp as (
    select x.package_id, t.*
      from t join public.plan_act_master_procurement_packages x on x.master_id = t.activity_master_id),
  agg as (
    select tp.package_id,
           count(distinct tp.activity_master_id)::int as activity_count,
           count(distinct tp.id)::int as task_count,
           min(tp.start_date) as first_start,
           max(tp.end_date) as last_finish,
           (array_agg(tp.id order by tp.start_date, tp.task_code))[1] as first_task_id
      from tp group by tp.package_id),
  pr as (
    select r.package_id, count(*)::int as n, min(r.required_date) as req, string_agg(r.pr_number, ', ' order by r.pr_number) as nums
      from public.procurement_prs r
     where r.project_id = p_project_id and r.package_id is not null and r.approval_status not in ('rejected', 'cancelled')
     group by r.package_id)
  select p.id, p.code, p.name, p.package_type, p.trade_category, p.is_long_lead,
         coalesce(p.default_lead_time_days, v_default_lead),
         case when p.default_lead_time_days is not null then 'package' else 'default' end,
         a.activity_count, a.task_count,
         a.first_task_id, ft.task_code, ft.task_name, a.first_start, a.last_finish,
         a.first_start - v_buffer,
         a.first_start - v_buffer - coalesce(p.default_lead_time_days, v_default_lead),
         coalesce(pr.n, 0), pr.nums, pr.req,
         case when pr.n is null then 'no_pr' when pr.req > a.first_start - v_buffer then 'pr_late' else 'covered' end
    from agg a
    join public.plan_act_procurement_packages p on p.id = a.package_id
    left join public.wbs_tasks ft on ft.id = a.first_task_id
    left join pr on pr.package_id = a.package_id
   order by a.first_start - v_buffer - coalesce(p.default_lead_time_days, v_default_lead), p.code;
end;
$$;

revoke all on function public.proc_project_package_plan(uuid) from public, anon;
grant execute on function public.proc_project_package_plan(uuid) to authenticated;
comment on function public.proc_project_package_plan(uuid) is
  'Procurement Package Plan: packages the project''s unfinished tasks need, with required-on-site / order-by dates and PR coverage.';

-- HR / E-Leave: an employee cannot hold two active leave requests on the same
-- day, whatever the leave type. Enforced here so it holds for every write path
-- (web form, Telegram mini app, direct API).
--
-- Clash rule, per calendar day: a full day clashes with anything; a morning
-- clashes with a morning; an afternoon with an afternoon. Morning + afternoon
-- on the same day is allowed. Skipped days, and Sundays / public holidays left
-- out of the request, never clash.
--
-- Mirrors getRequestDayPortions / findLeaveDayConflicts in
-- apps/web/lib/hr/leave-day-calculation.ts.
--
-- Additive only: one nullable column, two functions, one trigger.

-- Per-day choices as submitted: { "yyyy-mm-dd": "full" | "morning" | "afternoon" | "skip" }.
-- Days missing from the map are not requested. NULL on rows saved before this
-- column existed: those count as every day in the range (or the single half
-- day for an is_half_day request), matching the previous client check.
alter table public.leave_requests add column if not exists day_selections jsonb;

comment on column public.leave_requests.day_selections is
  'Per-day choices {yyyy-mm-dd: full|morning|afternoon|skip}; days absent are not requested. NULL = legacy row (whole range, or the single half day).';

-- The days (and which part of each day) a request occupies.
create or replace function public.leave_request_day_portions(
  p_start_date date,
  p_end_date date,
  p_day_selections jsonb,
  p_is_half_day boolean,
  p_half_day_period text
)
returns table (leave_date date, portion text)
language sql
immutable
set search_path = public
as $$
  select x.leave_date, x.portion
  from (
    select
      d::date as leave_date,
      case
        when p_day_selections is not null then p_day_selections ->> to_char(d, 'YYYY-MM-DD')
        when coalesce(p_is_half_day, false) and p_half_day_period in ('morning', 'afternoon') then p_half_day_period
        else 'full'
      end as portion
    from generate_series(p_start_date, p_end_date, interval '1 day') as d
  ) x
  where x.portion in ('full', 'morning', 'afternoon');
$$;

create or replace function public.leave_requests_prevent_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_blocking constant text[] := array['submitted', 'approved', 'pending_cancellation'];
  v_conflicts text;
begin
  if not (new.status = any (v_blocking)) then
    return new;
  end if;

  -- An already-active request whose days did not change (approve, reject
  -- step, cancellation request, ...) is not re-checked.
  if tg_op = 'UPDATE'
     and old.status = any (v_blocking)
     and new.start_date = old.start_date
     and new.end_date = old.end_date
     and new.day_selections is not distinct from old.day_selections
     and new.is_half_day is not distinct from old.is_half_day
     and new.half_day_period is not distinct from old.half_day_period then
    return new;
  end if;

  -- Serialise writes per employee so two concurrent submissions cannot both pass.
  perform pg_advisory_xact_lock(hashtextextended('leave_requests_overlap:' || new.employee_id::text, 0));

  select string_agg(to_char(c.leave_date, 'DD Mon YYYY'), ', ' order by c.leave_date)
    into v_conflicts
  from (
    select distinct n.leave_date
    from public.leave_request_day_portions(new.start_date, new.end_date, new.day_selections, new.is_half_day, new.half_day_period) n
    join public.leave_requests o
      on o.employee_id = new.employee_id
     and o.id <> new.id
     and o.status = any (v_blocking)
     and o.start_date <= new.end_date
     and o.end_date >= new.start_date
    cross join lateral public.leave_request_day_portions(o.start_date, o.end_date, o.day_selections, o.is_half_day, o.half_day_period) e
    where e.leave_date = n.leave_date
      and (n.portion = 'full' or e.portion = 'full' or n.portion = e.portion)
  ) c;

  if v_conflicts is not null then
    raise exception 'You already have a leave request on: %. Please select different dates.', v_conflicts
      using errcode = '23P01', hint = 'leave_date_conflict';
  end if;

  return new;
end;
$$;

drop trigger if exists leave_requests_prevent_overlap on public.leave_requests;
create trigger leave_requests_prevent_overlap
  before insert or update of status, start_date, end_date, day_selections, is_half_day, half_day_period
  on public.leave_requests
  for each row
  execute function public.leave_requests_prevent_overlap();

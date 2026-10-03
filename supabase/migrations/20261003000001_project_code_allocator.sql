-- Project codes are system-generated: PJR-<YYYY>-NNN.
--
-- Rules:
--   * YYYY is the creation year in Asia/Phnom_Penh; NNN restarts at 001 each year.
--   * The number comes from a per-year counter row in project_code_sequences
--     (prefix 'PJR-2026', ...), taken under a row lock, so concurrent creates
--     never collide and a deleted project's number is never reissued.
--   * A project inserted without a code gets one from the trigger. The app
--     never sends a code (no user override); seeds/imports that set their own
--     code are left alone, and the allocator skips any number already in use.
--   * The counter starts at the highest existing PJR-/PRJ-YYYY-NNN code of
--     that year (both prefixes were used before this change).
-- Idempotent; existing codes are untouched.

insert into public.project_code_sequences (prefix, last_sequence, description)
select 'PJR-' || m[1], max(m[2]::int), 'Project code sequence - PJR-' || m[1] || '-NNN'
from public.projects p,
     regexp_match(p.project_code, '^(?:PJR|PRJ)-(\d{4})-(\d{3,})$') m
where m is not null
group by m[1]
on conflict (prefix) do update
  set last_sequence = greatest(public.project_code_sequences.last_sequence, excluded.last_sequence);

-- Next code for the current year, consumed (call only when inserting).
create or replace function public.next_project_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_year text := to_char(now() at time zone 'Asia/Phnom_Penh', 'YYYY');
  v_key  text := 'PJR-' || v_year;
  v_seq  integer;
  v_code text;
begin
  loop
    insert into public.project_code_sequences as s (prefix, last_sequence, description)
    values (v_key, 1, 'Project code sequence - ' || v_key || '-NNN')
    on conflict (prefix) do update set last_sequence = s.last_sequence + 1
    returning last_sequence into v_seq;
    v_code := v_key || '-' || lpad(v_seq::text, 3, '0');
    exit when not exists (select 1 from public.projects where project_code = v_code);
  end loop;
  return v_code;
end $$;

-- Preview of the next code for the create forms; does not consume a number.
create or replace function public.peek_next_project_code()
returns text language sql stable security definer set search_path = public as $$
  select 'PJR-' || y || '-' || lpad((coalesce(
           (select last_sequence from public.project_code_sequences where prefix = 'PJR-' || y), 0) + 1)::text, 3, '0')
  from (select to_char(now() at time zone 'Asia/Phnom_Penh', 'YYYY') as y) t
$$;

create or replace function public.projects_assign_code()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.project_code is null or btrim(new.project_code) = '' then
    new.project_code := public.next_project_code();
  end if;
  return new;
end $$;

drop trigger if exists projects_assign_code on public.projects;
create trigger projects_assign_code
  before insert on public.projects
  for each row execute function public.projects_assign_code();

grant execute on function public.peek_next_project_code() to authenticated;
revoke execute on function public.peek_next_project_code() from anon, public;
revoke execute on function public.next_project_code() from anon, authenticated, public;

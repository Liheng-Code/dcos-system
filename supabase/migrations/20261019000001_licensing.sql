-- Licensing, Phase 1 (tenant side). Design:
-- docs/01-DCOS-Foundation/DCOS-Licensing-Control-Plane-Design.md sections 6.1, 7.3-7.5.
--
-- license_state holds the installed license token and the claims the app verified
-- from it. Only the server (service role) reads or writes it: the app verifies the
-- Ed25519 signature before storing claims, so the database trusts `claims`.
-- enforcement_mode mirrors the DCOS_LICENSE_MODE env var (the app syncs it) and
-- defaults to 'off', so nothing changes until a deployment opts in.

create table if not exists public.license_state (
  id boolean primary key default true check (id),
  token text,
  claims jsonb,
  lic_id text,
  lic_rev integer not null default 0,
  token_kid text,
  token_jti text,
  installed_at timestamptz,
  installed_by uuid references auth.users(id) on delete set null,
  enforcement_mode text not null default 'off' check (enforcement_mode in ('off', 'report', 'enforce')),
  -- Greatest time ever observed; license decisions use max(now(), high_water_at),
  -- so winding the server clock back changes nothing (design 4.5).
  high_water_at timestamptz,
  -- Reduce-only status from HQ (design 4.2); unused until HQ exists.
  suspended boolean not null default false,
  suspend_mode text check (suspend_mode in ('readonly', 'locked')),
  revoked_jtis text[] not null default '{}',
  compromised_kids text[] not null default '{}',
  last_refresh_ok_at timestamptz,
  last_refresh_error text,
  updated_at timestamptz not null default now()
);

insert into public.license_state (id) values (true) on conflict (id) do nothing;

alter table public.license_state enable row level security;
-- No policies: browser clients get nothing; the server uses the service role.

create table if not exists public.license_local_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now()
);

create index if not exists license_local_events_occurred_idx
  on public.license_local_events (occurred_at desc);

alter table public.license_local_events enable row level security;

-- ---------------------------------------------------------------------------
-- Usage. A seat is a named ACTIVE or INVITED user. A viewer seat (cheaper,
-- owner decision 3) is a user whose legacy profiles.role is empty or 'viewer'
-- and none of whose RBAC roles grants any write action.
-- A project counts unless it is closed out, and a tender counts only once
-- awarded (owner decision 2).
-- ---------------------------------------------------------------------------

create or replace function public.license_is_viewer(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.role from public.profiles p where p.id = p_user_id), 'viewer') = 'viewer'
     and not exists (
       select 1
       from public.user_roles ur
       join public.role_permissions rp on rp.role_code = ur.role_code
       where ur.user_id = p_user_id
         and (rp.can_create or rp.edit or rp.delete or rp.submit or rp.approve or rp.reject
              or rp.transmit or rp.configure or rp.reassign)
     );
$$;

create or replace function public.license_usage()
returns table (users integer, viewers integer, projects integer)
language sql
stable
security definer
set search_path = public
as $$
  with seats as (
    select public.license_is_viewer(p.id) as is_viewer
    from public.profiles p
    where p.account_status in ('ACTIVE', 'INVITED')
  )
  select
    (select count(*) filter (where not is_viewer) from seats)::integer,
    (select count(*) filter (where is_viewer) from seats)::integer,
    (select count(*)
       from public.projects pr
       where coalesce(pr.project_status, '') not in ('archived', 'cancelled', 'completed', 'closed')
         and (pr.project_type is distinct from 'tender'
              or exists (select 1 from public.project_precontract_details d
                         where d.project_id = pr.id and d.tender_stage = 'awarded')))::integer;
$$;

-- ---------------------------------------------------------------------------
-- Lifecycle, mirroring apps/web/lib/licensing/effective.ts. Returns
-- 'full' | 'readonly' | 'locked'; 'full' whenever enforcement_mode is 'off'.
-- ---------------------------------------------------------------------------

create or replace function public.license_access()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.license_state;
  lic jsonb;
  now_eff timestamptz;
  term_end timestamptz;
  grace_end timestamptz;
  readonly_end timestamptz;
begin
  select * into s from public.license_state where id;
  if s is null or s.enforcement_mode = 'off' then
    return 'full';
  end if;
  if s.claims is null then
    return 'locked';
  end if;

  lic := s.claims -> 'lic';
  if lic ->> 'hq_state' in ('revoked', 'terminated') then
    return 'locked';
  end if;
  if s.suspended or lic ->> 'hq_state' = 'suspended' then
    return case when coalesce(s.suspend_mode, lic ->> 'suspend_mode') = 'readonly' then 'readonly' else 'locked' end;
  end if;

  now_eff := greatest(now(), coalesce(s.high_water_at, now()));
  if now_eff < ((lic ->> 'from')::date)::timestamp at time zone 'UTC' then
    return 'locked';
  end if;
  term_end := (((lic ->> 'until')::date + 1)::timestamp) at time zone 'UTC';
  grace_end := term_end + make_interval(days => (lic ->> 'grace_days')::integer);
  readonly_end := grace_end + make_interval(days => (lic ->> 'readonly_days')::integer);

  if now_eff < grace_end then
    return 'full';
  elsif now_eff < readonly_end then
    return 'readonly';
  end if;
  return 'locked';
end;
$$;

-- Limit from the installed license; null means unlimited (or licensing off).
create or replace function public.license_limit(p_name text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when s.enforcement_mode = 'off' or s.claims is null then null
    else nullif(s.claims -> 'ent' -> 'limits' ->> p_name, '')::integer
  end
  from public.license_state s
  where s.id;
$$;

-- ---------------------------------------------------------------------------
-- Project limit (design 7.5, E7). Projects are created straight from the
-- browser, so the check lives in the database. Only inserts are checked:
-- awarding a tender or reopening a project never fails (soft over-limit).
-- In 'report' mode the would-be denial is logged and the insert goes ahead.
-- ---------------------------------------------------------------------------

create or replace function public.license_check_project_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text;
  v_access text;
  v_limit integer;
  v_used integer;
  v_code text;
  v_message text;
begin
  select enforcement_mode into v_mode from public.license_state where id;
  if v_mode is null or v_mode = 'off' then
    return new;
  end if;

  v_access := public.license_access();
  if v_access <> 'full' then
    v_code := case when v_access = 'readonly' then 'LIC_READ_ONLY' else 'LIC_LOCKED' end;
    v_message := 'The DCOS license does not allow creating projects at the moment.';
  elsif new.project_type is distinct from 'tender'
        and coalesce(new.project_status, '') not in ('archived', 'cancelled', 'completed', 'closed') then
    v_limit := public.license_limit('projects');
    if v_limit is not null then
      select u.projects into v_used from public.license_usage() u;
      if v_used >= v_limit then
        v_code := 'LIC_PROJECT_LIMIT';
        v_message := format('Project limit reached: %s of %s active projects. Tenders do not count until awarded.', v_used, v_limit);
      end if;
    end if;
  end if;

  if v_code is null then
    return new;
  end if;

  if v_mode = 'enforce' then
    -- The error rolls back the statement, so there is nothing to log here; the
    -- client shows the message.
    raise exception '%: %', v_code, v_message using errcode = 'P0001';
  end if;

  insert into public.license_local_events (event_type, payload, actor_id)
  values ('would_deny',
          jsonb_build_object('code', v_code, 'action', 'project_insert', 'used', v_used, 'limit', v_limit),
          auth.uid());
  return new;
end;
$$;

drop trigger if exists projects_license_check on public.projects;
create trigger projects_license_check
  before insert on public.projects
  for each row execute function public.license_check_project_insert();

revoke all on function public.license_usage() from public, anon;
revoke all on function public.license_access() from public, anon;
revoke all on function public.license_limit(text) from public, anon;
revoke all on function public.license_is_viewer(uuid) from public, anon;
grant execute on function public.license_usage() to authenticated, service_role;
grant execute on function public.license_access() to authenticated, service_role;
grant execute on function public.license_limit(text) to authenticated, service_role;
grant execute on function public.license_is_viewer(uuid) to authenticated, service_role;

-- Module 10-01 Daily Reporting — Phase 1C: Telegram group binding and launch.
--
-- Telegram is an interface, not a system of record. A Telegram group never
-- grants access: it only tells the bot where to post status lines and which
-- reporting unit a "Submit Daily Report" link belongs to. Every function here
-- is executable by the service role only; the API routes and the bot webhook
-- authenticate the caller and pass them in as p_actor.
--
-- Identity linking reuses the HR link-code flow (profiles.telegram_user_id),
-- so no second identity table is added.

-- ── 1. Group bindings ───────────────────────────────────────────────────────
-- One ACTIVE group per reporting unit and one ACTIVE unit per group. A row is
-- Pending until the bot sees the admin's binding code posted in the group.
create table public.dr_telegram_bindings (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references public.projects(id) on delete cascade,
  unit_id               uuid not null references public.dr_reporting_units(id) on delete cascade,
  chat_id               bigint,
  chat_title            text,
  chat_type             text check (chat_type in ('group', 'supergroup')),
  migrated_from_chat_id bigint,
  bot_present           boolean not null default true,
  -- The bot's "Submit Daily Report" message, edited in place when the link is re-issued.
  pinned_message_id     bigint,
  status                text not null default 'Pending'
                        check (status in ('Pending', 'Active', 'Migrated', 'Suspended', 'Unbound')),
  bound_by              uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  valid_from            timestamptz,
  valid_to              timestamptz,
  updated_at            timestamptz not null default now()
);

create unique index uq_dr_tg_binding_active_unit on public.dr_telegram_bindings (unit_id) where status = 'Active';
create unique index uq_dr_tg_binding_active_chat on public.dr_telegram_bindings (chat_id) where status = 'Active';
create index idx_dr_tg_binding_chat on public.dr_telegram_bindings (chat_id) where chat_id is not null;
create index idx_dr_tg_binding_project on public.dr_telegram_bindings (project_id);

-- Binding code the admin posts in the group. Stored as a hash, single use.
create table public.dr_telegram_binding_codes (
  id         uuid primary key default gen_random_uuid(),
  binding_id uuid not null references public.dr_telegram_bindings(id) on delete cascade,
  code_hash  text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- The launch link pinned in the group. Telegram limits the start parameter to
-- 64 characters, so the link carries an opaque random id (stored as a hash)
-- instead of a signed claim set; the claims live here, server-side.
create table public.dr_telegram_launch_tokens (
  id         uuid primary key default gen_random_uuid(),
  binding_id uuid not null references public.dr_telegram_bindings(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_dr_tg_launch_binding on public.dr_telegram_launch_tokens (binding_id);

-- Status-only lines for the group (R1 D21): report number and state, nothing else.
create table public.dr_telegram_group_outbox (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id    uuid not null,
  binding_id uuid not null,
  chat_id    bigint not null,
  text       text not null,
  source_key text not null unique,
  status     text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts   int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create index idx_dr_tg_group_outbox_pending on public.dr_telegram_group_outbox (created_at) where status = 'pending';

alter table public.dr_telegram_bindings enable row level security;
alter table public.dr_telegram_binding_codes enable row level security;
alter table public.dr_telegram_launch_tokens enable row level security;
alter table public.dr_telegram_group_outbox enable row level security;

revoke all on public.dr_telegram_bindings, public.dr_telegram_binding_codes,
              public.dr_telegram_launch_tokens, public.dr_telegram_group_outbox from anon, authenticated;
grant select on public.dr_telegram_bindings to authenticated;

-- Admins and approvers read bindings; nobody writes except through the functions.
create policy dr_tg_bindings_select on public.dr_telegram_bindings for select to authenticated
  using (public.dr_can_admin(project_id) or public.dr_can_review(project_id));

-- In-app alert types raised by the binding functions. The allowed list is a
-- check constraint on task_alerts; rebuild it with the two new values added.
do $$
declare
  v_con  text;
  v_def  text;
  v_vals text[];
begin
  select conname, pg_get_constraintdef(oid) into v_con, v_def
  from pg_constraint
  where conrelid = 'public.task_alerts'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%alert_type%';

  if v_con is not null then
    select array_agg(distinct m[1]) into v_vals
    from regexp_matches(substring(v_def from position('ANY' in v_def)), '([a-z][a-z_]*[a-z])', 'g') as m
    where m[1] not in ('text', 'alert_type');
    execute format('alter table public.task_alerts drop constraint %I', v_con);
  end if;

  select array_agg(distinct v order by v) into v_vals
  from unnest(coalesce(v_vals, '{}'::text[]) || array['dr_telegram_migrated', 'dr_telegram_suspended']) as v;

  execute format(
    'alter table public.task_alerts add constraint task_alerts_alert_type_check check (alert_type = any (%L::text[]))',
    v_vals);
end $$;

-- ── 2. Binding functions ────────────────────────────────────────────────────
-- An admin or the project's approver starts a binding: a Pending row plus a
-- one-time code (30 minutes) to post in the group. Replaces an earlier
-- Pending request for the same unit.
create or replace function public.dr_tg_create_binding(
  p_actor uuid, p_unit_id uuid, p_code_hash text, p_ttl_minutes int default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit    public.dr_reporting_units%rowtype;
  v_binding uuid;
  v_expires timestamptz := now() + make_interval(mins => greatest(1, least(p_ttl_minutes, 1440)));
begin
  select * into v_unit from dr_reporting_units where id = p_unit_id;
  if not found then
    raise exception 'DR_NOT_FOUND: reporting unit not found';
  end if;
  if not dr_can_review(v_unit.project_id, p_actor) then
    raise exception 'DR_FORBIDDEN: only a project approver or administrator can bind a Telegram group';
  end if;
  if v_unit.status = 'Demobilised' then
    raise exception 'DR_STATE: a demobilised unit cannot be bound to a group';
  end if;
  if coalesce(p_code_hash, '') = '' then
    raise exception 'DR_REQ_FIELD: a code hash is required';
  end if;

  update dr_telegram_bindings
     set status = 'Unbound', valid_to = now(), updated_at = now()
   where unit_id = p_unit_id and status = 'Pending' and chat_id is null;

  insert into dr_telegram_bindings (project_id, unit_id, bound_by)
  values (v_unit.project_id, p_unit_id, p_actor)
  returning id into v_binding;

  insert into dr_telegram_binding_codes (binding_id, code_hash, expires_at, created_by)
  values (v_binding, p_code_hash, v_expires, p_actor);

  perform dr_audit(v_unit.project_id, p_unit_id, null, null, 'DR.BINDING_CREATED', p_actor, 'TELEGRAM',
                   jsonb_build_object('binding_id', v_binding, 'expires_at', v_expires));
  return jsonb_build_object('binding_id', v_binding, 'expires_at', v_expires);
end;
$$;

-- The bot saw the code in a group. p_actor is the DCOS user behind the Telegram
-- account that posted it; that user must be allowed to bind the unit.
create or replace function public.dr_tg_bind_chat(
  p_actor uuid, p_code_hash text, p_chat_id bigint, p_chat_title text, p_chat_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code    public.dr_telegram_binding_codes%rowtype;
  v_binding public.dr_telegram_bindings%rowtype;
  v_unit    public.dr_reporting_units%rowtype;
  v_old     uuid;
begin
  select * into v_code from dr_telegram_binding_codes where code_hash = p_code_hash for update;
  if not found or v_code.used_at is not null or v_code.expires_at < now() then
    raise exception 'DR_NOT_FOUND: the binding code is invalid, used or expired';
  end if;
  select * into v_binding from dr_telegram_bindings where id = v_code.binding_id for update;
  if v_binding.status <> 'Pending' then
    raise exception 'DR_STATE: this binding request is no longer pending';
  end if;
  select * into v_unit from dr_reporting_units where id = v_binding.unit_id;
  if not dr_can_review(v_binding.project_id, p_actor) then
    raise exception 'DR_FORBIDDEN: only a project approver or administrator can bind a Telegram group';
  end if;
  if p_chat_type not in ('group', 'supergroup') then
    raise exception 'DR_INVALID: only a group or supergroup can be bound';
  end if;
  if exists (select 1 from dr_telegram_bindings where chat_id = p_chat_id and status = 'Active') then
    raise exception 'DR_STATE: this Telegram group is already bound to a reporting unit';
  end if;

  -- The unit's previous group, if any, is retired but kept as history.
  for v_old in
    select id from dr_telegram_bindings where unit_id = v_binding.unit_id and status = 'Active' for update
  loop
    update dr_telegram_bindings set status = 'Unbound', valid_to = now(), updated_at = now() where id = v_old;
    perform dr_audit(v_binding.project_id, v_binding.unit_id, null, null, 'DR.BINDING_UNBOUND', p_actor, 'TELEGRAM',
                     jsonb_build_object('binding_id', v_old, 'reason', 'replaced'));
  end loop;

  update dr_telegram_bindings
     set chat_id = p_chat_id, chat_title = left(p_chat_title, 200), chat_type = p_chat_type,
         bot_present = true, status = 'Active', valid_from = now(), bound_by = p_actor, updated_at = now()
   where id = v_binding.id;
  update dr_telegram_binding_codes set used_at = now() where id = v_code.id;

  perform dr_audit(v_binding.project_id, v_binding.unit_id, null, null, 'DR.BINDING_ACTIVATED', p_actor, 'TELEGRAM',
                   jsonb_build_object('binding_id', v_binding.id, 'chat_id', p_chat_id, 'chat_title', left(p_chat_title, 200)));
  return jsonb_build_object('binding_id', v_binding.id, 'unit_id', v_binding.unit_id, 'project_id', v_binding.project_id,
                            'unit_name', v_unit.display_name, 'unit_code', v_unit.unit_code);
end;
$$;

-- Basic group -> supergroup migration changes the chat id. The old binding is
-- retired and a Pending binding for the new id waits for an admin to confirm.
create or replace function public.dr_tg_migrate_chat(p_old_chat_id bigint, p_new_chat_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.dr_telegram_bindings%rowtype;
  v_new uuid;
  r     uuid;
begin
  select * into v_old from dr_telegram_bindings
   where chat_id = p_old_chat_id and status in ('Active', 'Suspended') for update;
  if not found then
    return jsonb_build_object('migrated', false);
  end if;
  if exists (select 1 from dr_telegram_bindings where chat_id = p_new_chat_id and status in ('Active', 'Pending')) then
    return jsonb_build_object('migrated', false);
  end if;

  update dr_telegram_bindings set status = 'Migrated', valid_to = now(), updated_at = now() where id = v_old.id;
  insert into dr_telegram_bindings
    (project_id, unit_id, chat_id, chat_title, chat_type, migrated_from_chat_id, bot_present, status, bound_by)
  values
    (v_old.project_id, v_old.unit_id, p_new_chat_id, v_old.chat_title, 'supergroup', p_old_chat_id, true, 'Pending', v_old.bound_by)
  returning id into v_new;

  perform dr_audit(v_old.project_id, v_old.unit_id, null, null, 'DR.BINDING_MIGRATED', null, 'TELEGRAM',
                   jsonb_build_object('old_binding_id', v_old.id, 'new_binding_id', v_new,
                                      'old_chat_id', p_old_chat_id, 'new_chat_id', p_new_chat_id));
  for r in select * from dr_reviewers(v_old.project_id) loop
    perform dr_notify(v_old.project_id, r, 'dr_telegram_migrated', 'High',
                      'Telegram group moved — confirm the binding',
                      'The group for a reporting unit was upgraded to a supergroup. Confirm the new binding in Setup > Telegram.',
                      '/dashboard/site/daily-reporting', 'dr-tg-migrated:' || v_new, null, '{email}');
  end loop;
  return jsonb_build_object('migrated', true, 'binding_id', v_new, 'unit_id', v_old.unit_id, 'project_id', v_old.project_id);
end;
$$;

create or replace function public.dr_tg_confirm_migration(p_actor uuid, p_binding_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.dr_telegram_bindings%rowtype;
begin
  select * into b from dr_telegram_bindings where id = p_binding_id for update;
  if not found then
    raise exception 'DR_NOT_FOUND: binding not found';
  end if;
  if not dr_can_review(b.project_id, p_actor) then
    raise exception 'DR_FORBIDDEN: only a project approver or administrator can confirm a binding';
  end if;
  if b.status <> 'Pending' or b.migrated_from_chat_id is null then
    raise exception 'DR_STATE: only a migrated binding waiting for confirmation can be confirmed';
  end if;
  if exists (select 1 from dr_telegram_bindings where unit_id = b.unit_id and status = 'Active') then
    raise exception 'DR_STATE: the unit already has an active group';
  end if;
  update dr_telegram_bindings set status = 'Active', valid_from = now(), bound_by = p_actor, updated_at = now() where id = b.id;
  perform dr_audit(b.project_id, b.unit_id, null, null, 'DR.BINDING_ACTIVATED', p_actor, 'TELEGRAM',
                   jsonb_build_object('binding_id', b.id, 'chat_id', b.chat_id, 'confirmed_migration', true));
end;
$$;

-- The bot was removed from, or re-added to, a group.
create or replace function public.dr_tg_set_bot_presence(p_chat_id bigint, p_present boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.dr_telegram_bindings%rowtype;
  r uuid;
begin
  if not p_present then
    select * into b from dr_telegram_bindings where chat_id = p_chat_id and status = 'Active' for update;
    if not found then
      return jsonb_build_object('changed', false);
    end if;
    update dr_telegram_bindings set status = 'Suspended', bot_present = false, updated_at = now() where id = b.id;
    -- Launch links stop working with the group.
    update dr_telegram_launch_tokens set revoked_at = now() where binding_id = b.id and revoked_at is null;
    perform dr_audit(b.project_id, b.unit_id, null, null, 'DR.BINDING_SUSPENDED', null, 'TELEGRAM',
                     jsonb_build_object('binding_id', b.id, 'reason', 'bot removed'));
    for r in select * from dr_reviewers(b.project_id) loop
      perform dr_notify(b.project_id, r, 'dr_telegram_suspended', 'High',
                        'Telegram bot removed from a reporting group',
                        'Reporters can no longer launch the report form from that group. Use the Field App or re-add the bot.',
                        '/dashboard/site/daily-reporting', 'dr-tg-suspended:' || b.id || ':' || to_char(now(), 'YYYYMMDDHH24MISS'),
                        null, '{email}');
    end loop;
    return jsonb_build_object('changed', true, 'status', 'Suspended');
  end if;

  select * into b from dr_telegram_bindings
   where chat_id = p_chat_id and status = 'Suspended' order by updated_at desc limit 1 for update;
  if not found or exists (select 1 from dr_telegram_bindings where unit_id = b.unit_id and status = 'Active') then
    return jsonb_build_object('changed', false);
  end if;
  update dr_telegram_bindings set status = 'Active', bot_present = true, updated_at = now() where id = b.id;
  perform dr_audit(b.project_id, b.unit_id, null, null, 'DR.BINDING_ACTIVATED', null, 'TELEGRAM',
                   jsonb_build_object('binding_id', b.id, 'reason', 'bot re-added'));
  return jsonb_build_object('changed', true, 'status', 'Active', 'binding_id', b.id, 'unit_id', b.unit_id);
end;
$$;

create or replace function public.dr_tg_unbind(p_actor uuid, p_binding_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.dr_telegram_bindings%rowtype;
begin
  select * into b from dr_telegram_bindings where id = p_binding_id for update;
  if not found then
    raise exception 'DR_NOT_FOUND: binding not found';
  end if;
  if not dr_can_review(b.project_id, p_actor) then
    raise exception 'DR_FORBIDDEN: only a project approver or administrator can unbind a group';
  end if;
  if b.status in ('Unbound', 'Migrated') then
    raise exception 'DR_STATE: this binding is already %', b.status;
  end if;
  update dr_telegram_bindings set status = 'Unbound', valid_to = now(), updated_at = now() where id = b.id;
  update dr_telegram_launch_tokens set revoked_at = now() where binding_id = b.id and revoked_at is null;
  update dr_telegram_binding_codes set used_at = coalesce(used_at, now()) where binding_id = b.id;
  perform dr_audit(b.project_id, b.unit_id, null, null, 'DR.BINDING_UNBOUND', p_actor, 'TELEGRAM',
                   jsonb_build_object('binding_id', b.id, 'chat_id', b.chat_id));
end;
$$;

-- ── 3. Launch tokens ────────────────────────────────────────────────────────
-- Issuing a new token revokes the binding's earlier ones, so a link that
-- leaked or was pinned long ago stops working when the admin rotates it.
create or replace function public.dr_tg_issue_launch_token(
  p_actor uuid, p_binding_id uuid, p_token_hash text, p_ttl_hours int default 24
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  b         public.dr_telegram_bindings%rowtype;
  v_expires timestamptz := now() + make_interval(hours => greatest(1, least(p_ttl_hours, 24)));
begin
  select * into b from dr_telegram_bindings where id = p_binding_id for update;
  if not found then
    raise exception 'DR_NOT_FOUND: binding not found';
  end if;
  if p_actor is not null and not dr_can_review(b.project_id, p_actor) then
    raise exception 'DR_FORBIDDEN: only a project approver or administrator can issue a launch link';
  end if;
  if b.status <> 'Active' then
    raise exception 'DR_STATE: the binding is %, not Active', b.status;
  end if;
  update dr_telegram_launch_tokens set revoked_at = now() where binding_id = b.id and revoked_at is null;
  insert into dr_telegram_launch_tokens (binding_id, token_hash, expires_at, created_by)
  values (b.id, p_token_hash, v_expires, p_actor);
  perform dr_audit(b.project_id, b.unit_id, null, null, 'DR.LAUNCH_TOKEN_ISSUED', p_actor, 'TELEGRAM',
                   jsonb_build_object('binding_id', b.id, 'expires_at', v_expires));
  return v_expires;
end;
$$;

-- Resolves a launch token to its binding. The caller still has to check that
-- the Telegram user is a unit member and a current member of the group.
create or replace function public.dr_tg_resolve_launch(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.dr_telegram_launch_tokens%rowtype;
  b public.dr_telegram_bindings%rowtype;
  u public.dr_reporting_units%rowtype;
begin
  select * into t from dr_telegram_launch_tokens where token_hash = p_token_hash;
  if not found or t.revoked_at is not null or t.expires_at < now() then
    raise exception 'DR_FORBIDDEN: the launch link is invalid or has expired; ask for a new one';
  end if;
  select * into b from dr_telegram_bindings where id = t.binding_id;
  if b.status <> 'Active' then
    raise exception 'DR_FORBIDDEN: this group is no longer bound to the reporting unit';
  end if;
  select * into u from dr_reporting_units where id = b.unit_id;
  if u.status <> 'Active' then
    raise exception 'DR_FORBIDDEN: the reporting unit is not active';
  end if;
  return jsonb_build_object('binding_id', b.id, 'unit_id', b.unit_id, 'project_id', b.project_id,
                            'chat_id', b.chat_id, 'unit_name', u.display_name, 'unit_code', u.unit_code,
                            'expires_at', t.expires_at);
end;
$$;

-- ── 4. Status lines for the group ───────────────────────────────────────────
-- Built from the audit trail, so every channel gets the same lines. Only the
-- report number and the state ever leave: no quantities, findings or comments.
create or replace function public.dr_tg_queue_group_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b      public.dr_telegram_bindings%rowtype;
  v_no   text;
  v_text text;
begin
  if new.event_code not in ('DR.REPORT_SUBMITTED', 'DR.CORRECTION_RESUBMITTED', 'DR.REPORT_AMENDED', 'DR.REVIEW_DECISION')
     or new.unit_id is null or new.report_id is null then
    return new;
  end if;
  select * into b from dr_telegram_bindings where unit_id = new.unit_id and status = 'Active' and bot_present;
  if not found then
    return new;
  end if;
  select report_no into v_no from dr_reports where id = new.report_id;
  if v_no is null then
    return new;
  end if;

  v_text := case
    when new.event_code = 'DR.REPORT_SUBMITTED' and coalesce((new.details->>'late')::boolean, false) then v_no || ' submitted (late)'
    when new.event_code = 'DR.REPORT_SUBMITTED' then v_no || ' submitted'
    when new.event_code = 'DR.CORRECTION_RESUBMITTED' then v_no || ' resubmitted'
    when new.event_code = 'DR.REPORT_AMENDED' then v_no || ' amendment sent for approval'
    when new.details->>'decision' in ('APPROVE', 'APPROVE_WITH_REMARK') then v_no || ' approved'
    when new.details->>'decision' = 'RETURN' then v_no || ' returned — check your direct messages'
    when new.details->>'decision' = 'REQUEST_INFO' then v_no || ' — more information requested, check your direct messages'
    else null
  end;
  if v_text is null then
    return new;
  end if;

  insert into dr_telegram_group_outbox (project_id, unit_id, binding_id, chat_id, text, source_key)
  values (b.project_id, b.unit_id, b.id, b.chat_id, v_text, 'audit:' || new.id)
  on conflict (source_key) do nothing;
  return new;
end;
$$;

create trigger trg_dr_tg_group_status
  after insert on public.dr_audit_log
  for each row execute function public.dr_tg_queue_group_status();

-- ── 5. Grants ───────────────────────────────────────────────────────────────
-- New functions are executable by PUBLIC by default; only the service role may run these.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('dr_tg_create_binding', 'dr_tg_bind_chat', 'dr_tg_migrate_chat', 'dr_tg_confirm_migration',
                        'dr_tg_set_bot_presence', 'dr_tg_unbind', 'dr_tg_issue_launch_token', 'dr_tg_resolve_launch',
                        'dr_tg_queue_group_status')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

grant select, insert, update, delete on public.dr_telegram_bindings, public.dr_telegram_binding_codes,
  public.dr_telegram_launch_tokens, public.dr_telegram_group_outbox to service_role;

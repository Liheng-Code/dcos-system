-- Module 10-01 Daily Reporting — custom fields per reporting unit (design §9.5)
-- and Telegram invites, so a subcontractor reporter never needs the website.
--
-- Custom field values travel inside the report payload (`custom_fields`,
-- with `custom_field_def_version`), so they are versioned and immutable with
-- the rest of the report. The definition is versioned too: changing it adds a
-- row, and old reports stay readable against the version they were written with.

-- ── 1. Custom field definitions ─────────────────────────────────────────────
-- fields: [{ "key": "wall_type", "label": "Wall Type", "type": "select",
--            "options": ["Hollow Clay Brick", "AAC Block"], "unit": null, "required": true }]
create table public.dr_custom_field_definitions (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id    uuid not null references public.dr_reporting_units(id) on delete cascade,
  version    int not null,
  fields     jsonb not null default '[]'::jsonb,
  is_active  boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (unit_id, version)
);
create unique index uq_dr_custom_fields_active on public.dr_custom_field_definitions (unit_id) where is_active;

alter table public.dr_custom_field_definitions enable row level security;
revoke all on public.dr_custom_field_definitions from anon, authenticated;
grant select on public.dr_custom_field_definitions to authenticated;
grant select, insert, update, delete on public.dr_custom_field_definitions to service_role;

create policy dr_custom_fields_select on public.dr_custom_field_definitions for select to authenticated
  using (public.dr_has_project_access(project_id, unit_id));

-- Saves a new version of a unit's custom fields. Called by a signed-in
-- administrator of the project; nothing else writes this table.
create or replace function public.dr_save_custom_fields(p_unit_id uuid, p_fields jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit    public.dr_reporting_units%rowtype;
  v_version int;
  f         jsonb;
  v_keys    text[] := '{}';
begin
  select * into v_unit from dr_reporting_units where id = p_unit_id;
  if not found then
    raise exception 'DR_NOT_FOUND: reporting unit not found';
  end if;
  if not dr_can_admin(v_unit.project_id) then
    raise exception 'DR_FORBIDDEN: only a project administrator can change custom fields';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'array' then
    raise exception 'DR_INVALID: fields must be a list';
  end if;
  if jsonb_array_length(p_fields) > 20 then
    raise exception 'DR_INVALID: at most 20 custom fields per unit';
  end if;

  for f in select * from jsonb_array_elements(p_fields) loop
    if coalesce(f->>'key', '') !~ '^[a-z][a-z0-9_]{0,39}$' then
      raise exception 'DR_INVALID: field key "%" must be lower-case letters, digits and underscores', coalesce(f->>'key', '');
    end if;
    if f->>'key' = any (v_keys) then
      raise exception 'DR_INVALID: field key "%" is used twice', f->>'key';
    end if;
    v_keys := v_keys || (f->>'key');
    if coalesce(btrim(f->>'label'), '') = '' or length(f->>'label') > 60 then
      raise exception 'DR_INVALID: field "%" needs a label of at most 60 characters', f->>'key';
    end if;
    if coalesce(f->>'type', '') not in ('text', 'number', 'select') then
      raise exception 'DR_INVALID: field "%" must be text, number or select', f->>'key';
    end if;
    if f->>'type' = 'select'
       and (jsonb_typeof(f->'options') is distinct from 'array' or jsonb_array_length(f->'options') not between 1 and 50) then
      raise exception 'DR_INVALID: field "%" needs between 1 and 50 options', f->>'key';
    end if;
  end loop;

  select coalesce(max(version), 0) + 1 into v_version from dr_custom_field_definitions where unit_id = p_unit_id;
  update dr_custom_field_definitions set is_active = false where unit_id = p_unit_id and is_active;
  insert into dr_custom_field_definitions (project_id, unit_id, version, fields, created_by)
  values (v_unit.project_id, p_unit_id, v_version, p_fields, auth.uid());

  perform dr_audit(v_unit.project_id, p_unit_id, null, null, 'DR.CUSTOM_FIELDS_CHANGED', auth.uid(), 'WEB',
                   jsonb_build_object('version', v_version, 'keys', to_jsonb(v_keys)));
  return v_version;
end;
$$;

revoke all on function public.dr_save_custom_fields(uuid, jsonb) from public, anon;
grant execute on function public.dr_save_custom_fields(uuid, jsonb) to authenticated, service_role;

-- ── 2. Telegram invites ─────────────────────────────────────────────────────
-- An approver issues a one-time link for one reporter. Opening it in Telegram
-- links that Telegram account to the reporter's DCOS user; from then on the
-- reporter works only in Telegram. Only the hash of the token is stored.
create table public.dr_telegram_invites (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id    uuid not null references public.dr_reporting_units(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_dr_tg_invites_user on public.dr_telegram_invites (user_id);

alter table public.dr_telegram_invites enable row level security;
revoke all on public.dr_telegram_invites from anon, authenticated;
grant select, insert, update, delete on public.dr_telegram_invites to service_role;

create or replace function public.dr_tg_create_invite(
  p_actor uuid, p_unit_id uuid, p_user_id uuid, p_token_hash text, p_ttl_hours int default 72
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit    public.dr_reporting_units%rowtype;
  v_expires timestamptz := now() + make_interval(hours => greatest(1, least(p_ttl_hours, 168)));
begin
  select * into v_unit from dr_reporting_units where id = p_unit_id;
  if not found then
    raise exception 'DR_NOT_FOUND: reporting unit not found';
  end if;
  if not dr_can_review(v_unit.project_id, p_actor) then
    raise exception 'DR_FORBIDDEN: only a project approver or administrator can invite a reporter';
  end if;
  if not exists (
    select 1 from dr_reporting_unit_members
    where unit_id = p_unit_id and user_id = p_user_id and status = 'active'
  ) then
    raise exception 'DR_INVALID: that person is not an active member of this reporting unit';
  end if;
  if coalesce(p_token_hash, '') = '' then
    raise exception 'DR_REQ_FIELD: a token hash is required';
  end if;

  -- A new invite replaces any the person has not used yet.
  update dr_telegram_invites set expires_at = now()
   where user_id = p_user_id and used_at is null and expires_at > now();
  insert into dr_telegram_invites (project_id, unit_id, user_id, token_hash, expires_at, created_by)
  values (v_unit.project_id, p_unit_id, p_user_id, p_token_hash, v_expires, p_actor);

  perform dr_audit(v_unit.project_id, p_unit_id, null, null, 'DR.TELEGRAM_INVITE_ISSUED', p_actor, 'TELEGRAM',
                   jsonb_build_object('user_id', p_user_id, 'expires_at', v_expires));
  return v_expires;
end;
$$;

-- The bot redeems an invite for the Telegram account that opened it.
create or replace function public.dr_tg_redeem_invite(p_token_hash text, p_telegram_user_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  i      public.dr_telegram_invites%rowtype;
  v_name text;
  v_unit public.dr_reporting_units%rowtype;
begin
  select * into i from dr_telegram_invites where token_hash = p_token_hash for update;
  if not found or i.used_at is not null or i.expires_at <= now() then
    raise exception 'DR_NOT_FOUND: this invite is not valid any more; ask for a new one';
  end if;
  if exists (select 1 from profiles where telegram_user_id = p_telegram_user_id and id <> i.user_id) then
    raise exception 'DR_STATE: this Telegram account is already linked to another DCOS user';
  end if;

  update profiles set telegram_user_id = p_telegram_user_id where id = i.user_id returning full_name into v_name;
  update dr_telegram_invites set used_at = now() where id = i.id;
  select * into v_unit from dr_reporting_units where id = i.unit_id;

  perform dr_audit(i.project_id, i.unit_id, null, null, 'DR.TELEGRAM_LINKED', i.user_id, 'TELEGRAM',
                   jsonb_build_object('via', 'invite', 'invite_id', i.id));
  return jsonb_build_object('user_id', i.user_id, 'full_name', v_name,
                            'unit_code', v_unit.unit_code, 'unit_name', v_unit.display_name);
end;
$$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('dr_tg_create_invite', 'dr_tg_redeem_invite')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

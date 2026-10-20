-- Activity Library — Phase 3.0 hardening.
-- 1. Children of an Activity Master (methods, quantity rules, logic rules, applicability, requirements) are frozen once the
--    master leaves draft, so approved library content cannot change silently. Database owners (seeds, migrations) are exempt.
-- 2. Templates can stamp a link between consecutive levels (e.g. next level survey after previous level stripping).
-- Depends on 20261006000001-3.

create or replace function public.plan_act_master_children_guard()
returns trigger language plpgsql as $$
declare
  v_master uuid;
  v_status text;
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  if tg_table_name = 'plan_act_logic_rules' then
    -- a link edits both masters' standard logic; the successor owns it
    v_master := coalesce(new.successor_master_id, old.successor_master_id);
  elsif tg_table_name = 'plan_act_applicability' then
    if coalesce(new.target_type, old.target_type) <> 'master' then return coalesce(new, old); end if;
    v_master := coalesce(new.target_id, old.target_id);
  else
    v_master := coalesce(new.master_id, old.master_id);
  end if;
  select status into v_status from public.plan_act_masters where id = v_master;
  if v_status is not null and v_status <> 'draft' then
    raise exception 'Activity Master is % and frozen; create a new version to change its methods, rules or requirements', v_status;
  end if;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['plan_act_methods','plan_act_quantity_rules','plan_act_logic_rules','plan_act_applicability','plan_act_requirements'] loop
    execute format('drop trigger if exists trg_%1$s_frozen on public.%1$I', t);
    execute format('create trigger trg_%1$s_frozen before insert or update or delete on public.%1$I for each row execute function public.plan_act_master_children_guard()', t);
  end loop;
end $$;

-- Inter-level link on the template (item positions, not ids, so it survives "save recipe")
alter table public.plan_act_templates
  add column if not exists inter_level_from_seq integer,
  add column if not exists inter_level_to_seq integer,
  add column if not exists inter_level_relation text not null default 'fs' check (inter_level_relation in ('fs','ss','ff','sf')),
  add column if not exists inter_level_lag_days numeric not null default 0;
comment on column public.plan_act_templates.inter_level_from_seq is
  'Item seq in level N that drives item inter_level_to_seq in level N+1 (null = levels are independent).';

-- freeze the recipe-level fields once the template leaves draft (extends the lifecycle guard)
create or replace function public.plan_act_template_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.plan_act_change_history(entity_type, entity_id, action, to_status)
    values ('template', new.id, 'create', new.status);
    return new;
  end if;
  if new.status is distinct from old.status then
    if (old.status, new.status) not in (
      ('draft','under_review'), ('under_review','draft'), ('under_review','approved'),
      ('approved','active'), ('approved','draft'),
      ('active','superseded'), ('active','archived'),
      ('superseded','archived'), ('draft','archived'), ('archived','draft')
    ) then
      raise exception 'Illegal Activity Template status change % -> %', old.status, new.status;
    end if;
    if new.status = 'approved' then
      new.approved_by := coalesce(new.approved_by, auth.uid());
      new.approved_at := coalesce(new.approved_at, now());
    end if;
    insert into public.plan_act_change_history(entity_type, entity_id, action, from_status, to_status)
    values ('template', new.id, 'status', old.status, new.status);
  elsif old.status <> 'draft'
    and (new.applies_to_level_types, new.inter_level_from_seq, new.inter_level_to_seq, new.inter_level_relation, new.inter_level_lag_days)
        is distinct from
        (old.applies_to_level_types, old.inter_level_from_seq, old.inter_level_to_seq, old.inter_level_relation, old.inter_level_lag_days) then
    raise exception 'Template is % and frozen; create a new version to change it', old.status;
  end if;
  return new;
end $$;

-- applicability of a template is frozen with it
create or replace function public.plan_act_template_applicability_guard()
returns trigger language plpgsql as $$
declare v_status text;
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then return coalesce(new, old); end if;
  if coalesce(new.target_type, old.target_type) <> 'template' then return coalesce(new, old); end if;
  select status into v_status from public.plan_act_templates where id = coalesce(new.target_id, old.target_id);
  if v_status is not null and v_status <> 'draft' then
    raise exception 'Template is % and frozen; create a new version to change its applicability', v_status;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_plan_act_applicability_template_frozen on public.plan_act_applicability;
create trigger trg_plan_act_applicability_template_frozen before insert or update or delete on public.plan_act_applicability
  for each row execute function public.plan_act_template_applicability_guard();

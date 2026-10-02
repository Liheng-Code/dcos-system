-- Material Master: server-side code allocation + duplicate detection.
--
-- Rules (docs/04-Business-Modules/12-Quantity-Surveying/16-Material Register.md §Code rules):
--   * Code format stays MAT-<GROUP>-NNN; GROUP comes from the Category code
--     (CAT-MASN -> MASN), else the Discipline group, else GEN.
--   * The code is assigned atomically by dwl_next_material_code() from a
--     per-group counter, never typed by the user, never reused.
--   * "Same material" = same category + type + size + thickness + grade +
--     compressive strength + standard + unit (name only when those are all
--     blank). Supplier / brand / price never create a new code.
--   * An exact match is refused by dwl_create_material(); near matches are
--     reported by dwl_find_material_matches() for the UI to warn about.
-- Idempotent; existing codes and data are untouched.

create extension if not exists pg_trgm with schema extensions;

-- ── Counter table ───────────────────────────────────────────────────────────
create table if not exists public.dwl_material_code_counters (
  group_code text primary key,
  last_seq   integer not null default 0
);
alter table public.dwl_material_code_counters enable row level security;
-- No policies: only the SECURITY DEFINER allocator touches it.
revoke all on public.dwl_material_code_counters from anon, authenticated;

insert into public.dwl_material_code_counters (group_code, last_seq)
select split_part(code, '-', 2),
       max((substring(code from '-(\d+)$'))::int)
from public.dwl_resources
where category = 'material' and code ~ '^MAT-[A-Z]{2,6}-\d+$'
group by 1
on conflict (group_code) do update
  set last_seq = greatest(public.dwl_material_code_counters.last_seq, excluded.last_seq);

-- ── Normalisation + fingerprint ─────────────────────────────────────────────
create or replace function public.dwl_norm_spec(p text)
returns text language sql immutable as $$
  select regexp_replace(
           replace(replace(replace(lower(coalesce(p, '')), '×', 'x'), '*', 'x'), 'µ', 'u'),
           '[^a-z0-9.]+', '', 'g')
$$;

create or replace function public.dwl_material_fingerprint(
  p_category_id uuid, p_type text, p_dimension text, p_thickness text,
  p_grade text, p_strength text, p_standard text, p_unit text, p_name text
) returns text language sql immutable as $$
  select coalesce(p_category_id::text, '') || '|' ||
         lower(coalesce(p_unit, '')) || '|' ||
         case
           when public.dwl_norm_spec(p_type) = '' and public.dwl_norm_spec(p_dimension) = ''
            and public.dwl_norm_spec(p_thickness) = '' and public.dwl_norm_spec(p_grade) = ''
            and public.dwl_norm_spec(p_strength) = '' and public.dwl_norm_spec(p_standard) = ''
           then 'n:' || public.dwl_norm_spec(p_name)
           else concat_ws('|',
                  public.dwl_norm_spec(p_type), public.dwl_norm_spec(p_dimension),
                  public.dwl_norm_spec(p_thickness), public.dwl_norm_spec(p_grade),
                  public.dwl_norm_spec(p_strength), public.dwl_norm_spec(p_standard))
         end
$$;

-- Fingerprint of every material, computed live so it never goes stale when a
-- unit or spec field is edited.
create or replace view public.dwl_v_material_fingerprints
with (security_invoker = true) as
select r.id as resource_id, r.code, r.is_active,
       coalesce(a.material_name, r.description) as material_name,
       a.category_id, a.material_type, r.unit,
       public.dwl_material_fingerprint(
         a.category_id, a.material_type, a.dimension, a.thickness, a.grade,
         a.compressive_strength, a.standard, r.unit,
         coalesce(a.material_name, r.description)) as fingerprint
from public.dwl_resources r
left join public.dwl_material_attributes a on a.resource_id = r.id
where r.category = 'material';

-- Groups of materials sharing one fingerprint = probable duplicates.
create or replace view public.dwl_v_material_duplicates
with (security_invoker = true) as
select fingerprint,
       count(*)::int as copies,
       array_agg(code order by code) as codes,
       array_agg(material_name order by code) as names
from public.dwl_v_material_fingerprints
group by fingerprint
having count(*) > 1;

-- ── Code allocator ──────────────────────────────────────────────────────────
create or replace function public.dwl_material_group_code(p_category_id uuid, p_discipline text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_cat text;
begin
  if p_category_id is not null then
    select code into v_cat from public.dwl_material_categories where id = p_category_id;
    if v_cat is not null and split_part(v_cat, '-', 2) ~ '^[A-Za-z]{2,6}$' then
      return upper(split_part(v_cat, '-', 2));
    end if;
  end if;
  return case p_discipline
    when 'Architectural' then 'ARC' when 'Structural' then 'STR' when 'Civil' then 'CIV'
    when 'MEP' then 'MEP' when 'Interior' then 'INT' when 'Landscape' then 'LND'
    when 'Specialist' then 'SPC' when 'Façade' then 'FAC' when 'Fire & Life Safety' then 'FLS'
    when 'Acoustic' then 'ACU' else 'GEN' end;
end $$;

create or replace function public.dwl_next_material_code(p_category_id uuid, p_discipline text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_group text := public.dwl_material_group_code(p_category_id, p_discipline);
  v_seq   integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  insert into public.dwl_material_code_counters as c (group_code, last_seq)
  values (v_group, 1)
  on conflict (group_code) do update set last_seq = c.last_seq + 1
  returning last_seq into v_seq;
  return 'MAT-' || v_group || '-' || lpad(v_seq::text, 3, '0');
end $$;

-- ── Match finder (exact + near) ─────────────────────────────────────────────
create or replace function public.dwl_find_material_matches(
  p_category_id uuid, p_type text, p_dimension text, p_thickness text,
  p_grade text, p_strength text, p_standard text, p_unit text, p_name text,
  p_exclude_resource_id uuid default null
) returns table (resource_id uuid, code text, material_name text, match_level text)
language sql stable set search_path = public, extensions as $$
  with me as (
    select public.dwl_material_fingerprint(
             p_category_id, p_type, p_dimension, p_thickness, p_grade,
             p_strength, p_standard, p_unit, p_name) as fp
  )
  select f.resource_id, f.code, f.material_name,
         case when f.fingerprint = me.fp then 'exact' else 'near' end
  from public.dwl_v_material_fingerprints f, me
  where f.is_active
    and f.resource_id is distinct from p_exclude_resource_id
    and (
      f.fingerprint = me.fp
      or (f.category_id is not distinct from p_category_id
          and lower(f.unit) = lower(coalesce(p_unit, f.unit))
          and similarity(f.material_name, coalesce(p_name, '')) >= 0.6)
    )
  order by (f.fingerprint = me.fp) desc,
           similarity(f.material_name, coalesce(p_name, '')) desc
  limit 10
$$;

-- ── Atomic create ───────────────────────────────────────────────────────────
-- p is the form payload (jsonb). Returns {resource_id, code}. Raises
-- 'DUPLICATE_MATERIAL: <code>' (errcode 23505) on an exact match.
create or replace function public.dwl_create_material(p jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_tenant uuid := public.dwl_current_tenant();
  v_cat    uuid := nullif(p->>'category_id', '')::uuid;
  v_exact  text;
  v_code   text;
  v_id     uuid;
begin
  if v_tenant is null then
    raise exception 'No tenant assigned to your profile' using errcode = '42501';
  end if;
  if v_cat is null then
    raise exception 'Category is required to generate a material code' using errcode = '22023';
  end if;

  select m.code into v_exact
  from public.dwl_find_material_matches(
         v_cat, p->>'material_type', p->>'dimension', p->>'thickness', p->>'grade',
         p->>'compressive_strength', p->>'standard', p->>'unit', p->>'material_name') m
  where m.match_level = 'exact' limit 1;
  if v_exact is not null then
    raise exception 'DUPLICATE_MATERIAL: %', v_exact using errcode = '23505';
  end if;

  v_code := public.dwl_next_material_code(v_cat, p->>'discipline');

  insert into public.dwl_resources (tenant_id, category, code, description, unit, is_active, created_by)
  values (v_tenant, 'material', v_code, p->>'description', p->>'unit',
          coalesce(p->>'lifecycle_status', 'active') = 'active', auth.uid())
  returning id into v_id;

  insert into public.dwl_material_attributes (
    resource_id, tenant_id, material_name, category_id, application_element, discipline,
    standard, grade, budget_code_id, lifecycle_status, tech_spec_summary, application_scope,
    material_type, brand, manufacturer, dimension, thickness, density,
    compressive_strength, color_finish, effective_date, created_by)
  values (
    v_id, v_tenant, p->>'material_name', v_cat, nullif(p->>'application_element', ''),
    nullif(p->>'discipline', ''), nullif(p->>'standard', ''), nullif(p->>'grade', ''),
    nullif(p->>'budget_code_id', '')::uuid, coalesce(p->>'lifecycle_status', 'active'),
    nullif(p->>'tech_spec_summary', ''), nullif(p->>'application_scope', ''),
    nullif(p->>'material_type', ''), nullif(p->>'brand', ''), nullif(p->>'manufacturer', ''),
    nullif(p->>'dimension', ''), nullif(p->>'thickness', ''), nullif(p->>'density', ''),
    nullif(p->>'compressive_strength', ''), nullif(p->>'color_finish', ''),
    nullif(p->>'effective_date', '')::date, auth.uid());

  return jsonb_build_object('resource_id', v_id, 'code', v_code);
end $$;

grant execute on function public.dwl_next_material_code(uuid, text) to authenticated;
grant execute on function public.dwl_find_material_matches(uuid, text, text, text, text, text, text, text, text, uuid) to authenticated;
grant execute on function public.dwl_create_material(jsonb) to authenticated;
revoke execute on function public.dwl_next_material_code(uuid, text) from anon, public;
revoke execute on function public.dwl_create_material(jsonb) from anon, public;
revoke execute on function public.dwl_find_material_matches(uuid, text, text, text, text, text, text, text, text, uuid) from anon, public;
grant select on public.dwl_v_material_fingerprints, public.dwl_v_material_duplicates to authenticated;
revoke all on public.dwl_v_material_fingerprints, public.dwl_v_material_duplicates from anon;

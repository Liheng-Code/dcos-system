-- Migration: 20260925000002_qs_library_search.sql
-- Purpose: Hybrid (full-text + trigram + pgvector) search index over the QS
--   cost-database libraries: dwl_resources (materials/labor/equipment/subcon),
--   qs_element_library and qs_description_library. One unified table indexes
--   all three source kinds so source tables are left untouched; triggers on
--   the sources keep it in sync, and a single RPC (search_qs_library) fuses
--   full-text + trigram + vector candidate lists with reciprocal-rank fusion.
--
--   Keyword fallback: when the caller passes p_embedding = null (no embedding
--   available, or the edge function failed to embed the query), the RPC is
--   keyword-only (full-text + trigram) and still returns ranked results.
--   Embeddings are filled asynchronously by the `qs-library-embed` edge
--   function (Supabase.ai `gte-small`, 384-dim) via qs_library_search_refresh
--   clearing embedding/embedded_at whenever content_hash changes; rows with a
--   null embedding simply drop out of the vector candidate list and continue
--   to match by keyword only until (re-)embedded.
-- Depends on: dwl_resources, dwl_material_attributes, dwl_v_materials (view),
--   qs_element_library, qs_description_library, profiles (already exist)

-- ============================================================================
-- 1. Extensions
-- ============================================================================

create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ============================================================================
-- 2. Index table
-- ============================================================================

create table if not exists public.qs_library_search (
  id            uuid primary key default gen_random_uuid(),
  source_type   text not null check (source_type in ('resource', 'element', 'element_description')),
  source_id     uuid not null,
  tenant_id     uuid null,                                  -- null = global row, visible to all authenticated users
  title         text not null,
  subtitle      text null,
  search_text   text not null,
  tsv           tsvector generated always as (to_tsvector('english', coalesce(search_text, ''))) stored,
  embedding     extensions.vector(384) null,
  content_hash  text not null,
  embedded_at   timestamptz null,
  updated_at    timestamptz not null default now(),
  constraint qs_library_search_source_key unique (source_type, source_id)
);

comment on table public.qs_library_search is
  'Unified hybrid search index (full-text + trigram + pgvector) over dwl_resources, '
  'qs_element_library and qs_description_library. Rows are maintained only by '
  'qs_library_search_refresh() via triggers on the source tables and the '
  'qs-library-embed edge function (service role) -- never written directly by clients.';

create index if not exists idx_qs_library_search_tsv on public.qs_library_search using gin (tsv);
create index if not exists idx_qs_library_search_trgm on public.qs_library_search using gin (search_text extensions.gin_trgm_ops);
create index if not exists idx_qs_library_search_embedding_hnsw on public.qs_library_search using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists idx_qs_library_search_tenant on public.qs_library_search (tenant_id);
create index if not exists idx_qs_library_search_pending_embed on public.qs_library_search (id) where embedding is null;

-- ============================================================================
-- 3. RLS -- mirror the dwl_resources tenant pattern; null tenant_id = global
-- ============================================================================

alter table public.qs_library_search enable row level security;

drop policy if exists "qs_library_search_tenant_select" on public.qs_library_search;
create policy "qs_library_search_tenant_select" on public.qs_library_search
  for select
  to authenticated
  using (
    tenant_id is null
    or tenant_id = (select company_id from public.profiles where id = auth.uid())
  );

-- No insert/update/delete policy for `authenticated`: writes only ever come
-- from the security-definer refresh function (via triggers) or the service
-- role (edge functions), never from client-side code.

grant select on public.qs_library_search to authenticated;

-- ============================================================================
-- 4. Text-building helpers
-- ============================================================================

-- Mirrors apps/web/components/qs/dwl-types.ts dwlDisplayResourceDescription():
-- strips the migration-era "<Kind> component (migrated) for X (source:
-- qs_cost_items.code='...')" wrapper back down to the real name X.
create or replace function public._qs_lib_clean_description(p_description text)
returns text
language sql
immutable
as $$
  select coalesce(
    (regexp_match(
      p_description,
      '^(?:Material|Labor|Equipment) component \(migrated\) for (.+?) \(source: qs_cost_items\.code=''[^'']*''\)$'
    ))[1],
    p_description
  );
$$;

-- Joins non-null, non-blank text values with a separator, skipping empties.
create or replace function public._qs_lib_join(p_parts text[], p_sep text default ' | ')
returns text
language sql
immutable
as $$
  select nullif(
    array_to_string(
      array(select x from unnest(p_parts) as x where x is not null and length(trim(x)) > 0),
      p_sep
    ),
    ''
  );
$$;

-- ============================================================================
-- 5. Per-source-type text recipes
-- ============================================================================

-- dwl_resources row -> (title, subtitle, search_text, tenant_id). Returns no
-- rows when the resource does not exist or is inactive. search_text leads
-- with r.code (not in the roadmap's field list, added here) so a resource is
-- findable by its code, per the RPC's own "substring/code match" behavior.
create or replace function public._qs_lib_resource_text(p_resource_id uuid)
returns table (title text, subtitle text, search_text text, tenant_id uuid)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    case
      when r.category = 'material' then coalesce(m.material_name, public._qs_lib_clean_description(r.description))
      else public._qs_lib_clean_description(r.description)
    end as title,
    public._qs_lib_join(
      array[r.code, case when r.category = 'material' then m.category_name else r.category end],
      ' - '
    ) as subtitle,
    case
      when r.category = 'material' then public._qs_lib_join(array[
        r.code,
        m.material_name,
        m.material_type,
        public._qs_lib_join(array[m.category_name, m.subcategory], ' / '),
        m.discipline,
        m.tech_spec_summary,
        public._qs_lib_join(array[m.standard, m.grade, m.dimension], ' '),
        m.application_element,
        array_to_string(m.tags, ' '),
        m.unit
      ], ' | ')
      else public._qs_lib_join(array[
        r.code,
        r.category,
        public._qs_lib_clean_description(r.description),
        r.unit,
        case
          when r.spec_reference is not null and r.spec_reference not like 'Migrated from%'
          then r.spec_reference
          else null
        end
      ], ' | ')
    end as search_text,
    r.tenant_id as tenant_id
  from public.dwl_resources r
  left join public.dwl_v_materials m on m.resource_id = r.id and r.category = 'material'
  where r.id = p_resource_id
    and r.is_active;
$$;

-- qs_description_library row -> (title, subtitle, search_text, tenant_id).
-- tenant_id is always null: qs_description_library/qs_element_library are
-- global tables (readable by every authenticated user, confirmed from their
-- "Auth users can view ..." RLS policies -- no tenant_id column on either).
create or replace function public._qs_lib_element_description_text(p_description_id uuid)
returns table (title text, subtitle text, search_text text, tenant_id uuid)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    d.description as title,
    public._qs_lib_join(array[e.discipline, e.section, e.sub_section, e.sub_element], ' > ') as subtitle,
    public._qs_lib_join(array[e.discipline, e.section, e.sub_section, e.sub_element], ' > ')
      || ': ' || d.description
      || case
           when e.typical_unit is not null and length(trim(e.typical_unit)) > 0
           then ' (' || e.typical_unit || ')'
           else ''
         end as search_text,
    null::uuid as tenant_id
  from public.qs_description_library d
  join public.qs_element_library e on e.id = d.element_library_id
  where d.id = p_description_id
    and d.is_active
    and e.is_active;
$$;

-- qs_element_library row -> (title, subtitle, search_text, tenant_id). Used
-- only for elements that currently have no active description rows (the
-- "fallback" index row so the element itself stays searchable/pickable).
create or replace function public._qs_lib_element_text(p_element_id uuid)
returns table (title text, subtitle text, search_text text, tenant_id uuid)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    e.sub_element as title,
    public._qs_lib_join(array[e.discipline, e.section, e.sub_section, e.sub_element], ' > ') as subtitle,
    public._qs_lib_join(array[e.discipline, e.section, e.sub_section, e.sub_element], ' > ')
      || case
           when e.typical_unit is not null and length(trim(e.typical_unit)) > 0
           then ' (' || e.typical_unit || ')'
           else ''
         end as search_text,
    null::uuid as tenant_id
  from public.qs_element_library e
  where e.id = p_element_id
    and e.is_active;
$$;

-- ============================================================================
-- 6. Refresh function -- recomputes and upserts (or deletes) one index row
-- ============================================================================

create or replace function public.qs_library_search_refresh(p_type text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_title       text;
  v_subtitle    text;
  v_search_text text;
  v_tenant_id   uuid;
  v_hash        text;
  v_found       boolean := false;
  v_has_desc    boolean;
begin
  if p_type = 'resource' then
    select rt.title, rt.subtitle, rt.search_text, rt.tenant_id, true
      into v_title, v_subtitle, v_search_text, v_tenant_id, v_found
      from public._qs_lib_resource_text(p_id) rt;

  elsif p_type = 'element_description' then
    select dt.title, dt.subtitle, dt.search_text, dt.tenant_id, true
      into v_title, v_subtitle, v_search_text, v_tenant_id, v_found
      from public._qs_lib_element_description_text(p_id) dt;

  elsif p_type = 'element' then
    select exists(
      select 1 from public.qs_description_library d
      where d.element_library_id = p_id and d.is_active
    ) into v_has_desc;

    if not v_has_desc then
      select et.title, et.subtitle, et.search_text, et.tenant_id, true
        into v_title, v_subtitle, v_search_text, v_tenant_id, v_found
        from public._qs_lib_element_text(p_id) et;
    end if;

  else
    raise exception 'qs_library_search_refresh: unknown source_type %', p_type;
  end if;

  if not coalesce(v_found, false) then
    delete from public.qs_library_search
      where source_type = p_type and source_id = p_id;
    return;
  end if;

  v_hash := md5(coalesce(v_search_text, ''));

  insert into public.qs_library_search as qls
    (source_type, source_id, tenant_id, title, subtitle, search_text, content_hash, updated_at)
  values
    (p_type, p_id, v_tenant_id, v_title, v_subtitle, v_search_text, v_hash, now())
  on conflict (source_type, source_id) do update
    set title        = excluded.title,
        subtitle     = excluded.subtitle,
        search_text  = excluded.search_text,
        tenant_id    = excluded.tenant_id,
        updated_at   = now(),
        content_hash = excluded.content_hash,
        embedding    = case when qls.content_hash is distinct from excluded.content_hash then null else qls.embedding end,
        embedded_at  = case when qls.content_hash is distinct from excluded.content_hash then null else qls.embedded_at end;
end;
$$;

grant execute on function public.qs_library_search_refresh(text, uuid) to service_role;

-- ============================================================================
-- 7. Sync triggers on the source tables
-- ============================================================================

-- dwl_resources: refresh the resource's own index row.
create or replace function public._qs_lib_trg_dwl_resources()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if TG_OP = 'DELETE' then
    perform public.qs_library_search_refresh('resource', OLD.id);
    return OLD;
  else
    perform public.qs_library_search_refresh('resource', NEW.id);
    return NEW;
  end if;
end;
$$;

drop trigger if exists qs_lib_sync_dwl_resources on public.dwl_resources;
create trigger qs_lib_sync_dwl_resources
  after insert or update or delete on public.dwl_resources
  for each row execute function public._qs_lib_trg_dwl_resources();

-- dwl_material_attributes: refresh the parent resource's index row (its
-- fields feed the material search_text via dwl_v_materials).
create or replace function public._qs_lib_trg_dwl_material_attributes()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_resource_id uuid;
begin
  v_resource_id := coalesce(NEW.resource_id, OLD.resource_id);
  perform public.qs_library_search_refresh('resource', v_resource_id);
  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

drop trigger if exists qs_lib_sync_dwl_material_attributes on public.dwl_material_attributes;
create trigger qs_lib_sync_dwl_material_attributes
  after insert or update or delete on public.dwl_material_attributes
  for each row execute function public._qs_lib_trg_dwl_material_attributes();

-- qs_description_library: refresh the description's own row, and the parent
-- element's fallback row (adds it back when the last description is removed,
-- removes it when the first description is added).
create or replace function public._qs_lib_trg_qs_description_library()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id         uuid;
  v_element_id uuid;
begin
  v_id := coalesce(NEW.id, OLD.id);
  v_element_id := coalesce(NEW.element_library_id, OLD.element_library_id);

  perform public.qs_library_search_refresh('element_description', v_id);
  perform public.qs_library_search_refresh('element', v_element_id);

  if TG_OP = 'UPDATE' and NEW.element_library_id is distinct from OLD.element_library_id then
    perform public.qs_library_search_refresh('element', OLD.element_library_id);
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

drop trigger if exists qs_lib_sync_qs_description_library on public.qs_description_library;
create trigger qs_lib_sync_qs_description_library
  after insert or update or delete on public.qs_description_library
  for each row execute function public._qs_lib_trg_qs_description_library();

-- qs_element_library: refresh the element's own fallback row and every one of
-- its descriptions (their search_text embeds the element's path).
create or replace function public._qs_lib_trg_qs_element_library()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
begin
  if TG_OP = 'DELETE' then
    perform public.qs_library_search_refresh('element', OLD.id);
    return OLD;
  end if;

  perform public.qs_library_search_refresh('element', NEW.id);
  for r in select id from public.qs_description_library where element_library_id = NEW.id loop
    perform public.qs_library_search_refresh('element_description', r.id);
  end loop;
  return NEW;
end;
$$;

drop trigger if exists qs_lib_sync_qs_element_library on public.qs_element_library;
create trigger qs_lib_sync_qs_element_library
  after insert or update or delete on public.qs_element_library
  for each row execute function public._qs_lib_trg_qs_element_library();

-- ============================================================================
-- 8. Backfill (text only; embeddings are filled later by qs-library-embed).
--    Works unchanged against an empty database -- the loops are simply no-ops.
-- ============================================================================

do $$
declare r record;
begin
  for r in select id from public.dwl_resources loop
    perform public.qs_library_search_refresh('resource', r.id);
  end loop;

  for r in select id from public.qs_description_library loop
    perform public.qs_library_search_refresh('element_description', r.id);
  end loop;

  for r in select id from public.qs_element_library loop
    perform public.qs_library_search_refresh('element', r.id);
  end loop;
end;
$$;

-- ============================================================================
-- 9. Hybrid search RPC
-- ============================================================================

create or replace function public.search_qs_library(
  p_query text,
  p_embedding extensions.vector(384) default null,
  p_types text[] default null,
  p_limit int default 50
)
returns table (
  source_type text,
  source_id   uuid,
  title       text,
  subtitle    text,
  score       double precision,
  match_kinds text[]
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  v_query      text := trim(coalesce(p_query, ''));
  v_cand_limit int := greatest(coalesce(p_limit, 50), 1) * 4;
begin
  if v_query = '' and p_embedding is null then
    return;
  end if;

  -- Widen the word-similarity threshold for this call only (default 0.6 is
  -- too strict for short library titles); still uses the gin_trgm index via
  -- the %> operator.
  perform set_config('pg_trgm.word_similarity_threshold', '0.3', true);

  return query
  with fulltext as (
    select qls.source_type, qls.source_id,
           row_number() over (order by ts_rank_cd(qls.tsv, websearch_to_tsquery('english', v_query)) desc) as rnk
    from public.qs_library_search qls
    where v_query <> ''
      and qls.tsv @@ websearch_to_tsquery('english', v_query)
      and (p_types is null or qls.source_type = any(p_types))
    order by ts_rank_cd(qls.tsv, websearch_to_tsquery('english', v_query)) desc
    limit v_cand_limit
  ),
  trigram as (
    select qls.source_type, qls.source_id,
           row_number() over (order by word_similarity(v_query, qls.search_text) desc) as rnk
    from public.qs_library_search qls
    where v_query <> ''
      and (qls.search_text %> v_query or qls.search_text ilike '%' || v_query || '%')
      and (p_types is null or qls.source_type = any(p_types))
    order by word_similarity(v_query, qls.search_text) desc
    limit v_cand_limit
  ),
  vect as (
    select qls.source_type, qls.source_id,
           row_number() over (order by qls.embedding <=> p_embedding) as rnk
    from public.qs_library_search qls
    where p_embedding is not null
      and qls.embedding is not null
      and (p_types is null or qls.source_type = any(p_types))
    order by qls.embedding <=> p_embedding
    limit v_cand_limit
  ),
  fused as (
    select fulltext.source_type, fulltext.source_id, 1.0 / (60 + fulltext.rnk) as s, 'fulltext'::text as kind from fulltext
    union all
    select trigram.source_type, trigram.source_id, 1.0 / (60 + trigram.rnk) as s, 'trigram'::text as kind from trigram
    union all
    select vect.source_type, vect.source_id, 1.0 / (60 + vect.rnk) as s, 'vector'::text as kind from vect
  )
  select
    f.source_type,
    f.source_id,
    qls.title,
    qls.subtitle,
    sum(f.s)::double precision as score,
    array_agg(distinct f.kind) as match_kinds
  from fused f
  join public.qs_library_search qls
    on qls.source_type = f.source_type and qls.source_id = f.source_id
  group by f.source_type, f.source_id, qls.title, qls.subtitle
  order by 5 desc  -- score (ordinal, not by alias: "score" also names an OUT parameter)
  limit coalesce(p_limit, 50);
end;
$$;

comment on function public.search_qs_library(text, extensions.vector, text[], int) is
  'Hybrid QS library search: reciprocal-rank fusion (k=60) of full-text '
  '(websearch_to_tsquery), trigram (word_similarity/ILIKE) and, when '
  'p_embedding is supplied, pgvector cosine-distance candidate lists over '
  'qs_library_search. p_embedding = null runs keyword-only, which is the '
  'client fallback path when the qs-library-search edge function (gte-small '
  'embedding) is unavailable. security invoker so the caller''s own RLS '
  '(tenant isolation on resource rows) applies.';

grant execute on function public.search_qs_library(text, extensions.vector, text[], int) to authenticated;

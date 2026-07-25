-- Migration: 20260722000011_qs_description_library.sql
-- Purpose: Create qs_description_library table — standardized, admin-managed picklist of
--          material-type descriptions (the 5th level of the QS Element Library cascade).
--          One Sub Element row in qs_element_library maps to N description rows here,
--          enabling estimators to pick from controlled material variants
--          (e.g. "Normal Concrete, 35Mpa Slump 13+-2.5" vs "Normal Concrete, 25Mpa").
-- Depends on: public.qs_element_library (created in 20260722000009_qs_element_library.sql)

create table public.qs_description_library (
  id                  uuid primary key default gen_random_uuid(),
  element_library_id  uuid not null references public.qs_element_library(id) on delete cascade,
  description         text not null,
  in_price_list       boolean not null default false,
  current_rate        numeric(15,2),
  sort_order          integer not null default 0,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (element_library_id, description)
);

create index idx_qs_description_library_element on public.qs_description_library(element_library_id);

alter table public.qs_description_library enable row level security;

-- Open RLS, UI-gated writes — mirrors qs_element_library and other Naming Convention
-- reference-library tables in this codebase.
create policy "Auth users can view qs description library"
  on public.qs_description_library for select to authenticated using (true);
create policy "Auth users can manage qs description library"
  on public.qs_description_library for insert to authenticated with check (true);
create policy "Auth users can update qs description library"
  on public.qs_description_library for update to authenticated using (true) with check (true);
create policy "Auth users can delete qs description library"
  on public.qs_description_library for delete to authenticated using (true);

-- updated_at trigger — reuses the shared public.set_updated_at() function
-- established in earlier migrations.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_qs_description_library_updated_at on public.qs_description_library;
create trigger set_qs_description_library_updated_at
  before update on public.qs_description_library
  for each row execute function public.set_updated_at();

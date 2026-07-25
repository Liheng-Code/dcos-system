-- Migration: 20260722000009_qs_element_library.sql
-- Purpose: Create qs_element_library table — standardized, admin-managed picklist of
--          Discipline -> Section -> Sub Section -> Sub Element (+ typical unit + budget code)
--          that Tender BOQ line items select from, replacing free-typed fields that caused
--          cost roll-up naming drift (e.g. "Interior Wall Finishes" vs "Internal Wall Finishes").
-- Depends on: public.budget_codes (already exists, see 20260711000003_budget_codes.sql)

create table public.qs_element_library (
  id              uuid primary key default gen_random_uuid(),
  discipline      text not null,
  section         text not null,
  sub_section     text not null,
  sub_element     text not null,
  budget_code_id  uuid references public.budget_codes(id) on delete set null,
  typical_unit    text,
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (discipline, section, sub_section, sub_element)
);

create index idx_qs_element_library_discipline on public.qs_element_library(discipline);
create index idx_qs_element_library_cascade on public.qs_element_library(discipline, section, sub_section);

alter table public.qs_element_library enable row level security;

-- Open RLS, UI-gated writes — mirrors budget_codes and other Naming Convention
-- reference-library tables in this codebase. Admin-only write access is enforced
-- by the app's Settings page, not by RLS.
create policy "Auth users can view qs element library"
  on public.qs_element_library for select to authenticated using (true);
create policy "Auth users can manage qs element library"
  on public.qs_element_library for insert to authenticated with check (true);
create policy "Auth users can update qs element library"
  on public.qs_element_library for update to authenticated using (true) with check (true);
create policy "Auth users can delete qs element library"
  on public.qs_element_library for delete to authenticated using (true);

-- updated_at trigger — reuses the shared public.set_updated_at() function
-- established in 20260717000005_create_rate_libraries.sql and the DWL phase migrations.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_qs_element_library_updated_at on public.qs_element_library;
create trigger set_qs_element_library_updated_at
  before update on public.qs_element_library
  for each row execute function public.set_updated_at();

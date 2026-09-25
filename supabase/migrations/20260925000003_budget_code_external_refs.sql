-- Migration: 20260925000003_budget_code_external_refs.sql
-- Purpose: Crosswalk table mapping DCOS budget codes (A.00-Z.70, elemental)
--   to external cost-classification standards (CSI MasterFormat/UniFormat,
--   RICS NRM1/NRM2, DIN 276, ...). Budget codes are elemental, so one code
--   routinely spans several MasterFormat divisions (e.g. C.01 External Wall
--   touches 04 Masonry, 05 Metals, 07 Thermal & Moisture, 08 Openings) and a
--   single flat "external code" column on budget_codes could not represent
--   that, nor a client's simultaneous need for two standards side by side
--   (e.g. MasterFormat for a US client, NRM1 for a UK one) on the same code.
--   A child mapping table lets one budget_code carry any number of refs
--   across any number of standards, one of which can be marked primary per
--   standard for a single-value display (e.g. the tender print appendix).
--   Keyed on budget_code_id (not budget_codes.code) because codes are
--   editable in the UI and the mapping must survive a code being renumbered.
-- Depends on: budget_codes (already exists)

create table if not exists public.budget_code_external_refs (
  id                uuid primary key default gen_random_uuid(),
  budget_code_id    uuid not null references public.budget_codes(id) on delete cascade,
  standard          text not null check (standard in (
                      'csi_masterformat', 'csi_uniformat', 'rics_nrm1', 'rics_nrm2', 'din_276', 'other'
                    )),
  standard_version  text,
  external_code     text not null,
  external_title    text,
  is_primary        boolean not null default false,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint budget_code_external_refs_code_key unique (budget_code_id, standard, external_code)
);

comment on table public.budget_code_external_refs is
  'Crosswalk from public.budget_codes to external cost-classification standards '
  '(CSI MasterFormat/UniFormat, RICS NRM1/NRM2, DIN 276, other). One budget code '
  'maps to many refs (elemental codes span several MasterFormat divisions); '
  'at most one ref per (budget_code, standard) may be is_primary, used for '
  'single-value display such as the tender submission print appendix.';

-- At most one primary ref per (budget_code, standard).
create unique index if not exists idx_budget_code_external_refs_primary
  on public.budget_code_external_refs (budget_code_id, standard)
  where is_primary;

create index if not exists idx_budget_code_external_refs_code
  on public.budget_code_external_refs (budget_code_id);

-- updated_at trigger, guarded in case public.set_updated_at() is ever absent.
do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists set_budget_code_external_refs_updated_at on public.budget_code_external_refs;
    create trigger set_budget_code_external_refs_updated_at
      before update on public.budget_code_external_refs
      for each row execute function public.set_updated_at();
  end if;
end;
$$;

-- RLS: mirror budget_codes' policies exactly (open read/write to any
-- authenticated user; the UI is what gates writes, with the qs_libraries
-- permission key the budget-codes page already uses).
alter table public.budget_code_external_refs enable row level security;

drop policy if exists "Auth users can view budget code external refs" on public.budget_code_external_refs;
create policy "Auth users can view budget code external refs" on public.budget_code_external_refs
  for select
  to authenticated
  using (true);

drop policy if exists "Auth users can manage budget code external refs" on public.budget_code_external_refs;
create policy "Auth users can manage budget code external refs" on public.budget_code_external_refs
  for insert
  to authenticated
  with check (true);

drop policy if exists "Auth users can update budget code external refs" on public.budget_code_external_refs;
create policy "Auth users can update budget code external refs" on public.budget_code_external_refs
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Auth users can delete budget code external refs" on public.budget_code_external_refs;
create policy "Auth users can delete budget code external refs" on public.budget_code_external_refs
  for delete
  to authenticated
  using (true);

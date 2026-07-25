-- Migration: 20260720000002_reconcile_rate_library_schema_drift.sql
-- Purpose: Document, in a tracked migration file, the live schema of five
--          tables that were found live in the `dcos-system` production
--          database with NO corresponding migration file anywhere in the
--          repo and NO entry in Supabase's tracked migration history
--          (`list_migrations` stops at 20260717000004):
--            - company_rate_library (257 rows)
--            - company_rate_library_lines (34 rows)
--            - tender_unit_rates (9 rows)
--            - tender_unit_rate_lines (34 rows)
--            - tender_price_list_items (29 rows)
--          This migration is written to be a safe no-op re-run against an
--          environment where these tables already exist (production, and
--          any branch cloned from it) while still being a correct
--          "create from scratch" migration for a fresh environment.
--          Every statement is idempotent: `create table if not exists`,
--          `create index if not exists`, and policy creation guarded by
--          `do $$ ... exception when duplicate_object then null; end $$;`.
-- Depends on: profiles, projects, tender_register (already exist)
-- Reconciles: docs/03-Business-Modules/12-Quantity-Surveying/
--             SOP_Direct_Works_Cost_Library_Module.md §6 D1, §12
-- Verified against live schema via direct SQL inspection on 2026-07-20
--          (pg_attribute / pg_constraint / pg_indexes / pg_policies) prior
--          to writing this file — column types, constraints, indexes, and
--          RLS policies below match the live database exactly.
--
-- NOTE: RLS policies below intentionally reproduce the existing PERMISSIVE
-- `USING (true) / WITH CHECK (true)` pattern already live on these tables.
-- This is documentation of current reality, not an endorsement — see
-- SOP-QS-Module.md §13 GAP-01 (Critical: RBAC not enforced on QS
-- components) and SOP §7 Step 1.1a, which explicitly requires the NEW
-- dwl_* tables (separate migration, Phase 1) to NOT repeat this pattern.
-- Tightening RLS on these legacy tables is an explicit future decision
-- (SOP §12.1 step 9, "freeze legacy tables read-only"), not done here.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. company_rate_library
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.company_rate_library (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null,
  code                 text not null,
  description          text not null,
  trade                text,
  unit                 text not null,
  mode                 text not null default 'flat' check (mode in ('flat','buildup')),
  base_rate            numeric(14,4),
  wastage_pct          numeric(6,3) default 0,
  productivity_factor  numeric(6,3) default 1 check (productivity_factor > 0),
  net_rate             numeric(14,4) not null default 0,
  category_tags        text[],
  region               text,
  source_project_id    uuid references public.projects(id) on delete set null,
  is_active            boolean not null default true,
  notes                text,
  created_by           uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  discipline           text,
  constraint company_rate_library_tenant_id_code_key unique (tenant_id, code)
);

create index if not exists idx_crl_tenant on public.company_rate_library(tenant_id);
create index if not exists idx_crl_trade on public.company_rate_library(tenant_id, trade);
create index if not exists idx_crl_tags on public.company_rate_library using gin (category_tags);
create index if not exists idx_crl_discipline on public.company_rate_library(tenant_id, discipline);

alter table public.company_rate_library enable row level security;

do $$ begin
  create policy "Auth users can view company rate library" on public.company_rate_library
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Auth users can insert company rate library" on public.company_rate_library
    for insert to authenticated with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Auth users can update company rate library" on public.company_rate_library
    for update to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Auth users can delete company rate library" on public.company_rate_library
    for delete to authenticated using (true);
exception when duplicate_object then null; end $$;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_company_rate_library_updated_at on public.company_rate_library;
create trigger set_company_rate_library_updated_at
  before update on public.company_rate_library
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. company_rate_library_lines
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.company_rate_library_lines (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null,
  library_rate_id        uuid not null references public.company_rate_library(id) on delete cascade,
  category               text not null check (category in ('material','labor','plant','subcon')),
  price_list_item_code   text,
  price_list_item_desc   text not null,
  unit_price             numeric(14,4) not null default 0,
  qty_per_unit           numeric(14,6) not null default 0,
  wastage_pct            numeric(6,3) default 0,
  line_total             numeric(14,4) not null default 0,
  sort_order             integer not null default 0
);

create index if not exists idx_crll_rate on public.company_rate_library_lines(library_rate_id);

alter table public.company_rate_library_lines enable row level security;

do $$ begin
  create policy "Auth users can view company rate library lines" on public.company_rate_library_lines
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Auth users can insert company rate library lines" on public.company_rate_library_lines
    for insert to authenticated with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Auth users can update company rate library lines" on public.company_rate_library_lines
    for update to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Auth users can delete company rate library lines" on public.company_rate_library_lines
    for delete to authenticated using (true);
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. tender_price_list_items
--    (distinct from the separate, empty `tender_price_list` table, which
--    already has a tracked migration — 20260711000005 / 20260717000003)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.tender_price_list_items (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  tender_id      uuid not null references public.tender_register(id) on delete cascade,
  code           text not null,
  description    text not null,
  category       text not null check (category in ('material','labor','plant','subcon')),
  unit           text not null,
  unit_price     numeric(14,4) not null check (unit_price > 0),
  currency       text not null default 'USD',
  supplier_name  text,
  quote_ref      text,
  quote_date     date,
  valid_until    date,
  is_active      boolean not null default true,
  notes          text,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint tender_price_list_items_tender_id_code_key unique (tender_id, code)
);

create index if not exists idx_tpi_category on public.tender_price_list_items(tender_id, category);

alter table public.tender_price_list_items enable row level security;

do $$ begin
  create policy "Auth users can view tender price list items" on public.tender_price_list_items
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Auth users can insert tender price list items" on public.tender_price_list_items
    for insert to authenticated with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Auth users can update tender price list items" on public.tender_price_list_items
    for update to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Auth users can delete tender price list items" on public.tender_price_list_items
    for delete to authenticated using (true);
exception when duplicate_object then null; end $$;

drop trigger if exists set_tender_price_list_items_updated_at on public.tender_price_list_items;
create trigger set_tender_price_list_items_updated_at
  before update on public.tender_price_list_items
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 4. tender_unit_rates
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.tender_unit_rates (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null,
  tender_id             uuid not null references public.tender_register(id) on delete cascade,
  code                  text not null,
  description           text not null,
  trade                 text,
  unit                  text not null,
  mode                  text not null default 'flat' check (mode in ('flat','buildup')),
  base_rate             numeric(14,4),
  wastage_pct           numeric(6,3) default 0,
  productivity_factor   numeric(6,3) default 1 check (productivity_factor > 0),
  net_rate              numeric(14,4) not null default 0,
  library_rate_id       uuid,
  is_active             boolean not null default true,
  notes                 text,
  created_by            uuid references public.profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  margin_pct            numeric(6,2) default 0,
  constraint tender_unit_rates_tender_id_code_key unique (tender_id, code)
);

do $$ begin
  alter table public.tender_unit_rates
    add constraint fk_tur_library_rate foreign key (library_rate_id)
    references public.company_rate_library(id) on delete set null;
exception when duplicate_object then null; end $$;

create index if not exists idx_tur_tender on public.tender_unit_rates(tender_id);
create index if not exists idx_tur_trade on public.tender_unit_rates(tender_id, trade);

alter table public.tender_unit_rates enable row level security;

do $$ begin
  create policy "Auth users can view tender unit rates" on public.tender_unit_rates
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Auth users can insert tender unit rates" on public.tender_unit_rates
    for insert to authenticated with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Auth users can update tender unit rates" on public.tender_unit_rates
    for update to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Auth users can delete tender unit rates" on public.tender_unit_rates
    for delete to authenticated using (true);
exception when duplicate_object then null; end $$;

drop trigger if exists set_tender_unit_rates_updated_at on public.tender_unit_rates;
create trigger set_tender_unit_rates_updated_at
  before update on public.tender_unit_rates
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 5. tender_unit_rate_lines
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.tender_unit_rate_lines (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null,
  unit_rate_id         uuid not null references public.tender_unit_rates(id) on delete cascade,
  category             text not null check (category in ('material','labor','plant','subcon')),
  price_list_item_id   uuid not null references public.tender_price_list_items(id) on delete restrict,
  qty_per_unit         numeric(14,6) not null check (qty_per_unit > 0),
  wastage_pct          numeric(6,3) default 0,
  line_total           numeric(14,4) not null default 0,
  sort_order           integer not null default 0
);

create index if not exists idx_turl_rate on public.tender_unit_rate_lines(unit_rate_id);
create index if not exists idx_turl_price_item on public.tender_unit_rate_lines(price_list_item_id);

alter table public.tender_unit_rate_lines enable row level security;

do $$ begin
  create policy "Auth users can view tender unit rate lines" on public.tender_unit_rate_lines
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Auth users can insert tender unit rate lines" on public.tender_unit_rate_lines
    for insert to authenticated with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Auth users can update tender unit rate lines" on public.tender_unit_rate_lines
    for update to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Auth users can delete tender unit rate lines" on public.tender_unit_rate_lines
    for delete to authenticated using (true);
exception when duplicate_object then null; end $$;

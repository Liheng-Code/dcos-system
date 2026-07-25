-- Migration: 20260720000017_fix_dwl_tenant_isolation.sql
-- Purpose: Fix the tenant-isolation infrastructure that every dwl_* RLS
--          policy depends on, which does not work for any real user.
--
-- ROOT CAUSE (verified live 2026-07-20, before writing this file):
--   Every dwl_* RLS policy checks `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`,
--   a pattern copied from 20260623000001_add_company_id_to_profiles_jwt_hook.sql,
--   which is recorded as APPLIED in `list_migrations`. But live inspection
--   shows NONE of what that migration (or the later, also-applied
--   20260711000002_add_company_id_to_profiles.sql, which ALSO claims to
--   add the same column) was supposed to produce actually exists:
--     - public.profiles has NO company_id column (confirmed via
--       information_schema.columns — only a legacy `company text` column
--       exists, null on all 35 rows)
--     - public.custom_access_token_hook does NOT exist in pg_proc
--     - no auth.users row carries a tenant_id claim anywhere
--   This is schema drift of the same category found and reconciled
--   elsewhere in this module (SOP §12): two migrations are marked
--   "applied" in the tracked history, but the live database does not
--   reflect what either of them claims to have done. Root cause of THAT
--   deeper drift is out of scope here (flagging it, not chasing it) —
--   this migration fixes forward rather than diagnosing why the historical
--   record and live state disagree.
--   Net effect before this fix: `auth.jwt() ->> 'tenant_id'` evaluates to
--   NULL for every real authenticated user, so every dwl_* tenant-isolation
--   policy silently rejected ALL real access (reads and writes) — the 771
--   seeded rows only exist because migrations run with elevated privileges
--   that bypass RLS entirely.
--
-- OTHER TABLES CHECKED, NOT AFFECTED: queried pg_policies for any
-- non-dwl_* policy referencing the JWT tenant_id claim — none found. This
-- broken pattern is isolated to the 11 dwl_* tables; no other table's RLS
-- relies on it. (Every other DCOS table's RLS uses either
-- `USING (true)` — the separately-flagged GAP-01 permissive pattern — or
-- direct auth.uid() checks, neither of which is touched here.)
--
-- FIX: switch from the JWT-claim pattern to the standard Supabase
-- subquery pattern used against the real, already-populated `companies`
-- table:  tenant_id = (select company_id from public.profiles where id = auth.uid())
-- This requires profiles.company_id to actually exist and be populated —
-- both are done here. profiles has RLS enabled but with a permissive
-- `USING (true)` policy (pre-existing, not touched), so the subquery can
-- read any profile row including the querying user's own, no
-- SECURITY DEFINER wrapper needed.
--
-- SCOPE: dwl_* tables only, as instructed. custom_access_token_hook, Auth
-- Hooks configuration, and every non-dwl_* table are untouched.
--
-- Append-only behavior on dwl_resource_prices and dwl_project_snapshots is
-- preserved exactly — only SELECT/INSERT policies are recreated for those
-- two tables, still no UPDATE/DELETE policy.
--
-- Backfill: this environment has exactly one company (MCC) and every
-- existing dwl_* row already carries that company's id as tenant_id.
-- Backfilling ALL 35 existing profiles to MCC reflects the actual current
-- (single-tenant) reality of this deployment, not an assumption — verified
-- live (public.companies has exactly 1 row).
--
-- Idempotent: `add column if not exists`, backfill only where null, and
-- every policy is dropped and recreated (safe to re-run).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. profiles.company_id — add (if truly still missing) and backfill
-- ─────────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists company_id uuid references public.companies(id) on delete set null;

create index if not exists idx_profiles_company_id on public.profiles(company_id);

update public.profiles
set company_id = (select id from public.companies where code = 'MCC')
where company_id is null
  and exists (select 1 from public.companies where code = 'MCC');

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Rewrite all dwl_* RLS policies: JWT-claim check -> profiles subquery
-- ─────────────────────────────────────────────────────────────────────────

-- dwl_suppliers (select/insert/update — no delete, deactivate pattern)
drop policy if exists dwl_suppliers_tenant_select on public.dwl_suppliers;
drop policy if exists dwl_suppliers_tenant_insert on public.dwl_suppliers;
drop policy if exists dwl_suppliers_tenant_update on public.dwl_suppliers;

create policy dwl_suppliers_tenant_select on public.dwl_suppliers
  for select using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
create policy dwl_suppliers_tenant_insert on public.dwl_suppliers
  for insert with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
create policy dwl_suppliers_tenant_update on public.dwl_suppliers
  for update using (tenant_id = (select company_id from public.profiles where id = auth.uid()))
  with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));

-- dwl_resources (select/insert/update — no delete, deactivate pattern)
drop policy if exists dwl_resources_tenant_select on public.dwl_resources;
drop policy if exists dwl_resources_tenant_write on public.dwl_resources;
drop policy if exists dwl_resources_tenant_update on public.dwl_resources;

create policy dwl_resources_tenant_select on public.dwl_resources
  for select using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
create policy dwl_resources_tenant_write on public.dwl_resources
  for insert with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
create policy dwl_resources_tenant_update on public.dwl_resources
  for update using (tenant_id = (select company_id from public.profiles where id = auth.uid()))
  with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));

-- dwl_resource_prices (select/insert ONLY — append-only, unchanged)
drop policy if exists dwl_resource_prices_tenant_select on public.dwl_resource_prices;
drop policy if exists dwl_resource_prices_tenant_insert on public.dwl_resource_prices;

create policy dwl_resource_prices_tenant_select on public.dwl_resource_prices
  for select using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
create policy dwl_resource_prices_tenant_insert on public.dwl_resource_prices
  for insert with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));

-- dwl_work_items (full CRUD)
drop policy if exists dwl_work_items_tenant_select on public.dwl_work_items;
drop policy if exists dwl_work_items_tenant_insert on public.dwl_work_items;
drop policy if exists dwl_work_items_tenant_update on public.dwl_work_items;
drop policy if exists dwl_work_items_tenant_delete on public.dwl_work_items;

create policy dwl_work_items_tenant_select on public.dwl_work_items
  for select using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
create policy dwl_work_items_tenant_insert on public.dwl_work_items
  for insert with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
create policy dwl_work_items_tenant_update on public.dwl_work_items
  for update using (tenant_id = (select company_id from public.profiles where id = auth.uid()))
  with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
create policy dwl_work_items_tenant_delete on public.dwl_work_items
  for delete using (tenant_id = (select company_id from public.profiles where id = auth.uid()));

-- dwl_work_item_resources (full CRUD)
drop policy if exists dwl_work_item_resources_tenant_select on public.dwl_work_item_resources;
drop policy if exists dwl_work_item_resources_tenant_insert on public.dwl_work_item_resources;
drop policy if exists dwl_work_item_resources_tenant_update on public.dwl_work_item_resources;
drop policy if exists dwl_work_item_resources_tenant_delete on public.dwl_work_item_resources;

create policy dwl_work_item_resources_tenant_select on public.dwl_work_item_resources
  for select using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
create policy dwl_work_item_resources_tenant_insert on public.dwl_work_item_resources
  for insert with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
create policy dwl_work_item_resources_tenant_update on public.dwl_work_item_resources
  for update using (tenant_id = (select company_id from public.profiles where id = auth.uid()))
  with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
create policy dwl_work_item_resources_tenant_delete on public.dwl_work_item_resources
  for delete using (tenant_id = (select company_id from public.profiles where id = auth.uid()));

-- dwl_assemblies (full CRUD)
drop policy if exists dwl_assemblies_tenant_select on public.dwl_assemblies;
drop policy if exists dwl_assemblies_tenant_insert on public.dwl_assemblies;
drop policy if exists dwl_assemblies_tenant_update on public.dwl_assemblies;
drop policy if exists dwl_assemblies_tenant_delete on public.dwl_assemblies;

create policy dwl_assemblies_tenant_select on public.dwl_assemblies
  for select using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
create policy dwl_assemblies_tenant_insert on public.dwl_assemblies
  for insert with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
create policy dwl_assemblies_tenant_update on public.dwl_assemblies
  for update using (tenant_id = (select company_id from public.profiles where id = auth.uid()))
  with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
create policy dwl_assemblies_tenant_delete on public.dwl_assemblies
  for delete using (tenant_id = (select company_id from public.profiles where id = auth.uid()));

-- dwl_assembly_items (full CRUD)
drop policy if exists dwl_assembly_items_tenant_select on public.dwl_assembly_items;
drop policy if exists dwl_assembly_items_tenant_insert on public.dwl_assembly_items;
drop policy if exists dwl_assembly_items_tenant_update on public.dwl_assembly_items;
drop policy if exists dwl_assembly_items_tenant_delete on public.dwl_assembly_items;

create policy dwl_assembly_items_tenant_select on public.dwl_assembly_items
  for select using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
create policy dwl_assembly_items_tenant_insert on public.dwl_assembly_items
  for insert with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
create policy dwl_assembly_items_tenant_update on public.dwl_assembly_items
  for update using (tenant_id = (select company_id from public.profiles where id = auth.uid()))
  with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
create policy dwl_assembly_items_tenant_delete on public.dwl_assembly_items
  for delete using (tenant_id = (select company_id from public.profiles where id = auth.uid()));

-- dwl_quantity_models (full CRUD)
drop policy if exists dwl_quantity_models_tenant_select on public.dwl_quantity_models;
drop policy if exists dwl_quantity_models_tenant_insert on public.dwl_quantity_models;
drop policy if exists dwl_quantity_models_tenant_update on public.dwl_quantity_models;
drop policy if exists dwl_quantity_models_tenant_delete on public.dwl_quantity_models;

create policy dwl_quantity_models_tenant_select on public.dwl_quantity_models
  for select using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
create policy dwl_quantity_models_tenant_insert on public.dwl_quantity_models
  for insert with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
create policy dwl_quantity_models_tenant_update on public.dwl_quantity_models
  for update using (tenant_id = (select company_id from public.profiles where id = auth.uid()))
  with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
create policy dwl_quantity_models_tenant_delete on public.dwl_quantity_models
  for delete using (tenant_id = (select company_id from public.profiles where id = auth.uid()));

-- dwl_model_factors (full CRUD)
drop policy if exists dwl_model_factors_tenant_select on public.dwl_model_factors;
drop policy if exists dwl_model_factors_tenant_insert on public.dwl_model_factors;
drop policy if exists dwl_model_factors_tenant_update on public.dwl_model_factors;
drop policy if exists dwl_model_factors_tenant_delete on public.dwl_model_factors;

create policy dwl_model_factors_tenant_select on public.dwl_model_factors
  for select using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
create policy dwl_model_factors_tenant_insert on public.dwl_model_factors
  for insert with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
create policy dwl_model_factors_tenant_update on public.dwl_model_factors
  for update using (tenant_id = (select company_id from public.profiles where id = auth.uid()))
  with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
create policy dwl_model_factors_tenant_delete on public.dwl_model_factors
  for delete using (tenant_id = (select company_id from public.profiles where id = auth.uid()));

-- dwl_projects (full CRUD)
drop policy if exists dwl_projects_tenant_select on public.dwl_projects;
drop policy if exists dwl_projects_tenant_insert on public.dwl_projects;
drop policy if exists dwl_projects_tenant_update on public.dwl_projects;
drop policy if exists dwl_projects_tenant_delete on public.dwl_projects;

create policy dwl_projects_tenant_select on public.dwl_projects
  for select using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
create policy dwl_projects_tenant_insert on public.dwl_projects
  for insert with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
create policy dwl_projects_tenant_update on public.dwl_projects
  for update using (tenant_id = (select company_id from public.profiles where id = auth.uid()))
  with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
create policy dwl_projects_tenant_delete on public.dwl_projects
  for delete using (tenant_id = (select company_id from public.profiles where id = auth.uid()));

-- dwl_project_snapshots (select/insert ONLY — append-only, unchanged)
drop policy if exists dwl_project_snapshots_tenant_select on public.dwl_project_snapshots;
drop policy if exists dwl_project_snapshots_tenant_insert on public.dwl_project_snapshots;

create policy dwl_project_snapshots_tenant_select on public.dwl_project_snapshots
  for select using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
create policy dwl_project_snapshots_tenant_insert on public.dwl_project_snapshots
  for insert with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));

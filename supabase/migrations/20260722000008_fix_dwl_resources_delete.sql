-- Migration: 20260722000008_fix_dwl_resources_delete.sql
-- Purpose: Fix silent delete failure on dwl_resources
--
-- Root cause: dwl_resources has RLS enabled but no DELETE policy.
-- Supabase silently rejects DELETE queries when no RLS policy matches.
--
-- Additionally, dwl_resource_prices and dwl_work_item_resources have FK
-- references to dwl_resources(id) without ON DELETE CASCADE, so deleting a
-- resource with child rows would fail with a foreign key violation.
--
-- Fix:
--   1. Add a tenant-scoped DELETE policy on dwl_resources (using the
--      profiles subquery pattern from 20260720000017, NOT the broken JWT pattern)
--   2. Replace FK on dwl_resource_prices.resource_id with ON DELETE CASCADE
--   3. Replace FK on dwl_work_item_resources.resource_id with ON DELETE CASCADE

-- ── 1. DELETE RLS policy for dwl_resources ────────────────────────────────────
drop policy if exists dwl_resources_tenant_delete on public.dwl_resources;
create policy dwl_resources_tenant_delete on public.dwl_resources
  for delete using (tenant_id = (select company_id from public.profiles where id = auth.uid()));

-- ── 2. FK on dwl_resource_prices → ON DELETE CASCADE ──────────────────────────
do $$ begin
  alter table public.dwl_resource_prices
    drop constraint if exists dwl_resource_prices_resource_id_fkey;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.dwl_resource_prices
    add constraint dwl_resource_prices_resource_id_fkey
    foreign key (resource_id) references public.dwl_resources(id) on delete cascade;
exception when duplicate_object then null; end $$;

-- ── 3. FK on dwl_work_item_resources → ON DELETE CASCADE ─────────────────────
do $$ begin
  alter table public.dwl_work_item_resources
    drop constraint if exists dwl_work_item_resources_resource_id_fkey;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.dwl_work_item_resources
    add constraint dwl_work_item_resources_resource_id_fkey
    foreign key (resource_id) references public.dwl_resources(id) on delete cascade;
exception when duplicate_object then null; end $$;

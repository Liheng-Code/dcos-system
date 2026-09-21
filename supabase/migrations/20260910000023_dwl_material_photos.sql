-- Migration: 20260910000023_dwl_material_photos.sql
-- Purpose: Cost & Rate Library — Material Master (DCOS-DS-12-012, docs/
--          04-Business-Modules/12-Quantity-Surveying/12-Material-
--          Specification-Price-Recording-Design.md). Adds
--          dwl_material_photos, the metadata table backing the Material
--          Master "Material Photos & Verification" capture/upload feature
--          (real Supabase Storage upload, per the plan
--          inside-module-quantity-surveying-delegated-valley.md). Storage
--          bucket + policies are added separately in
--          20260910000024_dwl_material_photos_storage.sql.
--
-- Depends on: 20260720000003_dwl_phase1_resources.sql (dwl_resources,
--             set_updated_at), 20260720000017 (RLS pattern),
--             public.profiles(company_id, id).
--
-- Design: tenant-scoped, normal (non-append-only) CRUD — a photo can be
--   removed if mis-captured. RLS idiom mirrors dwl_supplier_materials
--   (20260910000003_dwl_supplier_profiles_and_materials.sql): full
--   select/insert/update/delete gated by the profiles.company_id subquery.
--
-- Idempotent: create table if not exists, guarded policies.

create table if not exists public.dwl_material_photos (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  resource_id  uuid not null references public.dwl_resources(id) on delete cascade,
  storage_path text not null,          -- material-photos bucket path: {tenant_id}/{resource_id}/{filename}
  caption      text,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);

create index if not exists idx_dwl_material_photos_tenant
  on public.dwl_material_photos(tenant_id);
create index if not exists idx_dwl_material_photos_resource
  on public.dwl_material_photos(resource_id);

alter table public.dwl_material_photos enable row level security;

do $$ begin
  create policy dwl_material_photos_tenant_select on public.dwl_material_photos
    for select using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_material_photos_tenant_insert on public.dwl_material_photos
    for insert with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_material_photos_tenant_update on public.dwl_material_photos
    for update using (tenant_id = (select company_id from public.profiles where id = auth.uid()))
    with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_material_photos_tenant_delete on public.dwl_material_photos
    for delete using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;

comment on table public.dwl_material_photos is
  'Cost & Rate Library — Material Master photo/verification metadata '
  '(tenant-scoped CRUD). storage_path points into the material-photos '
  'Storage bucket. DCOS-DS-12-012.';

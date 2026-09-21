-- Migration: 20260910000024_dwl_material_photos_storage.sql
-- Purpose: Cost & Rate Library — Material Master (DCOS-DS-12-012, docs/
--          04-Business-Modules/12-Quantity-Surveying/12-Material-
--          Specification-Price-Recording-Design.md). Creates the
--          material-photos Storage bucket and its tenant-scoped RLS
--          policies backing dwl_material_photos
--          (20260910000023_dwl_material_photos.sql).
--
-- Depends on: public.profiles(id, company_id) (20260720000017).
--
-- Path convention: {tenant_id}/{resource_id}/{filename} — the FIRST path
--   segment must equal the caller's profiles.company_id, using the same
--   tenant-resolution subquery as every other dwl_* RLS policy in this
--   module. Unlike the existing open buckets in this repo
--   (procurement-attachments, qto-files — public=true, owner-gated writes
--   only), this bucket is PRIVATE and tenant-path-gated on every
--   operation, because material photos are tenant business data, not
--   shared reference material.
--
-- Idempotent: on conflict do nothing on the bucket insert, guarded
--   policies.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'material-photos',
  'material-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

do $$ begin
  create policy "Tenant members can view material photos"
    on storage.objects for select
    to authenticated
    using (
      bucket_id = 'material-photos'
      and (storage.foldername(name))[1] = (
        select company_id::text from public.profiles where id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Tenant members can upload material photos"
    on storage.objects for insert
    to authenticated
    with check (
      bucket_id = 'material-photos'
      and (storage.foldername(name))[1] = (
        select company_id::text from public.profiles where id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Tenant members can update material photos"
    on storage.objects for update
    to authenticated
    using (
      bucket_id = 'material-photos'
      and (storage.foldername(name))[1] = (
        select company_id::text from public.profiles where id = auth.uid()
      )
    )
    with check (
      bucket_id = 'material-photos'
      and (storage.foldername(name))[1] = (
        select company_id::text from public.profiles where id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Tenant members can delete material photos"
    on storage.objects for delete
    to authenticated
    using (
      bucket_id = 'material-photos'
      and (storage.foldername(name))[1] = (
        select company_id::text from public.profiles where id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;

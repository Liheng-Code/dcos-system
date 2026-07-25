-- Tender Exclude Items — replaces Provisional Sums and Dayworks
-- Items excluded from the BOQ that need to be documented in the submission

create table if not exists public.tender_exclude_items (
  id              uuid primary key default gen_random_uuid(),
  tender_id       uuid not null references public.tender_register(id) on delete cascade,
  item_code       text not null,
  description     text not null,
  reason          text,
  notes           text,
  sort_order      integer default 0,
  created_at      timestamptz not null default now(),
  unique(tender_id, item_code)
);

create index if not exists idx_tei_tender on public.tender_exclude_items(tender_id);
alter table public.tender_exclude_items enable row level security;
create policy "Auth users can view exclude items"
  on public.tender_exclude_items for select to authenticated using (true);
create policy "Auth users can manage exclude items"
  on public.tender_exclude_items for insert to authenticated with check (true);
create policy "Auth users can update exclude items"
  on public.tender_exclude_items for update to authenticated using (true) with check (true);
create policy "Auth users can delete exclude items"
  on public.tender_exclude_items for delete to authenticated using (true);

-- RBAC permissions for Exclude Items tab (same pattern as provisional sums / dayworks)
INSERT INTO public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, transmit, configure, reassign, scope)
VALUES
  ('L0',      'tender','tender_exclude_items', true,  true,  true,  true,  false, false, false, false, false, false, false, 'company'),
  ('L1',      'tender','tender_exclude_items', true,  true,  true,  true,  false, false, false, false, false, false, false, 'company'),
  ('L2',      'tender','tender_exclude_items', true,  true,  true,  true,  false, false, false, false, false, false, false, 'company'),
  ('L3',      'tender','tender_exclude_items', true,  true,  true,  false, false, false, false, false, false, false, false, 'project'),
  ('QS',      'tender','tender_exclude_items', true,  true,  true,  true,  false, false, false, false, false, false, false, 'company'),
  ('AC',      'tender','tender_exclude_items', true,  false, false, false, false, false, false, false, false, false, false, 'company'),
  ('PO',      'tender','tender_exclude_items', true,  true,  true,  false, false, false, false, false, false, false, false, 'company'),
  ('L4',      'tender','tender_exclude_items', true,  false, false, false, false, false, false, false, false, false, false, 'project'),
  ('L5',      'tender','tender_exclude_items', true,  false, false, false, false, false, false, false, false, false, false, 'project'),
  ('L6',      'tender','tender_exclude_items', false, false, false, false, false, false, false, false, false, false, false, null),
  ('EXT-CLT', 'tender','tender_exclude_items', false, false, false, false, false, false, false, false, false, false, false, null),
  ('EXT-CON', 'tender','tender_exclude_items', false, false, false, false, false, false, false, false, false, false, false, null),
  ('EXT-SUB', 'tender','tender_exclude_items', false, false, false, false, false, false, false, false, false, false, false, null)
ON CONFLICT DO NOTHING;

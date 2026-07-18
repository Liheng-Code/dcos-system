-- Migration: 20260718000002_create_wbs_node_quantities.sql
-- Purpose: Create wbs_node_quantities table (GFA per WBS level node) per DCOS-QS-GDL-001 V1.1
--          (docs/03-Business-Modules/12-Quantity-Surveying/04-GFA-Site-Area-Cost-per-m2-Design.md §2.3, §2.5)
-- Depends on: wbs_nodes (20260527000009_create_wbs_nodes.sql), auth.users,
--             public.qs_audit_trigger_fn() (20260612000004_qs_audit_log.sql),
--             public.set_updated_at() (20260717000005_create_rate_libraries.sql)

create table if not exists public.wbs_node_quantities (
  id              uuid primary key default gen_random_uuid(),
  wbs_node_id     uuid not null references public.wbs_nodes(id) on delete cascade,
  -- kept as an enum column (not a dedicated `gfa` column) so future metrics
  -- (e.g. NLA, roof area) can reuse this table without a new migration
  metric_code     text not null check (metric_code in ('GFA')),
  value           numeric(14,2) not null check (value >= 0),
  unit            text not null default 'm2',
  -- drawing revision reference (e.g. "A-102 Rev C") — mandatory at the UI layer
  -- per the "GFA is entered, never derived" rule (§3 Non-Negotiable Rule 1);
  -- not a DB NOT NULL constraint here, service layer enforces it on write
  source          text,
  -- required on UPDATE only (not on first INSERT) — enforced in the service
  -- layer, not a DB constraint, since a reason can't exist before the first
  -- value does
  revision_reason text,
  created_by      uuid references auth.users(id),
  updated_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (wbs_node_id, metric_code)
);

comment on table public.wbs_node_quantities is
  'GFA (and future area metrics) per WBS level node, per DCOS-QS-GDL-001. One row per (wbs_node_id, metric_code), edited in place with revision_reason + qs_audit_log capturing the before/after (BR-G5).';

-- Indexes
create index if not exists idx_wbs_node_quantities_wbs_node_id on public.wbs_node_quantities(wbs_node_id);
create index if not exists idx_wbs_node_quantities_metric_code on public.wbs_node_quantities(metric_code);

-- updated_at trigger (reuses public.set_updated_at(), already defined by
-- 20260717000005_create_rate_libraries.sql)
drop trigger if exists set_wbs_node_quantities_updated_at on public.wbs_node_quantities;
create trigger set_wbs_node_quantities_updated_at
  before update on public.wbs_node_quantities
  for each row execute function public.set_updated_at();

-- RLS — mirrors the wbs_nodes policy pattern exactly
-- (20260527000009_create_wbs_nodes.sql): authenticated can view/create/update,
-- admin-only delete.
alter table public.wbs_node_quantities enable row level security;

drop policy if exists "Authenticated users can view wbs node quantities" on public.wbs_node_quantities;
create policy "Authenticated users can view wbs node quantities"
  on public.wbs_node_quantities
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can create wbs node quantities" on public.wbs_node_quantities;
create policy "Authenticated users can create wbs node quantities"
  on public.wbs_node_quantities
  for insert
  to authenticated
  with check (true);

drop policy if exists "Authenticated users can update wbs node quantities" on public.wbs_node_quantities;
create policy "Authenticated users can update wbs node quantities"
  on public.wbs_node_quantities
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Admins can delete wbs node quantities" on public.wbs_node_quantities;
create policy "Admins can delete wbs node quantities"
  on public.wbs_node_quantities
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- §2.5 Audit trail — reuse the existing qs_audit_trigger_fn() / qs_audit_log
-- infrastructure (20260612000004_qs_audit_log.sql). Scoped to just this new
-- table so the already-applied migration is left untouched.
do $$
declare
  t text;
begin
  foreach t in array array[
    'wbs_node_quantities'
  ] loop
    execute format('
      drop trigger if exists qs_audit_%1$s on public.%1$s;
      create trigger qs_audit_%1$s
        after insert or update or delete on public.%1$s
        for each row execute function public.qs_audit_trigger_fn();
    ', t);
  end loop;
end;
$$;

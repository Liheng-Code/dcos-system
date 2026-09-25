-- Capture schema that exists in production (and the local clone) but had no migration, so a replay from
-- an empty DB recreates it. Fully idempotent: a no-op where the objects already exist (production, current local).
-- Tables: snap_price_list_items, snap_tender_boq_items, snap_unit_rate_lines, snap_unit_rates,
--         tender_dayworks, tender_provisional_sums
-- Columns: progress_snapshots, qs_boq_items, tender_boq_items, tender_exclude_items, tender_register,
--          wbs_node_quantities, wbs_nodes

-- ── Columns on existing tables ───────────────────────────────────────────────
alter table public.progress_snapshots  add column if not exists gfa_at_snapshot numeric(14,2);
alter table public.qs_boq_items        add column if not exists source_tender_boq_item_id uuid;
alter table public.qs_boq_items        add column if not exists source_tender_prelim_item_id uuid;
alter table public.tender_boq_items    add column if not exists is_manual_rate boolean default false not null;
alter table public.tender_boq_items    add column if not exists net_cost numeric(15,2) default 0;
alter table public.tender_boq_items    add column if not exists sourcing text default 'self'::text not null;
alter table public.tender_exclude_items add column if not exists quantity numeric(15,2) default 0 not null;
alter table public.tender_exclude_items add column if not exists unit text default 'ea'::text not null;
alter table public.tender_exclude_items add column if not exists unit_rate numeric(15,2) default 0;
alter table public.tender_exclude_items add column if not exists total_amount numeric(15,2)
  generated always as (quantity * coalesce(unit_rate, 0::numeric)) stored;
alter table public.tender_register     add column if not exists budget_converted_at timestamp with time zone;
alter table public.tender_register     add column if not exists budget_converted_by uuid;
alter table public.wbs_node_quantities add column if not exists is_current boolean default true not null;
alter table public.wbs_node_quantities add column if not exists revised_at timestamp with time zone;
alter table public.wbs_node_quantities add column if not exists revised_by uuid;
alter table public.wbs_node_quantities add column if not exists revised_reason text;
alter table public.wbs_nodes           add column if not exists is_basement boolean default false not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'qs_boq_items_source_tender_boq_item_id_fkey') then
    alter table public.qs_boq_items add constraint qs_boq_items_source_tender_boq_item_id_fkey
      foreign key (source_tender_boq_item_id) references public.tender_boq_items(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'qs_boq_items_source_tender_prelim_item_id_fkey') then
    alter table public.qs_boq_items add constraint qs_boq_items_source_tender_prelim_item_id_fkey
      foreign key (source_tender_prelim_item_id) references public.tender_preliminaries_items(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'qs_boq_items_source_tender_xor_check') then
    alter table public.qs_boq_items add constraint qs_boq_items_source_tender_xor_check
      check ((source_tender_boq_item_id is null) or (source_tender_prelim_item_id is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tender_boq_items_sourcing_check') then
    alter table public.tender_boq_items add constraint tender_boq_items_sourcing_check
      check (sourcing = any (array['self'::text, 'subcon'::text]));
  end if;
end $$;

-- ── Bid-revision snapshot tables ─────────────────────────────────────────────
create table if not exists public.snap_price_list_items (
  id uuid default gen_random_uuid() not null primary key,
  bid_revision_id uuid not null references public.tender_bid_summaries(id) on delete cascade,
  source_id uuid not null,
  tender_id uuid not null,
  code text not null,
  description text not null,
  category text not null,
  unit text not null,
  unit_price numeric(14,4) not null,
  currency text not null,
  supplier_name text,
  quote_ref text,
  quote_date date,
  valid_until date,
  is_active boolean not null,
  notes text,
  snapped_at timestamp with time zone default now() not null
);

create table if not exists public.snap_tender_boq_items (
  id uuid default gen_random_uuid() not null primary key,
  bid_revision_id uuid not null references public.tender_bid_summaries(id) on delete cascade,
  source_id uuid not null,
  tender_id uuid not null,
  section text not null,
  item_code text not null,
  description text not null,
  unit text not null,
  quantity numeric(15,2) not null,
  unit_rate numeric(15,2),
  total_amount numeric(15,2),
  unit_rate_id uuid,
  is_manual_rate boolean not null,
  sourcing text not null,
  discipline text,
  notes text,
  snapped_at timestamp with time zone default now() not null
);

create table if not exists public.snap_unit_rate_lines (
  id uuid default gen_random_uuid() not null primary key,
  bid_revision_id uuid not null references public.tender_bid_summaries(id) on delete cascade,
  source_id uuid not null,
  unit_rate_id uuid not null,
  category text not null,
  price_list_item_id uuid not null,
  qty_per_unit numeric(14,6) not null,
  wastage_pct numeric(6,3) default 0,
  line_total numeric(14,4) not null,
  sort_order integer not null,
  snapped_at timestamp with time zone default now() not null
);

create table if not exists public.snap_unit_rates (
  id uuid default gen_random_uuid() not null primary key,
  bid_revision_id uuid not null references public.tender_bid_summaries(id) on delete cascade,
  source_id uuid not null,
  tender_id uuid not null,
  code text not null,
  description text not null,
  trade text,
  unit text not null,
  mode text not null,
  base_rate numeric(14,4),
  wastage_pct numeric(6,3) default 0,
  productivity_factor numeric(6,3) default 1,
  net_rate numeric(14,4) not null,
  is_active boolean not null,
  notes text,
  snapped_at timestamp with time zone default now() not null
);

create index if not exists idx_snap_pli_revision  on public.snap_price_list_items (bid_revision_id);
create index if not exists idx_snap_tboq_revision on public.snap_tender_boq_items (bid_revision_id);
create index if not exists idx_snap_ur_revision   on public.snap_unit_rates (bid_revision_id);
create index if not exists idx_snap_url_revision  on public.snap_unit_rate_lines (bid_revision_id);

-- ── Tender dayworks & provisional sums ───────────────────────────────────────
create table if not exists public.tender_dayworks (
  id uuid default gen_random_uuid() not null primary key,
  tender_id uuid not null references public.tender_register(id) on delete cascade,
  item_code text not null,
  description text not null,
  unit text default 'day'::text not null,
  rate numeric(15,2) default 0 not null,
  estimated_qty numeric(15,2) default 0 not null,
  estimated_amount numeric(15,2) generated always as ((rate * estimated_qty)) stored,
  notes text,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint tender_dayworks_tender_id_item_code_key unique (tender_id, item_code)
);

create table if not exists public.tender_provisional_sums (
  id uuid default gen_random_uuid() not null primary key,
  tender_id uuid not null references public.tender_register(id) on delete cascade,
  item_code text not null,
  description text not null,
  amount numeric(15,2) default 0 not null,
  notes text,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint tender_provisional_sums_tender_id_item_code_key unique (tender_id, item_code)
);

create index if not exists idx_td_tender  on public.tender_dayworks (tender_id);
create index if not exists idx_tps_tender on public.tender_provisional_sums (tender_id);

-- ── RLS (same policies as production) ────────────────────────────────────────
alter table public.snap_price_list_items   enable row level security;
alter table public.snap_tender_boq_items   enable row level security;
alter table public.snap_unit_rate_lines    enable row level security;
alter table public.snap_unit_rates         enable row level security;
alter table public.tender_dayworks         enable row level security;
alter table public.tender_provisional_sums enable row level security;

drop policy if exists "Auth users can view snap price list" on public.snap_price_list_items;
create policy "Auth users can view snap price list" on public.snap_price_list_items for select to authenticated using (true);
drop policy if exists "Auth users can insert snap price list" on public.snap_price_list_items;
create policy "Auth users can insert snap price list" on public.snap_price_list_items for insert to authenticated with check (true);

drop policy if exists "Auth users can view snap tender boq" on public.snap_tender_boq_items;
create policy "Auth users can view snap tender boq" on public.snap_tender_boq_items for select to authenticated using (true);
drop policy if exists "Auth users can insert snap tender boq" on public.snap_tender_boq_items;
create policy "Auth users can insert snap tender boq" on public.snap_tender_boq_items for insert to authenticated with check (true);

drop policy if exists "Auth users can view snap unit rate lines" on public.snap_unit_rate_lines;
create policy "Auth users can view snap unit rate lines" on public.snap_unit_rate_lines for select to authenticated using (true);
drop policy if exists "Auth users can insert snap unit rate lines" on public.snap_unit_rate_lines;
create policy "Auth users can insert snap unit rate lines" on public.snap_unit_rate_lines for insert to authenticated with check (true);

drop policy if exists "Auth users can view snap unit rates" on public.snap_unit_rates;
create policy "Auth users can view snap unit rates" on public.snap_unit_rates for select to authenticated using (true);
drop policy if exists "Auth users can insert snap unit rates" on public.snap_unit_rates;
create policy "Auth users can insert snap unit rates" on public.snap_unit_rates for insert to authenticated with check (true);

drop policy if exists "Auth users can view tender dayworks" on public.tender_dayworks;
create policy "Auth users can view tender dayworks" on public.tender_dayworks for select to authenticated using (true);
drop policy if exists "Auth users can manage tender dayworks" on public.tender_dayworks;
create policy "Auth users can manage tender dayworks" on public.tender_dayworks for insert to authenticated with check (true);
drop policy if exists "Auth users can update tender dayworks" on public.tender_dayworks;
create policy "Auth users can update tender dayworks" on public.tender_dayworks for update to authenticated using (true) with check (true);
drop policy if exists "Auth users can delete tender dayworks" on public.tender_dayworks;
create policy "Auth users can delete tender dayworks" on public.tender_dayworks for delete to authenticated using (true);

drop policy if exists "Auth users can view tender provisional sums" on public.tender_provisional_sums;
create policy "Auth users can view tender provisional sums" on public.tender_provisional_sums for select to authenticated using (true);
drop policy if exists "Auth users can manage tender provisional sums" on public.tender_provisional_sums;
create policy "Auth users can manage tender provisional sums" on public.tender_provisional_sums for insert to authenticated with check (true);
drop policy if exists "Auth users can update tender provisional sums" on public.tender_provisional_sums;
create policy "Auth users can update tender provisional sums" on public.tender_provisional_sums for update to authenticated using (true) with check (true);
drop policy if exists "Auth users can delete tender provisional sums" on public.tender_provisional_sums;
create policy "Auth users can delete tender provisional sums" on public.tender_provisional_sums for delete to authenticated using (true);

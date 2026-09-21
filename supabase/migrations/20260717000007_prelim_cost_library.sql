-- Preliminaries Cost Library — reusable parameter-driven build-up templates.
-- Stores Z-code line items with component-level breakdowns and formula-based calculations.
-- Per-project Site Data parameters are stored in tender_prelim_settings.

-- 1. Master line items (reusable across all projects)
create table if not exists public.prelim_library_items (
  id              uuid primary key default gen_random_uuid(),
  parent_code     text,                           -- NULL = top-level section (Z.01, Z.30, Z.50, Z.70)
  code            text not null unique,            -- e.g. Z.01.05.01
  description     text not null,
  unit            text not null default 'Item',    -- Item / Month / m2 / Floor / Lot / Sum
  calc_mode       text not null default 'fixed'
    check (calc_mode in ('fixed', 'param', 'sum_children')),
  default_qty     numeric(15,2) default 1,         -- Fallback qty when no formula
  formula         text,                            -- Expression referencing P01-P12, e.g. "P06"
  sort_order      integer not null default 0,
  category        text not null default 'temporary_works'
    check (category in ('temporary_works', 'staff', 'design', 'risk')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_pli_parent_code on public.prelim_library_items(parent_code);
create index if not exists idx_pli_sort on public.prelim_library_items(sort_order);

-- 2. Component-level build-ups per line item
create table if not exists public.prelim_library_components (
  id              uuid primary key default gen_random_uuid(),
  item_id         uuid not null references public.prelim_library_items(id) on delete cascade,
  description     text not null,
  qty_formula     text not null default '1',       -- Expression: "1", "80", "P09", "(P06/50)"
  unit            text not null default 'no',      -- no / worker / m2 / mo / lot / trip / man-day
  rate            numeric(15,2) not null default 0,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_plc_item on public.prelim_library_components(item_id);

-- 3. Per-project parameter overrides
create table if not exists public.tender_prelim_settings (
  id              uuid primary key default gen_random_uuid(),
  tender_id       uuid not null unique references public.tender_register(id) on delete cascade,
  params          jsonb not null default '{}',     -- {"P01": 130, "P02": 800, ...}
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- RLS
alter table public.prelim_library_items enable row level security;
create policy "Auth users can view prelim library items"
  on public.prelim_library_items for select to authenticated using (true);
create policy "Auth users can manage prelim library items"
  on public.prelim_library_items for insert to authenticated with check (true);
create policy "Auth users can update prelim library items"
  on public.prelim_library_items for update to authenticated using (true) with check (true);
create policy "Auth users can delete prelim library items"
  on public.prelim_library_items for delete to authenticated using (true);

alter table public.prelim_library_components enable row level security;
create policy "Auth users can view prelim library components"
  on public.prelim_library_components for select to authenticated using (true);
create policy "Auth users can manage prelim library components"
  on public.prelim_library_components for insert to authenticated with check (true);
create policy "Auth users can update prelim library components"
  on public.prelim_library_components for update to authenticated using (true) with check (true);
create policy "Auth users can delete prelim library components"
  on public.prelim_library_components for delete to authenticated using (true);

alter table public.tender_prelim_settings enable row level security;
create policy "Auth users can view tender prelim settings"
  on public.tender_prelim_settings for select to authenticated using (true);
create policy "Auth users can manage tender prelim settings"
  on public.tender_prelim_settings for insert to authenticated with check (true);
create policy "Auth users can update tender prelim settings"
  on public.tender_prelim_settings for update to authenticated using (true) with check (true);
create policy "Auth users can delete tender prelim settings"
  on public.tender_prelim_settings for delete to authenticated using (true);

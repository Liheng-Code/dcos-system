-- Migration: 20260720000006_dwl_phase2_work_items.sql
-- Purpose: Direct Works Cost Library Module (QS-SOP-002) — Phase 2, Level 2:
--          Work Items and Recipes. Implements SOP §8 Step 2.1 (tables) and
--          Step 2.2 (dwl_v_work_item_rates / dwl_v_work_item_explosion
--          views).
-- Depends on: 20260720000003_dwl_phase1_resources.sql (dwl_resources,
--             dwl_v_current_prices), profiles (already exists)
-- Scope: Phase 2 only. Phase 3 (assemblies) and Phase 4 (parametric
--        models) are out of scope for this migration.
-- Idempotent: safe to re-run (create table if not exists, create index if
--          not exists, guarded policy creation).
--
-- RLS note: unlike dwl_resource_prices (Phase 1, append-only by design),
-- dwl_work_items and dwl_work_item_resources are maintained/corrected over
-- time (§8 Step 2.3), so they get normal tenant-scoped INSERT/UPDATE/DELETE
-- policies, not the price-table append-only pattern.
--
-- Security-definer view fix applied proactively here (not retrofitted
-- after the fact, unlike dwl_v_current_prices in Phase 1 — see
-- 20260720000005): both views below are created WITH (security_invoker =
-- true) from the start so RLS on the underlying dwl_* tables is enforced
-- for the querying user, not the view owner.

-- ─────────────────────────────────────────────────────────────────────────
-- Step 2.1 — dwl_work_items
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dwl_work_items (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  code         text not null,                 -- e.g. 03.02.010
  boq_section  text not null,                  -- 01..08 per QS workflow
  description  text not null,                  -- MUST state inclusions AND exclusions
  unit         text not null,
  method_note  text,                           -- e.g. 'Pump placement'
  is_active    boolean not null default true,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint dwl_work_items_code_key unique (code)
);

create index if not exists idx_dwl_work_items_tenant on public.dwl_work_items(tenant_id);
create index if not exists idx_dwl_work_items_boq_section on public.dwl_work_items(tenant_id, boq_section);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_dwl_work_items_updated_at on public.dwl_work_items;
create trigger set_dwl_work_items_updated_at
  before update on public.dwl_work_items
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- Step 2.1 — dwl_work_item_resources (recipe lines)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dwl_work_item_resources (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  work_item_id  uuid not null references public.dwl_work_items(id) on delete cascade,
  resource_id   uuid not null references public.dwl_resources(id),
  consumption   numeric(14,6) not null check (consumption > 0),
  waste_pct     numeric(6,4) not null default 0 check (waste_pct >= 0 and waste_pct < 1),
  basis_note    text not null,                 -- audit trail: WHERE the number came from
  sort_order    int not null default 0,
  constraint dwl_work_item_resources_item_resource_key unique (work_item_id, resource_id)
);

create index if not exists idx_dwl_wir_tenant on public.dwl_work_item_resources(tenant_id);
create index if not exists idx_dwl_wir_work_item on public.dwl_work_item_resources(work_item_id);
create index if not exists idx_dwl_wir_resource on public.dwl_work_item_resources(resource_id);

-- ─────────────────────────────────────────────────────────────────────────
-- RLS — tenant-scoped, normal CRUD (not append-only; recipe lines are
-- maintained over time per §8 Step 2.3).
-- ─────────────────────────────────────────────────────────────────────────
alter table public.dwl_work_items          enable row level security;
alter table public.dwl_work_item_resources enable row level security;

do $$ begin
  create policy dwl_work_items_tenant_select on public.dwl_work_items
    for select using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_work_items_tenant_insert on public.dwl_work_items
    for insert with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_work_items_tenant_update on public.dwl_work_items
    for update using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
    with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_work_items_tenant_delete on public.dwl_work_items
    for delete using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_work_item_resources_tenant_select on public.dwl_work_item_resources
    for select using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_work_item_resources_tenant_insert on public.dwl_work_item_resources
    for insert with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_work_item_resources_tenant_update on public.dwl_work_item_resources
    for update using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
    with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_work_item_resources_tenant_delete on public.dwl_work_item_resources
    for delete using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Step 2.2 — live rate view (security_invoker = true from the start)
-- ─────────────────────────────────────────────────────────────────────────
create or replace view public.dwl_v_work_item_rates
with (security_invoker = true)
as
select
  wi.id as work_item_id,
  wi.code,
  wi.boq_section,
  wi.description,
  wi.unit,
  sum(wir.consumption * (1 + wir.waste_pct) * cp.unit_price) as net_direct_rate,
  bool_or(cp.is_expired) as has_expired_price,
  count(*) as recipe_lines
from public.dwl_work_items wi
join public.dwl_work_item_resources wir on wir.work_item_id = wi.id
join public.dwl_v_current_prices cp on cp.resource_id = wir.resource_id
where wi.is_active
group by wi.id, wi.code, wi.boq_section, wi.description, wi.unit;

-- ─────────────────────────────────────────────────────────────────────────
-- Step 2.2 — explosion view (one row per recipe line, for the rate
-- build-up screen). security_invoker = true from the start.
-- ─────────────────────────────────────────────────────────────────────────
create or replace view public.dwl_v_work_item_explosion
with (security_invoker = true)
as
select
  wi.code as work_item_code,
  wir.sort_order,
  r.code as resource_code,
  r.description as resource_desc,
  r.unit as resource_unit,
  wir.consumption,
  wir.waste_pct,
  cp.unit_price,
  round(wir.consumption * (1 + wir.waste_pct) * cp.unit_price, 4) as line_cost,
  cp.source_type,
  cp.is_expired,
  wir.basis_note
from public.dwl_work_items wi
join public.dwl_work_item_resources wir on wir.work_item_id = wi.id
join public.dwl_resources r on r.id = wir.resource_id
join public.dwl_v_current_prices cp on cp.resource_id = wir.resource_id
order by wi.code, wir.sort_order;

-- Migration: 20260718000003_qs_boq_elemental_category.sql
-- Purpose: Add elemental_category to qs_boq_items + qs_budget_section_elemental_map
--          lookup, seeded from the real Budget Code Groups A-F, plus a trigger that
--          auto-populates elemental_category from the two rules that CAN be resolved
--          today (prelims via boq_type, external_works via wbs_node ancestry).
--          Per DCOS-QS-GDL-001 V1.1 (design doc §3).
-- Depends on: qs_boq_items (20260531000023_create_qs_boq_tables.sql),
--             qs_boq / qs_boq_sections (20260614000001_create_qs_boq_header.sql),
--             wbs_nodes.is_external_works (20260718000001_gfa_site_area_wbs_projects_columns.sql),
--             budget_codes (20260711000003_budget_codes.sql, seeded 20260711000004_budget_codes_seed.sql)

-- ── §3 qs_boq_items: elemental_category column ─────────────────────────────
-- Nullable — only required for items that need to appear in the §6/§9 elemental
-- summary. Defaulted where possible by the trigger below; otherwise set by the
-- QS engineer / service layer.
alter table public.qs_boq_items
  add column if not exists elemental_category text
    check (elemental_category in (
      'substructure', 'superstructure', 'architectural', 'mep', 'external_works', 'prelims'
    ));

-- qs_boq_items has no Budget Code Group A-F linkage today (its only existing
-- classification path is the separate CSI/MasterFormat cost_item_id chain).
-- Add the same budget_code_id column tender_boq_items already carries
-- (20260711000006_tender_boq_items_qs_extension.sql) so a QS engineer can tag a
-- live BOQ item with a Budget Code and let the map-table fallback below resolve
-- elemental_category automatically. Nullable/optional — items with no budget
-- code still work, they just fall through to manual elemental_category entry.
alter table public.qs_boq_items
  add column if not exists budget_code_id uuid references public.budget_codes(id) on delete set null;

create index if not exists idx_qs_boq_items_elemental_category
  on public.qs_boq_items(elemental_category);

create index if not exists idx_qs_boq_items_budget_code
  on public.qs_boq_items(budget_code_id);

comment on column public.qs_boq_items.elemental_category is
  'Coarse 5(+1)-line elemental classification for the GFA/Cost-per-m2 report (DCOS-QS-GDL-001 §6 Step 3). Separate from, and does not replace, the detailed 47-section Budget Code Groups A-F used across BOQ/procurement/cost transactions. Auto-defaulted by trg_qs_boq_items_default_elemental_category for the prelims and external_works cases; editable by the QS Manager for all other/edge cases.';

-- ── §3 qs_budget_section_elemental_map ──────────────────────────────────────
-- Thin, overridable classification bridging the 47-section Budget Code (Groups
-- A-F, see 02-Budget-Code-Design.md) to the 5-line elemental report. Group A
-- (Early Works) is intentionally NOT mapped to prelims/external_works here —
-- those two categories are always resolved dynamically (boq_type /
-- wbs_node.is_external_works, see trigger below), never via this static map.
create table if not exists public.qs_budget_section_elemental_map (
  budget_section_code text primary key references public.budget_codes(code) on delete cascade,
  elemental_category   text not null check (elemental_category in (
    'substructure', 'superstructure', 'architectural', 'mep', 'external_works', 'prelims'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.qs_budget_section_elemental_map is
  'Maps Budget Code Group A-F section codes (budget_codes.code) to the coarse elemental_category used by the GFA/Cost-per-m2 report. Editable by the QS Manager for edge cases (DCOS-QS-GDL-001 design doc §3). Rows are only ever substructure/superstructure/architectural/mep — prelims and external_works are resolved dynamically, never seeded here.';

create index if not exists idx_qs_budget_section_elemental_map_category
  on public.qs_budget_section_elemental_map(elemental_category);

drop trigger if exists set_qs_budget_section_elemental_map_updated_at on public.qs_budget_section_elemental_map;
create trigger set_qs_budget_section_elemental_map_updated_at
  before update on public.qs_budget_section_elemental_map
  for each row execute function public.set_updated_at();

alter table public.qs_budget_section_elemental_map enable row level security;

-- Mirrors the sibling budget_codes.sql RLS pattern (this is the same kind of
-- small master/config table extending the Budget Code system).
drop policy if exists "Auth users can view budget section elemental map" on public.qs_budget_section_elemental_map;
create policy "Auth users can view budget section elemental map"
  on public.qs_budget_section_elemental_map for select to authenticated using (true);
drop policy if exists "Auth users can insert budget section elemental map" on public.qs_budget_section_elemental_map;
create policy "Auth users can insert budget section elemental map"
  on public.qs_budget_section_elemental_map for insert to authenticated with check (true);
drop policy if exists "Auth users can update budget section elemental map" on public.qs_budget_section_elemental_map;
create policy "Auth users can update budget section elemental map"
  on public.qs_budget_section_elemental_map for update to authenticated using (true) with check (true);
drop policy if exists "Auth users can delete budget section elemental map" on public.qs_budget_section_elemental_map;
create policy "Auth users can delete budget section elemental map"
  on public.qs_budget_section_elemental_map for delete to authenticated using (true);

-- ── Seed: Group A (Early Work) -> substructure ──────────────────────────────
-- Early-works site activities (survey, soil investigation, clearance, leveling,
-- demolition, cleaning, existing-services repair, renovation) precede and enable
-- substructure work, so they read closest to "substructure" in a 5-line elemental
-- report. Per the design doc's own guidance this is a best-fit call, not a hard
-- rule -- editable by the QS Manager per project (e.g. a project where "A.07
-- Repair existing services" or "A.08 Renovation" should sit under a different
-- line instead).
insert into public.qs_budget_section_elemental_map (budget_section_code, elemental_category) values
  ('A.00', 'substructure'),
  ('A.01', 'substructure'),
  ('A.02', 'substructure'),
  ('A.03', 'substructure'),
  ('A.04', 'substructure'),
  ('A.05', 'substructure'),
  ('A.06', 'substructure'),
  ('A.07', 'substructure'),
  ('A.08', 'substructure')
on conflict (budget_section_code) do nothing;

-- ── Seed: Group B (Sub-Structure) -> substructure ───────────────────────────
-- NOTE / KNOWN AMBIGUITY (flagged explicitly in the design doc §3): B.04
-- "Super structure" (Super-Structure Podium in the guideline's wording) arguably
-- reads as `superstructure`, not `substructure`, since the guideline's 5-line
-- model has a dedicated Superstructure line that the 47-section Budget Code does
-- not. Seeded here as `substructure` (it sits inside Group B "Sub Structure")
-- but this is exactly the kind of edge case the QS Manager should be free to
-- re-point to `superstructure` per project.
insert into public.qs_budget_section_elemental_map (budget_section_code, elemental_category) values
  ('B.00', 'substructure'),
  ('B.01', 'substructure'),
  ('B.02', 'substructure'),
  ('B.03', 'substructure'),
  ('B.04', 'substructure') -- ambiguous: "Super structure" — see note above
on conflict (budget_section_code) do nothing;

-- ── Seed: Group C (Architecture) -> architectural ───────────────────────────
insert into public.qs_budget_section_elemental_map (budget_section_code, elemental_category) values
  ('C.00', 'architectural'),
  ('C.01', 'architectural'),
  ('C.02', 'architectural'),
  ('C.03', 'architectural'),
  ('C.04', 'architectural'),
  ('C.05', 'architectural'),
  ('C.06', 'architectural'),
  ('C.07', 'architectural'),
  ('C.08', 'architectural'),
  ('C.09', 'architectural'),
  ('C.10', 'architectural'),
  ('C.11', 'architectural'),
  ('C.12', 'architectural')
on conflict (budget_section_code) do nothing;

-- ── Seed: Group D (Interior Finish) -> architectural ────────────────────────
insert into public.qs_budget_section_elemental_map (budget_section_code, elemental_category) values
  ('D.00', 'architectural'),
  ('D.01', 'architectural'),
  ('D.02', 'architectural'),
  ('D.03', 'architectural')
on conflict (budget_section_code) do nothing;

-- ── Seed: Group E (Fittings, Furnishings & Equipment) -> architectural ──────
insert into public.qs_budget_section_elemental_map (budget_section_code, elemental_category) values
  ('E.00', 'architectural'),
  ('E.01', 'architectural'),
  ('E.02', 'architectural'),
  ('E.03', 'architectural'),
  ('E.04', 'architectural'),
  ('E.05', 'architectural'),
  ('E.06', 'architectural'),
  ('E.07', 'architectural'),
  ('E.08', 'architectural')
on conflict (budget_section_code) do nothing;

-- ── Seed: Group F (Services / MEP) -> mep ───────────────────────────────────
insert into public.qs_budget_section_elemental_map (budget_section_code, elemental_category) values
  ('F.00', 'mep'),
  ('F.01', 'mep'),
  ('F.02', 'mep'),
  ('F.03', 'mep'),
  ('F.04', 'mep'),
  ('F.05', 'mep'),
  ('F.06', 'mep'),
  ('F.07', 'mep'),
  ('F.08', 'mep'),
  ('F.09', 'mep'),
  ('F.10', 'mep')
on conflict (budget_section_code) do nothing;

-- ── Ancestry-aware external-works check ─────────────────────────────────────
-- Walks the wbs_nodes.parent_id chain (same recursive-CTE idiom already used by
-- public.build_wbs_full_path in 20260527000009_create_wbs_nodes.sql) and returns
-- true if the given node, or any ancestor, is flagged is_external_works.
create or replace function public.wbs_node_is_external_works(p_wbs_node_id uuid)
returns boolean
language sql
stable
as $$
  with recursive ancestors as (
    select id, parent_id, is_external_works
    from public.wbs_nodes
    where id = p_wbs_node_id
    union all
    select n.id, n.parent_id, n.is_external_works
    from public.wbs_nodes n
    inner join ancestors a on n.id = a.parent_id
  )
  select coalesce(bool_or(is_external_works), false)
  from ancestors;
$$;

-- ── Defaulting trigger for qs_boq_items.elemental_category ──────────────────
-- Only fills elemental_category when it is NULL — never overwrites an explicit
-- QS-set value. Resolves, in order:
--   1. prelims          <- linked qs_boq.boq_type = 'preliminary'
--   2. external_works   <- linked wbs_node (or an ancestor) has is_external_works = true
--   3. everything else  <- NOT WIRED UP, see comment in the function body below.
create or replace function public.qs_boq_items_default_elemental_category()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_boq_type text;
begin
  if new.elemental_category is not null then
    return new;
  end if;

  -- Rule 1: prelims, via the parent BOQ header's boq_type
  select b.boq_type into v_boq_type
  from public.qs_boq_sections s
  join public.qs_boq b on b.id = s.boq_id
  where s.id = new.boq_section_id;

  if v_boq_type = 'preliminary' then
    new.elemental_category := 'prelims';
    return new;
  end if;

  -- Rule 2: external works, via wbs_node ancestry
  if new.wbs_node_id is not null
     and public.wbs_node_is_external_works(new.wbs_node_id) then
    new.elemental_category := 'external_works';
    return new;
  end if;

  -- Rule 3: fallback via qs_budget_section_elemental_map, resolved through the
  -- budget_code_id column added alongside this trigger (qs_boq_items previously
  -- had no Budget Code Group A-F link at all -- only tender_boq_items did, see
  -- 20260711000006_tender_boq_items_qs_extension.sql). Only resolves when the QS
  -- engineer has tagged the item with a budget_code_id; there is no automatic
  -- tender -> live BOQ conversion copy today (award-conversion-dialog.tsx only
  -- flips project_type, it does not copy tender_boq_items rows across), so this
  -- is opt-in per item, not automatic for every project.
  if new.budget_code_id is not null then
    select m.elemental_category into new.elemental_category
    from public.budget_codes bc
    join public.qs_budget_section_elemental_map m on m.budget_section_code = bc.code
    where bc.id = new.budget_code_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_qs_boq_items_default_elemental_category on public.qs_boq_items;
create trigger trg_qs_boq_items_default_elemental_category
  before insert or update on public.qs_boq_items
  for each row execute function public.qs_boq_items_default_elemental_category();

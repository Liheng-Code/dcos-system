-- Migration: 20260910000040_dwl_assembly_crew_equipment_descriptions.sql
-- Purpose: Cost Item Library — Labour & Productivity tab redesign (plan
--          inside-module-quantity-surveying-delegated-valley.md). Adds the
--          free-text fields the richer mockup needs that dwl_assembly_crew/
--          dwl_assembly_equipment didn't have: a role/item description and
--          (crew only) a market-benchmark note. Everything else the tab
--          needs (day rate, daily_output, crew_cost_per_day,
--          labor_cost_per_unit) already exists via dwl_v_current_prices and
--          dwl_v_assembly_costing_summary.
--
-- Depends on: 20260910000036_dwl_cost_item_library_schema.sql (creates both
--   tables with full tenant-scoped CRUD RLS already — no RLS changes here).
--
-- Additive only: no existing column changes meaning.
-- Idempotent: add column if not exists, guarded seed touch-up (where
--   description is null).

alter table public.dwl_assembly_crew add column if not exists description text;
alter table public.dwl_assembly_crew add column if not exists benchmark_note text;
alter table public.dwl_assembly_equipment add column if not exists description text;

-- ─────────────────────────────────────────────────────────────────────────
-- Seed touch-up — backfill the ceiling example's 2 crew rows + 1 equipment
-- row with real, ceiling-appropriate text (not masonry) so the tab isn't
-- empty on first load. Guarded: only fires if the rows exist and are blank.
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare
  v_assembly_id uuid;
begin
  select id into v_assembly_id from public.dwl_assemblies where code = 'ASM-CEIL-GYP-001';
  if v_assembly_id is null then
    return;
  end if;

  update public.dwl_assembly_crew
  set description = 'Sets out the ceiling grid line & level, fixes main runners and furring channels, hangs boards, and finishes joint tooling.',
      benchmark_note = 'Cambodia Market Benchmark: $20.00 – $25.00 / 8-hour shift'
  where assembly_id = v_assembly_id
    and role_label = 'Skilled Mason (Thmar)'
    and description is null;

  update public.dwl_assembly_crew
  set description = 'Transports boards and framing from the drop-zone, assists lifting into the ceiling grid, and moves scaffolding between work areas.',
      benchmark_note = 'Cambodia Market Benchmark: $13.00 – $16.00 / 8-hour shift'
  where assembly_id = v_assembly_id
    and role_label = 'General Helper (Kon-Keng)'
    and description is null;

  update public.dwl_assembly_equipment
  set description = 'Standard 2.0m rolling staging for reaching ceiling grid height.'
  where assembly_id = v_assembly_id
    and role_label = 'Mobile Stepladder & Baker Scaffold'
    and description is null;
end $$;

-- Migration: 20260716000001_tender_award_budget_conversion.sql
-- Purpose: Convert an awarded tender's BOQ + preliminaries into the project's QS budget
--          baseline (qs_boq_sections / qs_boq_items / qs_budget_revisions), idempotently,
--          via a single SECURITY DEFINER RPC function.
-- Depends on: tender_register, tender_boq_items, tender_preliminaries_items (already exist,
--             see 20260531000054_tender_management.sql, 20260531000055_tender_cost_estimation.sql,
--             20260711000006_tender_boq_items_qs_extension.sql,
--             20260711000007_tender_preliminaries_items.sql);
--             qs_boq_sections, qs_boq_items, qs_budget_revisions (already exist, see
--             20260531000023_create_qs_boq_tables.sql, 20260531000048_qs_core_depth.sql,
--             20260615000001_qs_data_integrity.sql)

-- ──────────────────────────────────────────────────────────────────
-- 1. New columns
-- ──────────────────────────────────────────────────────────────────

-- Track when/by whom a tender's budget was converted into the project baseline.
alter table public.tender_register
  add column if not exists budget_converted_at timestamptz,
  add column if not exists budget_converted_by uuid references auth.users(id);

-- Traceability from a QS BOQ item back to the tender line item it was seeded from.
alter table public.qs_boq_items
  add column if not exists source_tender_boq_item_id uuid references public.tender_boq_items(id) on delete set null,
  add column if not exists source_tender_prelim_item_id uuid references public.tender_preliminaries_items(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'qs_boq_items_source_tender_xor_check'
  ) then
    alter table public.qs_boq_items
      add constraint qs_boq_items_source_tender_xor_check
      check (
        source_tender_boq_item_id is null or source_tender_prelim_item_id is null
      );
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────────
-- 2. Partial unique indexes — the real idempotency guarantee.
--    A given tender BOQ / preliminaries line can only ever be converted once.
-- ──────────────────────────────────────────────────────────────────
create unique index if not exists idx_qs_boq_items_source_tender_boq_item
  on public.qs_boq_items(source_tender_boq_item_id)
  where source_tender_boq_item_id is not null;

create unique index if not exists idx_qs_boq_items_source_tender_prelim_item
  on public.qs_boq_items(source_tender_prelim_item_id)
  where source_tender_prelim_item_id is not null;

-- ──────────────────────────────────────────────────────────────────
-- 3. convert_tender_to_project_budget(p_tender_id, p_user_id)
--
-- Validates the tender is awarded, linked to a project, and not already converted,
-- then copies tender_boq_items + tender_preliminaries_items into qs_boq_sections /
-- qs_boq_items, seeding a qs_budget_revisions row (revision_number = 1) for every
-- item created so public.account_budget_vs_actual reflects the new baseline
-- immediately. Runs inside the implicit transaction of the calling rpc() — any
-- exception (including the unique-index violations above on re-run) rolls back
-- the whole conversion automatically.
-- ──────────────────────────────────────────────────────────────────
create or replace function public.convert_tender_to_project_budget(
  p_tender_id uuid,
  p_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tender               record;
  v_section              record;
  v_section_id           uuid;
  v_prelim_section_id    uuid;
  v_next_seq             int;
  v_sections_created     int := 0;
  v_items_created        int := 0;
  v_prelim_items_created int := 0;
  v_total_amount         numeric(18,2) := 0;
  v_item                 record;
  v_new_item_id          uuid;
  v_seq                  int;
  v_has_prelims          boolean;
begin
  select * into v_tender
  from public.tender_register
  where id = p_tender_id;

  if not found then
    raise exception 'Tender not found' using errcode = 'P0002';
  end if;

  if v_tender.status != 'awarded' then
    raise exception 'NOT_AWARDED: tender status must be awarded';
  end if;

  if v_tender.project_id is null then
    raise exception 'NO_PROJECT_LINKED: tender has no linked project';
  end if;

  if v_tender.budget_converted_at is not null then
    raise exception 'ALREADY_CONVERTED: tender budget was already converted at %', v_tender.budget_converted_at;
  end if;

  -- ── One qs_boq_sections row per distinct tender_boq_items.section ──
  for v_section in
    select distinct coalesce(nullif(trim(tbi.section), ''), 'General') as title
    from public.tender_boq_items tbi
    where tbi.tender_id = p_tender_id
  loop
    select id into v_section_id
    from public.qs_boq_sections
    where project_id = v_tender.project_id
      and title = v_section.title
    limit 1;

    if v_section_id is null then
      select coalesce(max(seq), 0) + 1 into v_next_seq
      from public.qs_boq_sections
      where project_id = v_tender.project_id;

      insert into public.qs_boq_sections (project_id, seq, title, baseline_status)
      values (v_tender.project_id, v_next_seq, v_section.title, 'draft')
      returning id into v_section_id;

      v_sections_created := v_sections_created + 1;
    end if;

    v_seq := 0;
    for v_item in
      select *
      from public.tender_boq_items tbi
      where tbi.tender_id = p_tender_id
        and coalesce(nullif(trim(tbi.section), ''), 'General') = v_section.title
      order by tbi.sort_order nulls last, tbi.item_code
    loop
      v_seq := v_seq + 1;

      insert into public.qs_boq_items (
        project_id, boq_section_id, wbs_node_id, seq,
        description, unit, quantity, unit_rate, notes,
        source_tender_boq_item_id, baseline_status
      ) values (
        v_tender.project_id, v_section_id, v_item.wbs_node_id, v_seq,
        v_item.description, v_item.unit, v_item.quantity, coalesce(v_item.unit_rate, 0), v_item.notes,
        v_item.id, 'draft'
      )
      returning id into v_new_item_id;

      v_items_created := v_items_created + 1;

      insert into public.qs_budget_revisions (
        project_id, boq_item_id, revision_number,
        prev_quantity, new_quantity, prev_unit_rate, new_unit_rate,
        prev_total, new_total, reason, revised_by, revised_at
      ) values (
        v_tender.project_id, v_new_item_id, 1,
        0, v_item.quantity, 0, coalesce(v_item.unit_rate, 0),
        0, coalesce(v_item.total_amount, 0),
        'Initial baseline from tender award ' || v_tender.tender_no,
        p_user_id, now()
      );

      v_total_amount := v_total_amount + coalesce(v_item.total_amount, 0);
    end loop;
  end loop;

  -- ── Preliminaries: single 'Preliminaries' section, only if the tender has any ──
  select exists (
    select 1 from public.tender_preliminaries_items where tender_id = p_tender_id
  ) into v_has_prelims;

  if v_has_prelims then
    select id into v_prelim_section_id
    from public.qs_boq_sections
    where project_id = v_tender.project_id
      and title = 'Preliminaries'
    limit 1;

    if v_prelim_section_id is null then
      select coalesce(max(seq), 0) + 1 into v_next_seq
      from public.qs_boq_sections
      where project_id = v_tender.project_id;

      insert into public.qs_boq_sections (project_id, seq, title, baseline_status)
      values (v_tender.project_id, v_next_seq, 'Preliminaries', 'draft')
      returning id into v_prelim_section_id;

      v_sections_created := v_sections_created + 1;
    end if;

    v_seq := 0;
    for v_item in
      select *
      from public.tender_preliminaries_items
      where tender_id = p_tender_id
      order by sort_order nulls last, code
    loop
      v_seq := v_seq + 1;

      insert into public.qs_boq_items (
        project_id, boq_section_id, seq,
        description, unit, quantity, unit_rate, notes,
        source_tender_prelim_item_id, baseline_status
      ) values (
        v_tender.project_id, v_prelim_section_id, v_seq,
        v_item.description, v_item.unit, v_item.quantity, coalesce(v_item.rate, 0), v_item.notes,
        v_item.id, 'draft'
      )
      returning id into v_new_item_id;

      v_prelim_items_created := v_prelim_items_created + 1;

      insert into public.qs_budget_revisions (
        project_id, boq_item_id, revision_number,
        prev_quantity, new_quantity, prev_unit_rate, new_unit_rate,
        prev_total, new_total, reason, revised_by, revised_at
      ) values (
        v_tender.project_id, v_new_item_id, 1,
        0, v_item.quantity, 0, coalesce(v_item.rate, 0),
        0, coalesce(v_item.amount, 0),
        'Initial baseline from tender award ' || v_tender.tender_no,
        p_user_id, now()
      );

      v_total_amount := v_total_amount + coalesce(v_item.amount, 0);
    end loop;
  end if;

  update public.tender_register
  set budget_converted_at = now(),
      budget_converted_by = p_user_id
  where id = p_tender_id;

  return jsonb_build_object(
    'sections_created', v_sections_created,
    'items_created', v_items_created,
    'prelim_items_created', v_prelim_items_created,
    'total_amount', v_total_amount,
    'project_id', v_tender.project_id
  );
end;
$$;

grant execute on function public.convert_tender_to_project_budget(uuid, uuid) to authenticated;

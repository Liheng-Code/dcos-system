-- Migration: 20260716000003_tender_award_budget_conversion_boq_header_fix.sql
-- Purpose: Fix a defect found in commercial-qs review of 20260716000001: the
--          conversion RPC created qs_boq_sections with boq_id = NULL. The only
--          existing QS baseline-approval path (updateBoqBaselineStatus, driven
--          from BoqBuilder) always filters by boq_id, so orphaned sections were
--          invisible to it and their items could never leave baseline_status
--          'draft'. This replaces convert_tender_to_project_budget so it
--          resolves (or creates, mirroring the backfill in
--          20260614000001_create_qs_boq_header.sql) an active qs_boq header for
--          the project and attaches every new/reused section to it.

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
  v_boq_id               uuid;
  v_last_boq_number      text;
  v_boq_number           text;
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

  -- ── Resolve (or create) the qs_boq header sections/items must attach to ──
  -- Prefer an 'active' header; fall back to the oldest header of any status;
  -- create one (mirroring the 20260614000001 backfill convention) if the
  -- project has none yet, which is the common case for a fresh award.
  select id into v_boq_id
  from public.qs_boq
  where project_id = v_tender.project_id
  order by (status = 'active') desc, created_at asc
  limit 1;

  if v_boq_id is null then
    select boq_number into v_last_boq_number
    from public.qs_boq
    where project_id = v_tender.project_id
    order by boq_number desc
    limit 1;

    if v_last_boq_number is null then
      v_boq_number := 'BOQ-001';
    else
      v_boq_number := 'BOQ-' || lpad((replace(v_last_boq_number, 'BOQ-', '')::int + 1)::text, 3, '0');
    end if;

    insert into public.qs_boq (project_id, boq_number, title, boq_type, status, created_by)
    values (v_tender.project_id, v_boq_number, 'Main Bill of Quantities', 'main_works', 'active', p_user_id)
    returning id into v_boq_id;
  end if;

  -- ── One qs_boq_sections row per distinct tender_boq_items.section ──
  for v_section in
    select distinct coalesce(nullif(trim(tbi.section), ''), 'General') as title
    from public.tender_boq_items tbi
    where tbi.tender_id = p_tender_id
  loop
    select id into v_section_id
    from public.qs_boq_sections
    where boq_id = v_boq_id
      and title = v_section.title
    limit 1;

    if v_section_id is null then
      select coalesce(max(seq), 0) + 1 into v_next_seq
      from public.qs_boq_sections
      where boq_id = v_boq_id;

      insert into public.qs_boq_sections (project_id, boq_id, seq, title, baseline_status)
      values (v_tender.project_id, v_boq_id, v_next_seq, v_section.title, 'draft')
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
    where boq_id = v_boq_id
      and title = 'Preliminaries'
    limit 1;

    if v_prelim_section_id is null then
      select coalesce(max(seq), 0) + 1 into v_next_seq
      from public.qs_boq_sections
      where boq_id = v_boq_id;

      insert into public.qs_boq_sections (project_id, boq_id, seq, title, baseline_status)
      values (v_tender.project_id, v_boq_id, v_next_seq, 'Preliminaries', 'draft')
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
    'project_id', v_tender.project_id,
    'boq_id', v_boq_id
  );
end;
$$;

grant execute on function public.convert_tender_to_project_budget(uuid, uuid) to authenticated;
revoke execute on function public.convert_tender_to_project_budget(uuid, uuid) from public, anon;

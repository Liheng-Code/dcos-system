-- Migration: 20261030173000_design_tables_project_member_rls.sql
-- Purpose: The remaining 16 design_* tables change from one "for all using (true) with check (true)" policy (any
--          authenticated user could read and change every project's design records) to project members only, the
--          same rule 20261030164500 gave design_mep_commissioning, design_mep_material_submittal and
--          design_coordination_log. Design has no role_permissions rows (lib/modules/manifests/design.ts), so the check
--          is is_project_member(project_id); it is true for admins.
-- Depends on: the 16 tables below (each has project_id uuid not null), is_project_member(uuid) (all exist)
-- Policy change only: no table, column or data change. All 16 tables held no rows: the screens inserted a random or
-- missing project_id that the projects FK / not-null rejected (fixed in the same change), so no existing access is lost.

do $$
declare
  r record;
  t text;
begin
  for r in
    select * from (values
      ('design_arc_door_schedule', 'design_arc_door_auth'),
      ('design_arc_finish_schedule', 'design_arc_fin_auth'),
      ('design_arc_material_approval', 'design_arc_mat_auth'),
      ('design_arc_room_data', 'design_arc_room_auth'),
      ('design_arc_window_schedule', 'design_arc_win_auth'),
      ('design_drawings', 'design_draw_auth'),
      ('design_mep_equipment', 'mep_equip_auth'),
      ('design_mep_load_schedule', 'mep_load_auth'),
      ('design_mep_sleeve_coordination', 'mep_slv_auth'),
      ('design_review_comments', 'design_rev_auth'),
      ('design_rfi', 'design_rfi_auth'),
      ('design_str_calc_notes', 'str_calc_auth'),
      ('design_str_design_changes', 'str_dc_auth'),
      ('design_str_model_register', 'str_model_auth'),
      ('design_str_rebar_review', 'str_rebar_auth'),
      ('design_str_technical_queries', 'str_tq_auth')
    ) as v(tbl, old_policy)
  loop
    t := r.tbl;
    if to_regclass('public.' || t) is null then
      continue;  -- table not present in this database
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', r.old_policy, t);
    execute format('drop policy if exists %I on public.%I', t || '_member_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_member_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_member_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_member_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_project_member(project_id))', t || '_member_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_project_member(project_id))', t || '_member_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_project_member(project_id)) with check (public.is_project_member(project_id))', t || '_member_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_project_member(project_id))', t || '_member_delete', t);
    execute format('create index if not exists %I on public.%I (project_id)', t || '_project_id_idx', t);
  end loop;
end $$;

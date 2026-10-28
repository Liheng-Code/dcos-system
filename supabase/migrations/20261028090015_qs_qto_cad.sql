-- QTO: CAD drawings (DXF now, DWG through a converter later). Additive only.
-- A revision records which file is measured (PDF or CAD), the DXF to read, its units and the frame
-- that maps model coordinates to sheet units (so saved points never move). Measurements keep the
-- CAD objects they came from as evidence.

-- 1. Drawing revisions
alter table public.qto_drawing_revisions
  add column if not exists source_format     text,
  add column if not exists cad_path          text,
  add column if not exists cad_units         text,
  add column if not exists cad_meta          jsonb,
  add column if not exists conversion_status text,
  add column if not exists conversion_error  text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'qto_drawing_revisions_source_format_chk') then
    alter table public.qto_drawing_revisions add constraint qto_drawing_revisions_source_format_chk
      check (source_format is null or source_format in ('pdf', 'dxf', 'dwg'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'qto_drawing_revisions_cad_units_chk') then
    alter table public.qto_drawing_revisions add constraint qto_drawing_revisions_cad_units_chk
      check (cad_units is null or cad_units in ('mm', 'cm', 'm', 'in', 'ft'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'qto_drawing_revisions_conversion_status_chk') then
    alter table public.qto_drawing_revisions add constraint qto_drawing_revisions_conversion_status_chk
      check (conversion_status is null or conversion_status in ('not_needed', 'pending', 'processing', 'done', 'failed'));
  end if;
end $$;

comment on column public.qto_drawing_revisions.source_format is 'File measured on screen: pdf, dxf (read in the browser) or dwg (needs conversion to DXF).';
comment on column public.qto_drawing_revisions.cad_path is 'qto-files path of the DXF to read: the upload itself, or the DXF converted from a DWG.';
comment on column public.qto_drawing_revisions.cad_units is 'Drawing units chosen at upload when the DXF has none ($INSUNITS = 0); null = use the file''s units.';
comment on column public.qto_drawing_revisions.cad_meta is 'Summary read at upload: version, units, bounds, frame {ox, oy, k} (model → sheet), layer and entity counts, skipped types.';

-- Backfill from the stored files.
update public.qto_drawing_revisions
   set source_format = case
         when pdf_path is not null or lower(coalesce(file_path, '')) like '%.pdf' then 'pdf'
         when lower(coalesce(file_path, '')) like '%.dxf' then 'dxf'
         when lower(coalesce(file_path, '')) like '%.dwg' or file_type = 'dwg' then 'dwg'
       end
 where source_format is null;
update public.qto_drawing_revisions set cad_path = file_path
 where source_format = 'dxf' and cad_path is null;
update public.qto_drawing_revisions
   set conversion_status = case source_format when 'dwg' then 'pending' else 'not_needed' end
 where conversion_status is null and source_format is not null;

-- 2. Calibrations: how the scale was set.
alter table public.qto_drawing_calibrations
  add column if not exists method text not null default 'manual';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'qto_drawing_calibrations_method_chk') then
    alter table public.qto_drawing_calibrations add constraint qto_drawing_calibrations_method_chk
      check (method in ('manual', 'preset', 'cad_units'));
  end if;
end $$;

-- 3. Session versions: which file the version is measured on (never mixed within a version).
alter table public.qto_session_versions
  add column if not exists source_format text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'qto_session_versions_source_format_chk') then
    alter table public.qto_session_versions add constraint qto_session_versions_source_format_chk
      check (source_format is null or source_format in ('pdf', 'dxf', 'dwg'));
  end if;
end $$;

-- 4. Measurements: the CAD objects they were taken from.
alter table public.qto_measurements
  add column if not exists source_format         text,
  add column if not exists source_entity_handles text[],
  add column if not exists source_layer          text,
  add column if not exists source_block          text,
  add column if not exists source_selection      jsonb;
comment on column public.qto_measurements.source_entity_handles is 'DXF entity handles the measurement was taken from (CAD pick / select similar).';
comment on column public.qto_measurements.source_selection is 'How the CAD objects were selected, e.g. {"by":"block","name":"D1","scope":"model"}.';

-- 5. A calibration may only be saved on a revision of the caller's own company.
create or replace function public.qto_require_revision(p_drawing_revision_id uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.qto_drawing_revisions r
                  where r.id = p_drawing_revision_id and public.qto_tenant_ok(r.tenant_id)) then
    raise exception 'QTO_NOT_FOUND: drawing revision not found' using errcode = 'P0001';
  end if;
end $$;
revoke all on function public.qto_require_revision(uuid) from public;

-- Same rules as before, plus the revision check (a user of another company could save a scale on
-- someone else's revision).
create or replace function public.qto_save_calibration(
  p_drawing_revision_id uuid,
  p_page_no             integer,
  p_points              jsonb,
  p_pixel_distance      numeric,
  p_known_distance      numeric,
  p_known_unit          text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_id     uuid;
  v_metres numeric;
begin
  perform public.qto_require_permission('qto_workspace', 'edit');
  v_tenant := public.qto_require_tenant();
  perform public.qto_require_revision(p_drawing_revision_id);
  if p_known_unit not in ('mm', 'cm', 'm') then
    raise exception 'QTO_VALIDATION: calibration unit must be mm, cm or m' using errcode = 'P0001';
  end if;
  if coalesce(p_pixel_distance, 0) <= 0 or coalesce(p_known_distance, 0) <= 0 then
    raise exception 'QTO_VALIDATION: calibration distances must be greater than zero' using errcode = 'P0001';
  end if;
  v_metres := p_known_distance * case p_known_unit when 'mm' then 0.001 when 'cm' then 0.01 else 1 end;

  update public.qto_drawing_calibrations set is_active = false
   where drawing_revision_id = p_drawing_revision_id and page_no = coalesce(p_page_no, 1) and is_active;
  insert into public.qto_drawing_calibrations (tenant_id, drawing_revision_id, page_no, points, pixel_distance,
                                               known_distance, known_unit, metres_per_unit)
  values (v_tenant, p_drawing_revision_id, coalesce(p_page_no, 1), p_points, p_pixel_distance, p_known_distance,
          p_known_unit, v_metres / p_pixel_distance)
  returning id into v_id;
  return v_id;
end $$;

-- 6. Scale from the CAD units: same rules as qto_save_calibration, recorded as method cad_units.
create or replace function public.qto_save_cad_calibration(
  p_drawing_revision_id uuid,
  p_metres_per_unit     numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_id     uuid;
begin
  perform public.qto_require_permission('qto_workspace', 'edit');
  v_tenant := public.qto_require_tenant();
  perform public.qto_require_revision(p_drawing_revision_id);
  if coalesce(p_metres_per_unit, 0) <= 0 then
    raise exception 'QTO_VALIDATION: the drawing units must give a positive scale' using errcode = 'P0001';
  end if;
  update public.qto_drawing_calibrations set is_active = false
   where drawing_revision_id = p_drawing_revision_id and page_no = 1 and is_active;
  insert into public.qto_drawing_calibrations (tenant_id, drawing_revision_id, page_no, points, pixel_distance,
                                               known_distance, known_unit, metres_per_unit, method)
  values (v_tenant, p_drawing_revision_id, 1, '[{"x":0,"y":0},{"x":1000,"y":0}]'::jsonb, 1000,
          1000 * p_metres_per_unit, 'm', p_metres_per_unit, 'cad_units')
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.qto_save_cad_calibration(uuid, numeric) from public;
grant execute on function public.qto_save_cad_calibration(uuid, numeric) to authenticated;

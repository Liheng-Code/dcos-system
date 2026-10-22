-- Ensure the frozen snapshot header reflects the version number assigned during publish.
create or replace function public.publish_qs_wbs_template(p_template_id uuid)
returns public.qs_wbs_templates
language plpgsql
as $$
declare
  v_template public.qs_wbs_templates;
  v_snapshot jsonb;
  v_next_version integer;
begin
  if not public.can_manage_master_libraries() then
    raise exception 'You do not have permission to publish QS WBS templates';
  end if;
  select * into v_template from public.qs_wbs_templates where id = p_template_id for update;
  if not found then raise exception 'QS WBS template not found'; end if;
  if v_template.lifecycle_status <> 'draft' then
    raise exception 'Only draft QS WBS templates can be published';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_template.template_code, 0));
  select coalesce(max(version), 0) + 1 into v_next_version
    from public.qs_wbs_templates
    where template_code = v_template.template_code and lifecycle_status <> 'draft';
  v_snapshot := jsonb_build_object(
    'header', jsonb_set(
      jsonb_set(to_jsonb(v_template) - 'published_snapshot', '{version}', to_jsonb(v_next_version), true),
      '{lifecycle_status}', '"published"'::jsonb, true
    ),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.sort_order, i.item_code)
      from public.qs_wbs_template_items i where i.template_id = v_template.id and i.is_active), '[]'::jsonb),
    'locations', coalesce((select jsonb_agg(to_jsonb(l) order by l.sort_order, l.level_code)
      from public.qs_wbs_template_locations l where l.template_id = v_template.id), '[]'::jsonb)
  );

  update public.qs_wbs_templates
  set lifecycle_status = 'superseded', superseded_by_template_id = p_template_id,
      is_active = false, updated_at = now()
  where template_code = v_template.template_code and lifecycle_status = 'published';

  update public.qs_wbs_templates
  set version = v_next_version, lifecycle_status = 'published', is_active = true,
      published_at = now(), published_by = auth.uid(), published_snapshot = v_snapshot,
      archived_at = null, updated_at = now()
  where id = p_template_id returning * into v_template;
  return v_template;
end;
$$;

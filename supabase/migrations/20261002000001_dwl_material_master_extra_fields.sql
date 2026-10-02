-- Material Master: record density, compressive strength and effective date on
-- the material itself (Material Register template, docs/04-Business-Modules/
-- 12-Quantity-Surveying/16-Material Register.md). Free text for density and
-- strength because manufacturers quote ranges ("~1,000-1,400 kg/m3").
-- Additive and idempotent; the view only gains trailing columns.
alter table public.dwl_material_attributes
  add column if not exists density text,
  add column if not exists compressive_strength text,
  add column if not exists effective_date date;

-- Rebuild the view from its live definition, appending the new columns after
-- the last existing one (photo_count) so column positions are preserved.
do $$
declare
  v_def text;
begin
  v_def := pg_get_viewdef('public.dwl_v_materials'::regclass, true);
  if v_def !~ 'AS photo_count' or v_def ~ 'a\.compressive_strength' then
    return;
  end if;
  v_def := regexp_replace(
    v_def, 'AS photo_count',
    E'AS photo_count,\n    a.density,\n    a.compressive_strength,\n    a.effective_date');
  execute 'create or replace view public.dwl_v_materials with (security_invoker = true) as ' || v_def;
end $$;

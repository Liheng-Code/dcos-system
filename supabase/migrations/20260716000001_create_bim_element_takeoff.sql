-- BIM Viewer Module: per-element BoQ takeoff staging data, extracted from IFC
-- Property Sets/Quantities on user demand ("Extract for Takeoff"). Non-destructive
-- staging table — a human later reviews/aggregates these rows into a real BOQ
-- (qs_boq_items / tender_boq_items). See bim_models / bim_element_wbs_map in
-- 20260717000001_create_bim_tables.sql for the conventions mirrored here.

CREATE TABLE IF NOT EXISTS public.bim_element_takeoff (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  model_id       uuid NOT NULL REFERENCES public.bim_models(id) ON DELETE CASCADE,
  global_id      text NOT NULL,
  ifc_class      text,
  building_name  text,
  discipline     text,
  building_code  text,
  sequence       text,
  building_level text,   -- Reference Level
  level          text,   -- BoQLevel (kept distinct from building_level: Reference Level is the
                          -- Revit host-level attribute, BoQLevel is the estimator's QTO reporting
                          -- level — they can legitimately differ)
  section        text,
  sub_section    text,   -- Type Comments
  sub_element    text,   -- SubElement_* (prefix match, e.g. SubElement_Concrete)
  material_type  text,   -- Material_* (prefix match, e.g. Material_Concrete)
  element_type   text,   -- Type
  element_group  text,   -- ElementGroup_* (prefix match, e.g. ElementGroup_Concrete)
  element_id     text,   -- Element ID (Revit's source ID string, distinct from id/global_id)
  description    text,
  unit           text,   -- Unit_Volume
  quantity       numeric(18,4),
  raw_properties jsonb NOT NULL DEFAULT '{}',
  extracted_by   uuid NOT NULL REFERENCES public.profiles(id),
  extracted_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(model_id, global_id)
);

ALTER TABLE public.bim_element_takeoff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bim_element_takeoff_auth_all" ON public.bim_element_takeoff
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_bim_takeoff_model  ON public.bim_element_takeoff(model_id);
CREATE INDEX idx_bim_takeoff_tenant ON public.bim_element_takeoff(tenant_id);

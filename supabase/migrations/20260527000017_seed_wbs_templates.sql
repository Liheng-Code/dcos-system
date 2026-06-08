-- Seed WBS templates
insert into public.wbs_templates (template_name, template_desc, node_type_chain) values
(
  'Building Construction',
  'Standard building hierarchy: Project → Building → Level → Zone → Room → Element',
  '["building", "level", "zone", "room", "element"]'::jsonb
),
(
  'Infrastructure / Civil',
  'Linear infrastructure hierarchy: Project → Section → Segment → Structure → Component → Element',
  '["section", "segment", "structure", "component", "element"]'::jsonb
),
(
  'Industrial / Plant',
  'Industrial plant hierarchy: Project → Area → System → Subsystem → Equipment → Element',
  '["area", "system", "subsystem", "equipment", "element"]'::jsonb
);

-- ============================================================
-- Update level naming templates to new LevelEntry[] format
-- Replaces the old per-type pattern config with an ordered
-- list of { code, name } entries.
-- ============================================================

update public.level_naming_templates
set config = '[
  {"code": "B01", "name": "Basement 2"},
  {"code": "B02", "name": "Basement 1"},
  {"code": "G00", "name": "Ground Floor"},
  {"code": "L01", "name": "Level 1"},
  {"code": "L02", "name": "Level 2"},
  {"code": "L03", "name": "Level 3"},
  {"code": "PH01", "name": "Penthouse 1"},
  {"code": "R00", "name": "Roof"}
]'::jsonb
where template_name = 'SEQ Standard';

update public.level_naming_templates
set config = '[
  {"code": "B1", "name": "Basement 2"},
  {"code": "B2", "name": "Basement 1"},
  {"code": "GF", "name": "Ground Floor"},
  {"code": "1F", "name": "Level 1"},
  {"code": "2F", "name": "Level 2"},
  {"code": "3F", "name": "Level 3"},
  {"code": "PH1", "name": "Penthouse 1"},
  {"code": "RF", "name": "Roof"}
]'::jsonb
where template_name = 'Asian Convention';

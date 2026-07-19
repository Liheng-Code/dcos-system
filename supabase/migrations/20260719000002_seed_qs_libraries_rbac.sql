-- QS Libraries: single permission action for all library pages
-- Covers: Cost Library, Rate Libraries, Budget Codes, Prelim Cost Library, Unit Rate Library

INSERT INTO public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, transmit, configure, reassign, scope)
VALUES
  -- QS Libraries (module = 'qs', action = 'qs_libraries')
  ('L0',      'qs','qs_libraries', true,  true,  true,  true,  false, false, false, true,  false, true,  false, 'company'),
  ('L1',      'qs','qs_libraries', true,  true,  true,  true,  false, false, false, true,  false, true,  false, 'company'),
  ('L2',      'qs','qs_libraries', true,  true,  true,  true,  false, false, false, true,  false, false, false, 'company'),
  ('L3',      'qs','qs_libraries', true,  false, false, false, false, false, false, false, false, false, false, 'company'),
  ('QS',      'qs','qs_libraries', true,  true,  true,  true,  false, false, false, true,  false, true,  false, 'company'),
  ('AC',      'qs','qs_libraries', true,  false, false, false, false, false, false, false, false, false, false, 'company'),
  ('PO',      'qs','qs_libraries', true,  false, false, false, false, false, false, false, false, false, false, 'company'),
  ('L4',      'qs','qs_libraries', true,  false, false, false, false, false, false, false, false, false, false, 'company'),
  ('L5',      'qs','qs_libraries', true,  true,  true,  true,  false, false, false, true,  false, false, false, 'company'),
  ('L6',      'qs','qs_libraries', true,  true,  true,  true,  false, false, false, true,  false, false, false, 'company'),
  ('EXT-CLT', 'qs','qs_libraries', true,  false, false, false, false, false, false, false, false, false, false, 'company'),
  ('EXT-CON', 'qs','qs_libraries', true,  false, false, false, false, false, false, false, false, false, false, 'company'),
  ('EXT-SUB', 'qs','qs_libraries', false, false, false, false, false, false, false, false, false, false, false, null)
ON CONFLICT (role_code, module, action) DO NOTHING;

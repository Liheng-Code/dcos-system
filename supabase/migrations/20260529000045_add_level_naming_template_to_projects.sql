-- ============================================================
-- Link level naming template to project
-- ============================================================

alter table public.projects
  add column level_naming_template_id uuid references public.level_naming_templates(id) on delete set null;

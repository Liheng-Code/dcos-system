-- ============================================================
-- Level Naming Templates
-- ============================================================

create table if not exists public.level_naming_templates (
  id              uuid primary key default gen_random_uuid(),
  template_name   text not null unique,
  description     text,
  is_active       boolean not null default true,
  config          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ============================================================
-- RLS
-- ============================================================
alter table public.level_naming_templates enable row level security;

create policy "Authenticated users can view level naming templates"
  on public.level_naming_templates for select to authenticated using (true);

create policy "Authenticated users can manage level naming templates"
  on public.level_naming_templates for all to authenticated using (true) with check (true);

-- ============================================================
-- Seed: SEQ Standard (current hardcoded behavior)
-- ============================================================
insert into public.level_naming_templates (template_name, description, config) values
(
  'SEQ Standard',
  'Sequential numbering with two-digit padding: B01, G00, L01, L02, ..., PH01, R00',
  '{
    "basement":  {"prefix": "B", "suffix": "", "pad": 2, "start": 1, "increment": 1, "label": "Basement {n}"},
    "ground":    {"prefix": "G", "suffix": "", "pad": 2, "label": "Ground Floor"},
    "upper":     {"prefix": "L", "suffix": "", "pad": 2, "start": 1, "increment": 1, "label": "Level {n}"},
    "penthouse": {"prefix": "PH", "suffix": "", "pad": 2, "start": 1, "increment": 1, "label": "Penthouse {n}"},
    "roof":      {"prefix": "R", "suffix": "", "pad": 2, "label": "Roof Level"}
  }'::jsonb
),
(
  'Asian Convention',
  'Single-digit basement, GF for ground, number+F for upper levels: B1, GF, 1F, 2F, ..., PH1, RF',
  '{
    "basement":  {"prefix": "B", "suffix": "", "pad": 1, "start": 1, "increment": 1, "label": "Basement {n}"},
    "ground":    {"prefix": "GF", "suffix": "", "pad": 0, "label": "Ground Floor"},
    "upper":     {"prefix": "",  "suffix": "F", "pad": 1, "start": 1, "increment": 1, "label": "Level {n}"},
    "penthouse": {"prefix": "PH", "suffix": "", "pad": 1, "start": 1, "increment": 1, "label": "Penthouse {n}"},
    "roof":      {"prefix": "RF", "suffix": "", "pad": 0, "label": "Roof Level"}
  }'::jsonb
);

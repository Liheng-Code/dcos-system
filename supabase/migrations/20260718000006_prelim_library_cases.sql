-- ============================================================
-- 026 — Prelim Library Cases (named parameter sets)
-- ============================================================
-- Each case stores P01–P12 for a specific project scenario.
-- Library items (prelim_library_items) stay global/shared.

create table if not exists prelim_library_cases (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                          -- e.g. "Hattha", "General Dept of Taxation"
  params      jsonb not null default '{}'::jsonb,     -- { P01: 130, P02: 800, ... }
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table prelim_library_cases enable row level security;

create policy "Allow all for authenticated" on prelim_library_cases
  for all using (auth.role() = 'authenticated');

-- seed one default case with current DEFAULT_SITE_DATA values
insert into prelim_library_cases (name, params, is_default)
values (
  'Default',
  '{
    "P01": 130, "P02": 800, "P03": 115, "P04": 10,
    "P05": 36,  "P06": 4140, "P07": 18,  "P08": 10,
    "P09": 12,  "P10": 80,   "P11": 11,  "P12": 8000
  }'::jsonb,
  true
);

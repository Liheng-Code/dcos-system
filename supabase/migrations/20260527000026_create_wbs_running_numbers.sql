-- ============================================================
-- Phase 2 — WBS Running Numbers (auto-increment per project)
-- ============================================================

create table if not exists public.wbs_running_numbers (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  building_code     text not null check (building_code ~ '^B[A-Z]$'),
  level_code        text not null,
  discipline_code   text not null check (discipline_code ~ '^[A-Z]{2,4}$'),
  last_sequence     integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique(project_id, building_code, level_code, discipline_code),
  constraint seq_non_negative check (last_sequence >= 0)
);

-- ============================================================
-- RLS
-- ============================================================
alter table public.wbs_running_numbers enable row level security;

create policy "Authenticated users can view WBS running numbers"
  on public.wbs_running_numbers for select to authenticated using (true);
create policy "Authenticated users can manage WBS running numbers"
  on public.wbs_running_numbers for all to authenticated using (true) with check (true);

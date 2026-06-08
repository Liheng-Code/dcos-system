-- ============================================================
-- Phase 4 — Budget Package Integration
-- ============================================================

-- Add selected_sections to existing project_budget_settings
alter table public.project_budget_settings
  add column if not exists selected_sections jsonb not null default '[]'::jsonb;

-- Budget running numbers for PR/PO/VO auto-numbering
create table if not exists public.budget_running_numbers (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects(id) on delete cascade,
  budget_section      text not null,
  package_number      integer not null default 0,
  document_type       text not null check (document_type in ('PR', 'PO', 'VO')),
  last_sequence       integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique(project_id, budget_section, package_number, document_type),
  constraint budget_seq_non_negative check (last_sequence >= 0)
);

-- ============================================================
-- RLS
-- ============================================================
alter table public.budget_running_numbers enable row level security;

create policy "Authenticated users can view budget running numbers"
  on public.budget_running_numbers for select to authenticated using (true);
create policy "Authenticated users can manage budget running numbers"
  on public.budget_running_numbers for all to authenticated using (true) with check (true);

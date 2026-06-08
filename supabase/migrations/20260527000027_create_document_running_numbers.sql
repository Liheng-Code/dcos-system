-- ============================================================
-- Phase 3 — Document Running Numbers + Numbering Rules scope
-- ============================================================

-- Add running_number_scope to existing project_numbering_rules
alter table public.project_numbering_rules
  add column if not exists running_number_scope text not null default 'per_discipline'
  check (running_number_scope in ('per_project', 'per_discipline', 'per_doc_type'));

-- Document running numbers for auto-incrementing document codes
create table if not exists public.document_running_numbers (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects(id) on delete cascade,
  discipline_code     text,
  document_type_code  text,
  last_sequence       integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique(project_id, discipline_code, document_type_code),
  constraint doc_seq_non_negative check (last_sequence >= 0)
);

-- ============================================================
-- RLS
-- ============================================================
alter table public.document_running_numbers enable row level security;

create policy "Authenticated users can view document running numbers"
  on public.document_running_numbers for select to authenticated using (true);
create policy "Authenticated users can manage document running numbers"
  on public.document_running_numbers for all to authenticated using (true) with check (true);

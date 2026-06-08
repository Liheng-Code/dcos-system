-- ============================================================
-- Phase 5 — Transmittal System
-- ============================================================

create table if not exists public.transmittals (
  id                      uuid primary key default gen_random_uuid(),
  project_id              uuid not null references public.projects(id) on delete cascade,
  transmittal_code        text not null,
  issuer_company_id       uuid not null references public.companies(id),
  receiver_stakeholder_id uuid not null references public.stakeholders(id),
  subject                 text,
  status                  text not null default 'draft' check (status in ('draft', 'sent')),
  sent_at                 timestamptz,
  created_by              uuid not null references public.profiles(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique(project_id, transmittal_code)
);

create table if not exists public.transmittal_documents (
  id              uuid primary key default gen_random_uuid(),
  transmittal_id  uuid not null references public.transmittals(id) on delete cascade,
  document_id     uuid not null references public.documents(id),
  created_at      timestamptz not null default now(),
  unique(transmittal_id, document_id)
);

create table if not exists public.transmittal_running_numbers (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade unique,
  last_sequence     integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint trans_seq_non_negative check (last_sequence >= 0)
);

-- ============================================================
-- RLS
-- ============================================================
alter table public.transmittals enable row level security;
alter table public.transmittal_documents enable row level security;
alter table public.transmittal_running_numbers enable row level security;

create policy "Authenticated users can view transmittals"
  on public.transmittals for select to authenticated using (true);
create policy "Authenticated users can manage transmittals"
  on public.transmittals for all to authenticated using (true) with check (true);

create policy "Authenticated users can view transmittal documents"
  on public.transmittal_documents for select to authenticated using (true);
create policy "Authenticated users can manage transmittal documents"
  on public.transmittal_documents for all to authenticated using (true) with check (true);

create policy "Authenticated users can view transmittal running numbers"
  on public.transmittal_running_numbers for select to authenticated using (true);
create policy "Authenticated users can manage transmittal running numbers"
  on public.transmittal_running_numbers for all to authenticated using (true) with check (true);

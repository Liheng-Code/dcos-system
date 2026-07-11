-- Budget Code Master Classification — extends Tender Cost Estimation (Module #08)
-- Enterprise-wide elemental cost classification (A.00-Z.70 style), reused across tenders.
-- Mirrors unit_rate_library's "enterprise reusable library" pattern.

-- ── BUDGET CODE GROUPS (top-level letters) ──
create table if not exists public.budget_code_groups (
  code_letter     text primary key,
  name            text not null,
  sort_order      integer not null default 0
);

alter table public.budget_code_groups enable row level security;
create policy "Auth users can view budget code groups"
  on public.budget_code_groups for select to authenticated using (true);
create policy "Auth users can manage budget code groups"
  on public.budget_code_groups for insert to authenticated with check (true);
create policy "Auth users can update budget code groups"
  on public.budget_code_groups for update to authenticated using (true) with check (true);
create policy "Auth users can delete budget code groups"
  on public.budget_code_groups for delete to authenticated using (true);

-- ── BUDGET CODES (elemental classification, e.g. B.01, Z.01.01) ──
create table if not exists public.budget_codes (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  code_letter     text not null references public.budget_code_groups(code_letter) on delete restrict,
  parent_code_id  uuid references public.budget_codes(id) on delete restrict,
  code_level      smallint not null default 2 check (code_level in (2, 3)),
  description     text not null,
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_budget_codes_letter on public.budget_codes(code_letter);
create index if not exists idx_budget_codes_parent on public.budget_codes(parent_code_id);

alter table public.budget_codes enable row level security;
create policy "Auth users can view budget codes"
  on public.budget_codes for select to authenticated using (true);
create policy "Auth users can manage budget codes"
  on public.budget_codes for insert to authenticated with check (true);
create policy "Auth users can update budget codes"
  on public.budget_codes for update to authenticated using (true) with check (true);
create policy "Auth users can delete budget codes"
  on public.budget_codes for delete to authenticated using (true);

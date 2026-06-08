-- Procurement Module Tables — Phase 3 (Invoice Matching / Financial Close)

-- 12. Invoice Matches
create table if not exists public.procurement_invoice_matches (
  id                  uuid primary key default gen_random_uuid(),
  po_id               uuid not null references public.procurement_pos(id) on delete cascade,
  supplier_id         uuid not null references public.procurement_suppliers(id) on delete restrict,
  invoice_ref         text not null,
  invoice_date        date not null,
  invoice_amount      numeric not null,
  matched_gr_amount   numeric not null default 0,
  matched_po_amount   numeric not null default 0,
  variance_amount     numeric not null default 0,
  variance_reason     text,
  status              text not null default 'pending' check (status in ('pending', 'matched', 'variance_detected', 'approved', 'rejected')),
  approved_by         uuid references public.profiles(id) on delete set null,
  approved_at         timestamptz,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Add "under_invoice_match" to PO status constraint
alter table public.procurement_pos
  drop constraint if exists procurement_pos_status_check;

alter table public.procurement_pos
  add constraint procurement_pos_status_check
    check (status in ('draft', 'submitted', 'approved', 'issued', 'partially_delivered', 'delivered', 'under_invoice_match', 'closed', 'on_hold', 'cancelled'));

-- Enable RLS
alter table public.procurement_invoice_matches enable row level security;

-- RLS Policies
create policy "Authenticated users can view invoice matches"
  on public.procurement_invoice_matches for select to authenticated using (true);
create policy "Authenticated users can insert invoice matches"
  on public.procurement_invoice_matches for insert to authenticated with check (true);
create policy "Authenticated users can update invoice matches"
  on public.procurement_invoice_matches for update to authenticated using (true);
create policy "Authenticated users can delete invoice matches"
  on public.procurement_invoice_matches for delete to authenticated using (true);

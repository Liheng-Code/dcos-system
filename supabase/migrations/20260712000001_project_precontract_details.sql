-- Pre-contract project details table.
-- A pre-contract project (project_type = 'tender') IS the tender.
-- This table stores tender-specific fields that don't belong on the base projects table.

create table if not exists public.project_precontract_details (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null unique references public.projects(id) on delete cascade,
  tender_register_id  uuid references public.tender_register(id) on delete set null,

  -- Tender / Procurement
  tender_type         text check (tender_type in ('open','selective','negotiated','restricted')),
  procurement_method  text check (procurement_method in ('public_bid','limited_bid','direct_negotiation','framework')),
  submission_deadline timestamptz,
  tender_days         integer,

  -- Bid Pricing (denormalized from tender_bid_summaries for quick access)
  estimated_value     numeric(15,2),
  bid_price           numeric(15,2),
  bid_currency        text not null default 'USD',

  -- Award tracking
  award_status        text not null default 'pending'
                      check (award_status in ('pending','submitted','evaluated','awarded','lost','cancelled')),
  award_date          date,
  winning_bidder      uuid references public.profiles(id) on delete set null,
  loss_reason         text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Index for quick lookups by project
create index if not exists idx_precontract_project on public.project_precontract_details(project_id);

-- RLS
alter table public.project_precontract_details enable row level security;

create policy "Auth users can view precontract details"
  on public.project_precontract_details for select to authenticated using (true);

create policy "Auth users can insert precontract details"
  on public.project_precontract_details for insert to authenticated with check (true);

create policy "Auth users can update precontract details"
  on public.project_precontract_details for update to authenticated using (true) with check (true);

create policy "Auth users can delete precontract details"
  on public.project_precontract_details for delete to authenticated using (true);

-- Auto-update updated_at
create or replace function public.set_precontract_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger precontract_details_updated_at
  before update on public.project_precontract_details
  for each row execute function public.set_precontract_updated_at();

-- Tender Management — Module #07
-- Tender register, invitations, addenda, queries, submissions

-- ── TENDER REGISTER ──
create table if not exists public.tender_register (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid references public.projects(id) on delete set null,
  tender_no       text not null,
  title           text not null,
  description     text,
  tender_type     text not null check (tender_type in ('open','selective','negotiated','restricted')),
  status          text not null default 'draft' check (status in ('draft','published','invitation','submission','evaluation','awarded','cancelled','closed')),
  budget_range    numeric(15,2),
  currency        text not null default 'USD',
  issue_date      date,
  submission_deadline timestamptz,
  extension_date  timestamptz,
  tender_days     integer,
  procurement_method text check (procurement_method in ('public_bid','limited_bid','direct_negotiation','framework')),
  estimated_value numeric(15,2),
  project_location text,
  notes           text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(tender_no)
);

create index if not exists idx_tender_reg_status on public.tender_register(status);
create index if not exists idx_tender_reg_project on public.tender_register(project_id);
alter table public.tender_register enable row level security;
create policy "Authenticated users can view tenders"
  on public.tender_register for select to authenticated using (true);
create policy "Authenticated users can insert tenders"
  on public.tender_register for insert to authenticated with check (true);
create policy "Authenticated users can update tenders"
  on public.tender_register for update to authenticated using (true) with check (true);

-- ── TENDER INVITATIONS (for selective/restricted) ──
create table if not exists public.tender_invitations (
  id              uuid primary key default gen_random_uuid(),
  tender_id       uuid not null references public.tender_register(id) on delete cascade,
  supplier_id     uuid references public.procurement_suppliers(id) on delete set null,
  company_name    text not null,
  contact_person  text,
  email           text,
  invited_date    date not null default current_date,
  response_date   date,
  response        text check (response in ('accepted','declined','no_response')),
  bid_submitted   boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists idx_tender_inv_tender on public.tender_invitations(tender_id);
alter table public.tender_invitations enable row level security;
create policy "Auth users can view invitations"
  on public.tender_invitations for select to authenticated using (true);
create policy "Auth users can manage invitations"
  on public.tender_invitations for insert to authenticated with check (true);
create policy "Auth users can update invitations"
  on public.tender_invitations for update to authenticated using (true) with check (true);

-- ── TENDER ADDENDA ──
create table if not exists public.tender_addenda (
  id              uuid primary key default gen_random_uuid(),
  tender_id       uuid not null references public.tender_register(id) on delete cascade,
  addendum_no     text not null,
  title           text not null,
  description     text not null,
  issue_date      date not null default current_date,
  attachment_url  text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique(tender_id, addendum_no)
);

create index if not exists idx_tender_add_tender on public.tender_addenda(tender_id);
alter table public.tender_addenda enable row level security;
create policy "Auth users can view addenda"
  on public.tender_addenda for select to authenticated using (true);
create policy "Auth users can manage addenda"
  on public.tender_addenda for insert to authenticated with check (true);

-- ── TENDER QUERIES (Q&A) ──
create table if not exists public.tender_queries (
  id              uuid primary key default gen_random_uuid(),
  tender_id       uuid not null references public.tender_register(id) on delete cascade,
  query_no        text not null,
  question        text not null,
  answer          text,
  asked_by        text,
  is_confidential boolean not null default false,
  asked_date      date not null default current_date,
  answered_date   date,
  answered_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique(tender_id, query_no)
);

create index if not exists idx_tender_q_tender on public.tender_queries(tender_id);
alter table public.tender_queries enable row level security;
create policy "Auth users can view queries"
  on public.tender_queries for select to authenticated using (true);
create policy "Auth users can manage queries"
  on public.tender_queries for insert to authenticated with check (true);
create policy "Auth users can update queries"
  on public.tender_queries for update to authenticated using (true) with check (true);

-- ── TENDER SUBMISSIONS ──
create table if not exists public.tender_submissions (
  id              uuid primary key default gen_random_uuid(),
  tender_id       uuid not null references public.tender_register(id) on delete cascade,
  invitation_id   uuid references public.tender_invitations(id) on delete set null,
  bidder_name     text not null,
  submitted_date  timestamptz not null default now(),
  bid_amount      numeric(15,2) not null default 0,
  currency        text not null default 'USD',
  is_alternative  boolean not null default false,
  alternative_details text,
  submission_status text not null default 'submitted' check (submission_status in ('submitted','responsive','non_responsive','evaluated','shortlisted','withdrawn')),
  documents_url   text,
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_tender_sub_tender on public.tender_submissions(tender_id);
alter table public.tender_submissions enable row level security;
create policy "Auth users can view submissions"
  on public.tender_submissions for select to authenticated using (true);
create policy "Auth users can manage submissions"
  on public.tender_submissions for insert to authenticated with check (true);
create policy "Auth users can update submissions"
  on public.tender_submissions for update to authenticated using (true) with check (true);

-- ── TENDER SUBMISSION ITEMS (priced line items) ──
create table if not exists public.tender_submission_items (
  id              uuid primary key default gen_random_uuid(),
  submission_id   uuid not null references public.tender_submissions(id) on delete cascade,
  item_code       text not null,
  description     text,
  unit            text not null default 'ea',
  quantity        numeric(15,2) not null default 0,
  unit_rate       numeric(15,2) not null default 0,
  amount          numeric(15,2) generated always as (quantity * unit_rate) stored,
  created_at      timestamptz not null default now()
);

create index if not exists idx_tsi_sub on public.tender_submission_items(submission_id);
alter table public.tender_submission_items enable row level security;
create policy "Auth users can view submission items"
  on public.tender_submission_items for select to authenticated using (true);
create policy "Auth users can manage submission items"
  on public.tender_submission_items for insert to authenticated with check (true);

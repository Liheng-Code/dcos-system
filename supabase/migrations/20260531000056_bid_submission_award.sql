-- Bid Submission & Award — Module #09
-- Bid evaluation, comparison, award recommendations

-- ── BID EVALUATION ──
create table if not exists public.bid_evaluations (
  id              uuid primary key default gen_random_uuid(),
  tender_id       uuid not null references public.tender_register(id) on delete cascade,
  evaluation_no   text not null,
  method          text not null check (method in ('lowest_price','weighted_score','quality_cost','single_stage','two_stage')),
  evaluators      jsonb default '[]',
  criteria        jsonb not null default '[
    {"name": "Price", "weight": 60},
    {"name": "Technical", "weight": 20},
    {"name": "Experience", "weight": 10},
    {"name": "Schedule", "weight": 10}
  ]',
  status          text not null default 'draft' check (status in ('draft','in_progress','completed','approved')),
  summary         text,
  recommendation  text,
  recommended_bidder_id uuid references public.tender_submissions(id) on delete set null,
  completed_by    uuid references public.profiles(id) on delete set null,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(tender_id, evaluation_no)
);

create index if not exists idx_be_tender on public.bid_evaluations(tender_id);
alter table public.bid_evaluations enable row level security;
create policy "Auth users can view evaluations"
  on public.bid_evaluations for select to authenticated using (true);
create policy "Auth users can manage evaluations"
  on public.bid_evaluations for insert to authenticated with check (true);
create policy "Auth users can update evaluations"
  on public.bid_evaluations for update to authenticated using (true) with check (true);

-- ── BID EVALUATION SCORES (per bidder per criterion) ──
create table if not exists public.bid_evaluation_scores (
  id              uuid primary key default gen_random_uuid(),
  evaluation_id   uuid not null references public.bid_evaluations(id) on delete cascade,
  submission_id   uuid not null references public.tender_submissions(id) on delete cascade,
  criterion_name  text not null,
  score           numeric(5,2) not null check (score >= 0 and score <= 100),
  weight          numeric(5,2) not null,
  weighted_score  numeric(8,2) generated always as (score * weight / 100) stored,
  comments        text,
  scorer          uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique(evaluation_id, submission_id, criterion_name)
);

create index if not exists idx_bes_eval on public.bid_evaluation_scores(evaluation_id);
alter table public.bid_evaluation_scores enable row level security;
create policy "Auth users can view scores"
  on public.bid_evaluation_scores for select to authenticated using (true);
create policy "Auth users can manage scores"
  on public.bid_evaluation_scores for insert to authenticated with check (true);
create policy "Auth users can update scores"
  on public.bid_evaluation_scores for update to authenticated using (true) with check (true);

-- ── AWARD RECORDS ──
create table if not exists public.tender_award_records (
  id              uuid primary key default gen_random_uuid(),
  tender_id       uuid not null references public.tender_register(id) on delete cascade,
  submission_id   uuid not null references public.tender_submissions(id) on delete cascade,
  award_no        text not null,
  award_date      date not null default current_date,
  award_amount    numeric(15,2) not null default 0,
  currency        text not null default 'USD',
  awardee_name    text not null,
  justification   text,
  conditions      text,
  acceptance_date date,
  status          text not null default 'pending_acceptance' check (status in ('pending_acceptance','accepted','rejected','awarded','contract_signed','cancelled')),
  contract_no     text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(tender_id, award_no)
);

create index if not exists idx_tar_tender on public.tender_award_records(tender_id);
alter table public.tender_award_records enable row level security;
create policy "Auth users can view awards"
  on public.tender_award_records for select to authenticated using (true);
create policy "Auth users can manage awards"
  on public.tender_award_records for insert to authenticated with check (true);
create policy "Auth users can update awards"
  on public.tender_award_records for update to authenticated using (true) with check (true);

-- ── WIN/LOSS ANALYSIS ──
create table if not exists public.tender_win_loss (
  id              uuid primary key default gen_random_uuid(),
  tender_id       uuid not null references public.tender_register(id) on delete cascade unique,
  our_bid_amount  numeric(15,2) not null default 0,
  winning_bid_amount numeric(15,2),
  awardee_name    text,
  bid_spread      numeric(5,2),
  reason_won      text,
  reason_lost     text,
  lesson_learned  text,
  competitor_count integer,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on column public.tender_win_loss.bid_spread is 'Our bid as % above/below winner';

alter table public.tender_win_loss enable row level security;
create policy "Auth users can view win/loss"
  on public.tender_win_loss for select to authenticated using (true);
create policy "Auth users can manage win/loss"
  on public.tender_win_loss for insert to authenticated with check (true);
create policy "Auth users can update win/loss"
  on public.tender_win_loss for update to authenticated using (true) with check (true);

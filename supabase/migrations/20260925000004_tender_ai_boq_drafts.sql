-- Migration: 20260925000004_tender_ai_boq_drafts.sql
-- Purpose: Audit trail and per-use cost record for AI-assisted BOQ drafting.
--          A QS points Claude at a tender drawing (or an uploaded image); Claude
--          reads it and proposes draft BOQ lines, which are matched against the
--          QS library. Nothing reaches tender_boq_items until a QS reviews and
--          accepts specific lines (see lib/tender-ai-boq-draft.ts). Each row here
--          is one Claude API call: what was sent, the model, token usage (so
--          spend is visible), and the validated draft result. Drawing content
--          (as a PDF/image) is sent to Anthropic for this call.
-- Depends on: tender_register (20260531000054), qto_drawing_revisions
--             (20260805000001), profiles (20260526_0001).

create table if not exists public.tender_ai_boq_drafts (
  id                   uuid primary key default gen_random_uuid(),
  tender_id            uuid not null references public.tender_register(id) on delete cascade,
  drawing_revision_id  uuid references public.qto_drawing_revisions(id) on delete set null,
  source_name          text not null,           -- drawing no/rev label, or uploaded file name
  pages                int[],                    -- selected PDF pages (1-based); null = whole file / image
  instructions         text,
  model                text not null,
  input_tokens         int,
  output_tokens        int,
  cache_read_tokens    int,
  status               text not null check (status in ('succeeded','failed','refused')),
  error                text,
  result               jsonb,                   -- validated draft: summary, warnings, lines (+ library matches)
  accepted_count       int not null default 0,
  created_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now()
);

create index if not exists idx_tabd_tender_created
  on public.tender_ai_boq_drafts(tender_id, created_at desc);

alter table public.tender_ai_boq_drafts enable row level security;

-- Mirrors tender_boq_items: open to authenticated, no delete policy.
drop policy if exists "Auth users can view AI BOQ drafts" on public.tender_ai_boq_drafts;
create policy "Auth users can view AI BOQ drafts"
  on public.tender_ai_boq_drafts for select to authenticated using (true);

drop policy if exists "Auth users can create AI BOQ drafts" on public.tender_ai_boq_drafts;
create policy "Auth users can create AI BOQ drafts"
  on public.tender_ai_boq_drafts for insert to authenticated with check (true);

drop policy if exists "Auth users can update AI BOQ drafts" on public.tender_ai_boq_drafts;
create policy "Auth users can update AI BOQ drafts"
  on public.tender_ai_boq_drafts for update to authenticated using (true) with check (true);

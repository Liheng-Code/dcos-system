-- Migration: 20260925000005_tender_bid_preparation.sql
-- Purpose: Contractor-side tender preparation records for the Pre-Contract project view
--          (components/projects/precontract-detail.tsx):
--            * Go/No-Go (bid/no-bid) decision on project_precontract_details
--            * tender_clarifications — queries we raise to the client and their responses
--            * tender_returnables   — documents/schedules the client requires with the bid
--          plus RBAC rows for the three new tender actions.
-- Depends on: tender_register (20260531000054), project_precontract_details (20260712000001),
--             role_permissions + roles (20260527000002/3), profiles.
-- Idempotent: safe to replay on a DB where any part already exists.

-- ─── Go/No-Go decision ───────────────────────────────────────────────────────
alter table public.project_precontract_details
  add column if not exists go_no_go_decision  text check (go_no_go_decision in ('go','no_go')),
  add column if not exists go_no_go_date      date,
  add column if not exists go_no_go_by        uuid references public.profiles(id) on delete set null,
  add column if not exists go_no_go_rationale text;

-- ─── Tender clarifications (queries to the client) ───────────────────────────
create table if not exists public.tender_clarifications (
  id              uuid primary key default gen_random_uuid(),
  tender_id       uuid not null references public.tender_register(id) on delete cascade,
  query_no        text not null,
  category        text not null default 'technical'
                  check (category in ('technical','commercial','contractual','programme','other')),
  question        text not null,
  raised_date     date not null default current_date,
  status          text not null default 'open' check (status in ('open','answered','closed')),
  client_response text,
  response_date   date,
  raised_by       uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tender_id, query_no)
);

create index if not exists idx_tender_clar_tender on public.tender_clarifications(tender_id);
alter table public.tender_clarifications enable row level security;

-- Mirrors tender_risk_items: open to authenticated; UI gates actions via role_permissions.
drop policy if exists "Auth users can view clarifications" on public.tender_clarifications;
create policy "Auth users can view clarifications"
  on public.tender_clarifications for select to authenticated using (true);
drop policy if exists "Auth users can create clarifications" on public.tender_clarifications;
create policy "Auth users can create clarifications"
  on public.tender_clarifications for insert to authenticated with check (true);
drop policy if exists "Auth users can update clarifications" on public.tender_clarifications;
create policy "Auth users can update clarifications"
  on public.tender_clarifications for update to authenticated using (true) with check (true);
drop policy if exists "Auth users can delete clarifications" on public.tender_clarifications;
create policy "Auth users can delete clarifications"
  on public.tender_clarifications for delete to authenticated using (true);

-- ─── Tender returnables (compliance checklist) ───────────────────────────────
create table if not exists public.tender_returnables (
  id            uuid primary key default gen_random_uuid(),
  tender_id     uuid not null references public.tender_register(id) on delete cascade,
  item          text not null,
  category      text not null default 'technical'
                check (category in ('technical','commercial','legal','other')),
  is_mandatory  boolean not null default true,
  is_ready      boolean not null default false,
  notes         text,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_tender_ret_tender on public.tender_returnables(tender_id, sort_order);
alter table public.tender_returnables enable row level security;

drop policy if exists "Auth users can view returnables" on public.tender_returnables;
create policy "Auth users can view returnables"
  on public.tender_returnables for select to authenticated using (true);
drop policy if exists "Auth users can create returnables" on public.tender_returnables;
create policy "Auth users can create returnables"
  on public.tender_returnables for insert to authenticated with check (true);
drop policy if exists "Auth users can update returnables" on public.tender_returnables;
create policy "Auth users can update returnables"
  on public.tender_returnables for update to authenticated using (true) with check (true);
drop policy if exists "Auth users can delete returnables" on public.tender_returnables;
create policy "Auth users can delete returnables"
  on public.tender_returnables for delete to authenticated using (true);

-- ─── RBAC ────────────────────────────────────────────────────────────────────
-- Clarifications and returnables follow tender_register. Go/No-Go is viewable by the bid
-- team but only directors (L0–L2) record the decision (approve).
insert into public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, transmit, configure, reassign, scope)
select r.role_code, 'tender', a.action, r.view, r.can_create, r.edit, r.del, false, false, false, false, false, false, false, r.scope
from (values
  ('L0',      true,  true,  true,  true,  'company'),
  ('L1',      true,  true,  true,  true,  'company'),
  ('L2',      true,  true,  true,  true,  'company'),
  ('L3',      true,  true,  true,  false, 'project'),
  ('QS',      true,  true,  true,  false, 'company'),
  ('AC',      true,  false, false, false, 'company'),
  ('PO',      true,  true,  true,  false, 'company'),
  ('L4',      true,  false, false, false, 'project'),
  ('L5',      true,  false, false, false, 'project'),
  ('L6',      false, false, false, false, null),
  ('EXT-CLT', false, false, false, false, null),
  ('EXT-CON', false, false, false, false, null),
  ('EXT-SUB', false, false, false, false, null)
) as r(role_code, view, can_create, edit, del, scope)
cross join (values ('tender_clarifications'), ('tender_returnables')) as a(action)
where exists (select 1 from public.roles where code = r.role_code)
on conflict (role_code, module, action) do nothing;

insert into public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, transmit, configure, reassign, scope)
select r.role_code, 'tender', 'tender_go_no_go', r.view, false, false, false, false, r.approve, false, false, false, false, false, r.scope
from (values
  ('L0',      true,  true,  'company'),
  ('L1',      true,  true,  'company'),
  ('L2',      true,  true,  'company'),
  ('L3',      true,  false, 'project'),
  ('QS',      true,  false, 'company'),
  ('AC',      true,  false, 'company'),
  ('PO',      true,  false, 'company'),
  ('L4',      false, false, null),
  ('L5',      false, false, null),
  ('L6',      false, false, null),
  ('EXT-CLT', false, false, null),
  ('EXT-CON', false, false, null),
  ('EXT-SUB', false, false, null)
) as r(role_code, view, approve, scope)
where exists (select 1 from public.roles where code = r.role_code)
on conflict (role_code, module, action) do nothing;

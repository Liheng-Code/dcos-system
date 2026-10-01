-- Migration: 20260928000003_tender_workstream_registers.sql
-- Purpose: Phase C of the pre-contract master flow — workstream registers:
--            * tender_technical_items   — technical review (ARC / STR / MEP / BIM): scope, design issues,
--                                         missing info, constructability, assumptions, risks, alternatives
--            * tender_commercial_items  — commercial / contract conditions review (payment, retention,
--                                         advance, LDs, bonds, insurance, variations, EOT, claims, DLP, tax…)
--            * tender_sub_quotes        — procurement enquiry fields (supplier vs subcontractor, enquiry
--                                         status, lead time, availability, technical/commercial scores)
--            * tender_risk_items        — risk & opportunity fields (type, cause, status, owner,
--                                         programme impact) and the master's risk categories
--            * qto_document_register    — tender document types from the master list
-- Depends on: 20260928000002_tender_gates.sql (lock triggers stay on the altered tables),
--             tender_clarifications, qto_document_register, profiles, role_permissions + roles.
-- Idempotent: safe to replay.

-- ─── Technical review register ───────────────────────────────────────────────
create table if not exists public.tender_technical_items (
  id                 uuid primary key default gen_random_uuid(),
  tender_id          uuid not null references public.tender_register(id) on delete cascade,
  discipline         text not null check (discipline in ('ARC','STR','MEP','BIM')),
  item_type          text not null check (item_type in (
                       'scope','design_issue','missing_info','constructability','assumption',
                       'technical_risk','alternative')),
  description        text not null,
  source_document_id uuid references public.qto_document_register(id) on delete set null,
  status             text not null default 'open' check (status in ('open','resolved','closed')),
  owner_id           uuid references public.profiles(id) on delete set null,
  clarification_id   uuid references public.tender_clarifications(id) on delete set null,
  risk_id            uuid references public.tender_risk_items(id) on delete set null,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_tender_tech_tender on public.tender_technical_items(tender_id, discipline);
alter table public.tender_technical_items enable row level security;

drop policy if exists "Auth users can view technical items" on public.tender_technical_items;
create policy "Auth users can view technical items"
  on public.tender_technical_items for select to authenticated using (true);
drop policy if exists "Auth users can create technical items" on public.tender_technical_items;
create policy "Auth users can create technical items"
  on public.tender_technical_items for insert to authenticated with check (true);
drop policy if exists "Auth users can update technical items" on public.tender_technical_items;
create policy "Auth users can update technical items"
  on public.tender_technical_items for update to authenticated using (true) with check (true);
drop policy if exists "Auth users can delete technical items" on public.tender_technical_items;
create policy "Auth users can delete technical items"
  on public.tender_technical_items for delete to authenticated using (true);

-- ─── Commercial / contract review register ───────────────────────────────────
create table if not exists public.tender_commercial_items (
  id                 uuid primary key default gen_random_uuid(),
  tender_id          uuid not null references public.tender_register(id) on delete cascade,
  topic              text not null check (topic in (
                       'contract_conditions','payment_terms','retention','advance_payment','liquidated_damages',
                       'bonds','insurance','variations','extension_of_time','claims','defects_liability',
                       'tax','special_conditions')),
  client_requirement text,
  assessment         text not null default 'pending'
                     check (assessment in ('pending','acceptable','qualify','reject')),
  qualification      text,
  cost_impact        numeric(15,2) not null default 0,
  notes              text,
  owner_id           uuid references public.profiles(id) on delete set null,
  risk_id            uuid references public.tender_risk_items(id) on delete set null,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_tender_comm_tender on public.tender_commercial_items(tender_id, sort_order);
alter table public.tender_commercial_items enable row level security;

drop policy if exists "Auth users can view commercial items" on public.tender_commercial_items;
create policy "Auth users can view commercial items"
  on public.tender_commercial_items for select to authenticated using (true);
drop policy if exists "Auth users can create commercial items" on public.tender_commercial_items;
create policy "Auth users can create commercial items"
  on public.tender_commercial_items for insert to authenticated with check (true);
drop policy if exists "Auth users can update commercial items" on public.tender_commercial_items;
create policy "Auth users can update commercial items"
  on public.tender_commercial_items for update to authenticated using (true) with check (true);
drop policy if exists "Auth users can delete commercial items" on public.tender_commercial_items;
create policy "Auth users can delete commercial items"
  on public.tender_commercial_items for delete to authenticated using (true);

-- Commercial terms feed the price, so they freeze with the rest of the pricing.
drop trigger if exists tender_lock_guard on public.tender_commercial_items;
create trigger tender_lock_guard before insert or update or delete on public.tender_commercial_items
  for each row execute function public.tender_lock_guard();

-- ─── Procurement enquiry fields on sub/supplier quotes ───────────────────────
alter table public.tender_sub_quotes
  add column if not exists quote_type       text not null default 'subcontractor'
    check (quote_type in ('supplier','subcontractor')),
  add column if not exists status           text not null default 'received'
    check (status in ('enquiry_sent','received','declined')),
  add column if not exists enquiry_date     date,
  add column if not exists lead_time_days   integer,
  add column if not exists availability     text,
  add column if not exists technical_score  numeric(4,1) check (technical_score between 0 and 10),
  add column if not exists commercial_score numeric(4,1) check (commercial_score between 0 and 10);

-- ─── Risk & opportunity fields ───────────────────────────────────────────────
alter table public.tender_risk_items
  add column if not exists entry_type            text not null default 'risk'
    check (entry_type in ('risk','opportunity')),
  add column if not exists cause                 text,
  add column if not exists status                text not null default 'open'
    check (status in ('open','mitigated','closed','realised')),
  add column if not exists programme_impact_days integer,
  add column if not exists owner_id              uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at            timestamptz not null default now();

-- Keep the original categories (existing rows and the cost-estimation Risk tab use them) and add the
-- master's: cost, programme, procurement, contract, site, labour, design, client.
alter table public.tender_risk_items drop constraint if exists tender_risk_items_category_check;
alter table public.tender_risk_items add constraint tender_risk_items_category_check
  check (category in ('technical','commercial','schedule','geotechnical','market','regulatory','environmental','other',
                      'cost','programme','procurement','contract','site','labour','design','client'));

-- ─── Tender document types ───────────────────────────────────────────────────
alter table public.qto_document_register drop constraint if exists qto_document_register_document_type_check;
alter table public.qto_document_register add constraint qto_document_register_document_type_check
  check (document_type in ('dwg','pdf','xlsx','docx','specification','boq','tender_instruction','addendum',
                           'clarification','other',
                           'invitation_to_tender','employer_requirements','conditions_of_contract',
                           'schedule_of_rates','forms','site_information','geotechnical','appendix'));

-- ─── RBAC ────────────────────────────────────────────────────────────────────
-- Both registers follow tender_register (bid team edits; directors delete).
insert into public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, transmit, configure, reassign, scope)
select r.role_code, 'tender', a.action, r.view, r.can_create, r.edit, r.del, false, false, false, false, false, false, false, r.scope
from (values
  ('L0',      true,  true,  true,  true,  'company'),
  ('L1',      true,  true,  true,  true,  'company'),
  ('L2',      true,  true,  true,  true,  'company'),
  ('L3',      true,  true,  true,  false, 'project'),
  ('L4',      true,  true,  true,  false, 'project'),
  ('L5',      true,  true,  true,  false, 'project'),
  ('QS',      true,  true,  true,  false, 'company'),
  ('BIM',     true,  true,  true,  false, 'project'),
  ('PE',      true,  true,  true,  false, 'project'),
  ('HSE',     true,  true,  true,  false, 'project'),
  ('QA',      true,  true,  true,  false, 'project'),
  ('AC',      true,  false, false, false, 'company'),
  ('PO',      true,  true,  true,  false, 'company'),
  ('L6',      false, false, false, false, null),
  ('EXT-CLT', false, false, false, false, null),
  ('EXT-CON', false, false, false, false, null),
  ('EXT-SUB', false, false, false, false, null)
) as r(role_code, view, can_create, edit, del, scope)
cross join (values ('tender_technical'), ('tender_commercial')) as a(action)
where exists (select 1 from public.roles where code = r.role_code)
on conflict (role_code, module, action) do nothing;

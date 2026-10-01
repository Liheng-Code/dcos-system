-- Migration: 20260928000001_tender_lifecycle.sql
-- Purpose: Phase A of the pre-contract master flow
--          (docs/04-Business-Modules/04-02-Project-Setup/04-02-01-Pre Contract Project/PRE-CONTRACT Project Prompt.md):
--            * contractor-side lifecycle stage on project_precontract_details (tender_stage),
--              with key dates, Go/No-Go criteria and a close reason
--            * projects.consultant_id (registration: Client / Consultant)
--            * tender_workstreams — the tender team / responsibility matrix, one row per workstream
--          Transitions are owned by apps/web/lib/tender-lifecycle.ts, which also keeps the legacy
--          award_status in sync for existing readers.
-- Depends on: project_precontract_details (20260712000001), tender_bid_preparation (20260925000005),
--             tender_register, stakeholders, profiles, role_permissions + roles.
-- Idempotent: safe to replay; the backfill only touches rows whose stage was never set by the app.

-- ─── Lifecycle stage + key dates ─────────────────────────────────────────────
alter table public.project_precontract_details
  add column if not exists tender_stage text not null default 'opportunity'
    check (tender_stage in ('opportunity','review','go_no_go','tendering','internal_review','approval',
                            'submitted','awaiting_result','awarded','unsuccessful','closed')),
  add column if not exists stage_changed_at   timestamptz,
  add column if not exists closed_reason      text,
  add column if not exists go_no_go_criteria  jsonb,
  add column if not exists site_visit_date    date,
  add column if not exists query_deadline     timestamptz;

-- Backfill from the legacy award_status / Go decision. stage_changed_at stays null until the app
-- moves a tender, so a replay never overwrites a stage set through the UI.
update public.project_precontract_details
set tender_stage = case
      when award_status = 'awarded'                   then 'awarded'
      when award_status = 'lost'                      then 'unsuccessful'
      when award_status = 'cancelled'                 then 'closed'
      when award_status in ('submitted','evaluated')  then 'awaiting_result'
      when go_no_go_decision = 'go'                   then 'tendering'
      when go_no_go_decision = 'no_go'                then 'closed'
      else 'opportunity'
    end
where stage_changed_at is null;

create index if not exists idx_ppd_tender_stage on public.project_precontract_details(tender_stage);

-- ─── Consultant on the project ───────────────────────────────────────────────
do $$
begin
  if to_regclass('public.stakeholders') is not null then
    alter table public.projects
      add column if not exists consultant_id uuid references public.stakeholders(id) on delete set null;
  end if;
end $$;

-- ─── Tender workstreams (responsibility matrix) ──────────────────────────────
create table if not exists public.tender_workstreams (
  id          uuid primary key default gen_random_uuid(),
  tender_id   uuid not null references public.tender_register(id) on delete cascade,
  code        text not null check (code in (
                'documents','technical_arc','technical_str','technical_mep','technical_bim',
                'qs_tendering','planning','procurement','commercial','risk','hse_qaqc',
                'clarifications','compilation')),
  required    boolean not null default true,
  owner_id    uuid references public.profiles(id) on delete set null,
  due_date    date,
  status      text not null default 'not_started'
              check (status in ('not_started','in_progress','completed')),
  notes       text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tender_id, code)
);

create index if not exists idx_tender_ws_tender on public.tender_workstreams(tender_id, sort_order);
alter table public.tender_workstreams enable row level security;

-- Mirrors the other tender tables: open to authenticated; UI gates actions via role_permissions.
drop policy if exists "Auth users can view workstreams" on public.tender_workstreams;
create policy "Auth users can view workstreams"
  on public.tender_workstreams for select to authenticated using (true);
drop policy if exists "Auth users can create workstreams" on public.tender_workstreams;
create policy "Auth users can create workstreams"
  on public.tender_workstreams for insert to authenticated with check (true);
drop policy if exists "Auth users can update workstreams" on public.tender_workstreams;
create policy "Auth users can update workstreams"
  on public.tender_workstreams for update to authenticated using (true) with check (true);
drop policy if exists "Auth users can delete workstreams" on public.tender_workstreams;
create policy "Auth users can delete workstreams"
  on public.tender_workstreams for delete to authenticated using (true);

-- ─── RBAC ────────────────────────────────────────────────────────────────────
-- tender_workstreams follows tender_register (the tender manager assigns owners).
-- tender_lifecycle: submit = move the tender forward (review, internal review, submission);
-- approve = directors only (withdraw / close a live tender).
insert into public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, transmit, configure, reassign, scope)
select r.role_code, 'tender', 'tender_workstreams', r.view, r.can_create, r.edit, r.del, false, false, false, false, false, false, false, r.scope
from (values
  ('L0',      true,  true,  true,  true,  'company'),
  ('L1',      true,  true,  true,  true,  'company'),
  ('L2',      true,  true,  true,  true,  'company'),
  ('L3',      true,  true,  true,  false, 'project'),
  ('QS',      true,  false, true,  false, 'company'),
  ('AC',      true,  false, false, false, 'company'),
  ('PO',      true,  true,  true,  false, 'company'),
  ('L4',      true,  false, false, false, 'project'),
  ('L5',      true,  false, false, false, 'project'),
  ('L6',      false, false, false, false, null),
  ('EXT-CLT', false, false, false, false, null),
  ('EXT-CON', false, false, false, false, null),
  ('EXT-SUB', false, false, false, false, null)
) as r(role_code, view, can_create, edit, del, scope)
where exists (select 1 from public.roles where code = r.role_code)
on conflict (role_code, module, action) do nothing;

insert into public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, transmit, configure, reassign, scope)
select r.role_code, 'tender', 'tender_lifecycle', r.view, false, false, false, r.submit, r.approve, false, false, false, false, false, r.scope
from (values
  ('L0',      true,  true,  true,  'company'),
  ('L1',      true,  true,  true,  'company'),
  ('L2',      true,  true,  true,  'company'),
  ('L3',      true,  true,  false, 'project'),
  ('QS',      true,  false, false, 'company'),
  ('AC',      true,  false, false, 'company'),
  ('PO',      true,  true,  false, 'company'),
  ('L4',      true,  false, false, 'project'),
  ('L5',      true,  false, false, 'project'),
  ('L6',      false, false, false, null),
  ('EXT-CLT', false, false, false, null),
  ('EXT-CON', false, false, false, null),
  ('EXT-SUB', false, false, false, null)
) as r(role_code, view, submit, approve, scope)
where exists (select 1 from public.roles where code = r.role_code)
on conflict (role_code, module, action) do nothing;

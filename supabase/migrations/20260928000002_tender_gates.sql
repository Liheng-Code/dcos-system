-- Migration: 20260928000002_tender_gates.sql
-- Purpose: Phase B of the pre-contract master flow — gates and controls:
--            * Bid Approval: tender_bid_approvals (technical / commercial / price review, then
--              management), one round per internal review, recorded on project_precontract_details
--            * Price lock: tender_is_locked() + guard triggers on every tender pricing table. Pricing is
--              frozen from Internal Review onward; the only way back is Return to Tendering or an addendum.
--            * Addendum → controlled re-open: impact flags on tender_addenda and a trigger that returns a
--              tender in preparation to Tendering and its final bid revisions to draft.
--            * Submission record on project_precontract_details
--            * Compilation: returnables carry their owning workstream, a document link and a return flag
--            * Clarifications: tender_queries rows merged into tender_clarifications (single register)
-- Depends on: 20260928000001_tender_lifecycle.sql, 20260925000005_tender_bid_preparation.sql,
--             tender_bid_summaries (20260531000055), tender_win_loss, documents.
-- Idempotent: safe to replay.

-- ─── Approval + submission fields ────────────────────────────────────────────
alter table public.project_precontract_details
  add column if not exists approval_round           integer not null default 0,
  add column if not exists review_bid_summary_id    uuid references public.tender_bid_summaries(id) on delete set null,
  add column if not exists approved_bid_summary_id  uuid references public.tender_bid_summaries(id) on delete set null,
  add column if not exists bid_approved_at          timestamptz,
  add column if not exists submitted_at             timestamptz,
  add column if not exists submitted_by             uuid references public.profiles(id) on delete set null,
  add column if not exists submission_method        text
    check (submission_method in ('portal','email','hand_delivery','courier','other')),
  add column if not exists submission_reference     text,
  add column if not exists submitted_bid_summary_id uuid references public.tender_bid_summaries(id) on delete set null;

-- ─── Bid approvals ───────────────────────────────────────────────────────────
create table if not exists public.tender_bid_approvals (
  id              uuid primary key default gen_random_uuid(),
  tender_id       uuid not null references public.tender_register(id) on delete cascade,
  round           integer not null,
  bid_summary_id  uuid references public.tender_bid_summaries(id) on delete set null,
  step            text not null check (step in ('technical','commercial','price','management')),
  decision        text not null check (decision in ('approved','rejected','returned')),
  comments        text,
  user_id         uuid references public.profiles(id) on delete set null,
  decided_at      timestamptz not null default now(),
  unique (tender_id, round, step)
);

create index if not exists idx_tender_bid_appr_tender on public.tender_bid_approvals(tender_id, round);
alter table public.tender_bid_approvals enable row level security;

-- Approval rows are a record: view, insert and (for a re-decision within the round) update; no delete.
drop policy if exists "Auth users can view bid approvals" on public.tender_bid_approvals;
create policy "Auth users can view bid approvals"
  on public.tender_bid_approvals for select to authenticated using (true);
drop policy if exists "Auth users can create bid approvals" on public.tender_bid_approvals;
create policy "Auth users can create bid approvals"
  on public.tender_bid_approvals for insert to authenticated with check (true);
drop policy if exists "Auth users can update bid approvals" on public.tender_bid_approvals;
create policy "Auth users can update bid approvals"
  on public.tender_bid_approvals for update to authenticated using (true) with check (true);

-- ─── Price lock ──────────────────────────────────────────────────────────────
create or replace function public.tender_is_locked(p_tender_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.project_precontract_details d
    where d.tender_register_id = p_tender_id
      and d.tender_stage in ('internal_review','approval','submitted','awaiting_result','awarded','unsuccessful','closed')
  );
$$;

grant execute on function public.tender_is_locked(uuid) to authenticated;

create or replace function public.tender_lock_guard()
returns trigger
language plpgsql
as $$
declare
  v_tender uuid;
begin
  -- Maintenance escape hatch for admins running SQL directly: set local dcos.tender_unlock = 'on'.
  if coalesce(current_setting('dcos.tender_unlock', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  v_tender := case when tg_op = 'DELETE' then old.tender_id else new.tender_id end;

  -- Gates may still move a locked bid revision's status (final on approval, submitted on submission).
  -- Generated columns are excluded: in a BEFORE trigger NEW does not carry their computed values yet.
  if tg_table_name = 'tender_bid_summaries' and tg_op = 'UPDATE'
     and (to_jsonb(new) - array['status','updated_at','overhead_amount','profit_amount','total_bid_price','vat_amount'])
       = (to_jsonb(old) - array['status','updated_at','overhead_amount','profit_amount','total_bid_price','vat_amount']) then
    return new;
  end if;

  if public.tender_is_locked(v_tender)
     or (tg_op = 'UPDATE' and old.tender_id is distinct from new.tender_id and public.tender_is_locked(old.tender_id)) then
    raise exception 'Tender pricing is locked (internal review, approval or submitted). Return the bid to Tendering or record an addendum to change it.'
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'tender_boq_items','tender_price_list','tender_price_list_items','tender_preliminaries_items',
    'tender_prelim_settings','tender_bid_summaries','tender_sub_quotes','tender_risk_items',
    'tender_exclude_items','tender_dayworks','tender_provisional_sums','tender_unit_rates'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists tender_lock_guard on public.%I', t);
      execute format(
        'create trigger tender_lock_guard before insert or update or delete on public.%I
           for each row execute function public.tender_lock_guard()', t);
    end if;
  end loop;
end $$;

-- ─── Addenda: impact assessment + controlled re-open ─────────────────────────
alter table public.tender_addenda
  add column if not exists affects_drawings  boolean not null default false,
  add column if not exists affects_boq       boolean not null default false,
  add column if not exists affects_spec      boolean not null default false,
  add column if not exists affects_programme boolean not null default false,
  add column if not exists affects_cost      boolean not null default false,
  add column if not exists affects_risk      boolean not null default false,
  add column if not exists impact_notes      text,
  add column if not exists assessed          boolean not null default false;

drop policy if exists "Auth users can update addenda" on public.tender_addenda;
create policy "Auth users can update addenda"
  on public.tender_addenda for update to authenticated using (true) with check (true);
drop policy if exists "Auth users can delete addenda" on public.tender_addenda;
create policy "Auth users can delete addenda"
  on public.tender_addenda for delete to authenticated using (true);

create or replace function public.tender_addendum_reopen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reopened boolean;
begin
  -- During preparation an addendum invalidates any finalised / approved price. After submission it
  -- is only logged (post-submission changes go through clarification / negotiation).
  update public.project_precontract_details d
  set tender_stage     = 'tendering',
      stage_changed_at = case when d.tender_stage <> 'tendering' then now() else d.stage_changed_at end,
      bid_approved_at  = null,
      approved_bid_summary_id = null,
      updated_at       = now()
  where d.tender_register_id = new.tender_id
    and d.tender_stage in ('tendering','internal_review','approval');
  v_reopened := found;

  if v_reopened then
    update public.tender_bid_summaries
    set status = 'draft', updated_at = now()
    where tender_id = new.tender_id and status in ('review','final');
  end if;
  return new;
end;
$$;

drop trigger if exists tender_addendum_reopen on public.tender_addenda;
create trigger tender_addendum_reopen
  after insert on public.tender_addenda
  for each row execute function public.tender_addendum_reopen();

-- ─── Compilation (returnables) ───────────────────────────────────────────────
alter table public.tender_returnables
  add column if not exists workstream_code text,
  add column if not exists returned_at     timestamptz;

do $$
begin
  if to_regclass('public.documents') is not null then
    alter table public.tender_returnables
      add column if not exists document_id uuid references public.documents(id) on delete set null;
  end if;
end $$;

-- ─── Win/loss: allow correcting a record ─────────────────────────────────────
drop policy if exists "Auth users can delete win/loss" on public.tender_win_loss;
create policy "Auth users can delete win/loss"
  on public.tender_win_loss for delete to authenticated using (true);

-- ─── Clarifications: single register ─────────────────────────────────────────
-- tender_queries (the older Q&A table) is kept for history but no longer written by the app.
do $$
begin
  if to_regclass('public.tender_queries') is not null then
    insert into public.tender_clarifications
      (tender_id, query_no, category, question, raised_date, status, client_response, response_date, raised_by)
    select q.tender_id,
           q.query_no,
           'other',
           q.question,
           coalesce(q.asked_date, q.created_at::date),
           case when q.answer is not null and q.answer <> '' then 'answered' else 'open' end,
           nullif(q.answer, ''),
           q.answered_date,
           null
    from public.tender_queries q
    on conflict (tender_id, query_no) do nothing;
  end if;
end $$;

-- ─── RBAC ────────────────────────────────────────────────────────────────────
-- tender_bid_approval: view for the bid team; approve marks who may sit on the approval panel.
-- The step each role may decide (technical / commercial / price / management) is mapped in
-- apps/web/lib/tender-approval.ts.
insert into public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, transmit, configure, reassign, scope)
select r.role_code, 'tender', 'tender_bid_approval', r.view, false, false, false, false, r.approve, r.approve, false, false, false, false, r.scope
from (values
  ('L0',      true,  true,  'company'),
  ('L1',      true,  true,  'company'),
  ('L2',      true,  true,  'company'),
  ('L3',      true,  true,  'project'),
  ('L4',      true,  true,  'project'),
  ('L5',      true,  true,  'project'),
  ('QS',      true,  true,  'company'),
  ('AC',      true,  false, 'company'),
  ('PO',      true,  false, 'company'),
  ('L6',      false, false, null),
  ('EXT-CLT', false, false, null),
  ('EXT-CON', false, false, null),
  ('EXT-SUB', false, false, null)
) as r(role_code, view, approve, scope)
where exists (select 1 from public.roles where code = r.role_code)
on conflict (role_code, module, action) do nothing;

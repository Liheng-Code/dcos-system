-- Migration: 20260910000005_dwl_price_submissions.sql
-- Purpose: Material Specification & Price Recording (DCOS-DS-12-012), Phase C-E.
--          The Draft -> Submitted -> Verified -> Approved price workflow.
--            - dwl_price_submissions   : mutable staging record (breakdown +
--              workflow state). NOT a price yet.
--            - dwl_price_status_events : APPEND-ONLY transition log.
--            - dwl_resource_prices.submission_id : back-ref, added here.
--            - RPCs dwl_submit / dwl_verify / dwl_reject / dwl_approve
--              price submission — SECURITY DEFINER, role-checked, each logs
--              an event. On approve, ONE immutable dwl_resource_prices row
--              is inserted (the only workflow path that creates a price).
--            - role_permissions seed for a dedicated 'qs_price_approval'
--              action (the existing 'qs_libraries' action grants approve=false
--              to every role).
--
-- Depends on: 20260910000004 (dwl_resource_prices breakdown columns),
--             20260527000002 (roles, user_roles, role_permissions),
--             20260720000017 (RLS pattern), 20260719000002 (qs rbac seed).
--
-- APPEND-ONLY GUARANTEE: dwl_resource_prices keeps SELECT + INSERT policies
--   only. The approve RPC inserts (allowed); it never updates/deletes a
--   price row. dwl_price_status_events has SELECT + INSERT policies only.
--
-- Idempotent: create table/column if not exists, guarded policies,
--   create or replace function, on conflict do nothing on the rbac seed.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. dwl_price_submissions — mutable workflow staging record.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dwl_price_submissions (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  resource_id        uuid not null references public.dwl_resources(id) on delete cascade,
  supplier_id        uuid references public.dwl_suppliers(id),
  -- price payload (same names as the dwl_resource_prices columns)
  unit_price         numeric(14,4) not null check (unit_price >= 0),
  discount           numeric(14,4) not null default 0,
  delivery_cost      numeric(14,4) not null default 0,
  handling_cost      numeric(14,4) not null default 0,
  other_charges      numeric(14,4) not null default 0,
  tax_amount         numeric(14,4) not null default 0,
  quantity           numeric(14,4),
  currency           text not null default 'USD',
  valid_from         date not null,
  quote_valid_until  date,
  source_type        text not null default 'quotation'
                       check (source_type in ('quotation','purchase','market_survey','estimate')),
  location           text default 'Phnom Penh',
  payment_terms      text,
  delivery_terms     text,
  lead_time_days     integer,
  source_document    text,
  quotation_ref      text,
  quotation_date     date,
  project_code       text,
  notes              text,
  -- workflow state
  status             text not null default 'draft'
                       check (status in ('draft','submitted','verified','approved','rejected')),
  submitted_by       uuid references public.profiles(id),
  submitted_at       timestamptz,
  verified_by        uuid references public.profiles(id),
  verified_at        timestamptz,
  approved_by        uuid references public.profiles(id),
  approved_at        timestamptz,
  rejected_reason    text,
  resulting_price_id uuid references public.dwl_resource_prices(id),
  created_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_dwl_price_submissions_tenant   on public.dwl_price_submissions(tenant_id);
create index if not exists idx_dwl_price_submissions_resource  on public.dwl_price_submissions(resource_id);
create index if not exists idx_dwl_price_submissions_status    on public.dwl_price_submissions(tenant_id, status);

drop trigger if exists set_dwl_price_submissions_updated_at on public.dwl_price_submissions;
create trigger set_dwl_price_submissions_updated_at
  before update on public.dwl_price_submissions
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. dwl_price_status_events — APPEND-ONLY transition log.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dwl_price_status_events (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  submission_id  uuid not null references public.dwl_price_submissions(id) on delete cascade,
  from_status    text,
  to_status      text not null,
  actor          uuid references public.profiles(id),
  note           text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_dwl_price_status_events_submission
  on public.dwl_price_status_events(submission_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. dwl_resource_prices.submission_id — back-ref to the workflow record.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.dwl_resource_prices
  add column if not exists submission_id uuid references public.dwl_price_submissions(id);

create index if not exists idx_dwl_resource_prices_submission
  on public.dwl_resource_prices(submission_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. RLS
-- ─────────────────────────────────────────────────────────────────────────
alter table public.dwl_price_submissions   enable row level security;
alter table public.dwl_price_status_events enable row level security;

-- dwl_price_submissions: tenant-scoped select/insert/update; delete only
-- while still a draft.
do $$ begin
  create policy dwl_price_submissions_tenant_select on public.dwl_price_submissions
    for select using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dwl_price_submissions_tenant_insert on public.dwl_price_submissions
    for insert with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dwl_price_submissions_tenant_update on public.dwl_price_submissions
    for update using (tenant_id = (select company_id from public.profiles where id = auth.uid()))
    with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dwl_price_submissions_tenant_delete on public.dwl_price_submissions
    for delete using (
      tenant_id = (select company_id from public.profiles where id = auth.uid())
      and status = 'draft'
    );
exception when duplicate_object then null; end $$;

-- dwl_price_status_events: APPEND-ONLY — select + insert only.
do $$ begin
  create policy dwl_price_status_events_tenant_select on public.dwl_price_status_events
    for select using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dwl_price_status_events_tenant_insert on public.dwl_price_status_events
    for insert with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. RBAC — dedicated 'qs_price_approval' action.
--    The existing 'qs_libraries' action grants approve=false to every role
--    (20260719000002), so price approval needs its own capability.
--      submit  -> who may raise a submission for approval
--      edit    -> who may VERIFY a submitted price (the reviewer step)
--      approve -> who may APPROVE (creates the immutable price row)
--      reject  -> who may reject at verify/approve
--    Column order: role_code, module, action, view, can_create, edit,
--    delete, submit, approve, reject, export, transmit, configure,
--    reassign, scope.
-- ─────────────────────────────────────────────────────────────────────────
insert into public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, transmit, configure, reassign, scope)
values
  ('L0', 'qs', 'qs_price_approval', true,  true,  true,  false, true,  true,  true,  true,  false, false, false, 'company'),
  ('L1', 'qs', 'qs_price_approval', true,  true,  true,  false, true,  true,  true,  true,  false, false, false, 'company'),
  ('L2', 'qs', 'qs_price_approval', true,  true,  true,  false, true,  true,  true,  true,  false, false, false, 'company'),
  ('QS', 'qs', 'qs_price_approval', true,  true,  true,  false, true,  true,  true,  true,  false, false, false, 'company'),
  ('L3', 'qs', 'qs_price_approval', true,  false, false, false, true,  false, false, false, false, false, false, 'company'),
  ('L5', 'qs', 'qs_price_approval', true,  true,  false, false, true,  false, false, false, false, false, false, 'company'),
  ('L6', 'qs', 'qs_price_approval', true,  true,  false, false, true,  false, false, false, false, false, false, 'company'),
  ('PO', 'qs', 'qs_price_approval', true,  true,  false, false, true,  false, false, false, false, false, false, 'company'),
  ('AC', 'qs', 'qs_price_approval', true,  false, false, false, false, false, false, false, false, false, false, 'company')
on conflict (role_code, module, action) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Capability helpers (SECURITY DEFINER so they can read RBAC tables
--    regardless of the caller's RLS on those tables).
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.dwl_price_capability(p_field text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  execute format($q$
    select exists (
      select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role_code = ur.role_code
      where ur.user_id = auth.uid()
        and rp.module = 'qs'
        and rp.action = 'qs_price_approval'
        and rp.%I = true
    )$q$, p_field)
  into v_ok;
  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.dwl_price_capability(text) from public;
grant execute on function public.dwl_price_capability(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. Transition RPCs. All SECURITY DEFINER, all tenant-checked, all log an
--    event. Only dwl_approve_price_submission inserts a price row.
-- ─────────────────────────────────────────────────────────────────────────

-- helper: the caller's tenant, or raise
create or replace function public.dwl_current_tenant()
returns uuid
language sql
stable
as $$
  select company_id from public.profiles where id = auth.uid()
$$;

-- Submit: draft -> submitted
create or replace function public.dwl_submit_price_submission(p_submission_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.dwl_current_tenant();
  v_row public.dwl_price_submissions%rowtype;
begin
  select * into v_row from public.dwl_price_submissions
    where id = p_submission_id and tenant_id = v_tenant
    for update;
  if not found then raise exception 'submission % not found for this tenant', p_submission_id; end if;
  if v_row.status <> 'draft' then raise exception 'submission % is % — only draft can be submitted', p_submission_id, v_row.status; end if;

  update public.dwl_price_submissions
    set status = 'submitted', submitted_by = auth.uid(), submitted_at = now()
    where id = p_submission_id;

  insert into public.dwl_price_status_events (tenant_id, submission_id, from_status, to_status, actor)
    values (v_tenant, p_submission_id, 'draft', 'submitted', auth.uid());
end;
$$;

-- Verify: submitted -> verified (reviewer step; requires 'edit' capability)
create or replace function public.dwl_verify_price_submission(p_submission_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.dwl_current_tenant();
  v_row public.dwl_price_submissions%rowtype;
begin
  if not public.dwl_price_capability('edit') then
    raise exception 'not authorised to verify prices';
  end if;

  select * into v_row from public.dwl_price_submissions
    where id = p_submission_id and tenant_id = v_tenant
    for update;
  if not found then raise exception 'submission % not found for this tenant', p_submission_id; end if;
  if v_row.status <> 'submitted' then raise exception 'submission % is % — only submitted can be verified', p_submission_id, v_row.status; end if;

  update public.dwl_price_submissions
    set status = 'verified', verified_by = auth.uid(), verified_at = now()
    where id = p_submission_id;

  insert into public.dwl_price_status_events (tenant_id, submission_id, from_status, to_status, actor, note)
    values (v_tenant, p_submission_id, 'submitted', 'verified', auth.uid(), p_note);
end;
$$;

-- Reject: submitted|verified -> rejected (requires 'reject' capability)
create or replace function public.dwl_reject_price_submission(p_submission_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.dwl_current_tenant();
  v_row public.dwl_price_submissions%rowtype;
begin
  if not public.dwl_price_capability('reject') then
    raise exception 'not authorised to reject prices';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'a rejection reason is required';
  end if;

  select * into v_row from public.dwl_price_submissions
    where id = p_submission_id and tenant_id = v_tenant
    for update;
  if not found then raise exception 'submission % not found for this tenant', p_submission_id; end if;
  if v_row.status not in ('submitted','verified') then
    raise exception 'submission % is % — only submitted/verified can be rejected', p_submission_id, v_row.status;
  end if;

  update public.dwl_price_submissions
    set status = 'rejected', rejected_reason = p_reason
    where id = p_submission_id;

  insert into public.dwl_price_status_events (tenant_id, submission_id, from_status, to_status, actor, note)
    values (v_tenant, p_submission_id, v_row.status, 'rejected', auth.uid(), p_reason);
end;
$$;

-- Approve: verified -> approved. Inserts ONE immutable dwl_resource_prices
-- row. Requires 'approve' capability. Returns the new price id.
create or replace function public.dwl_approve_price_submission(p_submission_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.dwl_current_tenant();
  v_row public.dwl_price_submissions%rowtype;
  v_price_id uuid;
begin
  if not public.dwl_price_capability('approve') then
    raise exception 'not authorised to approve prices';
  end if;

  select * into v_row from public.dwl_price_submissions
    where id = p_submission_id and tenant_id = v_tenant
    for update;
  if not found then raise exception 'submission % not found for this tenant', p_submission_id; end if;
  if v_row.status <> 'verified' then
    raise exception 'submission % is % — only verified can be approved', p_submission_id, v_row.status;
  end if;
  if v_row.resulting_price_id is not null then
    raise exception 'submission % already produced price %', p_submission_id, v_row.resulting_price_id;
  end if;

  insert into public.dwl_resource_prices (
    tenant_id, resource_id, supplier_id, unit_price, currency, valid_from,
    quote_valid_until, source_type, location, notes,
    quantity, discount, delivery_cost, handling_cost, other_charges, tax_amount,
    payment_terms, delivery_terms, lead_time_days, source_document,
    quotation_ref, quotation_date, project_code,
    price_status, approved_by, approved_at, submission_id, created_by
  ) values (
    v_row.tenant_id, v_row.resource_id, v_row.supplier_id, v_row.unit_price, v_row.currency, v_row.valid_from,
    v_row.quote_valid_until, v_row.source_type, v_row.location, v_row.notes,
    v_row.quantity, v_row.discount, v_row.delivery_cost, v_row.handling_cost, v_row.other_charges, v_row.tax_amount,
    v_row.payment_terms, v_row.delivery_terms, v_row.lead_time_days, v_row.source_document,
    v_row.quotation_ref, v_row.quotation_date, v_row.project_code,
    'approved', auth.uid(), now(), v_row.id, v_row.created_by
  )
  returning id into v_price_id;

  update public.dwl_price_submissions
    set status = 'approved', approved_by = auth.uid(), approved_at = now(),
        resulting_price_id = v_price_id
    where id = p_submission_id;

  insert into public.dwl_price_status_events (tenant_id, submission_id, from_status, to_status, actor, note)
    values (v_tenant, p_submission_id, 'verified', 'approved', auth.uid(), p_note);

  return v_price_id;
end;
$$;

revoke all on function public.dwl_submit_price_submission(uuid)        from public;
revoke all on function public.dwl_verify_price_submission(uuid, text)  from public;
revoke all on function public.dwl_reject_price_submission(uuid, text)  from public;
revoke all on function public.dwl_approve_price_submission(uuid, text) from public;
grant execute on function public.dwl_submit_price_submission(uuid)        to authenticated;
grant execute on function public.dwl_verify_price_submission(uuid, text)  to authenticated;
grant execute on function public.dwl_reject_price_submission(uuid, text)  to authenticated;
grant execute on function public.dwl_approve_price_submission(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 8. dwl_v_price_submissions — queue view (submission + resolved names).
-- ─────────────────────────────────────────────────────────────────────────
drop view if exists public.dwl_v_price_submissions;

create view public.dwl_v_price_submissions
with (security_invoker = true)
as
select
  ps.*,
  r.code                  as material_code,
  coalesce(a.material_name, r.description) as material_name,
  r.unit                  as material_unit,
  s.name                  as supplier_name,
  (ps.unit_price
   - coalesce(ps.discount,0) + coalesce(ps.delivery_cost,0)
   + coalesce(ps.handling_cost,0) + coalesce(ps.other_charges,0)
   + coalesce(ps.tax_amount,0))          as effective_unit_cost
from public.dwl_price_submissions ps
join public.dwl_resources r on r.id = ps.resource_id
left join public.dwl_material_attributes a on a.resource_id = ps.resource_id
left join public.dwl_suppliers s on s.id = ps.supplier_id;

comment on view public.dwl_v_price_submissions is
  'Cost & Rate Library — price approval queue (DCOS-DS-12-012 Phase C-E).';

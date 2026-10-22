-- Migration: 20261022130911_procurement_p1_rls.sql
-- Purpose: Procurement hardening P1, part 1 (doc 13 sections 4.1, 5).
--   * Replace every `true` RLS policy on procurement_* and supplier_* tables with has_permission() checks.
--   * No delete policies (BR-16: never delete, cancel with a reason). Only draft/returned item rows may be deleted.
--   * Insert checks refuse pre-approved rows; budget confirmations have no client write path at all.
--   * Add created_by / submitted_by / status_reason / status_changed_* columns (additive).
--   * Edit lock: PR/PO header and item rows are read-only once the document leaves draft (PR: draft/returned).
--   * Seed SK read access to PO and supplier (Decision 2).
-- Depends on: has_permission(), role_permissions, procurement_* tables, 20261022130910 (audit lockdown)
-- Additive and idempotent. No tenant_id in this system. Project scoping is deferred (D1).

-- ---------------------------------------------------------------------------
-- 1. New columns (additive)
-- ---------------------------------------------------------------------------
alter table public.procurement_prs
  add column if not exists created_by        uuid,
  add column if not exists submitted_by      uuid,
  add column if not exists submitted_at      timestamptz,
  add column if not exists status_reason     text,
  add column if not exists status_changed_by uuid,
  add column if not exists status_changed_at timestamptz;

alter table public.procurement_pos
  add column if not exists created_by        uuid,
  add column if not exists submitted_by      uuid,
  add column if not exists submitted_at      timestamptz,
  add column if not exists status_reason     text,
  add column if not exists status_changed_by uuid,
  add column if not exists status_changed_at timestamptz;

alter table public.procurement_invoice_matches
  add column if not exists created_by        uuid,
  add column if not exists status_reason     text,
  add column if not exists status_changed_by uuid,
  add column if not exists status_changed_at timestamptz;

alter table public.procurement_budget_confirmations
  add column if not exists created_by        uuid,
  add column if not exists status_reason     text,
  add column if not exists status_changed_by uuid,
  add column if not exists status_changed_at timestamptz;

alter table public.procurement_rfqs
  add column if not exists created_by        uuid,   -- already exists in most installs
  add column if not exists status_reason     text,
  add column if not exists status_changed_by uuid,
  add column if not exists status_changed_at timestamptz;

alter table public.procurement_quotations
  add column if not exists created_by        uuid,
  add column if not exists status_reason     text,
  add column if not exists status_changed_by uuid,
  add column if not exists status_changed_at timestamptz;

-- Defaults apply to new rows only (legacy rows keep null: Decision 3).
alter table public.procurement_prs               alter column created_by set default auth.uid();
alter table public.procurement_pos               alter column created_by set default auth.uid();
alter table public.procurement_invoice_matches   alter column created_by set default auth.uid();
alter table public.procurement_budget_confirmations alter column created_by set default auth.uid();
alter table public.procurement_rfqs              alter column created_by set default auth.uid();
alter table public.procurement_quotations        alter column created_by set default auth.uid();

-- Force created_by to the caller on insert, so a client can't claim another author.
-- (auth.uid() is null for service/superuser sessions: the supplied value is kept.)
create or replace function public.proc_force_created_by()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'procurement_prs','procurement_pos','procurement_invoice_matches',
    'procurement_budget_confirmations','procurement_rfqs','procurement_quotations'
  ] loop
    execute format('drop trigger if exists trg_proc_force_created_by on public.%I', t);
    execute format('create trigger trg_proc_force_created_by before insert on public.%I
                    for each row execute function public.proc_force_created_by()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Replace all existing policies on the procurement tables (not notifications)
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in (
         'procurement_prs','procurement_pr_items',
         'procurement_budget_confirmations','procurement_budget_confirmation_items',
         'procurement_rfqs','procurement_rfq_suppliers','procurement_quotations','procurement_quotation_items',
         'procurement_pos','procurement_po_items','procurement_po_revisions',
         'procurement_delivery_notes','procurement_goods_receipts','procurement_invoice_matches',
         'procurement_suppliers','supplier_pq_records','supplier_pq_documents',
         'supplier_approved_trades','supplier_performance_scores','procurement_audit_log')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Plain tables: select = view, insert = can_create, update = edit. No delete.
do $$
declare
  m record;
begin
  for m in
    select * from (values
      ('procurement_rfq_suppliers',      'rfq'),
      ('procurement_quotation_items',    'rfq'),
      ('procurement_po_revisions',       'po'),
      ('procurement_delivery_notes',     'goods_receipt'),
      ('procurement_goods_receipts',     'goods_receipt'),
      ('procurement_suppliers',          'supplier'),
      ('supplier_pq_records',            'supplier'),
      ('supplier_pq_documents',          'supplier'),
      ('supplier_approved_trades',       'supplier'),
      ('supplier_performance_scores',    'supplier')
    ) as v(tbl, res)
  loop
    execute format('create policy %I on public.%I for select to authenticated
                    using ((select public.has_permission(''procurement'', %L, ''view'')))',
                   'proc_' || m.tbl || '_select', m.tbl, m.res);
    execute format('create policy %I on public.%I for insert to authenticated
                    with check ((select public.has_permission(''procurement'', %L, ''can_create'')))',
                   'proc_' || m.tbl || '_insert', m.tbl, m.res);
    execute format('create policy %I on public.%I for update to authenticated
                    using ((select public.has_permission(''procurement'', %L, ''edit'')))
                    with check ((select public.has_permission(''procurement'', %L, ''edit'')))',
                   'proc_' || m.tbl || '_update', m.tbl, m.res, m.res);
  end loop;
end $$;

-- Audit log: view only. No insert policy (the definer trigger writes it).
create policy proc_procurement_audit_log_select on public.procurement_audit_log
  for select to authenticated
  using ((select public.has_permission('procurement', 'audit_log', 'view')));

-- Budget confirmations (+items): read only for clients. They are created by procurement_confirm_budget().
create policy proc_procurement_budget_confirmations_select on public.procurement_budget_confirmations
  for select to authenticated
  using ((select public.has_permission('procurement', 'pr', 'view')));
create policy proc_procurement_budget_confirmation_items_select on public.procurement_budget_confirmation_items
  for select to authenticated
  using ((select public.has_permission('procurement', 'pr', 'view')));

-- PRs
create policy proc_procurement_prs_select on public.procurement_prs
  for select to authenticated
  using ((select public.has_permission('procurement', 'pr', 'view')));
create policy proc_procurement_prs_insert on public.procurement_prs
  for insert to authenticated
  with check (
    (select public.has_permission('procurement', 'pr', 'can_create'))
    and approval_status = 'draft'
    and approved_by is null
    and approved_at is null
    and submitted_by is null
    and budget_confirmation_id is null
    and coalesce(budget_checked, false) = false
  );
create policy proc_procurement_prs_update on public.procurement_prs
  for update to authenticated
  using ((select public.has_permission('procurement', 'pr', 'edit')))
  with check ((select public.has_permission('procurement', 'pr', 'edit')));

-- PR items: parent PR must be draft or returned for any write (Decision 1).
create policy proc_procurement_pr_items_select on public.procurement_pr_items
  for select to authenticated
  using ((select public.has_permission('procurement', 'pr', 'view')));
create policy proc_procurement_pr_items_insert on public.procurement_pr_items
  for insert to authenticated
  with check (
    (select public.has_permission('procurement', 'pr', 'can_create'))
    and exists (select 1 from public.procurement_prs p
                 where p.id = pr_id and p.approval_status in ('draft', 'returned'))
  );
create policy proc_procurement_pr_items_update on public.procurement_pr_items
  for update to authenticated
  using (
    (select public.has_permission('procurement', 'pr', 'edit'))
    and exists (select 1 from public.procurement_prs p
                 where p.id = pr_id and p.approval_status in ('draft', 'returned'))
  )
  with check (
    exists (select 1 from public.procurement_prs p
             where p.id = pr_id and p.approval_status in ('draft', 'returned'))
  );
create policy proc_procurement_pr_items_delete on public.procurement_pr_items
  for delete to authenticated
  using (
    (select public.has_permission('procurement', 'pr', 'edit'))
    and exists (select 1 from public.procurement_prs p
                 where p.id = pr_id and p.approval_status in ('draft', 'returned'))
  );

-- RFQs
create policy proc_procurement_rfqs_select on public.procurement_rfqs
  for select to authenticated
  using ((select public.has_permission('procurement', 'rfq', 'view')));
create policy proc_procurement_rfqs_insert on public.procurement_rfqs
  for insert to authenticated
  with check (
    (select public.has_permission('procurement', 'rfq', 'can_create'))
    and status = 'draft'
    and awarded_supplier_id is null
    and awarded_by is null
    and awarded_at is null
  );
create policy proc_procurement_rfqs_update on public.procurement_rfqs
  for update to authenticated
  using ((select public.has_permission('procurement', 'rfq', 'edit')))
  with check ((select public.has_permission('procurement', 'rfq', 'edit')));

-- Quotations. Sealed-bid select rule (BR-07) is P2: not applied here.
create policy proc_procurement_quotations_select on public.procurement_quotations
  for select to authenticated
  using ((select public.has_permission('procurement', 'rfq', 'view')));
create policy proc_procurement_quotations_insert on public.procurement_quotations
  for insert to authenticated
  with check (
    (select public.has_permission('procurement', 'rfq', 'can_create'))
    and status = 'pending'
    and not coalesce(is_awarded, false)
    and technical_score is null
    and commercial_score is null
    and combined_score is null
  );
create policy proc_procurement_quotations_update on public.procurement_quotations
  for update to authenticated
  using ((select public.has_permission('procurement', 'rfq', 'edit')))
  with check ((select public.has_permission('procurement', 'rfq', 'edit')));

-- POs
create policy proc_procurement_pos_select on public.procurement_pos
  for select to authenticated
  using ((select public.has_permission('procurement', 'po', 'view')));
create policy proc_procurement_pos_insert on public.procurement_pos
  for insert to authenticated
  with check (
    (select public.has_permission('procurement', 'po', 'can_create'))
    and status = 'draft'
    and approved_by is null
    and approved_at is null
    and issued_by is null
    and submitted_by is null
  );
create policy proc_procurement_pos_update on public.procurement_pos
  for update to authenticated
  using ((select public.has_permission('procurement', 'po', 'edit')))
  with check ((select public.has_permission('procurement', 'po', 'edit')));

-- PO items: parent PO must be draft for any write (Decision 1).
-- quantity_delivered / quantity_accepted are maintained by procurement_sync_po_delivery() (definer).
create policy proc_procurement_po_items_select on public.procurement_po_items
  for select to authenticated
  using ((select public.has_permission('procurement', 'po', 'view')));
create policy proc_procurement_po_items_insert on public.procurement_po_items
  for insert to authenticated
  with check (
    (select public.has_permission('procurement', 'po', 'can_create'))
    and exists (select 1 from public.procurement_pos p where p.id = po_id and p.status = 'draft')
  );
create policy proc_procurement_po_items_update on public.procurement_po_items
  for update to authenticated
  using (
    (select public.has_permission('procurement', 'po', 'edit'))
    and exists (select 1 from public.procurement_pos p where p.id = po_id and p.status = 'draft')
  )
  with check (
    exists (select 1 from public.procurement_pos p where p.id = po_id and p.status = 'draft')
  );
create policy proc_procurement_po_items_delete on public.procurement_po_items
  for delete to authenticated
  using (
    (select public.has_permission('procurement', 'po', 'edit'))
    and exists (select 1 from public.procurement_pos p where p.id = po_id and p.status = 'draft')
  );

-- Invoice matches
create policy proc_procurement_invoice_matches_select on public.procurement_invoice_matches
  for select to authenticated
  using ((select public.has_permission('procurement', 'invoice', 'view')));
create policy proc_procurement_invoice_matches_insert on public.procurement_invoice_matches
  for insert to authenticated
  with check (
    (select public.has_permission('procurement', 'invoice', 'can_create'))
    and status in ('pending', 'matched', 'variance_detected')
    and approved_by is null
    and approved_at is null
  );
create policy proc_procurement_invoice_matches_update on public.procurement_invoice_matches
  for update to authenticated
  using ((select public.has_permission('procurement', 'invoice', 'edit')))
  with check ((select public.has_permission('procurement', 'invoice', 'edit')));

-- ---------------------------------------------------------------------------
-- 3. Header edit lock (Decision 1): PR header editable only in draft/returned, PO header only in draft.
--    Transition functions (dcos.proc_transition = 'on') are exempt. updated_at alone never counts as an edit.
-- ---------------------------------------------------------------------------
create or replace function public.proc_edit_lock_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
  v_open   boolean;
begin
  if coalesce(current_setting('dcos.proc_transition', true), '') = 'on' then
    return new;
  end if;

  if tg_table_name = 'procurement_prs' then
    v_status := old.approval_status;
    v_open   := v_status in ('draft', 'returned');
  else
    v_status := old.status;
    v_open   := v_status = 'draft';
  end if;

  if not v_open and (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
    raise exception 'PROC_LOCKED: % is % and can no longer be edited', tg_table_name, v_status
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists trg_proc_zz_edit_lock_guard on public.procurement_prs;
create trigger trg_proc_zz_edit_lock_guard before update on public.procurement_prs
  for each row execute function public.proc_edit_lock_guard();

drop trigger if exists trg_proc_zz_edit_lock_guard on public.procurement_pos;
create trigger trg_proc_zz_edit_lock_guard before update on public.procurement_pos
  for each row execute function public.proc_edit_lock_guard();

-- ---------------------------------------------------------------------------
-- 4. Decision 2: storekeepers (SK) can read POs and suppliers (goods receipt screens embed them).
-- ---------------------------------------------------------------------------
insert into public.role_permissions (role_code, module, action, view, scope)
select 'SK', 'procurement', a.action, true, 'company'
  from (values ('po'), ('supplier')) as a(action)
 where exists (select 1 from public.roles where code = 'SK')
on conflict (role_code, module, action) do update set view = true;

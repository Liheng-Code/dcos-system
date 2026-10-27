-- Migration: 20261027131623_qs_qto_rls.sql
-- Purpose: Quantity Take-off P0 — tenant isolation and permission checks on the existing qto_*
--          tables (until now every policy was `using (true)`), tenant defaults for new rows, and a
--          private drawing bucket (files are read through signed URLs).
-- Follows 20261027131621 / 20261027131622, which backfilled tenant_id on these tables.
--
-- Readers outside QTO that keep working:
--   * Project precontract screens read/write qto_document_register → tenant check only, no QTO permission.
--   * The AI BOQ draft route reads qto_drawing_revisions with the user client and downloads files with
--     the service role → drawing tables use the tenant check only; the service role ignores RLS.
-- Not changed (legacy V1, no tenant column): qto_packages, qto_assumptions, qto_clarifications,
-- qto_reviews, qto_revisions, qto_audit_log.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Tenant defaults
-- ──────────────────────────────────────────────────────────────────────────
alter table public.qto_items             alter column tenant_id set default public.dwl_current_tenant();
alter table public.qto_measurements      alter column tenant_id set default public.dwl_current_tenant();
alter table public.qto_calculations      alter column tenant_id set default public.dwl_current_tenant();
alter table public.qto_drawing_register  alter column tenant_id set default public.dwl_current_tenant();
alter table public.qto_drawing_revisions alter column tenant_id set default public.dwl_current_tenant();
alter table public.qto_document_register alter column tenant_id set default public.dwl_current_tenant();

-- Child rows take the tenant of their parent, whatever the client sends.
create or replace function public.qto_inherit_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name in ('qto_measurements', 'qto_calculations') then
    select tenant_id into new.tenant_id from public.qto_items where id = new.qto_item_id;
  elsif tg_table_name = 'qto_item_factors' then
    select tenant_id into new.tenant_id from public.qto_items where id = new.item_id;
  elsif tg_table_name = 'qto_drawing_revisions' then
    select tenant_id into new.tenant_id from public.qto_drawing_register where id = new.drawing_id;
  elsif tg_table_name = 'qto_items' and new.session_version_id is not null then
    select tenant_id into new.tenant_id from public.qto_session_versions where id = new.session_version_id;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['qto_measurements', 'qto_calculations', 'qto_item_factors', 'qto_drawing_revisions', 'qto_items'] loop
    execute format('drop trigger if exists qto_inherit_tenant on public.%I', t);
    execute format('create trigger qto_inherit_tenant before insert on public.%I
                    for each row execute function public.qto_inherit_tenant()', t);
  end loop;
end $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Policies
-- ──────────────────────────────────────────────────────────────────────────
-- Registers (shared with the project precontract screens): same company only.
do $$
declare
  t text; pfx text;
begin
  for t, pfx in select * from (values ('qto_document_register', 'qto_doc'), ('qto_drawing_register', 'qto_draw'),
                                      ('qto_drawing_revisions', 'qto_rev')) v(t, p) loop
    execute format('drop policy if exists %I on public.%I', pfx || '_select', t);
    execute format('drop policy if exists %I on public.%I', pfx || '_insert', t);
    execute format('drop policy if exists %I on public.%I', pfx || '_update', t);
    execute format('drop policy if exists %I on public.%I', pfx || '_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.qto_tenant_ok(tenant_id))', pfx || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.qto_tenant_ok(tenant_id))', pfx || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.qto_tenant_ok(tenant_id)) with check (public.qto_tenant_ok(tenant_id))', pfx || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.qto_tenant_ok(tenant_id))', pfx || '_delete', t);
  end loop;
end $$;

-- Take-off content: same company and QTO permissions. Items are only hard-deleted by an admin (BR-03).
drop policy if exists qto_item_select on public.qto_items;
drop policy if exists qto_item_insert on public.qto_items;
drop policy if exists qto_item_update on public.qto_items;
drop policy if exists qto_item_delete on public.qto_items;
create policy qto_item_select on public.qto_items for select to authenticated
  using (public.qto_tenant_ok(tenant_id) and public.has_permission('qto', 'qto_register', 'view'));
create policy qto_item_insert on public.qto_items for insert to authenticated
  with check (public.qto_tenant_ok(tenant_id) and public.has_permission('qto', 'qto_workspace', 'edit'));
create policy qto_item_update on public.qto_items for update to authenticated
  using (public.qto_tenant_ok(tenant_id) and public.has_permission('qto', 'qto_workspace', 'edit'))
  with check (public.qto_tenant_ok(tenant_id) and public.has_permission('qto', 'qto_workspace', 'edit'));
create policy qto_item_delete on public.qto_items for delete to authenticated
  using (public.qto_tenant_ok(tenant_id) and public.is_admin(auth.uid()));

do $$
declare
  t text; pfx text;
begin
  for t, pfx in select * from (values ('qto_measurements', 'qto_meas'), ('qto_calculations', 'qto_calc')) v(t, p) loop
    execute format('drop policy if exists %I on public.%I', pfx || '_select', t);
    execute format('drop policy if exists %I on public.%I', pfx || '_insert', t);
    execute format('drop policy if exists %I on public.%I', pfx || '_update', t);
    execute format('drop policy if exists %I on public.%I', pfx || '_delete', t);
    execute format($p$create policy %I on public.%I for select to authenticated
      using (public.qto_tenant_ok(tenant_id) and public.has_permission('qto', 'qto_register', 'view'))$p$, pfx || '_select', t);
    execute format($p$create policy %I on public.%I for insert to authenticated
      with check (public.qto_tenant_ok(tenant_id) and public.has_permission('qto', 'qto_workspace', 'edit'))$p$, pfx || '_insert', t);
    execute format($p$create policy %I on public.%I for update to authenticated
      using (public.qto_tenant_ok(tenant_id) and public.has_permission('qto', 'qto_workspace', 'edit'))
      with check (public.qto_tenant_ok(tenant_id) and public.has_permission('qto', 'qto_workspace', 'edit'))$p$, pfx || '_update', t);
    execute format($p$create policy %I on public.%I for delete to authenticated
      using (public.qto_tenant_ok(tenant_id) and public.has_permission('qto', 'qto_workspace', 'edit'))$p$, pfx || '_delete', t);
  end loop;
end $$;

-- Calculation lines and BOQ links follow their calculation / item.
create or replace function public.qto_item_tenant_ok(p_item_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.qto_items i where i.id = p_item_id and public.qto_tenant_ok(i.tenant_id))
$$;

drop policy if exists qto_line_select on public.qto_calculation_lines;
drop policy if exists qto_line_insert on public.qto_calculation_lines;
drop policy if exists qto_line_update on public.qto_calculation_lines;
drop policy if exists qto_line_delete on public.qto_calculation_lines;
create policy qto_line_select on public.qto_calculation_lines for select to authenticated
  using (exists (select 1 from public.qto_calculations c where c.id = calculation_id and public.qto_tenant_ok(c.tenant_id))
         and public.has_permission('qto', 'qto_register', 'view'));
create policy qto_line_insert on public.qto_calculation_lines for insert to authenticated
  with check (exists (select 1 from public.qto_calculations c where c.id = calculation_id and public.qto_tenant_ok(c.tenant_id))
              and public.has_permission('qto', 'qto_workspace', 'edit'));
create policy qto_line_update on public.qto_calculation_lines for update to authenticated
  using (exists (select 1 from public.qto_calculations c where c.id = calculation_id and public.qto_tenant_ok(c.tenant_id))
         and public.has_permission('qto', 'qto_workspace', 'edit'));
create policy qto_line_delete on public.qto_calculation_lines for delete to authenticated
  using (exists (select 1 from public.qto_calculations c where c.id = calculation_id and public.qto_tenant_ok(c.tenant_id))
         and public.has_permission('qto', 'qto_workspace', 'edit'));

drop policy if exists qto_boqlink_select on public.qto_boq_links;
drop policy if exists qto_boqlink_insert on public.qto_boq_links;
drop policy if exists qto_boqlink_delete on public.qto_boq_links;
create policy qto_boqlink_select on public.qto_boq_links for select to authenticated
  using (public.qto_item_tenant_ok(qto_item_id));
create policy qto_boqlink_insert on public.qto_boq_links for insert to authenticated
  with check (public.qto_item_tenant_ok(qto_item_id) and public.has_permission('qto', 'qto_boq_mapping', 'can_create')
              and public.qto_version_is_editable(public.qto_item_version(qto_item_id)));
-- Links written by a transfer are part of the lineage and are not removed by hand.
create policy qto_boqlink_delete on public.qto_boq_links for delete to authenticated
  using (public.qto_item_tenant_ok(qto_item_id) and transfer_id is null
         and public.has_permission('qto', 'qto_boq_mapping', 'can_create')
         and public.qto_version_is_editable(public.qto_item_version(qto_item_id)));

grant execute on function public.qto_item_tenant_ok(uuid) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Private drawing bucket (signed URLs; the read policy for signed-in users stays)
-- ──────────────────────────────────────────────────────────────────────────
update storage.buckets set public = false where id = 'qto-files';

-- Migration: 20260928000004_tender_award_carryover_access.sql
-- Purpose: Let Award & Convert (apps/web/components/projects/award-conversion-dialog.tsx) carry the tender
--          risk register and price snapshot into the post-contract tables when the person awarding is not
--          the project's PM (usually a director). Found in Phase D browser testing: qs_risk_items and
--          qs_contract_snapshots only accepted rows from projects.project_manager_id, so an award by a director
--          silently dropped both.
--            * can_award_tender(uid): the user holds tender_lifecycle.submit (the permission that records a
--              tender's result) through user_roles
--            * INSERT + SELECT policies on qs_risk_items / qs_contract_snapshots for those users (added to,
--              not replacing, the existing PM / project-member policies)
--            * qs_risk_items.category widened to the tender register's categories
--              (20260928000003_tender_workstream_registers.sql) so every tender risk can carry over
-- Idempotent: safe to replay.

create or replace function public.can_award_tender(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_code = ur.role_code
    where ur.user_id = p_uid
      and rp.module = 'tender'
      and rp.action = 'tender_lifecycle'
      and rp.submit
  );
$$;

grant execute on function public.can_award_tender(uuid) to authenticated;

-- Carried-over risks are marked source = 'tender_conversion' by carryOverRisks (lib/qs-service.ts).
drop policy if exists "tender awarders can insert carried risks" on public.qs_risk_items;
create policy "tender awarders can insert carried risks"
  on public.qs_risk_items for insert to authenticated
  with check (source = 'tender_conversion' and public.can_award_tender(auth.uid()));

drop policy if exists "tender awarders can view risk items" on public.qs_risk_items;
create policy "tender awarders can view risk items"
  on public.qs_risk_items for select to authenticated
  using (public.can_award_tender(auth.uid()));

drop policy if exists "tender awarders can insert contract snapshots" on public.qs_contract_snapshots;
create policy "tender awarders can insert contract snapshots"
  on public.qs_contract_snapshots for insert to authenticated
  with check (public.can_award_tender(auth.uid()));

drop policy if exists "tender awarders can view contract snapshots" on public.qs_contract_snapshots;
create policy "tender awarders can view contract snapshots"
  on public.qs_contract_snapshots for select to authenticated
  using (public.can_award_tender(auth.uid()));

alter table public.qs_risk_items drop constraint if exists qs_risk_items_category_check;
alter table public.qs_risk_items add constraint qs_risk_items_category_check
  check (category in ('technical','commercial','schedule','geotechnical','market','regulatory','environmental','other',
                      'cost','programme','procurement','contract','site','labour','design','client'));

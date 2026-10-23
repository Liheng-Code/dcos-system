-- Resolve MDM tenant access from the authenticated profile instead of relying
-- on a custom JWT claim that may not be present in local or existing sessions.
-- The profile lookup is always scoped to auth.uid(), so callers cannot choose
-- another tenant by supplying a tenant identifier.

drop policy if exists mdm_entity_registry_tenant_select on public.mdm_entity_registry;
create policy mdm_entity_registry_tenant_select on public.mdm_entity_registry
  for select to authenticated
  using (
    tenant_id = (select p.company_id from public.profiles p where p.id = auth.uid())
  );

drop policy if exists mdm_registry_events_tenant_select on public.mdm_registry_events;
create policy mdm_registry_events_tenant_select on public.mdm_registry_events
  for select to authenticated
  using (
    tenant_id = (select p.company_id from public.profiles p where p.id = auth.uid())
    and (select public.has_permission('mdm', 'entity_registry', 'view'))
  );

drop policy if exists mdm_change_requests_tenant_select on public.mdm_change_requests;
create policy mdm_change_requests_tenant_select on public.mdm_change_requests
  for select to authenticated
  using (
    tenant_id = (select p.company_id from public.profiles p where p.id = auth.uid())
    and (
      requested_by = auth.uid()
      or (entity_code not in ('COM', 'PAR', 'SUP', 'PER', 'USR', 'EMP')
          and (select public.has_permission('mdm', 'change_request', 'view')))
    )
  );

drop policy if exists mdm_request_events_tenant_select on public.mdm_request_events;
create policy mdm_request_events_tenant_select on public.mdm_request_events
  for select to authenticated
  using (
    tenant_id = (select p.company_id from public.profiles p where p.id = auth.uid())
    and exists (
      select 1 from public.mdm_change_requests r
      where r.id = mdm_request_events.request_id
        and r.tenant_id = mdm_request_events.tenant_id
        and (
          r.requested_by = auth.uid()
          or (r.entity_code not in ('COM', 'PAR', 'SUP', 'PER', 'USR', 'EMP')
              and (select public.has_permission('mdm', 'change_request', 'view')))
        )
    )
  );

-- Keep tenant derivation consistent for all MDM write RPCs. The database
-- profile is the source of truth; auth.uid() still identifies the caller.
create or replace function public.mdm_assert_actor_tenant()
returns table (actor_id uuid, tenant_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_profile_tenant uuid;
begin
  if v_actor is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  select p.company_id into v_profile_tenant
  from public.profiles p
  where p.id = v_actor;

  if v_profile_tenant is null then
    raise exception using errcode = '42501', message = 'An assigned tenant is required';
  end if;

  return query select v_actor, v_profile_tenant;
end;
$$;

comment on function public.mdm_assert_actor_tenant() is
  'Returns the authenticated actor and the tenant assigned to that actor in profiles.company_id.';

-- Issuing a signed license revision is one atomic step (design 3.3, 5.4): the
-- previous live revision of the same license is superseded, this revision goes
-- live, its token is stored, the subscription and tenant follow, and the event
-- is recorded. The HQ server verifies the signature before calling this.

create or replace function public.issue_license(
  p_license_id uuid,
  p_token text,
  p_jti text,
  p_kid text,
  p_claims jsonb,
  p_expires_at timestamptz,
  p_actor uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.licenses;
  v_status text;
  v_previous uuid;
begin
  select * into l from public.licenses where id = p_license_id for update;
  if l.id is null then
    raise exception 'License revision % not found', p_license_id;
  end if;
  if l.status <> 'draft' then
    raise exception 'License % revision % is already %', l.number, l.revision, l.status;
  end if;

  v_status := case l.hq_state
    when 'suspended' then 'suspended'
    when 'revoked' then 'revoked'
    when 'terminated' then 'terminated'
    else 'active'
  end;

  -- Supersede whatever is live on this deployment (normally the previous revision).
  update public.licenses
     set status = 'superseded'
   where deployment_id = l.deployment_id
     and status in ('active', 'suspended')
     and id <> l.id
  returning id into v_previous;

  update public.licenses
     set status = v_status, issued_at = now(), issued_by = p_actor
   where id = l.id;

  insert into public.license_tokens (license_id, tenant_id, jti, kid, profile, token, claims, expires_at, created_by)
  values (l.id, l.tenant_id, p_jti, p_kid, coalesce(p_claims ->> 'prof', 'online'), p_token, p_claims, p_expires_at, p_actor);

  if l.subscription_id is not null then
    update public.subscriptions
       set status = case when v_status in ('revoked', 'terminated') then 'ended' else 'active' end,
           current_period_end = l.valid_until,
           plan_id = l.plan_id,
           type = l.type
     where id = l.subscription_id;
  end if;

  update public.tenants
     set status = case
       when v_status = 'suspended' then 'suspended'
       when v_status in ('revoked', 'terminated') then 'churned'
       when l.type = 'trial' then 'trial'
       else 'customer'
     end
   where id = l.tenant_id;

  insert into public.license_events (tenant_id, license_id, event_type, payload, actor_id)
  values (l.tenant_id, l.id,
          case
            when v_status = 'suspended' then 'suspended'
            when v_status = 'revoked' then 'revoked'
            when l.revision = 1 then 'issued'
            else 'revised'
          end,
          jsonb_build_object('number', l.number, 'revision', l.revision, 'jti', p_jti, 'kid', p_kid,
                             'reason', l.change_reason, 'superseded', v_previous),
          p_actor);
end;
$$;

revoke all on function public.issue_license(uuid, text, text, text, jsonb, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.issue_license(uuid, text, text, text, jsonb, timestamptz, uuid) to service_role;

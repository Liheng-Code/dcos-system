-- Migration: 20260623000001_add_company_id_to_profiles_jwt_hook.sql
-- Purpose: Wire profiles to companies (the tenant entity) and inject tenant_id
--          into Supabase JWTs via a custom_access_token_hook.
-- Depends on: profiles (20260526_0001), companies (20260527000006)
--
-- IMPORTANT — post-migration step (cannot be scripted):
--   After applying this migration, register the hook in the Supabase dashboard:
--   Auth → Hooks → Custom Access Token Hook → select function: public.custom_access_token_hook
--   Without this registration the JWT tenant_id claim will remain empty.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add company_id column to profiles
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists company_id uuid
    references public.companies(id) on delete set null;

create index if not exists profiles_company_id_idx on public.profiles(company_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Seed: assign all existing profiles to the single seed company (MCC).
--    In a real multi-tenant deployment each user is assigned their own company
--    during onboarding via the admin API or invitation flow.
-- ─────────────────────────────────────────────────────────────────────────────
update public.profiles p
set company_id = c.id
from public.companies c
where c.code = 'MCC'
  and p.company_id is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. custom_access_token_hook — injects tenant_id claim into every JWT.
--    Supabase calls this function (if registered) before signing the access
--    token, allowing us to embed application-level claims the RLS policies
--    can read with  auth.jwt() ->> 'tenant_id'.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims        jsonb;
  user_tenant   uuid;
begin
  claims := event -> 'claims';

  select company_id
    into user_tenant
    from public.profiles
   where id = (event ->> 'user_id')::uuid;

  if user_tenant is not null then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(user_tenant::text));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- Only supabase_auth_admin (the Auth service) may invoke this hook.
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

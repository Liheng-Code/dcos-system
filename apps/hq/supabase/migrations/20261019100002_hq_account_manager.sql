-- The HQ staff member who owns the customer relationship (design 3.1,
-- tenants.account_manager_id); shown as "Owner" on the licenses list.
alter table public.tenants
  add column if not exists account_manager_id uuid references auth.users(id) on delete set null;

update public.tenants set account_manager_id = created_by where account_manager_id is null;

create index if not exists tenants_account_manager_idx on public.tenants (account_manager_id);

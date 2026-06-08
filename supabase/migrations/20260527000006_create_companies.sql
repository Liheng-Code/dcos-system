create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text not null unique,
  logo_url    text,
  address     text,
  phone       text,
  email       text,
  website     text,
  tax_id      text,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

insert into public.companies (name, code, description)
values ('My Construction Company', 'MCC', 'Main construction company');

alter table public.companies enable row level security;

create policy "Admins can manage companies"
  on public.companies
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

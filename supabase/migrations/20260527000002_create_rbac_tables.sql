create table if not exists public.roles (
  code        text primary key,
  name        text not null,
  type        text not null check (type in ('internal_level', 'functional', 'external')),
  level       int check (level between 0 and 6),
  description text
);

create table if not exists public.role_permissions (
  role_code text not null references public.roles(code) on delete cascade,
  module    text not null,
  action    text not null,
  view      boolean not null default false,
  can_create boolean not null default false,
  edit      boolean not null default false,
  delete    boolean not null default false,
  submit    boolean not null default false,
  approve   boolean not null default false,
  reject    boolean not null default false,
  export    boolean not null default false,
  transmit  boolean not null default false,
  configure boolean not null default false,
  reassign  boolean not null default false,
  scope     text default null check (scope in ('own', 'department', 'project', 'company')),
  primary key (role_code, module, action)
);

create table if not exists public.user_roles (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role_code text not null references public.roles(code) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role_code)
);

create table if not exists public.approval_thresholds (
  id              uuid primary key default gen_random_uuid(),
  module          text not null,
  tier            text not null check (tier in ('tier_1', 'tier_2', 'tier_3')),
  min_amount      numeric default 0,
  max_amount      numeric,
  approver_roles  text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(module, tier)
);

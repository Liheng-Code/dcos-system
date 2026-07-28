-- Migration: 20260727000004_create_inv_tools.sql
-- Purpose: CWIMS Stage 1+2 gap-closure — serialized returnable tool custody tracking
-- Depends on: profiles, projects, wbs_nodes (20260527xxxxx), inv module (20260621000001)
-- Note: "one custodian at a time" is primarily a service-layer business rule; a partial
--       unique index below acts as a DB-level safety net only.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. inv_tools — Tool Master
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.inv_tools (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null,
  tool_code        text        not null,
  name             text        not null,
  serial_no        text,
  category         text,
  purchase_value   numeric(18,2),
  status           text        not null default 'available'
                     constraint inv_tools_status_check
                     check (status in ('available','issued','maintenance','lost','disposed')),
  is_restricted    boolean     not null default false,
  created_by       uuid        references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint inv_tools_code_tenant_uniq unique (tenant_id, tool_code)
);

create unique index if not exists inv_tools_serial_tenant_uniq
  on public.inv_tools(tenant_id, serial_no) where serial_no is not null;

create index if not exists inv_tools_tenant_idx on public.inv_tools(tenant_id);
create index if not exists inv_tools_status_idx on public.inv_tools(tenant_id, status);

create trigger inv_tools_set_updated_at
  before update on public.inv_tools
  for each row execute function public.inv_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. inv_tool_issues — Tool Custody / Issue-Return Ledger
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.inv_tool_issues (
  id                       uuid        primary key default gen_random_uuid(),
  tenant_id                uuid        not null,
  tool_id                  uuid        not null references public.inv_tools(id) on delete restrict,
  custodian_id             uuid        not null references public.profiles(id) on delete restrict,
  project_id               uuid        not null references public.projects(id) on delete cascade,
  wbs_node_id              uuid        references public.wbs_nodes(id) on delete set null,
  issued_by                uuid        references public.profiles(id) on delete set null,
  issued_at                timestamptz not null default now(),
  due_date                 date        not null,
  condition_out            text,
  condition_out_photo_ids  uuid[],
  returned_at              timestamptz,
  returned_to              uuid        references public.profiles(id) on delete set null,
  condition_in             text,
  condition_in_photo_ids   uuid[],
  status                   text        not null default 'issued'
                             constraint inv_tool_issues_status_check
                             check (status in ('issued','overdue','returned','damaged','lost')),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists inv_tool_issues_tenant_idx    on public.inv_tool_issues(tenant_id);
create index if not exists inv_tool_issues_project_idx   on public.inv_tool_issues(tenant_id, project_id);
create index if not exists inv_tool_issues_tool_idx      on public.inv_tool_issues(tenant_id, tool_id);
create index if not exists inv_tool_issues_custodian_idx on public.inv_tool_issues(tenant_id, custodian_id);
create index if not exists inv_tool_issues_status_idx    on public.inv_tool_issues(tenant_id, status);

-- Safety net: at most one open ("issued") custody row per tool at the DB level.
-- The definitive "one custodian at a time" business rule is enforced by the service layer.
create unique index if not exists inv_tool_issues_one_active_per_tool
  on public.inv_tool_issues(tool_id) where status = 'issued';

create trigger inv_tool_issues_set_updated_at
  before update on public.inv_tool_issues
  for each row execute function public.inv_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.inv_tools       enable row level security;
alter table public.inv_tool_issues enable row level security;

create policy "inv_tools_tenant_isolation" on public.inv_tools
  for all to authenticated
  using  (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "inv_tool_issues_tenant_isolation" on public.inv_tool_issues
  for all to authenticated
  using  (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

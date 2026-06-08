create table public.wbs_nodes (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  parent_id         uuid references public.wbs_nodes(id) on delete cascade,
  node_type         text not null check (node_type in ('building', 'level', 'zone', 'room', 'element', 'task_group', 'discipline')),
  wbs_code          text not null,
  wbs_name          text not null,
  full_path         text,
  sort_order        int not null default 0,
  progress_percent  numeric not null default 0 check (progress_percent between 0 and 100),
  status            text not null default 'active' check (status in ('active', 'closed', 'on_hold')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique(project_id, wbs_code)
);

create or replace function public.build_wbs_full_path(p_id uuid)
returns text
language sql
stable
as $$
  with recursive ancestors as (
    select id, wbs_code, parent_id, 1 as depth
    from public.wbs_nodes
    where id = p_id
    union all
    select n.id, n.wbs_code, n.parent_id, a.depth + 1
    from public.wbs_nodes n
    inner join ancestors a on n.id = a.parent_id
  )
  select string_agg(wbs_code, ' / ' order by depth desc)
  from ancestors;
$$;

create or replace function public.update_wbs_full_path()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  new.full_path := public.build_wbs_full_path(new.id);
  return new;
end;
$$;

create trigger trg_wbs_nodes_full_path
  before insert or update on public.wbs_nodes
  for each row execute function public.update_wbs_full_path();

create index idx_wbs_nodes_project_id on public.wbs_nodes(project_id);
create index idx_wbs_nodes_parent_id on public.wbs_nodes(parent_id);

alter table public.wbs_nodes enable row level security;

create policy "Authenticated users can view wbs nodes"
  on public.wbs_nodes
  for select
  to authenticated
  using (true);

create policy "Authenticated users can create wbs nodes"
  on public.wbs_nodes
  for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update wbs nodes"
  on public.wbs_nodes
  for update
  to authenticated
  using (true)
  with check (true);

create policy "Admins can delete wbs nodes"
  on public.wbs_nodes
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

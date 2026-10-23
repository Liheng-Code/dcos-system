-- Version-pinned crosswalk between QS estimate scaffolds and Planning WBS templates.
-- QS item hierarchy and Planning delivery hierarchy remain separate.

create table if not exists public.qs_wbs_template_planning_links (
  id uuid primary key default gen_random_uuid(),
  qs_template_id uuid not null references public.qs_wbs_templates(id) on delete cascade,
  planning_template_id uuid not null references public.wbs_templates(id) on delete cascade,
  qs_template_version integer not null,
  planning_template_version integer not null,
  mapping_kind text not null,
  qs_template_item_id uuid references public.qs_wbs_template_items(id) on delete cascade,
  planning_node_key text,
  status text not null default 'suggested',
  note text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qs_wbs_template_planning_links_kind_chk
    check (mapping_kind in ('template', 'scope_node', 'location')),
  constraint qs_wbs_template_planning_links_status_chk
    check (status in ('suggested', 'approved', 'excluded')),
  constraint qs_wbs_template_planning_links_shape_chk check (
    (mapping_kind = 'template' and qs_template_item_id is null and planning_node_key is null)
    or (mapping_kind = 'scope_node' and qs_template_item_id is not null and nullif(btrim(planning_node_key), '') is not null)
    or (mapping_kind = 'location' and qs_template_item_id is null and nullif(btrim(planning_node_key), '') is not null)
  ),
  constraint qs_wbs_template_planning_links_versions_chk
    check (qs_template_version > 0 and planning_template_version > 0)
);

create unique index if not exists uq_qs_wbs_tpl_plan_link_template
  on public.qs_wbs_template_planning_links(qs_template_id, planning_template_id)
  where mapping_kind = 'template';
create unique index if not exists uq_qs_wbs_tpl_plan_link_node
  on public.qs_wbs_template_planning_links(qs_template_id, planning_template_id, qs_template_item_id, planning_node_key)
  where mapping_kind = 'scope_node';
create unique index if not exists uq_qs_wbs_tpl_plan_link_location
  on public.qs_wbs_template_planning_links(qs_template_id, planning_template_id, planning_node_key)
  where mapping_kind = 'location';
create index if not exists idx_qs_wbs_tpl_plan_links_qs
  on public.qs_wbs_template_planning_links(qs_template_id, is_active, status);
create index if not exists idx_qs_wbs_tpl_plan_links_planning
  on public.qs_wbs_template_planning_links(planning_template_id, is_active, status);

comment on table public.qs_wbs_template_planning_links is
  'Version-pinned links from QS estimate scaffolds and scope items to Planning WBS templates and stable template node keys.';

alter table public.qs_wbs_template_planning_links enable row level security;
drop policy if exists "qs_wbs_template_planning_links select" on public.qs_wbs_template_planning_links;
create policy "qs_wbs_template_planning_links select"
  on public.qs_wbs_template_planning_links for select to authenticated using (true);
drop policy if exists "qs_wbs_template_planning_links manage" on public.qs_wbs_template_planning_links;
create policy "qs_wbs_template_planning_links manage"
  on public.qs_wbs_template_planning_links for all to authenticated
  using (public.can_manage_master_libraries())
  with check (public.can_manage_master_libraries());

comment on column public.qs_wbs_template_planning_links.qs_template_version is
  'QS scaffold version the association was reviewed against.';
comment on column public.qs_wbs_template_planning_links.planning_template_version is
  'Planning WBS template version the association was reviewed against.';
comment on column public.qs_wbs_template_planning_links.planning_node_key is
  'Stable node key within the pinned Planning template content document.';


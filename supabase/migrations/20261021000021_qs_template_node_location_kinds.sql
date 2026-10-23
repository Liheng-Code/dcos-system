-- Distinguish reusable QS scope structure and location patterns from live project WBS nodes.

alter table public.qs_wbs_template_items
  add column if not exists node_kind text not null default 'scope_item';

alter table public.qs_wbs_template_items
  drop constraint if exists qs_wbs_template_items_node_kind_chk;
alter table public.qs_wbs_template_items
  add constraint qs_wbs_template_items_node_kind_chk
  check (node_kind in ('scope_group', 'scope_item', 'work_package', 'system', 'asset'));

create unique index if not exists uq_qs_wbs_template_item_code
  on public.qs_wbs_template_items(template_id, item_code);

alter table public.qs_wbs_template_locations
  add column if not exists location_kind text,
  add column if not exists location_config jsonb not null default '{}'::jsonb;

alter table public.qs_wbs_template_locations
  drop constraint if exists qs_wbs_template_locations_kind_chk;
alter table public.qs_wbs_template_locations
  add constraint qs_wbs_template_locations_kind_chk
  check (location_kind is null or location_kind in (
    'building', 'level', 'zone', 'area', 'facility', 'route', 'segment', 'asset', 'system'
  ));

alter table public.qs_wbs_template_locations
  drop constraint if exists qs_wbs_template_locations_config_chk;
alter table public.qs_wbs_template_locations
  add constraint qs_wbs_template_locations_config_chk
  check (jsonb_typeof(location_config) = 'object');

create index if not exists idx_qs_wbs_template_locations_kind
  on public.qs_wbs_template_locations(template_id, location_kind, sort_order);

comment on column public.qs_wbs_template_items.node_kind is
  'Kind of reusable QS scope structure; these rows are template content, not operational project WBS nodes.';
comment on column public.qs_wbs_template_locations.location_kind is
  'Reusable location-pattern kind. Null preserves legacy rows and is inferred from template/location labels at use time.';
comment on column public.qs_wbs_template_locations.location_config is
  'Pattern parameters only. Project-specific levels, routes, segments, and assets stay in the project WBS/location model.';

-- Activity Library — quantities available to schedule generation, per WBS node and metric.
-- wbs_node_quantities is constrained to GFA only, so generation reads this table through the quantity-provider
-- abstraction (source = 'bim' | 'boq' | 'manual'). BIM/BOQ importers write here later; planners enter 'manual'.

create table if not exists public.plan_act_node_quantities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  wbs_node_id uuid not null references public.wbs_nodes(id) on delete cascade,
  metric_code text not null,                       -- matches plan_act_quantity_rules.metric_code
  value numeric not null check (value >= 0),
  unit text,
  source text not null default 'manual' check (source in ('bim','boq','manual','calculated','module')),
  source_ref text,
  note text,
  created_by uuid default auth.uid(),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wbs_node_id, metric_code, source)
);
create index if not exists idx_plan_act_nodeq_project on public.plan_act_node_quantities(project_id);
create index if not exists idx_plan_act_nodeq_node on public.plan_act_node_quantities(wbs_node_id, metric_code);

drop trigger if exists set_plan_act_node_quantities_updated_at on public.plan_act_node_quantities;
create trigger set_plan_act_node_quantities_updated_at before update on public.plan_act_node_quantities
  for each row execute function public.set_updated_at();

alter table public.plan_act_node_quantities enable row level security;
drop policy if exists plan_act_nodeq_select on public.plan_act_node_quantities;
create policy plan_act_nodeq_select on public.plan_act_node_quantities for select to authenticated
  using (public.is_project_member(project_id));
drop policy if exists plan_act_nodeq_write on public.plan_act_node_quantities;
create policy plan_act_nodeq_write on public.plan_act_node_quantities for all to authenticated
  using (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'edit'))
  with check (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'edit'));

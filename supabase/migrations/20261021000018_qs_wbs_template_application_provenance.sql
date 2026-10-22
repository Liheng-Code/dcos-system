-- Preserve the template and location snapshot used to scaffold each tender BOQ.

create table if not exists public.tender_qs_wbs_template_applications (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references public.tender_register(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  qs_template_id uuid references public.qs_wbs_templates(id) on delete set null,
  qs_template_version integer not null,
  planning_template_id uuid references public.wbs_templates(id) on delete set null,
  planning_template_version integer,
  building_code text not null,
  building_name text not null,
  selected_locations jsonb not null default '[]'::jsonb,
  template_snapshot jsonb not null,
  generated_line_count integer not null default 0,
  status text not null default 'applying',
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint tender_qs_wbs_template_applications_version_chk check (qs_template_version > 0),
  constraint tender_qs_wbs_template_applications_planning_version_chk check (planning_template_version is null or planning_template_version > 0),
  constraint tender_qs_wbs_template_applications_status_chk check (status in ('applying', 'applied', 'failed'))
);

create index if not exists idx_tender_qs_wbs_tpl_app_tender
  on public.tender_qs_wbs_template_applications(tender_id, created_at desc);
create index if not exists idx_tender_qs_wbs_tpl_app_qs_template
  on public.tender_qs_wbs_template_applications(qs_template_id, qs_template_version);

create or replace function public.prevent_qs_template_application_snapshot_change()
returns trigger
language plpgsql
as $$
begin
  if row(
    new.tender_id, new.project_id, new.qs_template_id, new.qs_template_version,
    new.planning_template_id, new.planning_template_version, new.building_code,
    new.building_name, new.selected_locations, new.template_snapshot, new.created_by
  ) is distinct from row(
    old.tender_id, old.project_id, old.qs_template_id, old.qs_template_version,
    old.planning_template_id, old.planning_template_version, old.building_code,
    old.building_name, old.selected_locations, old.template_snapshot, old.created_by
  ) then
    raise exception 'QS template application source snapshot is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists tender_qs_wbs_template_application_snapshot_immutable
  on public.tender_qs_wbs_template_applications;
create trigger tender_qs_wbs_template_application_snapshot_immutable
  before update on public.tender_qs_wbs_template_applications
  for each row execute function public.prevent_qs_template_application_snapshot_change();

alter table public.tender_boq_items
  add column if not exists qs_template_application_id uuid
  references public.tender_qs_wbs_template_applications(id) on delete set null;
create index if not exists idx_tender_boq_items_qs_template_application
  on public.tender_boq_items(qs_template_application_id)
  where qs_template_application_id is not null;

alter table public.tender_qs_wbs_template_applications enable row level security;
drop policy if exists "tender_qs_wbs_template_applications select" on public.tender_qs_wbs_template_applications;
create policy "tender_qs_wbs_template_applications select"
  on public.tender_qs_wbs_template_applications for select to authenticated using (true);
drop policy if exists "tender_qs_wbs_template_applications insert" on public.tender_qs_wbs_template_applications;
create policy "tender_qs_wbs_template_applications insert"
  on public.tender_qs_wbs_template_applications for insert to authenticated with check (true);
drop policy if exists "tender_qs_wbs_template_applications update" on public.tender_qs_wbs_template_applications;
create policy "tender_qs_wbs_template_applications update"
  on public.tender_qs_wbs_template_applications for update to authenticated using (true) with check (true);

comment on table public.tender_qs_wbs_template_applications is
  'Auditable snapshot of each QS template application that generated tender BOQ lines.';
comment on column public.tender_qs_wbs_template_applications.template_snapshot is
  'Immutable copy of the selected QS template header, selected scope items, and selected location patterns at application time.';
comment on column public.tender_boq_items.qs_template_application_id is
  'Source QS template application for this generated BOQ line, when applicable.';


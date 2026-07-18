-- Migration: 20260718000007_project_source_tender_link.sql
-- Purpose: Split pre-contract (tender) and post-contract (awarded) projects into
--          two genuinely separate `projects` rows instead of one row that flips
--          project_type in place. The tender row is preserved forever, untouched,
--          as a historical record; award creates a NEW project row linked back to
--          it via this column. See award-conversion-dialog.tsx for the write path.

alter table public.projects
  add column if not exists source_tender_project_id uuid references public.projects(id) on delete set null;

comment on column public.projects.source_tender_project_id is
  'For project_type = ''awarded'' rows only: the tender-phase projects.id this was '
  'assigned from via the award-conversion flow. Null for organic/internal projects '
  'and for tender rows themselves. The tender row is never repointed or mutated by '
  'this relationship.';

-- A tender should convert to at most one awarded project.
create unique index if not exists idx_projects_source_tender_unique
  on public.projects (source_tender_project_id)
  where source_tender_project_id is not null;

-- Supports the reverse lookup ("does this tender already have an awarded project?"
-- and showing the tender code on the awarded project's card) without a table scan.
create index if not exists idx_projects_source_tender_project_id
  on public.projects (source_tender_project_id);

-- Deep-copies wbs_nodes (structure only — not progress/budget/actuals) from one
-- project to another, preserving hierarchy via an id-remap temp table. Mirrors
-- public.clone_wbs_template_to_project (20260620000001_wbs_template_nodes.sql),
-- but sources from an existing project's wbs_nodes instead of wbs_template_nodes.
-- Used by the award-conversion flow to optionally carry a tender's preliminary
-- WBS structure into the newly created post-contract project. Returns the count
-- of nodes created.
create or replace function public.clone_wbs_nodes_between_projects(
  p_source_project_id uuid,
  p_target_project_id uuid
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count  int := 0;
  v_rec    record;
  v_new_id uuid;
begin
  drop table if exists _wbs_project_clone_map;
  create temp table _wbs_project_clone_map (
    old_id uuid primary key,
    new_id uuid not null
  ) on commit drop;

  for v_rec in
    with recursive ranked as (
      select id, parent_id, node_type, wbs_code, wbs_name, sort_order, 1 as depth
        from public.wbs_nodes
       where project_id = p_source_project_id and parent_id is null
      union all
      select n.id, n.parent_id, n.node_type, n.wbs_code, n.wbs_name, n.sort_order,
             r.depth + 1
        from public.wbs_nodes n
        join ranked r on n.parent_id = r.id
       where n.project_id = p_source_project_id
    )
    select * from ranked order by depth, sort_order
  loop
    v_new_id := gen_random_uuid();
    insert into _wbs_project_clone_map values (v_rec.id, v_new_id);

    insert into public.wbs_nodes (
      id, project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status
    ) values (
      v_new_id,
      p_target_project_id,
      (select new_id from _wbs_project_clone_map where old_id = v_rec.parent_id),
      v_rec.node_type,
      v_rec.wbs_code,
      v_rec.wbs_name,
      v_rec.sort_order,
      'active'
    );
    v_count := v_count + 1;
  end loop;

  drop table _wbs_project_clone_map;
  return v_count;
end;
$$;

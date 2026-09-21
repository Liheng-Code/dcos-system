-- Migration: 20260922000003_site_manpower_wbs_link.sql
-- Purpose: Productivity & Resource-Costing Plan, Phase 0 — let a site-manpower return be tied
--          to the WBS, so real headcount and hours can later be compared with the planned
--          crew of a task (actual productivity, plan Phase 5).
-- Depends on:
--   public.site_manpower (20260531000044_site_execution.sql)
--   public.wbs_nodes, public.wbs_tasks
--
-- Both links are OPTIONAL: a return may be for a trade on the whole site (as today), for a WBS
-- node (e.g. a floor), or for one task. Deleting the WBS row just clears the link. The same
-- pattern is used by site_progress_photos.wbs_node_id.

alter table public.site_manpower
  add column if not exists wbs_node_id uuid references public.wbs_nodes(id) on delete set null,
  add column if not exists wbs_task_id uuid references public.wbs_tasks(id) on delete set null;

create index if not exists idx_site_manpower_wbs_node
  on public.site_manpower (wbs_node_id) where wbs_node_id is not null;
create index if not exists idx_site_manpower_wbs_task
  on public.site_manpower (wbs_task_id) where wbs_task_id is not null;

comment on column public.site_manpower.wbs_node_id is 'Optional: WBS node (e.g. floor / zone) this manpower return relates to.';
comment on column public.site_manpower.wbs_task_id is 'Optional: schedule task this manpower return relates to (used for actual productivity).';

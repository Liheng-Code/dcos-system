-- Migration: 20260919000017_client_programme_view.sql
-- Purpose: Planning & Scheduling Completion Plan Continuation, R2.4 — a
--          read-only projection of the latest client-approved programme
--          revision for the external portal, plus (R2.7) additive
--          role_permissions grants so IPC readers (QS, DC, SS) can read
--          as-of progress snapshots via get_node_progress_asof().
-- Depends on:
--   public.plan_schedule_revisions / plan_schedule_streams (20260905100449,
--     status columns added by 20260919000010)
--   public.projects
--   RLS policies from 20260919000008 (so the projection is scoped by
--     is_project_member() + has_permission('planning','programme','view')).
--   public.role_permissions (20260527000002)
--
-- Schema verification notes:
--   - plan_schedule_revisions.status CHECK (20260919000010) includes
--     'approved_client' exactly: draft, submitted_internal, approved_internal,
--     submitted_client, approved_client, rejected.
--   - The view is a PLAIN view (no security_invoker option, no security
--     definer). RLS on the base tables is therefore enforced against the
--     querying user: a client who is a project member and holds the
--     EXT-CLT/EXT-CON ('planning','programme','view') grant (seeded
--     20260919000007) sees only their project's latest approved snapshot;
--     nobody else sees anything. Non-member access and unapproved revisions
--     are excluded by the same policies.
--   - "Latest" uses the highest revision_number within the approved set (the
--     revision sequence is monotonic per stream by construction — see
--     capture_schedule_revision()).
--   - 20260919000013's get_node_progress_asof() is SECURITY INVOKER and its
--     header flags that a QS-only role holding no planning grant falls back
--     to live wbs_nodes.progress_percent for every node instead of the
--     as-of snapshot. The IPC success criterion ("a single, reconciled
--     progress figure shared by Planning and QS") requires the as-of path, so
--     this migration records the decision by granting a read-only
--     ('planning','schedule','view') row to the roles that run claim seeding
--     (QS) and cost/IPC reporting (DC, SS). Granting view + edit for those
--     roles is intentionally NOT done — they read progress, they never edit
--     the schedule.

-- ── 1. Client programme projection ─────────────────────────────────────────
create or replace view public.v_plan_client_programme
as
select
  p.id                 as project_id,
  p.project_code,
  p.project_name,
  p.data_date,
  pr.revision_number,
  pr.created_at        as approved_at,
  pr.snapshot_data     as programme
from public.projects p
join public.plan_schedule_streams pss on pss.project_id = p.id
join public.plan_schedule_revisions pr on pr.stream_id = pss.id
where pr.status = 'approved_client'
  and pr.revision_number = (
    select max(pr2.revision_number)
    from public.plan_schedule_streams pss2
    join public.plan_schedule_revisions pr2 on pr2.stream_id = pss2.id
    where pss2.project_id = p.id
      and pr2.status = 'approved_client'
  );

grant select on public.v_plan_client_programme to authenticated;

comment on view public.v_plan_client_programme is
  'Latest client-approved programme revision per project, projected for the external read-only portal. Row visibility follows the RLS of the underlying plan_schedule_revisions (is_project_member + programme view grant).';

-- ── 2. IPC readers: as-of progress read access (R2.7) ──────────────────────
-- Additive rows on the 'planning' module for roles that consume progress data
-- without ever editing the schedule. Only action 'schedule' field 'view'.
insert into public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, configure, scope)
select r.role_code, 'planning', 'schedule',
       true, false, false, false, false, false, false, false, false, 'project'
from (values ('QS'), ('DC'), ('SS')) as r(role_code)
on conflict (role_code, module, action) do update set
  view  = excluded.view,
  scope = excluded.scope;
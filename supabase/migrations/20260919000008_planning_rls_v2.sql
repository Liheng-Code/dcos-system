-- Migration: 20260919000008_planning_rls_v2.sql
-- Purpose: Planning & Scheduling Completion Plan, Phase 2, item 2.1 (part 2) —
--          replace the blanket `using (true)` / admin-only-delete policies on
--          every planning table with the standard 4-policy
--          is_project_member() + has_permission('planning', <action>, <field>)
--          pattern. Depends on 20260919000007 (role_permissions seeded first,
--          so no role loses access the instant this migration lands) and
--          20260919000001 (is_project_member / has_permission).
-- Depends on:
--   public.is_project_member(uuid), public.has_permission(text,text,text)
--     (20260919000001_project_members_and_permission_helpers.sql)
--   public.role_permissions seeded for module 'planning'
--     (20260919000007_planning_role_permissions_seed.sql)
--
-- Schema verification — every table's *actual* existing policy names (read in
-- full from their source migrations before writing this file) and whether
-- project_id is a direct column or requires a join:
--
--   plan_calendars            direct column (project_id, NULLABLE — no
--                              NOT NULL constraint in 20260531000045; no
--                              existing row was found with a null project_id
--                              via grep, but the policy below is written to
--                              be safe either way: is_project_member(null)
--                              evaluates to is_admin() only, so a
--                              hypothetical project-less calendar is visible
--                              to admins only, never to a non-admin — a safe
--                              default, not a lockout of real usage).
--                              Old policy: "auth_plan_calendars" (single
--                              FOR ALL, using(true)/with check(true)).
--   plan_calendar_exceptions  JOIN via calendar_id -> plan_calendars.project_id
--                              (no project_id column at all). Old policy:
--                              "auth_plan_calendar_exceptions".
--   plan_resources             direct column (project_id NOT NULL). Old
--                              policy: "auth_plan_resources".
--   plan_task_assignments      JOIN via task_id -> wbs_tasks.project_id (no
--                              project_id column at all). Old policy:
--                              "auth_plan_task_assignments".
--   delay_register              direct column (project_id NOT NULL). Old
--                              policy: "delay_register_auth_all".
--   task_constraints            JOIN via task_id -> wbs_tasks.project_id (no
--                              project_id column at all). Old policies (this
--                              table already used the 4-policy select/insert/
--                              update/delete naming, just with `using(true)`):
--                              "task_constraints_select",
--                              "task_constraints_insert",
--                              "task_constraints_update",
--                              "task_constraints_delete".
--   weekly_plans                direct column (project_id NOT NULL). Old
--                              policy: "Authenticated users can manage
--                              weekly plans" (single FOR ALL).
--   weekly_plan_tasks           JOIN via weekly_plan_id -> weekly_plans.project_id
--                              (no project_id column at all). Old policy:
--                              "Authenticated users can manage weekly plan
--                              tasks" (single FOR ALL).
--   progress_snapshots          direct column (project_id NOT NULL). RLS was
--                              enabled with no policy at all in
--                              20260531000003 (that migration's own comment
--                              says so), but a LATER migration —
--                              20260908000001_scurve_series.sql — re-enabled
--                              RLS and added a permissive catch-all:
--                              `create policy "auth_progress_snapshots" ...
--                              for all to authenticated using (true) with
--                              check (true)`. A first pass of this migration
--                              searched only each table's *creation*
--                              migration and missed this later addition;
--                              caught on a second, full-history grep across
--                              every migration file (`create policy.*on
--                              public.progress_snapshots`) and confirmed by
--                              reading 20260908000001 in full. Old policy
--                              dropped below: "auth_progress_snapshots".
--                              Postgres ORs every applicable policy together,
--                              so leaving that permissive policy in place
--                              alongside the 4 restrictive ones below would
--                              have silently defeated this migration for
--                              this table (any authenticated user could
--                              still read/write every row regardless of
--                              project membership). The 4 policies below are
--                              also a prerequisite for 20260919000013's
--                              get_node_progress_asof() to be able to read
--                              snapshot rows as the calling user (see that
--                              migration's header).
--
--   A full-history re-check was then done for all other 15 tables in this
--   file too (grep for `\bon public\.<table>\b` — not anchored to "create
--   policy" on the same line, since several of these split "CREATE POLICY
--   name" and "ON public.table ..." across two lines, which a same-line
--   "create policy...on public.X" pattern would itself miss). Every hit
--   for the other 15 tables traces back to exactly the policy name(s)
--   already listed and dropped below — no other table had a second,
--   later permissive re-grant the way progress_snapshots did. Confirmed
--   clean: plan_calendars, plan_calendar_exceptions, plan_resources,
--   plan_task_assignments, delay_register, task_constraints, weekly_plans,
--   weekly_plan_tasks, plan_schedule_settings, plan_wbs_code_mask,
--   plan_timescale, plan_schedule_state, plan_schedule_streams,
--   plan_schedule_revisions, wbs_baselines.
--   plan_schedule_settings       direct column (project_id is the PRIMARY KEY
--                              itself). Old policy:
--                              "auth_plan_schedule_settings".
--   plan_wbs_code_mask           direct column (project_id is the PRIMARY KEY
--                              itself). Old policy: "auth_plan_wbs_code_mask".
--   plan_timescale                direct column (project_id is the PRIMARY
--                              KEY itself). Old policy: "auth_plan_timescale".
--   plan_schedule_state          direct column (project_id is the PRIMARY KEY
--                              itself). Old policies (Phase 1, already
--                              4-way): "plan_schedule_state_select_authenticated",
--                              "plan_schedule_state_insert_authenticated",
--                              "plan_schedule_state_update_authenticated",
--                              "plan_schedule_state_delete_authenticated".
--   plan_schedule_streams         direct column (project_id NOT NULL). Old
--                              policies: "Authenticated users can view/insert/
--                              update plan_schedule_streams" plus "Admins can
--                              delete plan_schedule_streams" (that last one
--                              checks `profiles.role = 'admin'` directly,
--                              not is_admin() — replaced below by the
--                              standard has_permission(...,'delete') delete
--                              policy, which already grants admins
--                              everything via has_permission()'s own
--                              is_admin() shortcut).
--   plan_schedule_revisions       JOIN via stream_id -> plan_schedule_streams.project_id
--                              (no project_id column at all). Old policies:
--                              "Authenticated users can view/insert/update
--                              plan_schedule_revisions" plus "Admins can
--                              delete plan_schedule_revisions" (same
--                              profiles.role='admin' pattern, replaced the
--                              same way).
--   wbs_baselines                  direct column (project_id NOT NULL). Old
--                              policies: "Authenticated users can view/manage
--                              (insert)/update wbs_baselines" plus "Admins
--                              can delete wbs_baselines" (same
--                              profiles.role='admin' pattern, replaced the
--                              same way).
--
-- NOT touched by this migration (out of scope per the plan): wbs_tasks,
-- wbs_nodes, task_alerts, activity_step_template_master/item, wbs_task_steps.

-- ════════════════════════════════════════════════════════════════════════
-- plan_calendars / plan_calendar_exceptions — action 'calendars'
-- ════════════════════════════════════════════════════════════════════════
drop policy if exists "auth_plan_calendars" on public.plan_calendars;

create policy "plan_calendars_select" on public.plan_calendars for select to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'calendars', 'view'));
create policy "plan_calendars_insert" on public.plan_calendars for insert to authenticated
  with check (is_project_member(project_id) and has_permission('planning', 'calendars', 'edit'));
create policy "plan_calendars_update" on public.plan_calendars for update to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'calendars', 'edit'))
  with check (is_project_member(project_id) and has_permission('planning', 'calendars', 'edit'));
create policy "plan_calendars_delete" on public.plan_calendars for delete to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'calendars', 'delete'));

drop policy if exists "auth_plan_calendar_exceptions" on public.plan_calendar_exceptions;

create policy "plan_calendar_exceptions_select" on public.plan_calendar_exceptions for select to authenticated
  using (
    exists (
      select 1 from public.plan_calendars pc
      where pc.id = plan_calendar_exceptions.calendar_id
        and is_project_member(pc.project_id)
    )
    and has_permission('planning', 'calendars', 'view')
  );
create policy "plan_calendar_exceptions_insert" on public.plan_calendar_exceptions for insert to authenticated
  with check (
    exists (
      select 1 from public.plan_calendars pc
      where pc.id = plan_calendar_exceptions.calendar_id
        and is_project_member(pc.project_id)
    )
    and has_permission('planning', 'calendars', 'edit')
  );
create policy "plan_calendar_exceptions_update" on public.plan_calendar_exceptions for update to authenticated
  using (
    exists (
      select 1 from public.plan_calendars pc
      where pc.id = plan_calendar_exceptions.calendar_id
        and is_project_member(pc.project_id)
    )
    and has_permission('planning', 'calendars', 'edit')
  )
  with check (
    exists (
      select 1 from public.plan_calendars pc
      where pc.id = plan_calendar_exceptions.calendar_id
        and is_project_member(pc.project_id)
    )
    and has_permission('planning', 'calendars', 'edit')
  );
create policy "plan_calendar_exceptions_delete" on public.plan_calendar_exceptions for delete to authenticated
  using (
    exists (
      select 1 from public.plan_calendars pc
      where pc.id = plan_calendar_exceptions.calendar_id
        and is_project_member(pc.project_id)
    )
    and has_permission('planning', 'calendars', 'delete')
  );

-- ════════════════════════════════════════════════════════════════════════
-- plan_resources — action 'resources'
-- ════════════════════════════════════════════════════════════════════════
drop policy if exists "auth_plan_resources" on public.plan_resources;

create policy "plan_resources_select" on public.plan_resources for select to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'resources', 'view'));
create policy "plan_resources_insert" on public.plan_resources for insert to authenticated
  with check (is_project_member(project_id) and has_permission('planning', 'resources', 'edit'));
create policy "plan_resources_update" on public.plan_resources for update to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'resources', 'edit'))
  with check (is_project_member(project_id) and has_permission('planning', 'resources', 'edit'));
create policy "plan_resources_delete" on public.plan_resources for delete to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'resources', 'delete'));

-- ════════════════════════════════════════════════════════════════════════
-- plan_task_assignments — action 'resources' (JOIN via task_id -> wbs_tasks)
-- ════════════════════════════════════════════════════════════════════════
drop policy if exists "auth_plan_task_assignments" on public.plan_task_assignments;

create policy "plan_task_assignments_select" on public.plan_task_assignments for select to authenticated
  using (
    exists (
      select 1 from public.wbs_tasks wt
      where wt.id = plan_task_assignments.task_id
        and is_project_member(wt.project_id)
    )
    and has_permission('planning', 'resources', 'view')
  );
create policy "plan_task_assignments_insert" on public.plan_task_assignments for insert to authenticated
  with check (
    exists (
      select 1 from public.wbs_tasks wt
      where wt.id = plan_task_assignments.task_id
        and is_project_member(wt.project_id)
    )
    and has_permission('planning', 'resources', 'edit')
  );
create policy "plan_task_assignments_update" on public.plan_task_assignments for update to authenticated
  using (
    exists (
      select 1 from public.wbs_tasks wt
      where wt.id = plan_task_assignments.task_id
        and is_project_member(wt.project_id)
    )
    and has_permission('planning', 'resources', 'edit')
  )
  with check (
    exists (
      select 1 from public.wbs_tasks wt
      where wt.id = plan_task_assignments.task_id
        and is_project_member(wt.project_id)
    )
    and has_permission('planning', 'resources', 'edit')
  );
create policy "plan_task_assignments_delete" on public.plan_task_assignments for delete to authenticated
  using (
    exists (
      select 1 from public.wbs_tasks wt
      where wt.id = plan_task_assignments.task_id
        and is_project_member(wt.project_id)
    )
    and has_permission('planning', 'resources', 'delete')
  );

-- ════════════════════════════════════════════════════════════════════════
-- delay_register — action 'delays'
-- ════════════════════════════════════════════════════════════════════════
drop policy if exists "delay_register_auth_all" on public.delay_register;

create policy "delay_register_select" on public.delay_register for select to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'delays', 'view'));
create policy "delay_register_insert" on public.delay_register for insert to authenticated
  with check (is_project_member(project_id) and has_permission('planning', 'delays', 'edit'));
create policy "delay_register_update" on public.delay_register for update to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'delays', 'edit'))
  with check (is_project_member(project_id) and has_permission('planning', 'delays', 'edit'));
create policy "delay_register_delete" on public.delay_register for delete to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'delays', 'delete'));

-- ════════════════════════════════════════════════════════════════════════
-- task_constraints — action 'lookahead' (JOIN via task_id -> wbs_tasks)
-- ════════════════════════════════════════════════════════════════════════
drop policy if exists "task_constraints_select" on public.task_constraints;
drop policy if exists "task_constraints_insert" on public.task_constraints;
drop policy if exists "task_constraints_update" on public.task_constraints;
drop policy if exists "task_constraints_delete" on public.task_constraints;

create policy "task_constraints_select" on public.task_constraints for select to authenticated
  using (
    exists (
      select 1 from public.wbs_tasks wt
      where wt.id = task_constraints.task_id
        and is_project_member(wt.project_id)
    )
    and has_permission('planning', 'lookahead', 'view')
  );
create policy "task_constraints_insert" on public.task_constraints for insert to authenticated
  with check (
    exists (
      select 1 from public.wbs_tasks wt
      where wt.id = task_constraints.task_id
        and is_project_member(wt.project_id)
    )
    and has_permission('planning', 'lookahead', 'edit')
  );
create policy "task_constraints_update" on public.task_constraints for update to authenticated
  using (
    exists (
      select 1 from public.wbs_tasks wt
      where wt.id = task_constraints.task_id
        and is_project_member(wt.project_id)
    )
    and has_permission('planning', 'lookahead', 'edit')
  )
  with check (
    exists (
      select 1 from public.wbs_tasks wt
      where wt.id = task_constraints.task_id
        and is_project_member(wt.project_id)
    )
    and has_permission('planning', 'lookahead', 'edit')
  );
create policy "task_constraints_delete" on public.task_constraints for delete to authenticated
  using (
    exists (
      select 1 from public.wbs_tasks wt
      where wt.id = task_constraints.task_id
        and is_project_member(wt.project_id)
    )
    and has_permission('planning', 'lookahead', 'delete')
  );

-- ════════════════════════════════════════════════════════════════════════
-- weekly_plans — action 'lookahead'
-- ════════════════════════════════════════════════════════════════════════
drop policy if exists "Authenticated users can manage weekly plans" on public.weekly_plans;

create policy "weekly_plans_select" on public.weekly_plans for select to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'lookahead', 'view'));
create policy "weekly_plans_insert" on public.weekly_plans for insert to authenticated
  with check (is_project_member(project_id) and has_permission('planning', 'lookahead', 'edit'));
create policy "weekly_plans_update" on public.weekly_plans for update to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'lookahead', 'edit'))
  with check (is_project_member(project_id) and has_permission('planning', 'lookahead', 'edit'));
create policy "weekly_plans_delete" on public.weekly_plans for delete to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'lookahead', 'delete'));

-- ════════════════════════════════════════════════════════════════════════
-- weekly_plan_tasks — action 'lookahead' (JOIN via weekly_plan_id -> weekly_plans)
-- ════════════════════════════════════════════════════════════════════════
drop policy if exists "Authenticated users can manage weekly plan tasks" on public.weekly_plan_tasks;

create policy "weekly_plan_tasks_select" on public.weekly_plan_tasks for select to authenticated
  using (
    exists (
      select 1 from public.weekly_plans wp
      where wp.id = weekly_plan_tasks.weekly_plan_id
        and is_project_member(wp.project_id)
    )
    and has_permission('planning', 'lookahead', 'view')
  );
create policy "weekly_plan_tasks_insert" on public.weekly_plan_tasks for insert to authenticated
  with check (
    exists (
      select 1 from public.weekly_plans wp
      where wp.id = weekly_plan_tasks.weekly_plan_id
        and is_project_member(wp.project_id)
    )
    and has_permission('planning', 'lookahead', 'edit')
  );
create policy "weekly_plan_tasks_update" on public.weekly_plan_tasks for update to authenticated
  using (
    exists (
      select 1 from public.weekly_plans wp
      where wp.id = weekly_plan_tasks.weekly_plan_id
        and is_project_member(wp.project_id)
    )
    and has_permission('planning', 'lookahead', 'edit')
  )
  with check (
    exists (
      select 1 from public.weekly_plans wp
      where wp.id = weekly_plan_tasks.weekly_plan_id
        and is_project_member(wp.project_id)
    )
    and has_permission('planning', 'lookahead', 'edit')
  );
create policy "weekly_plan_tasks_delete" on public.weekly_plan_tasks for delete to authenticated
  using (
    exists (
      select 1 from public.weekly_plans wp
      where wp.id = weekly_plan_tasks.weekly_plan_id
        and is_project_member(wp.project_id)
    )
    and has_permission('planning', 'lookahead', 'delete')
  );

-- ════════════════════════════════════════════════════════════════════════
-- progress_snapshots — action 'schedule'. Old policy (added later, by
-- 20260908000001_scurve_series.sql, not by this table's creation
-- migration): "auth_progress_snapshots" (FOR ALL, using(true)/with
-- check(true)) — see this file's header for how that was found.
-- ════════════════════════════════════════════════════════════════════════
drop policy if exists "auth_progress_snapshots" on public.progress_snapshots;

create policy "progress_snapshots_select" on public.progress_snapshots for select to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'schedule', 'view'));
create policy "progress_snapshots_insert" on public.progress_snapshots for insert to authenticated
  with check (is_project_member(project_id) and has_permission('planning', 'schedule', 'edit'));
create policy "progress_snapshots_update" on public.progress_snapshots for update to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'schedule', 'edit'))
  with check (is_project_member(project_id) and has_permission('planning', 'schedule', 'edit'));
create policy "progress_snapshots_delete" on public.progress_snapshots for delete to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'schedule', 'delete'));

-- ════════════════════════════════════════════════════════════════════════
-- plan_schedule_settings — action 'schedule', but insert/update require
-- 'configure' (project-wide config, not per-edit data)
-- ════════════════════════════════════════════════════════════════════════
drop policy if exists "auth_plan_schedule_settings" on public.plan_schedule_settings;

create policy "plan_schedule_settings_select" on public.plan_schedule_settings for select to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'schedule', 'view'));
create policy "plan_schedule_settings_insert" on public.plan_schedule_settings for insert to authenticated
  with check (is_project_member(project_id) and has_permission('planning', 'schedule', 'configure'));
create policy "plan_schedule_settings_update" on public.plan_schedule_settings for update to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'schedule', 'configure'))
  with check (is_project_member(project_id) and has_permission('planning', 'schedule', 'configure'));
create policy "plan_schedule_settings_delete" on public.plan_schedule_settings for delete to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'schedule', 'delete'));

-- ════════════════════════════════════════════════════════════════════════
-- plan_wbs_code_mask — action 'schedule', insert/update require 'configure'
-- ════════════════════════════════════════════════════════════════════════
drop policy if exists "auth_plan_wbs_code_mask" on public.plan_wbs_code_mask;

create policy "plan_wbs_code_mask_select" on public.plan_wbs_code_mask for select to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'schedule', 'view'));
create policy "plan_wbs_code_mask_insert" on public.plan_wbs_code_mask for insert to authenticated
  with check (is_project_member(project_id) and has_permission('planning', 'schedule', 'configure'));
create policy "plan_wbs_code_mask_update" on public.plan_wbs_code_mask for update to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'schedule', 'configure'))
  with check (is_project_member(project_id) and has_permission('planning', 'schedule', 'configure'));
create policy "plan_wbs_code_mask_delete" on public.plan_wbs_code_mask for delete to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'schedule', 'delete'));

-- ════════════════════════════════════════════════════════════════════════
-- plan_timescale — action 'schedule', insert/update require 'configure'
-- ════════════════════════════════════════════════════════════════════════
drop policy if exists "auth_plan_timescale" on public.plan_timescale;

create policy "plan_timescale_select" on public.plan_timescale for select to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'schedule', 'view'));
create policy "plan_timescale_insert" on public.plan_timescale for insert to authenticated
  with check (is_project_member(project_id) and has_permission('planning', 'schedule', 'configure'));
create policy "plan_timescale_update" on public.plan_timescale for update to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'schedule', 'configure'))
  with check (is_project_member(project_id) and has_permission('planning', 'schedule', 'configure'));
create policy "plan_timescale_delete" on public.plan_timescale for delete to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'schedule', 'delete'));

-- ════════════════════════════════════════════════════════════════════════
-- plan_schedule_state — action 'schedule'. Written only by the server (the
-- admin client in the alert-evaluation API route, which bypasses RLS via the
-- service role) — insert/update below follow the standard 'edit' pattern
-- anyway, purely for defense-in-depth/consistency, per the plan.
-- ════════════════════════════════════════════════════════════════════════
drop policy if exists "plan_schedule_state_select_authenticated" on public.plan_schedule_state;
drop policy if exists "plan_schedule_state_insert_authenticated" on public.plan_schedule_state;
drop policy if exists "plan_schedule_state_update_authenticated" on public.plan_schedule_state;
drop policy if exists "plan_schedule_state_delete_authenticated" on public.plan_schedule_state;

create policy "plan_schedule_state_select" on public.plan_schedule_state for select to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'schedule', 'view'));
create policy "plan_schedule_state_insert" on public.plan_schedule_state for insert to authenticated
  with check (is_project_member(project_id) and has_permission('planning', 'schedule', 'edit'));
create policy "plan_schedule_state_update" on public.plan_schedule_state for update to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'schedule', 'edit'))
  with check (is_project_member(project_id) and has_permission('planning', 'schedule', 'edit'));
create policy "plan_schedule_state_delete" on public.plan_schedule_state for delete to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'schedule', 'delete'));

-- ════════════════════════════════════════════════════════════════════════
-- plan_schedule_streams — action 'programme'
-- ════════════════════════════════════════════════════════════════════════
drop policy if exists "Authenticated users can view plan_schedule_streams" on public.plan_schedule_streams;
drop policy if exists "Authenticated users can insert plan_schedule_streams" on public.plan_schedule_streams;
drop policy if exists "Authenticated users can update plan_schedule_streams" on public.plan_schedule_streams;
drop policy if exists "Admins can delete plan_schedule_streams" on public.plan_schedule_streams;

create policy "plan_schedule_streams_select" on public.plan_schedule_streams for select to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'programme', 'view'));
create policy "plan_schedule_streams_insert" on public.plan_schedule_streams for insert to authenticated
  with check (is_project_member(project_id) and has_permission('planning', 'programme', 'edit'));
create policy "plan_schedule_streams_update" on public.plan_schedule_streams for update to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'programme', 'edit'))
  with check (is_project_member(project_id) and has_permission('planning', 'programme', 'edit'));
create policy "plan_schedule_streams_delete" on public.plan_schedule_streams for delete to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'programme', 'delete'));

-- ════════════════════════════════════════════════════════════════════════
-- plan_schedule_revisions — action 'programme' (JOIN via stream_id -> plan_schedule_streams)
-- ════════════════════════════════════════════════════════════════════════
drop policy if exists "Authenticated users can view plan_schedule_revisions" on public.plan_schedule_revisions;
drop policy if exists "Authenticated users can insert plan_schedule_revisions" on public.plan_schedule_revisions;
drop policy if exists "Authenticated users can update plan_schedule_revisions" on public.plan_schedule_revisions;
drop policy if exists "Admins can delete plan_schedule_revisions" on public.plan_schedule_revisions;

create policy "plan_schedule_revisions_select" on public.plan_schedule_revisions for select to authenticated
  using (
    exists (
      select 1 from public.plan_schedule_streams pss
      where pss.id = plan_schedule_revisions.stream_id
        and is_project_member(pss.project_id)
    )
    and has_permission('planning', 'programme', 'view')
  );
create policy "plan_schedule_revisions_insert" on public.plan_schedule_revisions for insert to authenticated
  with check (
    exists (
      select 1 from public.plan_schedule_streams pss
      where pss.id = plan_schedule_revisions.stream_id
        and is_project_member(pss.project_id)
    )
    and has_permission('planning', 'programme', 'edit')
  );
create policy "plan_schedule_revisions_update" on public.plan_schedule_revisions for update to authenticated
  using (
    exists (
      select 1 from public.plan_schedule_streams pss
      where pss.id = plan_schedule_revisions.stream_id
        and is_project_member(pss.project_id)
    )
    and has_permission('planning', 'programme', 'edit')
  )
  with check (
    exists (
      select 1 from public.plan_schedule_streams pss
      where pss.id = plan_schedule_revisions.stream_id
        and is_project_member(pss.project_id)
    )
    and has_permission('planning', 'programme', 'edit')
  );
create policy "plan_schedule_revisions_delete" on public.plan_schedule_revisions for delete to authenticated
  using (
    exists (
      select 1 from public.plan_schedule_streams pss
      where pss.id = plan_schedule_revisions.stream_id
        and is_project_member(pss.project_id)
    )
    and has_permission('planning', 'programme', 'delete')
  );

-- ════════════════════════════════════════════════════════════════════════
-- wbs_baselines — action 'baseline'
-- ════════════════════════════════════════════════════════════════════════
drop policy if exists "Authenticated users can view wbs_baselines" on public.wbs_baselines;
drop policy if exists "Authenticated users can manage wbs_baselines" on public.wbs_baselines;
drop policy if exists "Authenticated users can update wbs_baselines" on public.wbs_baselines;
drop policy if exists "Admins can delete wbs_baselines" on public.wbs_baselines;

create policy "wbs_baselines_select" on public.wbs_baselines for select to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'baseline', 'view'));
create policy "wbs_baselines_insert" on public.wbs_baselines for insert to authenticated
  with check (is_project_member(project_id) and has_permission('planning', 'baseline', 'edit'));
create policy "wbs_baselines_update" on public.wbs_baselines for update to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'baseline', 'edit'))
  with check (is_project_member(project_id) and has_permission('planning', 'baseline', 'edit'));
create policy "wbs_baselines_delete" on public.wbs_baselines for delete to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'baseline', 'delete'));

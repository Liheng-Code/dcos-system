-- Migration: 20260905000005_plan_resources_profile_link.sql
-- Purpose: Allow a public.plan_resources row to optionally represent a real
--          DCOS user account, converging the Tasks module's real
--          assignment system (wbs_tasks.owner_id/assignee_id -> profiles)
--          with Planning's free-text resource system (plan_resources /
--          plan_task_assignments, added in
--          20260905000004_create_plan_resources.sql). Part of the approved
--          "Tasks <-> Gantt Chart integration" plan.
--
--          A resource row with profile_id set represents a real person;
--          equipment/material/subcontractor resources keep profile_id null
--          exactly as today. The partial unique index enforces at most one
--          resource row per real person per project, while leaving
--          non-person resources (profile_id is null) completely unrestricted.
--
-- Depends on:
--   public.plan_resources (20260905000004_create_plan_resources.sql)
--   public.profiles       (20260526_0001_create_profiles.sql)
--
-- Purely additive: no changes to plan_task_assignments, no changes to
-- existing plan_resources rows or columns, no RLS changes (existing
-- permissive-authenticated policy on plan_resources already covers reads/
-- writes of the new column).

alter table public.plan_resources
  add column if not exists profile_id uuid references public.profiles(id);

create unique index if not exists plan_resources_project_profile_key
  on public.plan_resources(project_id, profile_id)
  where profile_id is not null;

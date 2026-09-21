-- Migration: 20260918000002_activity_step_template_fields.sql
-- Purpose: Expand Activity Step Templates with the additional site-control
--          fields present in docs/Activity_Step_Templates_Architectural_MEP.xlsx
--          ("All Step Templates" sheet): Discipline, Resource / Crew,
--          Est. Duration (Days), Inspection Hold Point. Added to both
--          activity_step_template_item (the master template's steps) and
--          wbs_task_steps (the per-task copy a site engineer edits), so the
--          fields survive the copy-on-assign done in
--          apps/web/lib/planning/activity-steps-service.ts.
-- Depends on: 20260918000001_activity_step_templates.sql

alter table public.activity_step_template_item
  add column if not exists discipline text,
  add column if not exists resource_crew text,
  add column if not exists est_duration_days numeric,
  add column if not exists inspection_hold_point boolean not null default false;

comment on column public.activity_step_template_item.discipline is
  'Discipline responsible for this step, e.g. "Architectural", "Electrical / ELV", "HVAC" — informational, independent of group_name.';
comment on column public.activity_step_template_item.resource_crew is
  'Suggested resource / crew to execute this step, e.g. "Masonry Crew", "QA/QC + Electrical Engineer".';
comment on column public.activity_step_template_item.est_duration_days is
  'Planner''s estimated duration of this step in days — a guideline for look-ahead planning, not tied to the schedule engine.';
comment on column public.activity_step_template_item.inspection_hold_point is
  'True when this step is a QA/QC inspection hold point (must be signed off before work proceeds), matching the "Inspection Hold Point" column of the source template library.';

alter table public.wbs_task_steps
  add column if not exists discipline text,
  add column if not exists resource_crew text,
  add column if not exists est_duration_days numeric,
  add column if not exists inspection_hold_point boolean not null default false;

comment on column public.wbs_task_steps.discipline is
  'Discipline responsible for this step — copied from the source template on assignment, editable afterwards.';
comment on column public.wbs_task_steps.resource_crew is
  'Resource / crew executing this step — copied from the source template on assignment, editable afterwards.';
comment on column public.wbs_task_steps.est_duration_days is
  'Planner''s estimated duration of this step in days — copied from the source template on assignment, editable afterwards.';
comment on column public.wbs_task_steps.inspection_hold_point is
  'True when this step is a QA/QC inspection hold point — copied from the source template on assignment, editable afterwards.';

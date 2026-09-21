-- Migration: 20260917000003_plan_schedule_settings_progress_line.sql
-- Purpose: Add MS-Project-style "Progress Line" style settings to
--          plan_schedule_settings (single configurable progress line drawn
--          on the Planning ▸ Gantt Chart). On/off visibility is a client-side
--          toggle only and is not persisted here.
-- Depends on: plan_schedule_settings (created in 20260917000002)

alter table public.plan_schedule_settings
  add column if not exists progress_line_date_source text not null default 'data_date',
  add column if not exists progress_line_custom_date date,
  add column if not exists progress_line_color text not null default '#dc2626',
  add column if not exists progress_line_point_shape text not null default 'diamond',
  add column if not exists progress_line_point_color text not null default '#dc2626',
  add column if not exists progress_line_show_date boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.plan_schedule_settings'::regclass
      and conname = 'plan_schedule_settings_progress_line_date_source_check'
  ) then
    alter table public.plan_schedule_settings
      add constraint plan_schedule_settings_progress_line_date_source_check
      check (progress_line_date_source in ('data_date', 'today', 'custom'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.plan_schedule_settings'::regclass
      and conname = 'plan_schedule_settings_progress_line_point_shape_check'
  ) then
    alter table public.plan_schedule_settings
      add constraint plan_schedule_settings_progress_line_point_shape_check
      check (progress_line_point_shape in ('diamond', 'circle', 'square'));
  end if;
end $$;

comment on column public.plan_schedule_settings.progress_line_date_source is
  'Which date the single progress line is drawn at: the project data date, today, or a manually picked date (progress_line_custom_date).';
comment on column public.plan_schedule_settings.progress_line_custom_date is
  'Manually picked date for the progress line when progress_line_date_source = ''custom''. Ignored otherwise.';
comment on column public.plan_schedule_settings.progress_line_color is
  'Hex color of the progress line stroke itself.';
comment on column public.plan_schedule_settings.progress_line_point_shape is
  'Marker shape drawn at each task/bar intersection along the progress line.';
comment on column public.plan_schedule_settings.progress_line_point_color is
  'Hex color of the progress line''s intersection point markers.';
comment on column public.plan_schedule_settings.progress_line_show_date is
  'Whether to render the progress line''s date as a label on the Gantt chart. Visibility of the progress line itself is a client-side toggle and is not persisted.';

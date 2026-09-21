-- Migration: 20260917000004_plan_schedule_settings_bar_style.sql
-- Purpose: Add MS-Project-style "Bar Styles" configuration to
--          plan_schedule_settings (per-category Gantt bar color/shape for
--          Normal/Critical/Near-critical task bars, plus which task field
--          renders at each of 5 text positions around a bar).
-- Depends on: plan_schedule_settings (created in 20260917000002)

alter table public.plan_schedule_settings
  add column if not exists bar_style jsonb not null default '{
    "normal": {"color": "#3b82f6", "shape": "pill"},
    "critical": {"color": "#ef4444", "shape": "pill"},
    "nearCritical": {"color": "#f59e0b", "shape": "pill"},
    "text": {"left": "none", "right": "none", "top": "none", "bottom": "none", "inside": "name_progress"}
  }'::jsonb;

comment on column public.plan_schedule_settings.bar_style is
  'Gantt bar appearance, matching apps/web/lib/planning/gantt-bar-style.ts GanttBarStyleSettings: per-category (normal/critical/nearCritical) bar color + shape (pill/rounded/square), and which task field renders at each of 5 text positions around a bar (left/right/top/bottom/inside — field ids like "name", "name_progress", "start", "finish", "duration", "progress", "float", "owner", "code", "none"). Edited via the Gantt Chart''s double-click "Format Bar" dialog; applies to every task bar in the project, not per-task.';
